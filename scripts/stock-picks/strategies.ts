import type { StockPickStrategy } from '@/scripts/stock-picks/backtest'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'

const DEFAULT_MIN_TURNOVER = 1_000_000_000
const PICKS_PER_DATE = 3

export type StrategyName =
  | 'pullbackRebound'
  | 'volumeBreakout'
  | 'volumeBreakoutBullishCandle'
  | 'volumeBreakoutNoGapUp'
  | 'earlyTrend'
  | 'composite'
export type SelectionMode = 'force3' | 'abstain'
export type AblationFeature = keyof StockFeatureVector
export type TieredFillTier = 'breakout' | 'relaxedBreakout' | 'volumeOnly'

export interface TieredFillPick {
  readonly symbol: string
  readonly tier: TieredFillTier
}

export const DEFAULT_TIERED_FILL_TIERS: readonly TieredFillTier[] = [
  'breakout',
  'relaxedBreakout',
  'volumeOnly',
]

export interface StockMasterState {
  readonly symbol: string
  readonly is_active: boolean
  readonly status_flags: Readonly<Record<string, unknown>> | null
}

interface CommonParameters {
  readonly minTurnover: number
  readonly minScore: number
}

export interface PullbackReboundParameters extends CommonParameters {
  readonly rsiMin: number
  readonly rsiMax: number
  readonly maxSma20DistancePercent: number
  readonly minTrendR2: number
  readonly minVolumeRatio: number
}

export interface VolumeBreakoutParameters extends CommonParameters {
  readonly minVolumePercentile: number
  readonly minDistanceFromHighPercent: number
  /** 과거 저장 파라미터는 70으로 해석한다. 새 최적화 그리드는 항상 값을 명시한다. */
  readonly maxRsi?: number
  readonly requireBullishCandle?: boolean
  readonly excludeGapUp?: boolean
}

export interface EarlyTrendParameters extends CommonParameters {
  readonly maxGoldenCrossAge: number
  readonly minAdx: number
  readonly minAdxChange: number
  readonly minTrendR2: number
  readonly maxTrendR2: number
  readonly minTrendR2Change: number
}

export interface CompositeParameters extends CommonParameters {
  readonly weightPullback: number
  readonly weightBreakout: number
  readonly weightEarlyTrend: number
  readonly pullback: PullbackReboundParameters
  readonly breakout: VolumeBreakoutParameters
  readonly earlyTrend: EarlyTrendParameters
}

export interface StrategyParameterMap {
  readonly pullbackRebound: PullbackReboundParameters
  readonly volumeBreakout: VolumeBreakoutParameters
  readonly volumeBreakoutBullishCandle: VolumeBreakoutParameters
  readonly volumeBreakoutNoGapUp: VolumeBreakoutParameters
  readonly earlyTrend: EarlyTrendParameters
  readonly composite: CompositeParameters
}

export const DEFAULT_PULLBACK_REBOUND_PARAMETERS: PullbackReboundParameters = {
  minTurnover: DEFAULT_MIN_TURNOVER,
  minScore: 45,
  rsiMin: 35,
  rsiMax: 55,
  maxSma20DistancePercent: 3,
  minTrendR2: 0.5,
  minVolumeRatio: 0.8,
}

export const DEFAULT_VOLUME_BREAKOUT_PARAMETERS: VolumeBreakoutParameters = {
  minTurnover: DEFAULT_MIN_TURNOVER,
  minScore: 45,
  minVolumePercentile: 95,
  minDistanceFromHighPercent: -3,
  maxRsi: 70,
  requireBullishCandle: false,
  excludeGapUp: false,
}

export const DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS: VolumeBreakoutParameters = {
  ...DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  requireBullishCandle: true,
}

export const DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS: VolumeBreakoutParameters = {
  ...DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  excludeGapUp: true,
}

/**
 * WHY: 전조 채굴 98,276건에서 ATR14 분리도 0.726이 1위였지만 같은 기간의 라벨을 본
 * 결과이므로 프로덕션 게이트에는 넣지 않는다. 게이트는 프로덕션과 동결하고 랭킹만
 * 포워드 섀도우로 측정한다. 포워드 픽 ≥40개 && 섀도우−프로덕션 ≥ +3%p이면
 * 자동 승격하지 않고 Isaac 결정 안건으로 올린다.
 */
export const VOLUME_BREAKOUT_ATR_RANK_PARAMETERS: VolumeBreakoutParameters = {
  minTurnover: 500_000_000,
  minScore: 0,
  minVolumePercentile: 90,
  minDistanceFromHighPercent: 0,
  maxRsi: 75,
  excludeGapUp: true,
}

export const DEFAULT_EARLY_TREND_PARAMETERS: EarlyTrendParameters = {
  minTurnover: DEFAULT_MIN_TURNOVER,
  minScore: 45,
  maxGoldenCrossAge: 10,
  minAdx: 15,
  minAdxChange: 0,
  minTrendR2: 0.25,
  maxTrendR2: 0.9,
  minTrendR2Change: 0,
}

export const DEFAULT_COMPOSITE_PARAMETERS: CompositeParameters = {
  minTurnover: DEFAULT_MIN_TURNOVER,
  minScore: 40,
  weightPullback: 1,
  weightBreakout: 1,
  weightEarlyTrend: 1,
  pullback: DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  breakout: DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  earlyTrend: DEFAULT_EARLY_TREND_PARAMETERS,
}

export const DEFAULT_STRATEGY_PARAMETERS: StrategyParameterMap = {
  pullbackRebound: DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  volumeBreakout: DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  volumeBreakoutBullishCandle: DEFAULT_VOLUME_BREAKOUT_BULLISH_CANDLE_PARAMETERS,
  volumeBreakoutNoGapUp: DEFAULT_VOLUME_BREAKOUT_NO_GAP_UP_PARAMETERS,
  earlyTrend: DEFAULT_EARLY_TREND_PARAMETERS,
  composite: DEFAULT_COMPOSITE_PARAMETERS,
}

export const COMPOSITE_ABLATION_FEATURES: readonly AblationFeature[] = [
  'sma20DistancePercent',
  'trendR2_60',
  'volumeRatio20',
  'volumePercentile60',
  'distanceFromHigh60',
  'goldenCrossAge',
  'adx14',
  'adx14Change',
  'trendR2_20',
  'trendR2_20Change',
]

export const COMPOSITE_ABLATION_EXCLUSIONS: ReadonlyArray<{
  readonly feature: AblationFeature
  readonly reason: string
}> = [
  {
    feature: 'rsi14',
    reason: '공통 과매수 하드 게이트이므로 OOS ablation 대상에서 제외한다.',
  },
  {
    feature: 'sma60',
    reason: 'pullbackRebound 적격성 게이트일 뿐 직접 점수 가중치가 없다.',
  },
  {
    feature: 'trendSlope60',
    reason: 'pullbackRebound 적격성 게이트일 뿐 직접 점수 가중치가 없다.',
  },
  {
    feature: 'bullishCandle',
    reason: '적격성 하드 게이트이므로 연속형 점수 기여 ablation에서 제외한다.',
  },
]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

interface ScoreComponent {
  readonly feature: AblationFeature
  readonly weight: number
  readonly score: number
}

/** ablation은 입력값이나 게이트를 지우지 않고 해당 점수 성분의 가중치만 0으로 만든다. */
const sumScoreComponents = (
  components: readonly ScoreComponent[],
  omittedFeature?: AblationFeature,
): number => components.reduce((sum, component) => (
  sum + (component.feature === omittedFeature ? 0 : component.weight * component.score)
), 0)

const flagged = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return false
  return ['Y', 'YES', 'TRUE', 'T', '1'].includes(value.trim().toUpperCase())
}

const trimmedCode = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export function passesCommonGate(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  minTurnover = DEFAULT_MIN_TURNOVER,
  maxRsi = 70,
): boolean {
  if (!master?.is_active) return false
  const statusFlags = master.status_flags
  if (
    flagged(statusFlags?.managed_stock)
    || flagged(statusFlags?.trading_suspended)
    || flagged(statusFlags?.liquidation_trading)
    || ['02', '03'].includes(trimmedCode(statusFlags?.market_warning_code))
    || ['2', '3'].includes(trimmedCode(statusFlags?.short_term_overheat_code))
    || flagged(statusFlags?.investment_caution)
    || flagged(statusFlags?.market_warning_risk_notice)
  ) return false
  if (feature.averageTurnover20 === null || feature.averageTurnover20 < minTurnover) return false
  if (feature.close === null || feature.close < 1_000) return false
  // 기존 제품의 Stoch/Williams 과매수 제외 의도를 RSI 상한 단일 기준으로 단순화한다.
  if (feature.rsi14 === null || feature.rsi14 > maxRsi) return false
  return true
}

export function scorePullbackRebound(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: PullbackReboundParameters,
  omittedScoreFeature?: AblationFeature,
): number | null {
  if (!passesCommonGate(feature, master, parameters.minTurnover)) return null
  const {
    close, sma60, trendR2_60: trendFit, trendSlope60: trendSlope,
    rsi14, sma20DistancePercent: smaDistance, bullishCandle, volumeRatio20: currentVolumeRatio,
  } = feature
  if (
    close === null || sma60 === null || close <= sma60
    || trendFit === null || trendFit < parameters.minTrendR2
    || trendSlope === null || trendSlope <= 0
    || rsi14 === null || rsi14 < parameters.rsiMin || rsi14 > parameters.rsiMax
    || smaDistance === null || Math.abs(smaDistance) > parameters.maxSma20DistancePercent
    || bullishCandle !== true
    || currentVolumeRatio === null || currentVolumeRatio < parameters.minVolumeRatio
  ) return null

  const rsiCenter = (parameters.rsiMin + parameters.rsiMax) / 2
  const rsiHalfRange = Math.max(1, (parameters.rsiMax - parameters.rsiMin) / 2)
  const trendScore = clamp01((trendFit - parameters.minTrendR2) / Math.max(0.01, 1 - parameters.minTrendR2))
  const rsiScore = clamp01(1 - Math.abs(rsi14 - rsiCenter) / rsiHalfRange)
  const proximityScore = clamp01(1 - Math.abs(smaDistance) / parameters.maxSma20DistancePercent)
  const recoveryScore = clamp01((currentVolumeRatio - parameters.minVolumeRatio) / Math.max(0.1, 2 - parameters.minVolumeRatio))
  return sumScoreComponents([
    { feature: 'trendR2_60', weight: 25, score: trendScore },
    { feature: 'rsi14', weight: 25, score: rsiScore },
    { feature: 'sma20DistancePercent', weight: 20, score: proximityScore },
    { feature: 'bullishCandle', weight: 15, score: 1 },
    { feature: 'volumeRatio20', weight: 15, score: recoveryScore },
  ], omittedScoreFeature)
}

export function scoreVolumeBreakout(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: VolumeBreakoutParameters,
  omittedScoreFeature?: AblationFeature,
): number | null {
  if (!passesCommonGate(feature, master, parameters.minTurnover, parameters.maxRsi ?? 70)) return null
  const percentile = feature.volumePercentile60
  const distance = feature.distanceFromHigh60
  if (
    percentile === null || percentile < parameters.minVolumePercentile
    || distance === null || distance < parameters.minDistanceFromHighPercent
    || (parameters.requireBullishCandle && feature.bullishCandle !== true)
    || (
      parameters.excludeGapUp
      && (feature.gapFromPreviousClosePercent === null || feature.gapFromPreviousClosePercent > 0)
    )
  ) return null

  const volumeScore = clamp01(
    (percentile - parameters.minVolumePercentile) / Math.max(1, 100 - parameters.minVolumePercentile),
  )
  const breakoutScore = clamp01(
    (distance - parameters.minDistanceFromHighPercent) / Math.max(1, 5 - parameters.minDistanceFromHighPercent),
  )
  return sumScoreComponents([
    { feature: 'volumePercentile60', weight: 60, score: volumeScore },
    { feature: 'distanceFromHigh60', weight: 40, score: breakoutScore },
  ], omittedScoreFeature)
}

export function scoreEarlyTrend(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: EarlyTrendParameters,
  omittedScoreFeature?: AblationFeature,
): number | null {
  if (!passesCommonGate(feature, master, parameters.minTurnover)) return null
  const { goldenCrossAge, adx14, adx14Change, trendR2_20: trendFit, trendR2_20Change: trendChange } = feature
  if (
    goldenCrossAge === null || goldenCrossAge > parameters.maxGoldenCrossAge
    || adx14 === null || adx14 < parameters.minAdx
    || adx14Change === null || adx14Change <= parameters.minAdxChange
    || trendFit === null || trendFit < parameters.minTrendR2 || trendFit > parameters.maxTrendR2
    || trendChange === null || trendChange <= parameters.minTrendR2Change
  ) return null

  const recencyScore = clamp01(1 - goldenCrossAge / Math.max(1, parameters.maxGoldenCrossAge))
  const adxScore = clamp01((adx14 - parameters.minAdx) / 25)
  const fitScore = clamp01((trendFit - parameters.minTrendR2) / Math.max(0.01, parameters.maxTrendR2 - parameters.minTrendR2))
  const accelerationScore = clamp01((adx14Change + trendChange * 100) / 10)
  return sumScoreComponents([
    { feature: 'goldenCrossAge', weight: 30, score: recencyScore },
    { feature: 'adx14', weight: 25, score: adxScore },
    { feature: 'trendR2_20', weight: 20, score: fitScore },
    // 기존 결합 공식을 유지하면서 두 입력에 각각 절반의 점수 가중치를 귀속한다.
    { feature: 'adx14Change', weight: 12.5, score: accelerationScore },
    { feature: 'trendR2_20Change', weight: 12.5, score: accelerationScore },
  ], omittedScoreFeature)
}

export function scoreComposite(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: CompositeParameters,
  omittedScoreFeature?: AblationFeature,
): number | null {
  if (!passesCommonGate(feature, master, parameters.minTurnover)) return null
  const scores = [
    { score: scorePullbackRebound(feature, master, { ...parameters.pullback, minTurnover: parameters.minTurnover }, omittedScoreFeature), weight: parameters.weightPullback },
    { score: scoreVolumeBreakout(feature, master, { ...parameters.breakout, minTurnover: parameters.minTurnover }, omittedScoreFeature), weight: parameters.weightBreakout },
    { score: scoreEarlyTrend(feature, master, { ...parameters.earlyTrend, minTurnover: parameters.minTurnover }, omittedScoreFeature), weight: parameters.weightEarlyTrend },
  ]
  if (scores.every(({ score }) => score === null)) return null
  const totalWeight = scores.reduce((sum, row) => sum + Math.max(0, row.weight), 0)
  if (totalWeight === 0) return null
  return scores.reduce((sum, row) => sum + (row.score ?? 0) * Math.max(0, row.weight), 0) / totalWeight
}

export function scoreStrategy<K extends StrategyName>(input: {
  readonly name: K
  readonly feature: StockFeatureVector
  readonly master: StockMasterState | undefined
  readonly parameters: StrategyParameterMap[K]
  readonly omittedFeature?: AblationFeature
}): number | null {
  if (input.name === 'pullbackRebound') {
    return scorePullbackRebound(
      input.feature,
      input.master,
      input.parameters as PullbackReboundParameters,
      input.omittedFeature,
    )
  }
  if (
    input.name === 'volumeBreakout'
    || input.name === 'volumeBreakoutBullishCandle'
    || input.name === 'volumeBreakoutNoGapUp'
  ) {
    return scoreVolumeBreakout(
      input.feature,
      input.master,
      input.parameters as VolumeBreakoutParameters,
      input.omittedFeature,
    )
  }
  if (input.name === 'earlyTrend') {
    return scoreEarlyTrend(
      input.feature,
      input.master,
      input.parameters as EarlyTrendParameters,
      input.omittedFeature,
    )
  }
  return scoreComposite(
    input.feature,
    input.master,
    input.parameters as CompositeParameters,
    input.omittedFeature,
  )
}

export function rankStrategyCandidates<K extends StrategyName>(input: {
  readonly name: K
  readonly features: readonly StockFeatureVector[]
  readonly masters: ReadonlyMap<string, StockMasterState>
  readonly parameters: StrategyParameterMap[K]
  readonly mode: SelectionMode
  readonly universe?: ReadonlySet<string>
  readonly omittedFeature?: AblationFeature
  readonly pickCount?: number
}): Array<{ symbol: string; score: number }> {
  const minScore = (input.parameters as CommonParameters).minScore
  return input.features.flatMap((feature) => {
    if (input.universe && !input.universe.has(feature.symbol)) return []
    const score = scoreStrategy({
      name: input.name,
      feature,
      master: input.masters.get(feature.symbol),
      parameters: input.parameters,
      omittedFeature: input.omittedFeature,
    })
    if (score === null || (input.mode === 'abstain' && score < minScore)) return []
    return [{ symbol: feature.symbol, score }]
  }).sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol))
    .slice(0, input.pickCount ?? PICKS_PER_DATE)
}

export function rankVolumeOnlyCandidates(input: {
  readonly features: readonly StockFeatureVector[]
  readonly masters: ReadonlyMap<string, StockMasterState>
  readonly parameters: VolumeBreakoutParameters
  readonly universe?: ReadonlySet<string>
  readonly pickCount?: number
}): Array<{ symbol: string; volumePercentile: number }> {
  return input.features.flatMap((feature) => {
    if (input.universe && !input.universe.has(feature.symbol)) return []
    if (feature.volumePercentile60 === null) return []
    if (!passesCommonGate(
      feature,
      input.masters.get(feature.symbol),
      input.parameters.minTurnover,
      input.parameters.maxRsi ?? 70,
    )) return []
    return [{ symbol: feature.symbol, volumePercentile: feature.volumePercentile60 }]
  }).sort((left, right) => (
    right.volumePercentile - left.volumePercentile
    || left.symbol.localeCompare(right.symbol)
  )).slice(0, input.pickCount ?? PICKS_PER_DATE)
}

export function rankTieredFillCandidates(input: {
  readonly features: readonly StockFeatureVector[]
  readonly masters: ReadonlyMap<string, StockMasterState>
  readonly parameters: VolumeBreakoutParameters
  readonly tiers?: ReadonlyArray<TieredFillTier>
  readonly universe?: ReadonlySet<string>
  readonly pickCount?: number
}): TieredFillPick[] {
  const tiers = input.tiers ?? DEFAULT_TIERED_FILL_TIERS
  const targetPickCount = input.pickCount ?? PICKS_PER_DATE
  const remainingUniverse = new Set(
    input.universe ?? input.features.map((feature) => feature.symbol),
  )
  const picks: TieredFillPick[] = []

  for (const tier of tiers) {
    const pickCount = targetPickCount - picks.length
    if (pickCount <= 0) break
    const symbols = tier === 'volumeOnly'
      ? rankVolumeOnlyCandidates({
          features: input.features,
          masters: input.masters,
          parameters: input.parameters,
          universe: remainingUniverse,
          pickCount,
        }).map((row) => row.symbol)
      : rankStrategyCandidates({
          name: 'volumeBreakoutNoGapUp',
          features: input.features,
          masters: input.masters,
          parameters: tier === 'relaxedBreakout'
            ? {
                ...input.parameters,
                minDistanceFromHighPercent: -3,
                minVolumePercentile: 80,
              }
            : input.parameters,
          mode: 'force3',
          universe: remainingUniverse,
          pickCount,
        }).map((row) => row.symbol)

    for (const symbol of symbols) {
      if (!remainingUniverse.delete(symbol)) continue
      picks.push({ symbol, tier })
    }
  }

  return picks
}

export function createTieredFillStrategy(input: {
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly masters: ReadonlyMap<string, StockMasterState>
  readonly parameters: VolumeBreakoutParameters
  readonly tiers?: ReadonlyArray<TieredFillTier>
}): StockPickStrategy {
  let cachedUniverse: readonly string[] | null = null
  let cachedUniverseSet: ReadonlySet<string> | undefined
  return (_handler, universe, simDate) => {
    if (cachedUniverse !== universe) {
      cachedUniverse = universe
      cachedUniverseSet = new Set(universe)
    }
    return rankTieredFillCandidates({
      features: input.featuresByDate.get(simDate) ?? [],
      masters: input.masters,
      parameters: input.parameters,
      tiers: input.tiers,
      universe: cachedUniverseSet,
    }).map((row) => row.symbol)
  }
}

/** 사전등록 섀도우: 프로덕션 게이트 통과 집합을 ATR14 rolling percentile로만 재정렬한다. */
export function rankVolumeBreakoutAtrRankCandidates(input: {
  readonly features: readonly StockFeatureVector[]
  readonly masters: ReadonlyMap<string, StockMasterState>
  readonly universe?: ReadonlySet<string>
}): Array<{ symbol: string; score: number }> {
  return input.features.flatMap((feature) => {
    if (input.universe && !input.universe.has(feature.symbol)) return []
    const score = scoreVolumeBreakout(
      feature,
      input.masters.get(feature.symbol),
      VOLUME_BREAKOUT_ATR_RANK_PARAMETERS,
    )
    if (score === null) return []
    return [{
      symbol: feature.symbol,
      score,
      atrPercentile: feature.atrPercentile60,
    }]
  }).sort((left, right) => (
    (right.atrPercentile ?? -1) - (left.atrPercentile ?? -1)
    || right.score - left.score
    || left.symbol.localeCompare(right.symbol)
  )).slice(0, PICKS_PER_DATE)
    .map(({ symbol, score }) => ({ symbol, score }))
}

export function createVolumeBreakoutAtrRankStrategy(input: {
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly masters: ReadonlyMap<string, StockMasterState>
}): StockPickStrategy {
  let cachedUniverse: readonly string[] | null = null
  let cachedUniverseSet: ReadonlySet<string> | undefined
  return (_handler, universe, simDate) => {
    if (cachedUniverse !== universe) {
      cachedUniverse = universe
      cachedUniverseSet = new Set(universe)
    }
    return rankVolumeBreakoutAtrRankCandidates({
      features: input.featuresByDate.get(simDate) ?? [],
      masters: input.masters,
      universe: cachedUniverseSet,
    }).map((row) => row.symbol)
  }
}

export function createCachedFeatureStrategy<K extends StrategyName>(input: {
  readonly name: K
  readonly featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>
  readonly masters: ReadonlyMap<string, StockMasterState>
  readonly parameters: StrategyParameterMap[K]
  readonly mode: SelectionMode
  readonly omittedFeature?: AblationFeature
}): StockPickStrategy {
  let cachedUniverse: readonly string[] | null = null
  let cachedUniverseSet: ReadonlySet<string> | undefined
  return (_handler, universe, simDate) => {
    if (cachedUniverse !== universe) {
      cachedUniverse = universe
      cachedUniverseSet = new Set(universe)
    }
    return rankStrategyCandidates({
      name: input.name,
      features: input.featuresByDate.get(simDate) ?? [],
      masters: input.masters,
      parameters: input.parameters,
      mode: input.mode,
      universe: cachedUniverseSet,
      omittedFeature: input.omittedFeature,
    }).map((row) => row.symbol)
  }
}

export async function loadStockMasterStates(): Promise<StockMasterState[]> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  return fetchAllRows<StockMasterState>((from, to) => supabaseAdmin
    .from('stock_master')
    .select('symbol, is_active, status_flags')
    .order('symbol', { ascending: true })
    .range(from, to))
}
