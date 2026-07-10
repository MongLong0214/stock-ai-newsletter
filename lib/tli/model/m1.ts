import { CONFIRMATORY_FEATURE_NAMES } from '@/lib/tli/features/confirmatory-feature-types'

export type M1FeatureRow = {
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
  readonly abstain?: boolean
}

export type M1PlattCalibratorArtifact = {
  readonly type: 'platt'
  readonly a: number
  readonly b: number
}

/** @deprecated tli-model-artifact-v1 전용. 신규 artifact에서는 허용하지 않는다. */
export type M1CalibratorArtifact =
  | M1PlattCalibratorArtifact
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

export type M1ModelArtifactV2 = {
  readonly artifact_version: 'tli-model-artifact-v2'
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
  readonly calibrator: M1PlattCalibratorArtifact
  readonly estimator_contract: {
    readonly penalty: 'l2'
    readonly solver: 'lbfgs'
    readonly fit_intercept: true
    readonly class_weight: null
    readonly max_iter: 5000
    readonly tol: number
    readonly selected_c: number
  }
  readonly calibration_contract: {
    readonly type: 'platt'
    readonly source: 'time_blocked_cross_fitted_oof_margin'
    readonly penalty: null
    readonly solver: 'lbfgs'
    readonly fit_intercept: true
    readonly class_weight: null
    readonly max_iter: 5000
    readonly tol: number
    readonly origin_weighting: 'one_per_origin'
    readonly probability_clamp: readonly [number, number]
  }
  readonly inner_oof: {
    readonly origin_count: number
    readonly fold_count: number
    readonly ordered_origins: readonly string[]
    readonly folds: readonly {
      readonly fold_id: string
      readonly validation_origin: string
      readonly train_origins: readonly string[]
    }[]
    readonly split_origins_sha256: string
  }
  readonly trained_at: string
  readonly train_range: readonly [string, string]
  readonly labeler_version: string
  readonly seed: number
  readonly train_event_rate: number
  readonly sample_report: {
    readonly observed_n: number
    readonly events: number
    readonly event_rate: number
    readonly parameters: number
    readonly selected_c: number
    readonly candidate_scores: readonly {
      readonly c: number
      readonly mean_brier: number
      readonly fold_briers: readonly number[]
    }[]
    readonly oof_rows: number
    readonly oof_positive: number
    readonly oof_negative: number
  }
  readonly runtime: {
    readonly uv_version: string
    readonly python_version: string
    readonly python_implementation: string
    readonly os: string
    readonly arch: string
    readonly blas: string
    readonly thread_env: Readonly<Record<string, string>>
    readonly resolved_packages: readonly string[]
    readonly script_lock_sha256: string
    readonly training_code_git_sha: string
    readonly training_code_git_status: string
  }
}

/** @deprecated 파서와 추론기는 이 shape를 unsupported_legacy_artifact로 거부한다. */
export type LegacyM1ModelArtifactV1 = {
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

/** @deprecated v1은 기존 호출부의 컴파일 전환용이며 런타임에서 항상 거부된다. */
export type M1ModelArtifact = M1ModelArtifactV2 | LegacyM1ModelArtifactV1

export class UnsupportedLegacyArtifactError extends Error {
  readonly name = 'unsupported_legacy_artifact'
  readonly code = 'unsupported_legacy_artifact'

  constructor() {
    super('unsupported_legacy_artifact')
  }
}

class M1PredictionContractError extends Error {
  readonly name = 'M1PredictionContractError'

  constructor(readonly code: string) {
    super(code)
  }
}

const CALIBRATION_EPS = 1e-6

function assertNever(value: never): never {
  throw new M1PredictionContractError(`unexpected_artifact:${JSON.stringify(value)}`)
}

function assertFinite(values: readonly number[], code: string): void {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new M1PredictionContractError(code)
  }
}

function requireV2Artifact(artifact: M1ModelArtifact): M1ModelArtifactV2 {
  switch (artifact.artifact_version) {
    case 'tli-model-artifact-v2':
      break
    case 'tli-model-artifact-v1':
      throw new UnsupportedLegacyArtifactError()
    default:
      return assertNever(artifact)
  }

  if (artifact.model_type !== 'm1_logistic') {
    throw new M1PredictionContractError('invalid_m1_artifact_identity')
  }
  if (artifact.feature_schema.length !== CONFIRMATORY_FEATURE_NAMES.length) {
    throw new M1PredictionContractError('m1_feature_schema_length_mismatch')
  }
  for (let index = 0; index < CONFIRMATORY_FEATURE_NAMES.length; index++) {
    if (artifact.feature_schema[index] !== CONFIRMATORY_FEATURE_NAMES[index]) {
      throw new M1PredictionContractError(`m1_feature_schema_mismatch:${index}`)
    }
  }
  if (
    artifact.scaler.median.length !== CONFIRMATORY_FEATURE_NAMES.length
    || artifact.scaler.mad.length !== CONFIRMATORY_FEATURE_NAMES.length
    || artifact.coefficients.weights.length !== CONFIRMATORY_FEATURE_NAMES.length * 2
  ) {
    throw new M1PredictionContractError('m1_artifact_vector_length_mismatch')
  }
  assertFinite(artifact.scaler.median, 'm1_scaler_median_nonfinite')
  assertFinite(artifact.scaler.mad, 'm1_scaler_mad_nonfinite')
  assertFinite(artifact.coefficients.weights, 'm1_coefficients_nonfinite')
  if (artifact.scaler.mad.some((value) => value < 0)) {
    throw new M1PredictionContractError('m1_scaler_mad_negative')
  }
  return artifact
}

function buildSupportedDesignVector(artifact: M1ModelArtifactV2, row: M1FeatureRow): number[] {
  if (
    row.values.length !== CONFIRMATORY_FEATURE_NAMES.length
    || row.missingFlags.length !== CONFIRMATORY_FEATURE_NAMES.length
  ) {
    throw new M1PredictionContractError('m1_feature_row_length_mismatch')
  }
  const scaled = CONFIRMATORY_FEATURE_NAMES.map((_, index) => {
    const median = artifact.scaler.median[index]
    const mad = artifact.scaler.mad[index]
    const raw = row.values[index]
    const missing = row.missingFlags[index]
    if (median === undefined || mad === undefined || missing === undefined) {
      throw new M1PredictionContractError('m1_feature_row_length_mismatch')
    }
    if (raw === undefined || missing || !Number.isFinite(raw)) return 0
    return (raw - median) / (mad > 0 ? mad : 1)
  })
  return [...scaled, ...row.missingFlags.map((missing) => (missing ? 1 : 0))]
}

export function buildM1DesignVector(artifact: M1ModelArtifact, row: M1FeatureRow): number[] {
  return buildSupportedDesignVector(requireV2Artifact(artifact), row)
}

export function predictM1Probability(artifact: M1ModelArtifact, row: M1FeatureRow): number | null {
  const supported = requireV2Artifact(artifact)
  if (row.abstain) return null
  const design = buildSupportedDesignVector(supported, row)
  let margin = supported.coefficients.intercept
  for (let index = 0; index < design.length; index++) {
    const weight = supported.coefficients.weights[index]
    const value = design[index]
    if (weight === undefined || value === undefined) {
      throw new M1PredictionContractError('m1_artifact_vector_length_mismatch')
    }
    margin += weight * value
  }
  const probability = 1 / (1 + Math.exp(supported.calibrator.a * margin + supported.calibrator.b))
  return Math.min(1 - CALIBRATION_EPS, Math.max(CALIBRATION_EPS, probability))
}
