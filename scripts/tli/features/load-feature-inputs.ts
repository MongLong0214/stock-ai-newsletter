import { addKoreanTradingDays, countKoreanTradingDaysBetween } from '@/lib/tli/trading-calendar'
import type { FeatureInputs, BasketStockFeatureInput } from '@/lib/tli/features/build-features'
import { KST_OFFSET_MS } from '@/lib/tli/date-utils'
import { KOSPI_INDEX_SYMBOL, selectTopThemeStockSymbols } from '@/scripts/tli/prices/stock-daily-prices'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { loadThemeStockMembershipAsOf } from '@/scripts/tli/features/load-membership-as-of'

export interface InterestMetricFeatureRow {
  readonly theme_id: string
  readonly time: string
  readonly raw_value: number | null
  readonly anchor_scaled_value: number | null
}

export interface NewsMetricFeatureRow {
  readonly theme_id: string
  readonly time: string
  readonly article_count: number | null
}

export interface ThemeStockFeatureRow {
  readonly theme_id: string
  readonly symbol: string
  readonly relevance: number | null
  readonly is_active: boolean
  readonly created_at?: string | null
}

export interface StockDailyFeatureRow {
  readonly symbol: string
  readonly trade_date: string
  readonly close: number
  readonly volume: number | null
}

export interface ThemeStateFeatureRow {
  readonly theme_id: string
  readonly effective_from: string
  readonly is_active: boolean
  readonly first_spike_date: string | null
}

export interface CompletedEpisodeFeatureRow {
  readonly episode_start: string
  readonly episode_end: string | null
  readonly primary_peak_date: string | null
  readonly is_active: boolean
}

export interface PredictionSnapshotFeatureRow {
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
}

export interface FeatureInputRows {
  readonly themeId: string
  readonly baseDate: string
  readonly interestRows: readonly InterestMetricFeatureRow[]
  readonly newsRows: readonly NewsMetricFeatureRow[]
  readonly themeStockRows: readonly ThemeStockFeatureRow[]
  readonly priceRows: readonly StockDailyFeatureRow[]
  readonly themeStateRows: readonly ThemeStateFeatureRow[]
  readonly completedEpisodeRows: readonly CompletedEpisodeFeatureRow[]
  readonly snapshotRows: readonly PredictionSnapshotFeatureRow[]
}

export interface LoadFeatureInputsRequest {
  readonly themeId: string
  readonly baseDate: string
}

interface QueryError {
  readonly message: string
}

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{
    readonly data: readonly T[] | null
    readonly error: QueryError | null
  }>
}

const PAGE_SIZE = 1000

const fetchAllRows = async <T>(createQuery: () => RangeQuery<T>): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`T-201 피처 입력 로딩 실패: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

const getFiniteNumber = (value: number | null): number | null => (
  value === null || !Number.isFinite(value) ? null : value
)

const sortByDate = <T extends { readonly [K in D]: string }, D extends keyof T>(
  rows: readonly T[],
  dateKey: D,
): T[] => [...rows].sort((left, right) => left[dateKey].localeCompare(right[dateKey]))

const mean = (values: readonly number[]): number | null => {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

const getCloseAtDate = (rows: readonly StockDailyFeatureRow[], symbol: string, date: string): number | null => {
  const row = rows.find((price) => price.symbol === symbol && price.trade_date === date)
  return getFiniteNumber(row?.close ?? null)
}

const getVolumesThroughBase = (
  rows: readonly StockDailyFeatureRow[],
  symbol: string,
  baseDate: string,
  count: number,
): number[] => sortByDate(
  rows.filter((row) => row.symbol === symbol && row.trade_date <= baseDate && row.volume !== null),
  'trade_date',
).slice(-count).flatMap((row) => getFiniteNumber(row.volume) ?? [])

const getKstDateFromTimestamp = (timestamp: string | null | undefined): string | null => {
  if (!timestamp) return null
  const millis = new Date(timestamp).getTime()
  if (!Number.isFinite(millis)) return null
  const [datePart] = new Date(millis + KST_OFFSET_MS).toISOString().split('T')
  return datePart ?? null
}

const buildBasketStocks = (input: FeatureInputRows): BasketStockFeatureInput[] => {
  const lookbackDate = addKoreanTradingDays(input.baseDate, -5)
  // Point-in-time eligibility can only prove the mapping existed by baseDate.
  // Current is_active still drops later-deactivated stocks until membership history exists.
  const basketRows = input.themeStockRows.filter((row) => {
    if (row.theme_id !== input.themeId) return false
    const createdDate = getKstDateFromTimestamp(row.created_at)
    return createdDate === null || createdDate <= input.baseDate
  })

  return selectTopThemeStockSymbols(basketRows, 5).map((symbol) => ({
    symbol,
    closeAtLookback: getCloseAtDate(input.priceRows, symbol, lookbackDate),
    closeAtBase: getCloseAtDate(input.priceRows, symbol, input.baseDate),
    recentVolumes: getVolumesThroughBase(input.priceRows, symbol, input.baseDate, 5),
    baselineVolumes: getVolumesThroughBase(input.priceRows, symbol, input.baseDate, 20),
  }))
}

const buildCrossSectionalAnchorMeans = (input: FeatureInputRows): number[] => {
  const byTheme = new Map<string, number[]>()
  for (const row of input.interestRows) {
    if (row.time > input.baseDate) continue
    const value = getFiniteNumber(row.anchor_scaled_value)
    if (value === null) continue
    const values = byTheme.get(row.theme_id) ?? []
    values.push(value)
    byTheme.set(row.theme_id, values)
  }

  return [...byTheme.values()].flatMap((values) => {
    const recentMean = mean(values.slice(-7))
    return recentMean === null ? [] : [recentMean]
  })
}

const getDaysSinceSpike = (input: FeatureInputRows): number | null => {
  const latestActive = sortByDate(
    input.themeStateRows.filter((row) => (
      row.theme_id === input.themeId && row.is_active && row.effective_from <= input.baseDate
    )),
    'effective_from',
  ).at(-1)
  const spikeDate = latestActive?.first_spike_date ?? latestActive?.effective_from ?? null
  return spikeDate ? countKoreanTradingDaysBetween({ fromDate: spikeDate, toDate: input.baseDate }) : null
}

/**
 * baseDate 시점에 이미 완결된(episode_end <= baseDate) 에피소드만 코호트에 포함한다.
 * 코호트를 baseDate 제한 없이 로드/재사용하는 호출부(offline-eval-data.ts 등)가 있으므로
 * 조립 단계에서 반드시 이 필터를 적용해야 walk-forward 평가의 미래 누수를 막을 수 있다.
 * lib/tli/analog/baselines.ts의 filterObservableCorpus와 동일한 관측 가능성 판정 사상.
 */
const buildCompletedEpisodePeakDays = (rows: readonly CompletedEpisodeFeatureRow[], baseDate: string): number[] => (
  rows.flatMap((row) => {
    if (row.is_active || row.primary_peak_date === null) return []
    if (row.episode_end === null || row.episode_end > baseDate) return []
    return [countKoreanTradingDaysBetween({
      fromDate: row.episode_start,
      toDate: row.primary_peak_date,
    })]
  })
)

const resolveBablPhaseSignal = (input: FeatureInputRows): number | null => {
  const snapshot = input.snapshotRows.find((row) => (
    row.theme_id === input.themeId && row.snapshot_date === input.baseDate
  ))
  if (!snapshot) return null
  switch (snapshot.phase) {
    case 'rising':
      return 1
    case 'cooling':
      return -1
    default:
      return 0
  }
}

export function assembleFeatureInputsFromRows(input: FeatureInputRows): FeatureInputs {
  const themeInterestRows = sortByDate(
    input.interestRows.filter((row) => row.theme_id === input.themeId && row.time <= input.baseDate),
    'time',
  )
  const themeNewsRows = sortByDate(
    input.newsRows.filter((row) => row.theme_id === input.themeId && row.time <= input.baseDate),
    'time',
  )
  const lookbackDate = addKoreanTradingDays(input.baseDate, -5)

  return {
    interestRaw: themeInterestRows.flatMap((row) => getFiniteNumber(row.raw_value) ?? []),
    anchorScaled: themeInterestRows.slice(-7).flatMap((row) => getFiniteNumber(row.anchor_scaled_value) ?? []),
    crossSectionalAnchorMeans: buildCrossSectionalAnchorMeans(input),
    newsCounts: themeNewsRows.flatMap((row) => getFiniteNumber(row.article_count) ?? []),
    basketStocks: buildBasketStocks(input),
    kospiCloseAtLookback: getCloseAtDate(input.priceRows, KOSPI_INDEX_SYMBOL, lookbackDate),
    kospiCloseAtBase: getCloseAtDate(input.priceRows, KOSPI_INDEX_SYMBOL, input.baseDate),
    daysSinceSpike: getDaysSinceSpike(input),
    completedEpisodePeakDays: buildCompletedEpisodePeakDays(input.completedEpisodeRows, input.baseDate),
    bablPhaseSignal: resolveBablPhaseSignal(input),
  }
}

/** base_date에만 의존하는 교차 테마·교차 종목 입력 (한 base_date의 모든 테마가 동일하게 재사용) */
export interface SharedFeatureRows {
  readonly interestRows: readonly InterestMetricFeatureRow[]
  readonly newsRows: readonly NewsMetricFeatureRow[]
  readonly priceRows: readonly StockDailyFeatureRow[]
  readonly completedEpisodeRows: readonly CompletedEpisodeFeatureRow[]
  readonly snapshotRows: readonly PredictionSnapshotFeatureRow[]
}

/** themeId로 필터되는 소량·인덱스 입력 (테마별로 다름) */
export interface ThemeScopedFeatureRows {
  readonly themeStockRows: readonly ThemeStockFeatureRow[]
  readonly themeStateRows: readonly ThemeStateFeatureRow[]
}

/**
 * base_date에만 의존하는 공유 입력을 로드한다.
 *
 * ⚠️ 반드시 테마 루프 **밖에서 base_date당 한 번만** 호출할 것. 루프 안에서 호출하면
 * interest/news/price/snapshot의 전 테마·전 종목 20일 창을 테마 수만큼 중복 로드해 egress가
 * O(themes)로 폭증한다 — 2026-07 Supabase egress 초과(19GB)의 근본 원인이 바로 이 패턴이었다.
 */
export async function loadSharedFeatureRows(baseDate: string): Promise<SharedFeatureRows> {
  const startDate = addKoreanTradingDays(baseDate, -20)
  const [interestRows, newsRows, priceRows, completedEpisodeRows, snapshotRows] = await Promise.all([
    fetchAllRows<InterestMetricFeatureRow>(() => supabaseAdmin
      .from('interest_metrics')
      .select('theme_id, time, raw_value, anchor_scaled_value')
      .gte('time', startDate)
      .lte('time', baseDate)
      .order('time', { ascending: true })
      .order('theme_id', { ascending: true })
      .order('id', { ascending: true })),
    fetchAllRows<NewsMetricFeatureRow>(() => supabaseAdmin
      .from('news_metrics')
      .select('theme_id, time, article_count')
      .gte('time', startDate)
      .lte('time', baseDate)
      .order('time', { ascending: true })
      .order('theme_id', { ascending: true })
      .order('id', { ascending: true })),
    fetchAllRows<StockDailyFeatureRow>(() => supabaseAdmin
      .from('stock_daily_prices')
      .select('symbol, trade_date, close, volume')
      .gte('trade_date', startDate)
      .lte('trade_date', baseDate)
      .order('trade_date', { ascending: true })
      .order('symbol', { ascending: true })),
    fetchAllRows<CompletedEpisodeFeatureRow>(() => supabaseAdmin
      .from('episode_registry_v1')
      .select('episode_start, episode_end, primary_peak_date, is_active')
      .eq('is_active', false)
      .lte('episode_end', baseDate)
      .order('episode_end', { ascending: true })
      .order('episode_start', { ascending: true })
      .order('id', { ascending: true })),
    fetchAllRows<PredictionSnapshotFeatureRow>(() => supabaseAdmin
      .from('prediction_snapshots_v2')
      .select('theme_id, snapshot_date, phase')
      .eq('run_type', 'prod')
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', baseDate)
      .order('snapshot_date', { ascending: true })
      .order('theme_id', { ascending: true })
      .order('id', { ascending: true })),
  ])

  return { interestRows, newsRows, priceRows, completedEpisodeRows, snapshotRows }
}

/** 테마 스코프 입력 로드 (theme_stocks + theme_state — themeId 인덱스, 소량) */
export async function loadThemeScopedFeatureRows(
  themeId: string,
  baseDate: string,
): Promise<ThemeScopedFeatureRows> {
  const [stocks, themeStateRows] = await Promise.all([
    supabaseAdmin
      .from('theme_stocks')
      .select('theme_id, symbol, relevance, is_active, created_at')
      .eq('theme_id', themeId)
      .eq('is_active', true),
    fetchAllRows<ThemeStateFeatureRow>(() => supabaseAdmin
      .from('theme_state_history_v2')
      .select('theme_id, effective_from, is_active, first_spike_date')
      .eq('theme_id', themeId)
      .lte('effective_from', baseDate)
      .order('effective_from', { ascending: true })
      .order('theme_id', { ascending: true })
      .order('id', { ascending: true })),
  ])

  if (stocks.error) {
    throw new Error(`T-201 피처 입력 로딩 실패: ${stocks.error.message}`)
  }

  return { themeStockRows: stocks.data ?? [], themeStateRows }
}

/**
 * 단일 테마의 피처 입력. 공유 로드 + 테마 로드를 합친 하위호환 래퍼.
 *
 * 다수 테마를 처리할 때는 이 함수를 루프에서 부르지 말고, `loadSharedFeatureRows`를 루프 밖에서
 * 한 번 부른 뒤 테마별로 `loadThemeScopedFeatureRows` + `assembleFeatureInputsFromRows`를 조합하라.
 */
export async function loadFeatureInputsForBaseDate(
  request: LoadFeatureInputsRequest,
): Promise<FeatureInputs> {
  const [shared, themeScoped] = await Promise.all([
    loadSharedFeatureRows(request.baseDate),
    loadThemeScopedFeatureRows(request.themeId, request.baseDate),
  ])

  return assembleFeatureInputsFromRows({
    themeId: request.themeId,
    baseDate: request.baseDate,
    ...shared,
    ...themeScoped,
  })
}
