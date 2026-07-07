import { FEATURE_NAMES } from '@/lib/tli/features/build-features'

export interface M1FeatureRow {
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
  readonly abstain?: boolean
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
  readonly calibrator: {
    readonly type: 'platt'
    readonly a: number
    readonly b: number
  }
  readonly trained_at: string
  readonly train_range: readonly [string, string]
  readonly labeler_version: string
  readonly seed: number
  readonly sample_report: unknown
}

const ROBUST_SCALE = 1.4826
const MIN_MAD = 0.001

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value))

function assertM1Artifact(artifact: M1ModelArtifact): void {
  if (artifact.artifact_version !== 'tli-model-artifact-v1' || artifact.model_type !== 'm1_logistic') {
    throw new Error('Invalid M1 artifact identity')
  }
  if (artifact.calibrator.type !== 'platt') {
    throw new Error('M1 artifact calibrator must be platt')
  }
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

export function predictM1Probability(artifact: M1ModelArtifact, row: M1FeatureRow): number | null {
  if (row.abstain) return null
  const design = buildM1DesignVector(artifact, row)
  const margin = design.reduce((sum, value, index) => (
    sum + value * artifact.coefficients.weights[index]
  ), artifact.coefficients.intercept)
  return sigmoid(-(artifact.calibrator.a * margin + artifact.calibrator.b))
}
