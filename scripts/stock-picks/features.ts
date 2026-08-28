import type { GuardedStockDataHandler } from '@/scripts/stock-picks/data-handler'
import {
  adx,
  atrPercent,
  consecutiveUpDays,
  distanceFromHigh,
  ema,
  gapFromPreviousClosePercent,
  macdHistogram,
  obvSlope,
  position52w,
  rollingPercentileRank,
  sma,
  smaSlope,
  trendR2,
  volumeRatio,
  wilderRsi,
  type NullableNumber,
} from '@/scripts/stock-picks/indicators'

const FEATURE_HISTORY_DAYS = 320
const GOLDEN_CROSS_SEARCH_DAYS = 60

export interface StockFeatureVector {
  readonly symbol: string
  readonly simDate: string
  readonly open: number | null
  readonly high: number | null
  readonly low: number | null
  readonly close: number | null
  readonly volume: number | null
  readonly averageTurnover20: number | null
  readonly rsi14: number | null
  readonly macdHistogram: number | null
  readonly sma20: number | null
  readonly sma60: number | null
  readonly ema20: number | null
  readonly sma20Slope5: number | null
  readonly sma20DistancePercent: number | null
  readonly atrPercent14: number | null
  /** 0~100 범위의 최근 60거래일 ATR14 mid-rank percentile이다. */
  readonly atrPercentile60: number | null
  readonly adx14: number | null
  readonly adx14Previous: number | null
  readonly adx14Change: number | null
  readonly obvSlope20: number | null
  readonly volumeRatio20: number | null
  /** 0~100 범위의 최근 60거래일 거래량 mid-rank percentile이다. */
  readonly volumePercentile60: number | null
  readonly position52w: number | null
  readonly position52wObservations: number
  readonly position52wFullWindow: boolean
  readonly consecutiveUpDays: number | null
  readonly trendR2_20: number | null
  readonly trendSlope20: number | null
  readonly trendR2_20Previous: number | null
  readonly trendR2_20Change: number | null
  readonly trendR2_60: number | null
  readonly trendSlope60: number | null
  /** 현재 종가와 직전 60거래일 최고 종가의 거리로, 돌파 시 양수다. */
  readonly distanceFromHigh60: number | null
  /** 신호일 시가와 직전 거래일 종가 사이의 갭으로, 양수면 갭상승이다. */
  readonly gapFromPreviousClosePercent: number | null
  readonly goldenCrossAge: number | null
  readonly bullishCandle: boolean | null
}

const difference = (current: number | null, previous: number | null): number | null => (
  current === null || previous === null ? null : current - previous
)

const calculateGoldenCrossAge = (closes: readonly NullableNumber[]): number | null => {
  for (let age = 0; age <= GOLDEN_CROSS_SEARCH_DAYS; age++) {
    const end = closes.length - age
    if (end < 61) break
    const current = closes.slice(0, end)
    const previous = closes.slice(0, end - 1)
    const current20 = sma(current, 20)
    const current60 = sma(current, 60)
    const previous20 = sma(previous, 20)
    const previous60 = sma(previous, 60)
    if (
      current20 !== null && current60 !== null
      && previous20 !== null && previous60 !== null
      && current20 > current60 && previous20 <= previous60
    ) return age
  }
  return null
}

const buildVector = (input: {
  readonly symbol: string
  readonly simDate: string
  readonly opens: readonly NullableNumber[]
  readonly highs: readonly NullableNumber[]
  readonly lows: readonly NullableNumber[]
  readonly closes: readonly NullableNumber[]
  readonly volumes: readonly NullableNumber[]
  readonly atrPercent14Values: readonly NullableNumber[]
}): StockFeatureVector => {
  const { opens, highs, lows, closes, volumes } = input
  const currentClose = closes.at(-1) ?? null
  const currentOpen = opens.at(-1) ?? null
  const currentSma20 = sma(closes, 20)
  const currentAdx = adx(highs, lows, closes, 14)
  const previousAdx = adx(highs.slice(0, -1), lows.slice(0, -1), closes.slice(0, -1), 14)
  const currentTrend20 = trendR2(closes, 20)
  const previousTrend20 = trendR2(closes.slice(0, -1), 20)
  const trend60 = trendR2(closes, 60)
  const position = position52w(closes)
  const turnovers = closes.map((close, index) => {
    const volume = volumes[index]
    return close === null || volume === null ? null : close * volume
  })

  return {
    symbol: input.symbol,
    simDate: input.simDate,
    open: currentOpen,
    high: highs.at(-1) ?? null,
    low: lows.at(-1) ?? null,
    close: currentClose,
    volume: volumes.at(-1) ?? null,
    averageTurnover20: sma(turnovers, 20),
    rsi14: wilderRsi(closes, 14),
    macdHistogram: macdHistogram(closes),
    sma20: currentSma20,
    sma60: sma(closes, 60),
    ema20: ema(closes, 20),
    sma20Slope5: smaSlope(closes, 20, 5),
    sma20DistancePercent: currentClose === null || currentSma20 === null
      ? null
      : (currentClose / currentSma20 - 1) * 100,
    atrPercent14: input.atrPercent14Values.at(-1) ?? null,
    atrPercentile60: (() => {
      const rank = rollingPercentileRank(input.atrPercent14Values, 60)
      return rank === null ? null : rank * 100
    })(),
    adx14: currentAdx,
    adx14Previous: previousAdx,
    adx14Change: difference(currentAdx, previousAdx),
    obvSlope20: obvSlope(closes, volumes, 20),
    volumeRatio20: volumeRatio(volumes, 20),
    volumePercentile60: (() => {
      const rank = rollingPercentileRank(volumes, 60)
      return rank === null ? null : rank * 100
    })(),
    position52w: position.value,
    position52wObservations: position.observations,
    position52wFullWindow: position.fullWindow,
    consecutiveUpDays: consecutiveUpDays(closes),
    trendR2_20: currentTrend20?.r2 ?? null,
    trendSlope20: currentTrend20?.slope ?? null,
    trendR2_20Previous: previousTrend20?.r2 ?? null,
    trendR2_20Change: difference(currentTrend20?.r2 ?? null, previousTrend20?.r2 ?? null),
    trendR2_60: trend60?.r2 ?? null,
    trendSlope60: trend60?.slope ?? null,
    distanceFromHigh60: distanceFromHigh(closes, 60),
    gapFromPreviousClosePercent: gapFromPreviousClosePercent(closes.at(-2), currentOpen),
    goldenCrossAge: calculateGoldenCrossAge(closes),
    bullishCandle: currentOpen === null || currentClose === null ? null : currentClose > currentOpen,
  }
}

/**
 * 한 심볼의 가격행을 GuardedStockDataHandler에서 날짜당 한 번만 읽고, 각 기준일은
 * 해당 날짜까지의 prefix로만 계산한다. includeFromDate 이전 행은 warm-up으로만 쓴다.
 */
export function buildFeatureSeries(input: {
  readonly handler: GuardedStockDataHandler
  readonly symbol: string
  readonly dates: readonly string[]
  readonly includeFromDate?: string
}): StockFeatureVector[] {
  const dates = [...new Set(input.dates.filter(Boolean))].sort()
  const opens: NullableNumber[] = []
  const highs: NullableNumber[] = []
  const lows: NullableNumber[] = []
  const closes: NullableNumber[] = []
  const volumes: NullableNumber[] = []
  const atrPercent14Values: NullableNumber[] = []
  const output: StockFeatureVector[] = []

  for (const simDate of dates) {
    const row = input.handler.get(input.symbol, simDate)
    opens.push(row?.open ?? null)
    highs.push(row?.high ?? null)
    lows.push(row?.low ?? null)
    closes.push(row?.close ?? null)
    volumes.push(row?.volume ?? null)
    atrPercent14Values.push(atrPercent(
      highs.slice(-FEATURE_HISTORY_DAYS),
      lows.slice(-FEATURE_HISTORY_DAYS),
      closes.slice(-FEATURE_HISTORY_DAYS),
      14,
    ))
    if (input.includeFromDate && simDate < input.includeFromDate) continue

    output.push(buildVector({
      symbol: input.symbol,
      simDate,
      opens: opens.slice(-FEATURE_HISTORY_DAYS),
      highs: highs.slice(-FEATURE_HISTORY_DAYS),
      lows: lows.slice(-FEATURE_HISTORY_DAYS),
      closes: closes.slice(-FEATURE_HISTORY_DAYS),
      volumes: volumes.slice(-FEATURE_HISTORY_DAYS),
      atrPercent14Values: atrPercent14Values.slice(-FEATURE_HISTORY_DAYS),
    }))
  }
  return output
}

/** 단일 심볼×기준일 편의 함수. 최적화 러너는 buildFeatureSeries를 사용한다. */
export function buildFeatureVector(
  handler: GuardedStockDataHandler,
  symbol: string,
  simDate = handler.simDate,
): StockFeatureVector {
  const dates: string[] = []
  for (let offset = FEATURE_HISTORY_DAYS - 1; offset >= 0; offset--) {
    const date = handler.previousTradingDay(simDate, offset)
    if (date) dates.push(date)
  }
  const feature = buildFeatureSeries({ handler, symbol, dates }).at(-1)
  if (!feature) throw new Error(`피처 기준일이 거래일 인덱스에 없습니다: ${simDate}`)
  return feature
}
