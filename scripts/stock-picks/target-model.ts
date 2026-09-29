import type { StockFeatureVector } from '@/scripts/stock-picks/features'

export const TARGET_MODEL_FEATURE_NAMES = [
  'atrPercent14', 'rsi14', 'macdPercent', 'sma20DistancePercent',
  'sma20Slope5Percent', 'trendSlope20Percent', 'trendR2_20', 'adx14',
  'logVolumeRatio20', 'volumePercentile60', 'gapPercent', 'signalReturnPercent',
  'closeLocation', 'distanceFromHigh60', 'position52w', 'logTurnover20',
] as const

export interface TargetLogisticModel {
  readonly featureNames: readonly string[]
  readonly lower: readonly number[]
  readonly upper: readonly number[]
  readonly mean: readonly number[]
  readonly scale: readonly number[]
  readonly coefficient: readonly number[]
  readonly intercept: number
}

export type TargetModelArtifact = {
  readonly trainedSignalFrom?: string
  readonly trainedSignalThrough?: string
  readonly version?: string
  readonly objective?: string
} & (
  | { readonly kind: 'directJoint'; readonly models: { readonly joint: TargetLogisticModel } }
  | {
    readonly kind: 'conditionalJoint'
    readonly models: {
      readonly entryBullish: TargetLogisticModel
      readonly touchGivenBullish: TargetLogisticModel
    }
  }
)

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Signal-day inputs only. Their fixed order is shared with the offline training artifact. */
export function targetModelFeatures(feature: StockFeatureVector): number[] | null {
  const required = [
    feature.atrPercent14, feature.rsi14, feature.macdHistogram, feature.close,
    feature.sma20DistancePercent, feature.sma20Slope5, feature.trendSlope20,
    feature.trendR2_20, feature.adx14, feature.volumeRatio20, feature.volumePercentile60,
    feature.gapFromPreviousClosePercent, feature.open, feature.high, feature.low,
    feature.distanceFromHigh60, feature.position52w, feature.averageTurnover20,
  ]
  if (!required.every(finite)) return null
  const { open, high, low, close, volumeRatio20, averageTurnover20 } = feature
  if (open! <= 0 || close! <= 0 || high! < low! || volumeRatio20! < 0 || averageTurnover20! < 0) return null
  const values = [
    feature.atrPercent14!, feature.rsi14!, feature.macdHistogram! / close! * 100,
    feature.sma20DistancePercent!, feature.sma20Slope5! * 100, feature.trendSlope20! * 100,
    feature.trendR2_20!, feature.adx14!, Math.log1p(volumeRatio20!), feature.volumePercentile60!,
    feature.gapFromPreviousClosePercent!, (close! / open! - 1) * 100,
    high === low ? 0.5 : (close! - low!) / (high! - low!),
    feature.distanceFromHigh60!, feature.position52w!, Math.log1p(averageTurnover20! / 1e8),
  ]
  return values.every(finite) ? values : null
}

const validateLogisticModel = (model: TargetLogisticModel): void => {
  const count = TARGET_MODEL_FEATURE_NAMES.length
  if (!model || !Array.isArray(model.featureNames)
    || model.featureNames.length !== count
    || model.featureNames.some((name, index) => name !== TARGET_MODEL_FEATURE_NAMES[index])) {
    throw new Error('Target model featureNames do not match the runtime feature order')
  }
  for (const key of ['lower', 'upper', 'mean', 'scale', 'coefficient'] as const) {
    if (!Array.isArray(model[key]) || model[key].length !== count || !model[key].every(finite)) {
      throw new Error(`Target model ${key} must contain ${count} finite values`)
    }
  }
  if (!finite(model.intercept)) throw new Error('Target model intercept must be finite')
  if (model.scale.some((value) => value <= 0)) throw new Error('Target model scale must be positive')
  if (model.lower.some((value, index) => value > model.upper[index]!)) {
    throw new Error('Target model clipping lower bound exceeds upper bound')
  }
}

const logisticScore = (values: readonly number[], model: TargetLogisticModel): number => {
  const margin = values.reduce((sum, value, index) => {
    const clipped = Math.max(model.lower[index]!, Math.min(model.upper[index]!, value))
    return sum + (clipped - model.mean[index]!) / model.scale[index]! * model.coefficient[index]!
  }, model.intercept)
  if (Number.isNaN(margin)) throw new Error('Target model produced an invalid margin')
  if (margin >= 0) return 1 / (1 + Math.exp(-margin))
  const exponential = Math.exp(margin)
  return exponential / (1 + exponential)
}

/** A learned ranking output in [0, 1], not a calibrated success probability. */
export function scoreTargetModel(feature: StockFeatureVector, artifact: TargetModelArtifact): number | null {
  if (artifact?.kind === 'directJoint') validateLogisticModel(artifact.models?.joint)
  else if (artifact?.kind === 'conditionalJoint') {
    validateLogisticModel(artifact.models?.entryBullish)
    validateLogisticModel(artifact.models?.touchGivenBullish)
  } else throw new Error('Unsupported target model kind')
  const values = targetModelFeatures(feature)
  if (!values) return null
  if (artifact.kind === 'directJoint') return logisticScore(values, artifact.models.joint)
  // Exact chain: P(bullish) * P(touch | bullish), with independently fitted preprocessing.
  return logisticScore(values, artifact.models.entryBullish) * logisticScore(values, artifact.models.touchGivenBullish)
}
