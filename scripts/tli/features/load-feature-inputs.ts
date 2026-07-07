import { addKoreanTradingDays, countKoreanTradingDaysBetween } from '@/lib/tli/trading-calendar'
import type { FeatureInputs, BasketStockFeatureInput } from '@/lib/tli/features/build-features'
import { KOSPI_INDEX_SYMBOL, selectTopThemeStockSymbols } from '@/scripts/tli/prices/stock-daily-prices'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

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

export interface FeatureInputRows {
  readonly themeId: string
  readonly baseDate: string
  readonly interestRows: readonly InterestMetricFeatureRow[]
  readonly newsRows: readonly NewsMetricFeatureRow[]
  readonly themeStockRows: readonly ThemeStockFeatureRow[]
  readonly priceRows: readonly StockDailyFeatureRow[]
  readonly themeStateRows: readonly ThemeStateFeatureRow[]
  readonly completedEpisodeRows: readonly CompletedEpisodeFeatureRow[]
}

export interface LoadFeatureInputsRequest {
  readonly themeId: string
  readonly baseDate: string
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

const buildBasketStocks = (input: FeatureInputRows): BasketStockFeatureInput[] => {
  const lookbackDate = addKoreanTradingDays(input.baseDate, -5)
  return selectTopThemeStockSymbols(input.themeStockRows, 5).map((symbol) => ({
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
  }
}

export async function loadFeatureInputsForBaseDate(
  request: LoadFeatureInputsRequest,
): Promise<FeatureInputs> {
  const startDate = addKoreanTradingDays(request.baseDate, -20)
  const [interest, news, stocks, prices, states, episodes] = await Promise.all([
    supabaseAdmin
      .from('interest_metrics')
      .select('theme_id, time, raw_value, anchor_scaled_value')
      .gte('time', startDate)
      .lte('time', request.baseDate),
    supabaseAdmin
      .from('news_metrics')
      .select('theme_id, time, article_count')
      .gte('time', startDate)
      .lte('time', request.baseDate),
    supabaseAdmin
      .from('theme_stocks')
      .select('theme_id, symbol, relevance, is_active')
      .eq('theme_id', request.themeId)
      .eq('is_active', true),
    supabaseAdmin
      .from('stock_daily_prices')
      .select('symbol, trade_date, close, volume')
      .gte('trade_date', startDate)
      .lte('trade_date', request.baseDate),
    supabaseAdmin
      .from('theme_state_history_v2')
      .select('theme_id, effective_from, is_active, first_spike_date')
      .eq('theme_id', request.themeId)
      .lte('effective_from', request.baseDate),
    supabaseAdmin
      .from('episode_registry_v1')
      .select('episode_start, episode_end, primary_peak_date, is_active')
      .eq('is_active', false)
      .lte('episode_end', request.baseDate),
  ])

  for (const response of [interest, news, stocks, prices, states, episodes]) {
    if (response.error) {
      throw new Error(`T-201 피처 입력 로딩 실패: ${response.error.message}`)
    }
  }

  return assembleFeatureInputsFromRows({
    themeId: request.themeId,
    baseDate: request.baseDate,
    interestRows: interest.data ?? [],
    newsRows: news.data ?? [],
    themeStockRows: stocks.data ?? [],
    priceRows: prices.data ?? [],
    themeStateRows: states.data ?? [],
    completedEpisodeRows: episodes.data ?? [],
  })
}
