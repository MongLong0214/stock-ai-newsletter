import type { StockPickStrategy } from '@/scripts/stock-picks/backtest'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'

const DEFAULT_MIN_TURNOVER = 1_000_000_000
const PICKS_PER_DATE = 3

export type StrategyName = 'pullbackRebound' | 'volumeBreakout' | 'earlyTrend' | 'composite'
export type SelectionMode = 'force3' | 'abstain'
export type AblationFeature = keyof StockFeatureVector

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
  earlyTrend: DEFAULT_EARLY_TREND_PARAMETERS,
  composite: DEFAULT_COMPOSITE_PARAMETERS,
}

export const COMPOSITE_ABLATION_FEATURES: readonly AblationFeature[] = [
  'rsi14',
  'sma60',
  'sma20DistancePercent',
  'trendR2_60',
  'trendSlope60',
  'bullishCandle',
  'volumeRatio20',
  'volumePercentile60',
  'distanceFromHigh60',
  'goldenCrossAge',
  'adx14',
  'adx14Change',
  'trendR2_20',
  'trendR2_20Change',
]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const flagged = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return false
  return ['Y', 'YES', 'TRUE', 'T', '1'].includes(value.trim().toUpperCase())
}

export function passesCommonGate(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  minTurnover = DEFAULT_MIN_TURNOVER,
): boolean {
  if (!master?.is_active) return false
  if (
    flagged(master.status_flags?.managed_stock)
    || flagged(master.status_flags?.trading_suspended)
    || flagged(master.status_flags?.liquidation_trading)
  ) return false
  if (feature.averageTurnover20 === null || feature.averageTurnover20 < minTurnover) return false
  if (feature.close === null || feature.close < 1_000) return false
  // 기존 제품의 Stoch/Williams 과매수 제외 의도를 RSI>70 단일 기준으로 단순화한다.
  if (feature.rsi14 === null || feature.rsi14 > 70) return false
  return true
}

export function scorePullbackRebound(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: PullbackReboundParameters,
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
  return 25 * trendScore + 25 * rsiScore + 20 * proximityScore + 15 + 15 * recoveryScore
}

export function scoreVolumeBreakout(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: VolumeBreakoutParameters,
): number | null {
  if (!passesCommonGate(feature, master, parameters.minTurnover)) return null
  const percentile = feature.volumePercentile60
  const distance = feature.distanceFromHigh60
  if (
    percentile === null || percentile < parameters.minVolumePercentile
    || distance === null || distance < parameters.minDistanceFromHighPercent
  ) return null

  const volumeScore = clamp01(
    (percentile - parameters.minVolumePercentile) / Math.max(1, 100 - parameters.minVolumePercentile),
  )
  const breakoutScore = clamp01(
    (distance - parameters.minDistanceFromHighPercent) / Math.max(1, 5 - parameters.minDistanceFromHighPercent),
  )
  return 60 * volumeScore + 40 * breakoutScore
}

export function scoreEarlyTrend(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: EarlyTrendParameters,
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
  return 30 * recencyScore + 25 * adxScore + 20 * fitScore + 25 * accelerationScore
}

export function scoreComposite(
  feature: StockFeatureVector,
  master: StockMasterState | undefined,
  parameters: CompositeParameters,
): number | null {
  if (!passesCommonGate(feature, master, parameters.minTurnover)) return null
  const scores = [
    { score: scorePullbackRebound(feature, master, { ...parameters.pullback, minTurnover: parameters.minTurnover }), weight: parameters.weightPullback },
    { score: scoreVolumeBreakout(feature, master, { ...parameters.breakout, minTurnover: parameters.minTurnover }), weight: parameters.weightBreakout },
    { score: scoreEarlyTrend(feature, master, { ...parameters.earlyTrend, minTurnover: parameters.minTurnover }), weight: parameters.weightEarlyTrend },
  ]
  if (scores.every(({ score }) => score === null)) return null
  const totalWeight = scores.reduce((sum, row) => sum + Math.max(0, row.weight), 0)
  if (totalWeight === 0) return null
  return scores.reduce((sum, row) => sum + (row.score ?? 0) * Math.max(0, row.weight), 0) / totalWeight
}

const omitFeature = (feature: StockFeatureVector, key?: AblationFeature): StockFeatureVector => {
  if (!key) return feature
  const value = feature[key]
  if (typeof value === 'boolean') return { ...feature, [key]: false }
  if (typeof value === 'number' && key === 'position52wObservations') return { ...feature, [key]: 0 }
  return { ...feature, [key]: null }
}

export function scoreStrategy<K extends StrategyName>(input: {
  readonly name: K
  readonly feature: StockFeatureVector
  readonly master: StockMasterState | undefined
  readonly parameters: StrategyParameterMap[K]
  readonly omittedFeature?: AblationFeature
}): number | null {
  const feature = omitFeature(input.feature, input.omittedFeature)
  if (input.name === 'pullbackRebound') {
    return scorePullbackRebound(feature, input.master, input.parameters as PullbackReboundParameters)
  }
  if (input.name === 'volumeBreakout') {
    return scoreVolumeBreakout(feature, input.master, input.parameters as VolumeBreakoutParameters)
  }
  if (input.name === 'earlyTrend') {
    return scoreEarlyTrend(feature, input.master, input.parameters as EarlyTrendParameters)
  }
  return scoreComposite(feature, input.master, input.parameters as CompositeParameters)
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
