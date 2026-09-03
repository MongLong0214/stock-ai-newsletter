import type { LabelStatusCounts } from '@/scripts/stock-picks/backtest'
import { validateResearchDataset } from '@/scripts/stock-picks/data-contract'
import { getRawPrice, loadPriceBook, type PriceBook } from '@/scripts/stock-picks/data-handler'
import { labelPick, type StockPickLabel } from '@/scripts/stock-picks/label'
import type { StockPickSnapshot } from '@/scripts/stock-picks/pick-snapshots'
import { loadStockPickSnapshots } from '@/scripts/stock-picks/pick-snapshots'
import { PRODUCTION_STRATEGY } from '@/scripts/stock-picks/production-strategy'
import { TradingDayIndex, loadTradingDayIndex } from '@/scripts/stock-picks/trading-days'

const DEFAULT_LOOKBACK_DAYS = 60
const RECENT_WEEK_COUNT = 4
const INFORMATIONAL_HOLDING_DAYS = 8
export type ForwardPicksSource = 'code' | 'llm_fallback' | 'crash' | null
export type ForwardNullReason = 'missingEntryOpen' | 'missingWindowData'
type SourceKey = Exclude<ForwardPicksSource, null> | 'null'

export interface PublishedNewsletterRow {
  readonly newsletter_date: string
  readonly gemini_analysis: string
  readonly picks_source: string | null
}

interface PublishedPick {
  readonly publicationDate: string
  readonly symbol: string
  readonly picksSource: ForwardPicksSource
}

interface MaturePick extends PublishedPick {
  readonly signalDate: string
  readonly entryDate: string
  readonly maturityDate: string
}

interface EvaluatedPick extends MaturePick {
  readonly label: StockPickLabel | null
  readonly nullReason: ForwardNullReason | null
}

export interface ForwardAccuracySummary {
  readonly totalPicks: number
  readonly labeledPicks: number
  readonly nullPicks: number
  readonly touchedPicks: number
  readonly statusCounts: LabelStatusCounts
  readonly hitRate: number | null
  readonly nullRate: number
}

export interface ForwardWeeklySummary extends ForwardAccuracySummary {
  readonly startDate: string
  readonly endDate: string
}

export interface ShadowForwardStrategySummary {
  readonly dayCount: number
  readonly pickCount: number
  readonly labeledPickCount: number
  readonly hitCount: number
  readonly slotDenominator: number
  readonly slotPrecisionAt3: number | null
}

export interface ShadowForwardComparison {
  readonly startDate: string
  readonly endDate: string
  readonly snapshotCount: number
  readonly publishedV1: ShadowForwardStrategySummary
  readonly productionV0Only: ShadowForwardStrategySummary
  readonly slotPrecisionDifferencePercentagePoints: number | null
}

export interface ForwardMeasurementReport {
  readonly asOfDate: string
  readonly lookbackDays: number
  readonly startDate: string
  readonly publishedNewsletterCount: number
  readonly invalidNewsletterCount: number
  readonly crashNewsletterCount: number
  readonly loadedPickCount: number
  readonly immaturePickCount: number
  readonly overall: ForwardAccuracySummary
  readonly informational8HoldingDays: ForwardAccuracySummary
  readonly byPicksSource: Readonly<Record<SourceKey, ForwardAccuracySummary>>
  readonly nullBreakdown: Readonly<Record<ForwardNullReason, number>>
  readonly recent4Weeks: readonly ForwardWeeklySummary[]
  readonly shadowComparison: ShadowForwardComparison
}

const SOURCE_KEYS: readonly SourceKey[] = ['code', 'llm_fallback', 'crash', 'null']

const addCalendarDays = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`올바르지 않은 날짜입니다: ${date}`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

const sourceKey = (source: ForwardPicksSource): SourceKey => source ?? 'null'

const normalizeSource = (source: string | null): ForwardPicksSource => (
  source === 'code' || source === 'llm_fallback' || source === 'crash' ? source : null
)

const summarize = (picks: readonly EvaluatedPick[]): ForwardAccuracySummary => {
  const labels = picks.flatMap((pick) => pick.label ? [pick.label] : [])
  const touchedPicks = labels.filter((label) => label.touched).length
  const conditionalLabelCount = labels.filter((label) => label.status !== 'data_error').length
  const nullPicks = picks.length - labels.length
  const statusCounts: LabelStatusCounts = {
    hit: labels.filter((label) => label.status === 'hit').length,
    miss: labels.filter((label) => label.status === 'miss').length,
    unexpected_untradeable: labels.filter((label) => (
      label.status === 'unexpected_untradeable'
    )).length,
    data_error: labels.filter((label) => label.status === 'data_error').length,
  }
  return {
    totalPicks: picks.length,
    labeledPicks: labels.length,
    nullPicks,
    touchedPicks,
    statusCounts,
    hitRate: conditionalLabelCount > 0 ? touchedPicks / conditionalLabelCount : null,
    nullRate: picks.length > 0 ? nullPicks / picks.length : 0,
  }
}

const emptyShadowComparison = (startDate: string, asOfDate: string): ShadowForwardComparison => ({
  startDate,
  endDate: asOfDate,
  snapshotCount: 0,
  publishedV1: {
    dayCount: 0,
    pickCount: 0,
    labeledPickCount: 0,
    hitCount: 0,
    slotDenominator: 0,
    slotPrecisionAt3: null,
  },
  productionV0Only: {
    dayCount: 0,
    pickCount: 0,
    labeledPickCount: 0,
    hitCount: 0,
    slotDenominator: 0,
    slotPrecisionAt3: null,
  },
  slotPrecisionDifferencePercentagePoints: null,
})

const parsePublishedPicks = (row: PublishedNewsletterRow): {
  readonly kind: 'stock' | 'crash' | 'invalid'
  readonly picks: PublishedPick[]
} => {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.gemini_analysis)
  } catch {
    return { kind: 'invalid', picks: [] }
  }

  if (
    typeof parsed === 'object'
    && parsed !== null
    && !Array.isArray(parsed)
    && (parsed as Record<string, unknown>).type === 'crash_alert'
  ) {
    return { kind: 'crash', picks: [] }
  }
  if (!Array.isArray(parsed)) return { kind: 'invalid', picks: [] }

  const picks = parsed.flatMap((candidate): PublishedPick[] => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return []
    const symbol = (candidate as Record<string, unknown>).ticker
    if (typeof symbol !== 'string' || symbol.length === 0) return []
    return [{
      publicationDate: row.newsletter_date.slice(0, 10),
      symbol,
      picksSource: normalizeSource(row.picks_source),
    }]
  })
  return { kind: picks.length > 0 ? 'stock' : 'invalid', picks }
}

const maturePick = (
  pick: PublishedPick,
  tradingDays: TradingDayIndex,
  asOfDate: string,
  holdingDays = 5,
): MaturePick | null => {
  const entryDate = tradingDays.firstTradingDayOnOrAfter(pick.publicationDate)
  if (!entryDate) return null
  const signalDate = tradingDays.nextTradingDay(entryDate, -1)
  const maturityDate = tradingDays.nextTradingDay(entryDate, holdingDays - 1)
  if (!signalDate || !maturityDate || maturityDate > asOfDate) return null
  return { ...pick, signalDate, entryDate, maturityDate }
}

const evaluatePick = (
  pick: MaturePick,
  prices: PriceBook,
  tradingDays: TradingDayIndex,
  holdingDays = 5,
): EvaluatedPick => {
  const label = labelPick(pick.symbol, pick.signalDate, prices, tradingDays, holdingDays)
  if (label) return { ...pick, label, nullReason: null }

  const entryOpen = getRawPrice(prices, pick.symbol, pick.entryDate)?.open
  return {
    ...pick,
    label: null,
    nullReason: entryOpen === null || entryOpen === undefined
      ? 'missingEntryOpen'
      : 'missingWindowData',
  }
}

export function measureShadowForwardComparison(input: {
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly snapshots: readonly StockPickSnapshot[]
  readonly startDate: string
  readonly asOfDate: string
}): ShadowForwardComparison {
  const snapshots = input.snapshots.filter((snapshot) => (
    snapshot.strategy === PRODUCTION_STRATEGY.name
    && snapshot.signal_date >= input.startDate
    && snapshot.signal_date <= input.asOfDate
  ))
  const matureSnapshots = snapshots.filter((snapshot) => {
    const entryDate = input.tradingDays.nextTradingDay(snapshot.signal_date, 1)
    const maturityDate = entryDate ? input.tradingDays.nextTradingDay(entryDate, 4) : null
    return maturityDate !== null && maturityDate <= input.asOfDate
  })
  const summarizeSnapshots = (
    select: (snapshot: StockPickSnapshot) => ReadonlyArray<StockPickSnapshot['picks'][number]>,
  ): ShadowForwardStrategySummary => {
    const labels = matureSnapshots.flatMap((snapshot) => select(snapshot).map((candidate) => (
      labelPick(candidate.symbol, snapshot.signal_date, input.prices, input.tradingDays)
    )))
    const hitCount = labels.filter((label) => label?.touched).length
    const slotDenominator = matureSnapshots.length * 3
    return {
      dayCount: matureSnapshots.length,
      pickCount: labels.length,
      labeledPickCount: labels.filter((label) => label !== null).length,
      hitCount,
      slotDenominator,
      slotPrecisionAt3: slotDenominator > 0 ? hitCount / slotDenominator : null,
    }
  }
  const publishedV1 = summarizeSnapshots((snapshot) => snapshot.picks.slice(0, 3))
  const productionV0Only = summarizeSnapshots((snapshot) => (
    snapshot.top_candidates.filter((candidate) => candidate.tier === 'breakout').slice(0, 3)
  ))
  return {
    startDate: input.startDate,
    endDate: input.asOfDate,
    snapshotCount: snapshots.length,
    publishedV1,
    productionV0Only,
    slotPrecisionDifferencePercentagePoints: publishedV1.slotPrecisionAt3 === null
      || productionV0Only.slotPrecisionAt3 === null
      ? null
      : (publishedV1.slotPrecisionAt3 - productionV0Only.slotPrecisionAt3) * 100,
  }
}

export function measureForwardPicks(input: {
  readonly newsletters: readonly PublishedNewsletterRow[]
  readonly prices: PriceBook
  readonly tradingDays: TradingDayIndex
  readonly asOfDate: string
  readonly lookbackDays?: number
  readonly shadowComparison?: ShadowForwardComparison
}): ForwardMeasurementReport {
  const lookbackDays = input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  if (!Number.isInteger(lookbackDays) || lookbackDays <= 0) {
    throw new Error(`lookbackDays는 양의 정수여야 합니다: ${lookbackDays}`)
  }
  const startDate = addCalendarDays(input.asOfDate, -(lookbackDays - 1))
  const newsletters = input.newsletters.filter((row) => {
    const date = row.newsletter_date.slice(0, 10)
    return date >= startDate && date <= input.asOfDate
  })

  const parsed = newsletters.map(parsePublishedPicks)
  const publishedPicks = parsed.flatMap((result) => result.picks)
  const maturePicks = publishedPicks.flatMap((pick) => {
    const mature = maturePick(pick, input.tradingDays, input.asOfDate)
    return mature ? [mature] : []
  })
  const evaluated = maturePicks.map((pick) => evaluatePick(pick, input.prices, input.tradingDays))
  const informational8MaturePicks = publishedPicks.flatMap((pick) => {
    const mature = maturePick(pick, input.tradingDays, input.asOfDate, INFORMATIONAL_HOLDING_DAYS)
    return mature ? [mature] : []
  })
  const informational8Evaluated = informational8MaturePicks.map((pick) => (
    evaluatePick(pick, input.prices, input.tradingDays, INFORMATIONAL_HOLDING_DAYS)
  ))

  const byPicksSource = Object.fromEntries(SOURCE_KEYS.map((key) => [
    key,
    summarize(evaluated.filter((pick) => sourceKey(pick.picksSource) === key)),
  ])) as Record<SourceKey, ForwardAccuracySummary>

  const nullBreakdown: Record<ForwardNullReason, number> = {
    missingEntryOpen: 0,
    missingWindowData: 0,
  }
  for (const pick of evaluated) {
    if (pick.nullReason) nullBreakdown[pick.nullReason]++
  }

  const recent4Weeks = Array.from({ length: RECENT_WEEK_COUNT }, (_, index) => {
    const weeksAgo = RECENT_WEEK_COUNT - index - 1
    const endDate = addCalendarDays(input.asOfDate, -weeksAgo * 7)
    const weekStartDate = addCalendarDays(endDate, -6)
    return {
      startDate: weekStartDate,
      endDate,
      ...summarize(evaluated.filter((pick) => (
        pick.publicationDate >= weekStartDate && pick.publicationDate <= endDate
      ))),
    }
  })

  return {
    asOfDate: input.asOfDate,
    lookbackDays,
    startDate,
    publishedNewsletterCount: newsletters.length,
    invalidNewsletterCount: parsed.filter((result) => result.kind === 'invalid').length,
    crashNewsletterCount: parsed.filter((result) => result.kind === 'crash').length,
    loadedPickCount: publishedPicks.length,
    immaturePickCount: publishedPicks.length - maturePicks.length,
    overall: summarize(evaluated),
    informational8HoldingDays: summarize(informational8Evaluated),
    byPicksSource,
    nullBreakdown,
    recent4Weeks,
    shadowComparison: input.shadowComparison ?? emptyShadowComparison(startDate, input.asOfDate),
  }
}

const loadPublishedNewsletters = async (
  startDate: string,
  endDate: string,
): Promise<PublishedNewsletterRow[]> => {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  return fetchAllRows<PublishedNewsletterRow>((from, to) => supabaseAdmin
    .from('newsletter_content')
    .select('newsletter_date, gemini_analysis, picks_source')
    .eq('is_sent', true)
    .gte('newsletter_date', startDate)
    .lte('newsletter_date', endDate)
    .order('newsletter_date', { ascending: true })
    .range(from, to))
}

const percent = (value: number | null): string => value === null ? '-' : `${(value * 100).toFixed(1)}%`
const percentagePoints = (value: number | null): string => (
  value === null ? '-' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%p`
)

export function renderShadowForwardComparisonSection(comparison: ShadowForwardComparison): string {
  if (comparison.snapshotCount === 0) {
    return [
      `저장 스냅샷 v1-v0 포워드 비교 (신호일 ${comparison.startDate}~${comparison.endDate})`,
      '스냅샷 대기 중',
    ].join('\n')
  }
  return [
    `저장 스냅샷 v1-v0 포워드 비교 (신호일 ${comparison.startDate}~${comparison.endDate}, 제품 기준 5보유일)`,
    '| 전략 | 성숙 일수 | 픽 수 | 라벨 수 | 슬롯 적중 | slotPrecision@3 | 차이(%p) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| v1 (published) | ${comparison.publishedV1.dayCount} | ${comparison.publishedV1.pickCount} | ${comparison.publishedV1.labeledPickCount} | ${comparison.publishedV1.hitCount}/${comparison.publishedV1.slotDenominator} | ${percent(comparison.publishedV1.slotPrecisionAt3)} | ${percentagePoints(comparison.slotPrecisionDifferencePercentagePoints)} |`,
    `| v0-only | ${comparison.productionV0Only.dayCount} | ${comparison.productionV0Only.pickCount} | ${comparison.productionV0Only.labeledPickCount} | ${comparison.productionV0Only.hitCount}/${comparison.productionV0Only.slotDenominator} | ${percent(comparison.productionV0Only.slotPrecisionAt3)} | - |`,
  ].join('\n')
}

export function printForwardMeasurementReport(report: ForwardMeasurementReport): void {
  console.log(JSON.stringify(report, null, 2))
  console.table([
    { scope: 'overall', ...report.overall },
    ...SOURCE_KEYS.map((key) => ({ scope: `source:${key}`, ...report.byPicksSource[key] })),
  ].map((row) => ({
    scope: row.scope,
    picks: row.totalPicks,
    labeled: row.labeledPicks,
    nulls: row.nullPicks,
    hits: row.touchedPicks,
    hitRate: percent(row.hitRate),
    nullRate: percent(row.nullRate),
    statusHit: row.statusCounts.hit,
    statusMiss: row.statusCounts.miss,
    statusUnexpectedUntradeable: row.statusCounts.unexpected_untradeable,
    statusDataError: row.statusCounts.data_error,
  })))
  console.table(report.recent4Weeks.map((week) => ({
    period: `${week.startDate}~${week.endDate}`,
    picks: week.totalPicks,
    labeled: week.labeledPicks,
    nulls: week.nullPicks,
    hits: week.touchedPicks,
    hitRate: percent(week.hitRate),
    nullRate: percent(week.nullRate),
  })))
  console.log(`제품 기준: 5보유일 타율 ${percent(report.overall.hitRate)} (${report.overall.touchedPicks}/${report.overall.labeledPicks})`)
  console.log(`참고: 8보유일 확장 시 타율 ${percent(report.informational8HoldingDays.hitRate)} (${report.informational8HoldingDays.touchedPicks}/${report.informational8HoldingDays.labeledPicks})`)
  // 워크플로우가 이 로그를 GITHUB_STEP_SUMMARY에 그대로 적재하므로 같은 섹션이 양쪽에 노출된다.
  console.log(renderShadowForwardComparisonSection(report.shadowComparison))
}

const readDays = (args: readonly string[]): number => {
  const raw = args.find((arg) => arg.startsWith('--days='))?.slice('--days='.length)
  if (!raw) return DEFAULT_LOOKBACK_DAYS
  const days = Number(raw)
  if (!Number.isInteger(days) || days <= 0) throw new Error(`--days는 양의 정수여야 합니다: ${raw}`)
  return days
}

const isDirectRun = /measure-forward\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const lookbackDays = readDays(process.argv.slice(2))
  const asOfDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const startDate = addCalendarDays(asOfDate, -(lookbackDays - 1))

  Promise.all([
    loadPublishedNewsletters(startDate, asOfDate),
    loadTradingDayIndex(),
    loadStockPickSnapshots({ from: startDate, to: asOfDate }),
  ]).then(async ([newsletters, tradingDays, snapshots]) => {
    const publishedPicks = newsletters.flatMap((row) => parsePublishedPicks(row).picks)
    const maturePicks = publishedPicks.flatMap((pick) => {
      const mature = maturePick(pick, tradingDays, asOfDate)
      return mature ? [mature] : []
    })

    const matureSnapshotSignalDates = snapshots.map((snapshot) => snapshot.signal_date).filter((date) => {
      const entryDate = tradingDays.nextTradingDay(date, 1)
      const maturityDate = entryDate ? tradingDays.nextTradingDay(entryDate, 4) : null
      return maturityDate !== null && maturityDate <= asOfDate
    })
    const priceStartDate = [
      maturePicks.map((pick) => pick.entryDate).sort()[0],
      matureSnapshotSignalDates.map((date) => tradingDays.nextTradingDay(date, 1)).sort()[0],
    ].filter((date): date is string => date !== undefined).sort()[0]
    const prices = priceStartDate
      ? await loadPriceBook({ startDate: priceStartDate, endDate: asOfDate })
      : new Map()
    const dataContract = validateResearchDataset({
      tradingDays,
      prices,
      fromDate: priceStartDate ?? startDate,
      toDate: asOfDate,
    })
    console.log(JSON.stringify({ event: 'research_data_contract', ...dataContract }))
    const shadowComparison = measureShadowForwardComparison({
      prices,
      tradingDays,
      snapshots,
      startDate,
      asOfDate,
    })
    const report = measureForwardPicks({
      newsletters,
      prices,
      tradingDays,
      asOfDate,
      lookbackDays,
      shadowComparison,
    })
    printForwardMeasurementReport(report)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
