import type { StockData, StockSignals } from '@/lib/llm/_types/stock-data'
import { validateStockData } from '@/lib/llm/korea/stock-json'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import { KOREAN_MARKET_HOLIDAYS_BY_YEAR } from '@/app/archive/_utils/market/_constants/holidays'
import {
  getRawPrice,
  loadPriceBook,
  StockDataHandler,
  type PriceBook,
} from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries, type StockFeatureVector } from '@/scripts/stock-picks/features'
import {
  rankStrategyCandidates,
  type StockMasterState,
  type VolumeBreakoutParameters,
} from '@/scripts/stock-picks/strategies'
import {
  loadTradingDayIndex,
  type TradingDayIndex,
} from '@/scripts/stock-picks/trading-days'

// optimize의 FEATURE_WARMUP_DAYS와 같은 320거래일을 써 장기 피처 계산 창을 통일한다.
const PRICE_HISTORY_TRADING_DAYS = 320
const REQUIRED_PICK_COUNT = 3

/**
 * optimize-v3(2026-08-28, 공급 하한 반영)의 volumeBreakoutNoGapUp 최빈 fold 선택값.
 * 전체 walk-forward OOS precision@3 = 43.0% (99/230), 고유 티커 214·최다 0.8%.
 * excludeGapUp: 갭상승 종목은 익일 시가가 이미 높아 +10% 여지가 소진 — 제외가 실측 우위.
 * 조용한 장에선 후보가 마르며(후보<3 throw) prepare가 LLM fallback으로 처리한다 — 의도된 abstain.
 */
export const PRODUCTION_VOLUME_BREAKOUT_PARAMETERS: VolumeBreakoutParameters = {
  minTurnover: 500_000_000,
  // force3에서는 minScore를 적용하지 않고 전략 게이트만 유효하다.
  minScore: 0,
  minVolumePercentile: 90,
  minDistanceFromHighPercent: 0,
  maxRsi: 75,
  excludeGapUp: true,
}

export interface StockPickMaster extends StockMasterState {
  readonly name: string
}

type LoadTradingDays = () => Promise<TradingDayIndex>
type LoadPrices = (input?: { readonly startDate?: string; readonly endDate?: string }) => Promise<PriceBook>
type LoadMasters = () => Promise<StockPickMaster[]>

export interface GeneratePicksDependencies {
  readonly loadTradingDays?: LoadTradingDays
  readonly loadPrices?: LoadPrices
  readonly loadMasters?: LoadMasters
}

export async function loadStockPickMasters(): Promise<StockPickMaster[]> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  return fetchAllRows<StockPickMaster>((from, to) => supabaseAdmin
    .from('stock_master')
    .select('symbol, name, is_active, status_flags')
    .eq('is_active', true)
    .order('symbol', { ascending: true })
    .range(from, to))
}

/** 06:00 KST 발행 준비 시점에 완전히 끝난 가장 최근 거래일이다. */
export function getExpectedSignalDate(todayKst: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKst)) {
    throw new Error(`todayKst 형식은 YYYY-MM-DD여야 합니다: ${todayKst}`)
  }
  const calendarYear = Number(todayKst.slice(0, 4))
  if (!KOREAN_MARKET_HOLIDAYS_BY_YEAR[calendarYear]) {
    throw new Error(`한국 증시 휴장일 캘린더 미등록 연도: ${calendarYear}`)
  }
  return addKoreanTradingDays(todayKst, -1)
}

export function assertFreshSignalDate(signalDate: string, todayKst: string): void {
  const expectedSignalDate = getExpectedSignalDate(todayKst)
  if (signalDate !== expectedSignalDate) {
    throw new Error(
      `주가 데이터 신선도 게이트 실패: signalDate=${signalDate}, expected=${expectedSignalDate}, todayKst=${todayKst}`,
    )
  }
}

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
)
const clampScore = (value: number): number => Math.round(clamp(value, 0, 100))
const average = (values: readonly number[]): number => (
  values.reduce((sum, value) => sum + value, 0) / values.length
)
const finiteOr = (value: number | null, fallback = 50): number => (
  value !== null && Number.isFinite(value) ? value : fallback
)
const centeredScore = (value: number | null, fullScale: number): number => (
  value === null ? 50 : clampScore(50 + value / fullScale * 50)
)

/**
 * 레거시 7개 카테고리를 전부 관측 기술지표로만 산출한다.
 * sentiment_score도 뉴스/LLM 감성이 아니라 가격 위치·추세·연속상승의 수급심리 대용치다.
 */
export function buildSignals(feature: StockFeatureVector): StockSignals {
  const close = finiteOr(feature.close, 1)
  const sma60Distance = feature.sma60 === null ? null : (close / feature.sma60 - 1) * 100
  const macdPercent = feature.macdHistogram === null ? null : feature.macdHistogram / close * 100
  const obvDailyVolume = feature.obvSlope20 === null || feature.volume === null || feature.volume === 0
    ? null
    : feature.obvSlope20 / feature.volume

  const trendScore = clampScore(average([
    centeredScore(feature.sma20DistancePercent, 10),
    centeredScore(sma60Distance, 20),
    centeredScore(feature.sma20Slope5 === null ? null : feature.sma20Slope5 * 100, 1),
    clampScore(finiteOr(feature.trendR2_20, 0.5) * 100),
  ]))
  const momentumScore = clampScore(average([
    clampScore(finiteOr(feature.rsi14)),
    centeredScore(macdPercent, 2),
    feature.bullishCandle === null ? 50 : feature.bullishCandle ? 65 : 35,
    clampScore(50 + finiteOr(feature.consecutiveUpDays, 0) * 10),
  ]))
  const volumeScore = clampScore(average([
    clampScore(finiteOr(feature.volumePercentile60)),
    centeredScore(feature.volumeRatio20 === null ? null : feature.volumeRatio20 - 1, 2),
    centeredScore(obvDailyVolume, 0.5),
  ]))
  const volatilityScore = feature.atrPercent14 === null
    ? 50
    : clampScore(100 - Math.abs(feature.atrPercent14 - 3) * 20)
  const patternScore = clampScore(average([
    centeredScore(feature.distanceFromHigh60, 5),
    feature.bullishCandle === null ? 50 : feature.bullishCandle ? 70 : 30,
    feature.goldenCrossAge === null ? 50 : clampScore(100 - feature.goldenCrossAge * 5),
    clampScore(finiteOr(feature.position52w, 0.5) * 100),
  ]))
  const sentimentScore = clampScore(average([
    clampScore(finiteOr(feature.position52w, 0.5) * 100),
    centeredScore(feature.trendSlope20 === null ? null : feature.trendSlope20 * 100, 1),
    clampScore(50 + finiteOr(feature.consecutiveUpDays, 0) * 10),
  ]))
  const overallScore = clampScore(
    trendScore * 0.20
    + momentumScore * 0.15
    + volumeScore * 0.25
    + volatilityScore * 0.10
    + patternScore * 0.20
    + sentimentScore * 0.10,
  )

  return {
    trend_score: trendScore,
    momentum_score: momentumScore,
    volume_score: volumeScore,
    volatility_score: volatilityScore,
    pattern_score: patternScore,
    sentiment_score: sentimentScore,
    overall_score: overallScore,
  }
}

const fixed = (value: number | null, digits = 1): string => finiteOr(value, 0).toFixed(digits)
const directionLabel = (value: number): string => value > 0 ? '상승' : value < 0 ? '하락' : '보합'
const rsiLabel = (value: number): string => value >= 60 ? '강세' : value <= 40 ? '약세' : '중립'
const volumeLabel = (ratio: number): string => ratio >= 2 ? '급증' : ratio >= 1 ? '평균상회' : '평균하회'

const hasCalculatedOutputMetrics = (feature: StockFeatureVector): boolean => [
  feature.open,
  feature.high,
  feature.low,
  feature.close,
  feature.volume,
  feature.averageTurnover20,
  feature.rsi14,
  feature.macdHistogram,
  feature.sma20,
  feature.sma60,
  feature.sma20Slope5,
  feature.sma20DistancePercent,
  feature.atrPercent14,
  feature.adx14,
  feature.obvSlope20,
  feature.volumeRatio20,
  feature.volumePercentile60,
  feature.position52w,
  feature.consecutiveUpDays,
  feature.trendR2_20,
  feature.trendSlope20,
  feature.trendR2_60,
  feature.distanceFromHigh60,
].every((value) => value !== null && Number.isFinite(value)) && feature.bullishCandle !== null

export function buildRationale(feature: StockFeatureVector, strategyScore: number): string {
  const close = finiteOr(feature.close, 0)
  const open = finiteOr(feature.open, close)
  const dailyReturn = open > 0 ? (close / open - 1) * 100 : 0
  const rsi = finiteOr(feature.rsi14)
  const volumeRatio = finiteOr(feature.volumeRatio20, 0)
  const highDistance = finiteOr(feature.distanceFromHigh60, 0)
  const trendSlopePercent = finiteOr(feature.trendSlope20, 0) * 100
  const obvSlope = finiteOr(feature.obvSlope20, 0)
  const positionPercent = finiteOr(feature.position52w, 0.5) * 100
  const goldenCrossAge = feature.goldenCrossAge ?? -1

  return [
    `기준일 종가 ${Math.round(close).toLocaleString('en-US')}원`,
    `당일 등락 ${fixed(dailyReturn)}% ${directionLabel(dailyReturn)}`,
    `RSI ${fixed(rsi)} ${rsiLabel(rsi)}`,
    `거래량비율 ${fixed(volumeRatio * 100, 0)}% ${volumeLabel(volumeRatio)}`,
    `60일 거래량 백분위 ${fixed(feature.volumePercentile60)}점`,
    highDistance >= 0
      ? `60일 신고가 ${fixed(highDistance)}% 돌파`
      : `60일 고점까지 ${fixed(Math.abs(highDistance))}%`,
    `20일선 괴리 ${fixed(feature.sma20DistancePercent)}%`,
    `20일 추세 기울기 ${fixed(trendSlopePercent, 2)}%/일`,
    `20일 추세 적합도 R2 ${fixed(finiteOr(feature.trendR2_20, 0.5) * 100)}점`,
    `60일 추세 적합도 R2 ${fixed(finiteOr(feature.trendR2_60, 0.5) * 100)}점`,
    `MACD 히스토그램 ${fixed(feature.macdHistogram, 2)}`,
    `ATR14 ${fixed(feature.atrPercent14)}%`,
    `ADX14 ${fixed(feature.adx14)}점`,
    `OBV20 기울기 ${fixed(obvSlope, 0)}`,
    `${feature.position52wObservations}거래일 가격위치 ${fixed(positionPercent)}%`,
    `연속상승 ${finiteOr(feature.consecutiveUpDays, 0).toFixed(0)}일`,
    `골든크로스 감지 ${goldenCrossAge >= 0 ? 1 : 0}회·경과 ${goldenCrossAge}일`,
    `20일 평균거래대금 ${fixed(finiteOr(feature.averageTurnover20) / 100_000_000, 1)}억원`,
    `volumeBreakout 전략점수 ${strategyScore.toFixed(1)}점`,
  ].join('|')
}

export async function generatePicks(input: {
  readonly todayKst?: string
  readonly dependencies?: GeneratePicksDependencies
} = {}): Promise<string> {
  const todayKst = input.todayKst ?? getKSTDateString()
  const loadTradingDays = input.dependencies?.loadTradingDays ?? loadTradingDayIndex
  const loadPrices = input.dependencies?.loadPrices ?? loadPriceBook
  const loadMasters = input.dependencies?.loadMasters ?? loadStockPickMasters

  const tradingDays = await loadTradingDays()
  const signalDate = tradingDays.lastDate
  if (!signalDate) throw new Error('KOSPI 실측 거래일이 없습니다')
  assertFreshSignalDate(signalDate, todayKst)

  const historyDates = tradingDays.tradingDays.slice(-PRICE_HISTORY_TRADING_DAYS)
  const startDate = historyDates[0]
  if (!startDate || historyDates.length < PRICE_HISTORY_TRADING_DAYS) {
    throw new Error(`피처 계산용 거래일 부족: ${historyDates.length}/${PRICE_HISTORY_TRADING_DAYS}`)
  }

  const [prices, masters] = await Promise.all([
    loadPrices({ startDate, endDate: signalDate }),
    loadMasters(),
  ])
  const handler = new StockDataHandler(prices, tradingDays).at(signalDate)
  const eligibleMasters = masters.filter((master) => {
    const current = getRawPrice(prices, master.symbol, signalDate)
    return master.is_active && current?.source === 'kis'
  })
  const mastersBySymbol = new Map(eligibleMasters.map((master) => [master.symbol, master]))
  const features = eligibleMasters.flatMap((master) => {
    const feature = buildFeatureSeries({
      handler,
      symbol: master.symbol,
      dates: historyDates,
      includeFromDate: signalDate,
    }).at(-1)
    return feature && hasCalculatedOutputMetrics(feature) ? [feature] : []
  })
  const featuresBySymbol = new Map(features.map((feature) => [feature.symbol, feature]))
  const ranked = rankStrategyCandidates({
    name: 'volumeBreakout',
    features,
    masters: mastersBySymbol,
    parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
    mode: 'force3',
    pickCount: REQUIRED_PICK_COUNT,
  })
  if (ranked.length !== REQUIRED_PICK_COUNT) {
    throw new Error(`volumeBreakout 후보 부족: ${ranked.length}/${REQUIRED_PICK_COUNT}`)
  }

  const picks: StockData[] = ranked.map(({ symbol, score }) => {
    const master = mastersBySymbol.get(symbol)
    const feature = featuresBySymbol.get(symbol)
    if (!master || !feature || feature.close === null || !Number.isInteger(feature.close) || feature.close <= 0) {
      throw new Error(`픽 원천 데이터 불완전: ${symbol}`)
    }
    return {
      ticker: symbol,
      name: master.name,
      close_price: feature.close,
      rationale: buildRationale(feature, score),
      signals: buildSignals(feature),
    }
  })

  if (!validateStockData(picks)) throw new Error('코드 픽이 StockDataArray 호환 계약을 통과하지 못했습니다')
  return JSON.stringify(picks)
}

const isDirectRun = /generate-picks\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  generatePicks().then((json) => {
    console.log(json)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
