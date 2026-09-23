import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { KOREAN_MARKET_HOLIDAYS_BY_YEAR } from '@/app/archive/_utils/market/_constants/holidays'
import type { StockData, StockSignals } from '@/lib/llm/_types/stock-data'
import { validateStockData } from '@/lib/llm/korea/stock-json'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import {
  getRawPrice,
  loadPriceBook,
  StockDataHandler,
  type PriceBook,
} from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries, type StockFeatureVector } from '@/scripts/stock-picks/features'
import { parsePublishedPicks } from '@/scripts/stock-picks/measure-forward'
import { buildTechnicalContextMap, type TechnicalContext } from '@/scripts/stock-picks/technical-context'
import {
  hashCanonicalJson,
  LEGACY_VOLUME_BREAKOUT_STRATEGY,
  PRODUCTION_STRATEGY,
  PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
} from '@/scripts/stock-picks/production-strategy'
import {
  LOW_VOLATILITY_STABLE_PARAMETERS,
  rankLowVolatilityStableCandidates,
  rankSeededRandomCandidates,
  rankStrategyCandidates,
  rankTieredFillCandidates,
  type StockMasterState,
  type TieredFillTier,
} from '@/scripts/stock-picks/strategies'
import {
  findMissingTradingDays,
  loadTradingDayIndex,
  type TradingDayIndex,
} from '@/scripts/stock-picks/trading-days'

// optimize의 FEATURE_WARMUP_DAYS와 같은 320거래일을 써 장기 피처 계산 창을 통일한다.
const PRICE_HISTORY_TRADING_DAYS = 320
const REQUIRED_PICK_COUNT = 3

export { PRODUCTION_VOLUME_BREAKOUT_PARAMETERS } from '@/scripts/stock-picks/production-strategy'

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
  readonly loadRecentPublishedSymbols?: (input: {
    readonly signalDate: string
    readonly tradingDays: TradingDayIndex
    readonly lookbackTradingDays: number
  }) => Promise<ReadonlySet<string>>
}

export interface StockPicksFunnel {
  readonly signalDate: string
  readonly activeMasters: number
  readonly withFreshKisRow: number
  readonly withCompleteFeatures: number
  readonly gatePassed: number
  readonly picked: number
}

export interface RankedStockFeature extends StockFeatureVector {
  readonly technicalContext?: TechnicalContext
  readonly name: string
  readonly score: number
  readonly rank: number
  readonly tier: TieredFillTier
}

export interface GeneratePicksMeta {
  readonly signalDate: string
  readonly strategy: typeof PRODUCTION_STRATEGY.name
  readonly strategyVersion: typeof PRODUCTION_STRATEGY.version
  readonly parameters: typeof LOW_VOLATILITY_STABLE_PARAMETERS
  readonly parametersHash: string
  readonly funnel: StockPicksFunnel
  readonly rankedCandidates: readonly RankedStockFeature[]
  readonly shadows: ReadonlyArray<{
    readonly strategy: string
    readonly strategyVersion: string
    readonly parametersHash: string
    readonly picks: RankedStockFeature[]
  }>
}

export async function loadRecentPublishedSymbols(input: {
  readonly signalDate: string
  readonly tradingDays: TradingDayIndex
  readonly lookbackTradingDays: number
}): Promise<ReadonlySet<string>> {
  const signalIndex = input.tradingDays.indexByDate.get(input.signalDate)
  if (signalIndex === undefined) throw new Error(`거래일 인덱스에 신호일이 없습니다: ${input.signalDate}`)
  const startDate = input.tradingDays.tradingDays[Math.max(0, signalIndex - input.lookbackTradingDays + 1)]!
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const rows = await fetchAllRows<{ newsletter_date: string; gemini_analysis: string; picks_source: string | null }>((from, to) => supabaseAdmin
    .from('newsletter_content')
    .select('newsletter_date, gemini_analysis, picks_source')
    .gte('newsletter_date', startDate)
    .lte('newsletter_date', input.signalDate)
    .order('newsletter_date', { ascending: true })
    .range(from, to))
  return new Set(rows.flatMap((row) => {
    const parsed = parsePublishedPicks(row)
    if (parsed.kind === 'invalid') {
      throw new Error(`발행 종목 파싱 실패: newsletter_date=${row.newsletter_date}`)
    }
    return parsed.picks.map((pick) => pick.symbol)
  }))
}

export interface GeneratePicksResult {
  readonly json: string
  readonly picks: readonly StockData[]
  readonly meta: GeneratePicksMeta
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

/** 뉴스레터 준비 시점에 완전히 끝난 가장 최근 거래일이다. */
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

/**
 * 마지막 실측일을 검증하고, 완전히 끝난 캔들까지만 사용할 신호일을 반환한다.
 * 기존 호출부 호환을 위해 export 이름과 두 인자 시그니처는 유지한다.
 */
export function assertFreshSignalDate(lastDate: string, todayKst: string): string {
  const expectedSignalDate = getExpectedSignalDate(todayKst)
  if (lastDate < expectedSignalDate) {
    throw new Error(
      `주가 데이터 신선도 게이트 실패: signalDate=${lastDate}, expected=${expectedSignalDate}, todayKst=${todayKst}`,
    )
  }
  if (lastDate > expectedSignalDate) {
    console.warn(`⚠️ 당일 미완성 캔들 감지 → signalDate=${expectedSignalDate}로 트리밍 (lastDate=${lastDate})`)
  }
  return expectedSignalDate
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

export const hasCalculatedOutputMetrics = (feature: StockFeatureVector): boolean => [
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

export function buildRationale(
  feature: StockFeatureVector,
  strategyScore: number,
  tier: TieredFillTier,
  rank?: number,
): string {
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
    tier === 'lowVolatility' ? `변동성 안정 순위 ${rank ?? 0}위` : `volumeBreakout 전략점수 ${strategyScore.toFixed(1)}점`,
    `선정 경로 ${tier === 'lowVolatility' ? '저변동 안정' : tier === 'breakout' ? '거래량 돌파' : '거래량 상위 보충'}`,
  ].join('|')
}

export async function generatePicksWithMeta(input: {
  readonly todayKst?: string
  readonly dependencies?: GeneratePicksDependencies
} = {}): Promise<GeneratePicksResult> {
  const todayKst = input.todayKst ?? getKSTDateString()
  const loadTradingDays = input.dependencies?.loadTradingDays ?? loadTradingDayIndex
  const loadPrices = input.dependencies?.loadPrices ?? loadPriceBook
  const loadMasters = input.dependencies?.loadMasters ?? loadStockPickMasters
  const loadRecent = input.dependencies?.loadRecentPublishedSymbols ?? loadRecentPublishedSymbols

  const tradingDays = await loadTradingDays()
  const lastDate = tradingDays.lastDate
  if (!lastDate) throw new Error('KOSPI 실측 거래일이 없습니다')
  const signalDate = assertFreshSignalDate(lastDate, todayKst)
  const signalDateIndex = tradingDays.indexByDate.get(signalDate)
  if (signalDateIndex === undefined) {
    throw new Error(
      `주가 데이터 신선도 게이트 실패: expected=${signalDate}가 KOSPI 실측 거래일 인덱스에 없습니다`,
    )
  }

  const historyDates = tradingDays.tradingDays.slice(
    Math.max(0, signalDateIndex - PRICE_HISTORY_TRADING_DAYS + 1),
    signalDateIndex + 1,
  )
  const startDate = historyDates[0]
  if (!startDate || historyDates.length < PRICE_HISTORY_TRADING_DAYS) {
    throw new Error(`피처 계산용 거래일 부족: ${historyDates.length}/${PRICE_HISTORY_TRADING_DAYS}`)
  }
  const missingTradingDays = findMissingTradingDays(tradingDays, startDate, signalDate)
  if (missingTradingDays.length > 0) {
    console.warn(
      `⚠️ 320거래일 피처 창의 캘린더 거래일 누락: count=${missingTradingDays.length}`,
    )
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
  const technicalContexts = buildTechnicalContextMap({
    handler,
    symbols: masters.filter((master) => master.is_active).map((master) => master.symbol),
    dates: historyDates,
    includeFromDate: signalDate,
  }).get(signalDate)
  const recentPublishedSymbols = await loadRecent({
    signalDate,
    tradingDays,
    lookbackTradingDays: LOW_VOLATILITY_STABLE_PARAMETERS.recentPickTradingDays,
  })
  const rankedSymbols = rankLowVolatilityStableCandidates({
    features,
    masters: mastersBySymbol,
    parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
    excludeSymbols: recentPublishedSymbols,
    pickCount: features.length,
  })
  const rankedFeatures: RankedStockFeature[] = rankedSymbols.flatMap((symbol, index) => {
    const feature = featuresBySymbol.get(symbol)
    const master = mastersBySymbol.get(symbol)
    if (!feature || !master || feature.atrPercent14 === null) return []
    // score는 ATR% 원값이며 낮을수록 좋은 순위다.
    return [{ ...feature, name: master.name, score: feature.atrPercent14, rank: index + 1,
      tier: 'lowVolatility', technicalContext: technicalContexts?.get(symbol) }]
  })
  const ranked = rankedFeatures.slice(0, REQUIRED_PICK_COUNT)
  if (ranked.length !== REQUIRED_PICK_COUNT) {
    throw new Error(`저변동 후보 부족: ${ranked.length}/${REQUIRED_PICK_COUNT}`)
  }

  const shadows: GeneratePicksMeta['shadows'][number][] = []
  const addShadow = (strategy: string, strategyVersion: string, parametersHash: string,
    candidates: readonly { symbol: string; tier: TieredFillTier; score: number }[]) => {
    if (candidates.length < REQUIRED_PICK_COUNT) {
      console.warn(`⚠️ ${strategy} 섀도우 후보 부족: ${candidates.length}/${REQUIRED_PICK_COUNT}`)
      return
    }
    const picks = candidates.slice(0, REQUIRED_PICK_COUNT).flatMap(({ symbol, tier, score }, index) => {
      const feature = featuresBySymbol.get(symbol)
      const master = mastersBySymbol.get(symbol)
      return feature && master
        ? [{ ...feature, name: master.name, score, rank: index + 1, tier,
          technicalContext: technicalContexts?.get(symbol) }]
        : []
    })
    if (picks.length < REQUIRED_PICK_COUNT) {
      console.warn(`⚠️ ${strategy} 섀도우 후보 부족: ${picks.length}/${REQUIRED_PICK_COUNT}`)
      return
    }
    shadows.push({ strategy, strategyVersion, parametersHash, picks })
  }
  try {
    const breakoutCandidates = rankStrategyCandidates({
      name: 'volumeBreakoutNoGapUp',
      features,
      masters: mastersBySymbol,
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      mode: 'force3',
      pickCount: features.length,
    })
    const breakoutScores = new Map(breakoutCandidates.map((candidate) => (
      [candidate.symbol, candidate.score]
    )))
    const legacyCandidates = rankTieredFillCandidates({
      features,
      masters: mastersBySymbol,
      parameters: PRODUCTION_VOLUME_BREAKOUT_PARAMETERS,
      tiers: LEGACY_VOLUME_BREAKOUT_STRATEGY.fillTiers,
    })
    addShadow('shadow:A-volumeBreakout-v1.1', LEGACY_VOLUME_BREAKOUT_STRATEGY.version,
      LEGACY_VOLUME_BREAKOUT_STRATEGY.parametersHash, legacyCandidates.map(({ symbol, tier }) => ({
        symbol, tier, score: tier === 'breakout' ? breakoutScores.get(symbol) ?? 0
          : featuresBySymbol.get(symbol)?.volumePercentile60 ?? 0,
      })))
  } catch (error) {
    console.warn('⚠️ shadow:A-volumeBreakout-v1.1 섀도우 계산 실패:', error)
  }
  const randomBase = { features, masters: mastersBySymbol,
    minTurnover: LOW_VOLATILITY_STABLE_PARAMETERS.minTurnover,
    maxRsi: LOW_VOLATILITY_STABLE_PARAMETERS.maxRsi, pickCount: REQUIRED_PICK_COUNT }
  try {
    const randomB = rankSeededRandomCandidates({ ...randomBase, excludePreferred: false, seed: `${signalDate}:B` })
    addShadow('shadow:B-random', 'v1-2026-09-23', hashCanonicalJson({
      gateVersion: 'status-flags-valid-candle-v2', seedRule: 'signalDate:B',
      minTurnover: randomBase.minTurnover, maxRsi: randomBase.maxRsi,
    }), randomB.map((symbol, index) => ({ symbol, tier: 'volumeOnly', score: index + 1 })))
  } catch (error) {
    console.warn('⚠️ shadow:B-random 섀도우 계산 실패:', error)
  }
  try {
    const randomJ = rankSeededRandomCandidates({ ...randomBase, excludePreferred: true,
      maxSignalDayReturn: LOW_VOLATILITY_STABLE_PARAMETERS.maxSignalDayReturn,
      excludeSymbols: recentPublishedSymbols, seed: `${signalDate}:J` })
    addShadow('shadow:J-randomConstrained', 'v1-2026-09-23', hashCanonicalJson({
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS, gateVersion: 'status-flags-valid-candle-v2',
      preferredRule: 'krx-code-last-digit-nonzero', seedRule: 'signalDate:J',
    }), randomJ.map((symbol, index) => ({ symbol, tier: 'volumeOnly', score: index + 1 })))
  } catch (error) {
    console.warn('⚠️ shadow:J-randomConstrained 섀도우 계산 실패:', error)
  }

  const picks: StockData[] = ranked.map(({ symbol, score, tier, rank }) => {
    const master = mastersBySymbol.get(symbol)
    const feature = featuresBySymbol.get(symbol)
    if (!master || !feature || feature.close === null || !Number.isInteger(feature.close) || feature.close <= 0) {
      throw new Error(`픽 원천 데이터 불완전: ${symbol}`)
    }
    return {
      ticker: symbol,
      name: master.name,
      close_price: feature.close,
      rationale: buildRationale(feature, score, tier, rank),
      signals: buildSignals(feature),
    }
  })

  if (!validateStockData(picks)) throw new Error('코드 픽이 StockDataArray 호환 계약을 통과하지 못했습니다')

  const parametersHash = PRODUCTION_STRATEGY.parametersHash
  const funnel: StockPicksFunnel = {
    signalDate,
    activeMasters: masters.filter((master) => master.is_active).length,
    withFreshKisRow: eligibleMasters.length,
    withCompleteFeatures: features.length,
    gatePassed: rankedSymbols.length,
    picked: picks.length,
  }
  console.log(JSON.stringify({ event: 'stock_picks_funnel', ...funnel }))

  const toObservableCandidate = (candidate: RankedStockFeature) => {
    const master = mastersBySymbol.get(candidate.symbol)
    return {
      rank: candidate.rank,
      ticker: candidate.symbol,
      name: master?.name ?? candidate.symbol,
      close: candidate.close,
      score: candidate.score,
      tier: candidate.tier,
      volumePercentile60: candidate.volumePercentile60,
      distanceFromHigh60: candidate.distanceFromHigh60,
      atrPercent14: candidate.atrPercent14,
      averageTurnover20: candidate.averageTurnover20,
      rsi14: candidate.rsi14,
      gapFromPreviousClosePercent: candidate.gapFromPreviousClosePercent,
      technicalContext: candidate.technicalContext,
    }
  }
  const picksByTier = { lowVolatility: ranked.length }
  console.log(JSON.stringify({
    event: 'stock_picks_generated',
    signalDate,
    strategy: PRODUCTION_STRATEGY.name,
    strategyVersion: PRODUCTION_STRATEGY.version,
    parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
    parametersHash,
    picksByTier,
    picks: rankedFeatures.slice(0, REQUIRED_PICK_COUNT).map(toObservableCandidate),
    topCandidates: rankedFeatures.slice(0, 20).map(toObservableCandidate),
    shadows: shadows.map((shadow) => ({ strategy: shadow.strategy, picks: shadow.picks.map((pick) => pick.symbol) })),
  }))

  const snapshotPath = process.env.STOCK_PICKS_SNAPSHOT_PATH
  if (snapshotPath) {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await writeFile(snapshotPath, `${JSON.stringify({
      signalDate,
      generatedAt: new Date().toISOString(),
      gitSha: process.env.GITHUB_SHA ?? null,
      strategy: PRODUCTION_STRATEGY.name,
      strategyVersion: PRODUCTION_STRATEGY.version,
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      parametersHash,
      funnel,
      picks: ranked,
      topCandidates: rankedFeatures.slice(0, 20),
    }, null, 2)}\n`, 'utf8')
  }

  const json = JSON.stringify(picks)
  return {
    json,
    picks,
    meta: {
      signalDate,
      strategy: PRODUCTION_STRATEGY.name,
      strategyVersion: PRODUCTION_STRATEGY.version,
      parameters: LOW_VOLATILITY_STABLE_PARAMETERS,
      parametersHash,
      funnel,
      rankedCandidates: rankedFeatures,
      shadows,
    },
  }
}

export async function generatePicks(input: {
  readonly todayKst?: string
  readonly dependencies?: GeneratePicksDependencies
} = {}): Promise<string> {
  return (await generatePicksWithMeta(input)).json
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
