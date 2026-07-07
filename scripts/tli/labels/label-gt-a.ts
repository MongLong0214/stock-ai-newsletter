import { supabaseAdmin } from '../shared/supabase-admin'
import { batchQuery, batchUpsert, groupByThemeId } from '../shared/supabase-batch'
import {
  GTA_HORIZON_DAYS,
  GTA_LABELER_VERSION,
  labelGtA,
  type GtALabelResult,
} from '../../../lib/tli/labels/gt-a'
import {
  addKoreanTradingDays,
  countKoreanTradingDaysBetween,
  getKoreanTradingDateWindow,
} from '../../../lib/tli/trading-calendar'
import { getKSTDateString } from '../../../lib/tli/date-utils'

interface ThemeRow {
  readonly id: string
  readonly is_active: boolean
  readonly keyword_epoch: number | null
}

interface InterestMetricRow {
  readonly theme_id: string
  readonly time: string
  readonly raw_value: number | null
}

interface StateHistoryRow {
  readonly theme_id: string
  readonly effective_from: string
  readonly effective_to: string | null
  readonly is_active: boolean
  readonly closed_at: string | null
}

interface PendingLabelRow {
  readonly theme_id: string
  readonly keyword_epoch: number
}

export interface GtALabelGenerationResult {
  readonly baseDate: string
  readonly totalThemes: number
  readonly pendingCount: number
  readonly finalCount: number
  readonly censoredCount: number
  readonly excludedCount: number
}

const toRawMap = (rows: readonly InterestMetricRow[]): Map<string, number> => {
  const rawByDate = new Map<string, number>()
  for (const row of rows) {
    if (row.raw_value !== null && Number.isFinite(row.raw_value)) {
      rawByDate.set(row.time, row.raw_value)
    }
  }
  return rawByDate
}

const collectRawValues = (rawByDate: Map<string, number>, dates: readonly string[]): number[] =>
  dates.flatMap((date) => {
    const value = rawByDate.get(date)
    return value === undefined ? [] : [value]
  })

const findWindowMaxRenewalGap = (
  rawByDate: Map<string, number>,
  baseDate: string,
): number | null => {
  const windowDates = getKoreanTradingDateWindow({ baseDate, startOffset: -29, endOffset: 0 })
  let maxValue = Number.NEGATIVE_INFINITY
  let latestMaxDate: string | null = null

  for (const date of windowDates) {
    const value = rawByDate.get(date)
    if (value === undefined) continue
    if (value >= maxValue) {
      maxValue = value
      latestMaxDate = date
    }
  }

  return latestMaxDate === null
    ? null
    : countKoreanTradingDaysBetween({ fromDate: latestMaxDate, toDate: baseDate })
}

const deactivatedBeforeHorizon = (
  themeId: string,
  horizonDate: string,
  states: readonly StateHistoryRow[],
): boolean => states.some((row) =>
  row.theme_id === themeId
  && !row.is_active
  && row.closed_at !== null
  && row.closed_at <= horizonDate
)

const loadPendingKeywordEpochs = async (
  themeIds: readonly string[],
  baseDate: string,
): Promise<Map<string, number>> => {
  const rows = await batchQuery<PendingLabelRow>(
    'theme_labels',
    'theme_id, keyword_epoch',
    [...themeIds],
    (query) => query
      .eq('base_date', baseDate)
      .eq('label_type', 'gt_a')
      .eq('label_status', 'pending'),
  )
  return new Map(rows.map((row) => [row.theme_id, row.keyword_epoch]))
}

export function buildGtALabelRow(input: {
  readonly themeId: string
  readonly baseDate: string
  readonly result: GtALabelResult
}): Record<string, unknown> {
  return {
    theme_id: input.themeId,
    base_date: input.baseDate,
    label_type: 'gt_a',
    horizon_days: GTA_HORIZON_DAYS,
    g_log_ratio: input.result.gLogRatio,
    y_binary: input.result.yBinary,
    denominator: input.result.denominator,
    rescale_suspect: input.result.rescaleSuspect,
    low_signal: input.result.lowSignal,
    keyword_epoch: input.result.keywordEpoch,
    label_status: input.result.status,
    exclude_reason: input.result.excludeReason,
    labeler_version: input.result.labelerVersion,
    finalized_at: input.result.status === 'final' || input.result.status === 'censored'
      ? new Date().toISOString()
      : null,
  }
}

const buildPendingRow = (input: {
  readonly themeId: string
  readonly baseDate: string
  readonly keywordEpoch: number
}): Record<string, unknown> => ({
  theme_id: input.themeId,
  base_date: input.baseDate,
  label_type: 'gt_a',
  horizon_days: GTA_HORIZON_DAYS,
  keyword_epoch: input.keywordEpoch,
  label_status: 'pending',
  labeler_version: GTA_LABELER_VERSION,
})

async function loadThemes(includeInactive: boolean): Promise<ThemeRow[]> {
  let query = supabaseAdmin
    .from('themes')
    .select('id, is_active, keyword_epoch')

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw new Error(`GT-A 테마 로딩 실패: ${error.message}`)
  return data ?? []
}

export async function generateGtALabelsForBaseDate(input: {
  readonly baseDate: string
  readonly includeInactive?: boolean
  readonly today?: string
}): Promise<GtALabelGenerationResult> {
  const baseDate = input.baseDate
  const today = input.today ?? getKSTDateString()
  const themes = await loadThemes(input.includeInactive ?? false)
  const themeIds = themes.map((theme) => theme.id)
  if (themeIds.length === 0) {
    return { baseDate, totalThemes: 0, pendingCount: 0, finalCount: 0, censoredCount: 0, excludedCount: 0 }
  }

  const horizonDate = addKoreanTradingDays(baseDate, GTA_HORIZON_DAYS)
  const horizonElapsed = today >= horizonDate
  const pastDates = getKoreanTradingDateWindow({ baseDate, startOffset: -4, endOffset: 0 })
  const futureDates = getKoreanTradingDateWindow({ baseDate, startOffset: 1, endOffset: GTA_HORIZON_DAYS })
  const queryStartDate = getKoreanTradingDateWindow({ baseDate, startOffset: -29, endOffset: -29 })[0]

  const metricRows = await batchQuery<InterestMetricRow>(
    'interest_metrics',
    'theme_id, time, raw_value',
    themeIds,
    (query) => query
      .eq('source', 'naver_datalab')
      .gte('time', queryStartDate)
      .lte('time', horizonDate),
  )
  const metricsByTheme = groupByThemeId(metricRows)

  const stateRows = input.includeInactive
    ? await batchQuery<StateHistoryRow>(
      'theme_state_history_v2',
      'theme_id, effective_from, effective_to, is_active, closed_at',
      themeIds,
      (query) => query.lte('effective_from', horizonDate),
    )
    : []
  const pendingEpochByTheme = horizonElapsed
    ? await loadPendingKeywordEpochs(themeIds, baseDate)
    : new Map<string, number>()

  const rows: Record<string, unknown>[] = []
  let pendingCount = 0
  let finalCount = 0
  let censoredCount = 0
  let excludedCount = 0

  for (const theme of themes) {
    const keywordEpoch = theme.keyword_epoch ?? 1
    if (!horizonElapsed) {
      rows.push(buildPendingRow({ themeId: theme.id, baseDate, keywordEpoch }))
      pendingCount++
      continue
    }

    const rawByDate = toRawMap(metricsByTheme.get(theme.id) ?? [])
    const keywordEpochAtBase = pendingEpochByTheme.get(theme.id) ?? keywordEpoch
    const result = labelGtA({
      pastRaw: collectRawValues(rawByDate, pastDates),
      futureRaw: collectRawValues(rawByDate, futureDates),
      keywordEpochAtBase,
      keywordEpochAtFinalize: keywordEpoch,
      windowMaxRenewalGapDays: findWindowMaxRenewalGap(rawByDate, baseDate),
      deactivatedBeforeHorizon: deactivatedBeforeHorizon(theme.id, horizonDate, stateRows),
    })
    rows.push(buildGtALabelRow({ themeId: theme.id, baseDate, result }))
    if (result.status === 'final') finalCount++
    if (result.status === 'censored') censoredCount++
    if (result.status === 'excluded') excludedCount++
  }

  await batchUpsert('theme_labels', rows, 'theme_id,base_date,label_type,horizon_days', 'GT-A 라벨')
  return { baseDate, totalThemes: themes.length, pendingCount, finalCount, censoredCount, excludedCount }
}
