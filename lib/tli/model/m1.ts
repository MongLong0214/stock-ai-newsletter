import { FEATURE_NAMES } from '@/lib/tli/features/build-features'

export interface M1FeatureRow {
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
  readonly abstain?: boolean
}

export type M1CalibratorArtifact =
  | {
    readonly type: 'platt'
    readonly a: number
    readonly b: number
  }
  | {
    readonly type: 'beta'
    readonly a: number
    readonly b: number
    readonly c: number
  }
  | {
    readonly type: 'isotonic'
    readonly thresholds: readonly number[]
    readonly values: readonly number[]
  }

export interface M1ModelArtifact {
  readonly artifact_version: 'tli-model-artifact-v1'
  readonly model_type: 'm1_logistic'
  readonly feature_schema: readonly string[]
  readonly scaler: {
    readonly median: readonly number[]
    readonly mad: readonly number[]
  }
  readonly coefficients: {
    readonly intercept: number
    readonly weights: readonly number[]
  }
  readonly calibrator: M1CalibratorArtifact
  readonly trained_at: string
  readonly train_range: readonly [string, string]
  readonly labeler_version: string
  readonly seed: number
  readonly train_event_rate?: number
  readonly sample_report: unknown
}

const ROBUST_SCALE = 1.4826
const MIN_MAD = 0.001
const CALIBRATION_EPS = 1e-6

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value))

function assertNever(value: never): never {
  throw new Error(`Unhandled M1 calibrator: ${JSON.stringify(value)}`)
}

function assertCalibrator(calibrator: M1CalibratorArtifact): void {
  switch (calibrator.type) {
    case 'platt':
    case 'beta':
      return
    case 'isotonic': {
      if (calibrator.thresholds.length === 0 || calibrator.thresholds.length !== calibrator.values.length) {
        throw new Error('M1 isotonic calibrator requires paired non-empty breakpoints')
      }
      for (let index = 1; index < calibrator.thresholds.length; index++) {
        const previous = calibrator.thresholds[index - 1]
        const current = calibrator.thresholds[index]
        if (previous === undefined || current === undefined || current <= previous) {
          throw new Error('M1 isotonic calibrator thresholds must be strictly increasing')
        }
      }
      return
    }
    default:
      return assertNever(calibrator)
  }
}

function assertM1Artifact(artifact: M1ModelArtifact): void {
  if (artifact.artifact_version !== 'tli-model-artifact-v1' || artifact.model_type !== 'm1_logistic') {
    throw new Error('Invalid M1 artifact identity')
  }
  assertCalibrator(artifact.calibrator)
  if (artifact.feature_schema.length !== FEATURE_NAMES.length) {
    throw new Error('M1 artifact feature schema length mismatch')
  }
  for (let index = 0; index < FEATURE_NAMES.length; index++) {
    if (artifact.feature_schema[index] !== FEATURE_NAMES[index]) {
      throw new Error(`M1 artifact feature schema mismatch at index ${index}`)
    }
  }
  if (
    artifact.scaler.median.length !== FEATURE_NAMES.length ||
    artifact.scaler.mad.length !== FEATURE_NAMES.length ||
    artifact.coefficients.weights.length !== FEATURE_NAMES.length * 2
  ) {
    throw new Error('M1 artifact scaler or coefficient length mismatch')
  }
  if (
    artifact.train_event_rate !== undefined &&
    (!Number.isFinite(artifact.train_event_rate) || artifact.train_event_rate <= 0 || artifact.train_event_rate >= 1)
  ) {
    throw new Error('M1 artifact train_event_rate must be in (0,1)')
  }
}

function robustFeatureValue(artifact: M1ModelArtifact, row: M1FeatureRow, index: number): number {
  const median = artifact.scaler.median[index]
  const mad = artifact.scaler.mad[index]
  const raw = row.values[index]
  const missing = row.missingFlags[index] || raw === undefined || !Number.isFinite(raw)
  const imputed = missing ? median : raw
  return mad < MIN_MAD ? 0 : (imputed - median) / (ROBUST_SCALE * mad)
}

export function buildM1DesignVector(artifact: M1ModelArtifact, row: M1FeatureRow): number[] {
  assertM1Artifact(artifact)
  if (row.values.length !== FEATURE_NAMES.length || row.missingFlags.length !== FEATURE_NAMES.length) {
    throw new Error('M1 feature row length mismatch')
  }
  return [
    ...FEATURE_NAMES.map((_, index) => robustFeatureValue(artifact, row, index)),
    ...row.missingFlags.map((missing) => (missing ? 1 : 0)),
  ]
}

function clippedBaseProbability(margin: number): number {
  return Math.min(1 - CALIBRATION_EPS, Math.max(CALIBRATION_EPS, sigmoid(margin)))
}

function interpolateIsotonic(calibrator: Extract<M1CalibratorArtifact, { readonly type: 'isotonic' }>, base: number): number {
  const firstThreshold = calibrator.thresholds[0]
  const firstValue = calibrator.values[0]
  const lastThreshold = calibrator.thresholds[calibrator.thresholds.length - 1]
  const lastValue = calibrator.values[calibrator.values.length - 1]
  if (
    firstThreshold === undefined ||
    firstValue === undefined ||
    lastThreshold === undefined ||
    lastValue === undefined
  ) {
    throw new Error('M1 isotonic calibrator requires paired non-empty breakpoints')
  }
  if (base <= firstThreshold) return firstValue
  if (base >= lastThreshold) return lastValue

  for (let index = 1; index < calibrator.thresholds.length; index++) {
    const leftThreshold = calibrator.thresholds[index - 1]
    const rightThreshold = calibrator.thresholds[index]
    const leftValue = calibrator.values[index - 1]
    const rightValue = calibrator.values[index]
    if (
      leftThreshold === undefined ||
      rightThreshold === undefined ||
      leftValue === undefined ||
      rightValue === undefined
    ) {
      throw new Error('M1 isotonic calibrator requires paired non-empty breakpoints')
    }
    if (base <= rightThreshold) {
      const weight = (base - leftThreshold) / (rightThreshold - leftThreshold)
      return leftValue + weight * (rightValue - leftValue)
    }
  }
  return lastValue
}

function applyCalibrator(calibrator: M1CalibratorArtifact, margin: number): number {
  switch (calibrator.type) {
    case 'platt':
      return sigmoid(-(calibrator.a * margin + calibrator.b))
    case 'beta': {
      const base = clippedBaseProbability(margin)
      return sigmoid((calibrator.a * Math.log(base)) + (calibrator.b * -Math.log(1 - base)) + calibrator.c)
    }
    case 'isotonic':
      return interpolateIsotonic(calibrator, sigmoid(margin))
    default:
      return assertNever(calibrator)
  }
}

export function predictM1Probability(artifact: M1ModelArtifact, row: M1FeatureRow): number | null {
  if (row.abstain) return null
  const design = buildM1DesignVector(artifact, row)
  const margin = design.reduce((sum, value, index) => (
    sum + value * artifact.coefficients.weights[index]
  ), artifact.coefficients.intercept)
  return applyCalibrator(artifact.calibrator, margin)
}
