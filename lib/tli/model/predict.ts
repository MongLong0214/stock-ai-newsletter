import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { CONFIRMATORY_FEATURE_NAMES } from '@/lib/tli/features/confirmatory-feature-types'
import { predictM1Probability, UnsupportedLegacyArtifactError } from '@/lib/tli/model/m1'
import type { M1FeatureRow, M1ModelArtifact, M1ModelArtifactV2 } from '@/lib/tli/model/m1'

export { UnsupportedLegacyArtifactError }

const numberArraySchema = z.array(z.number())
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

const estimatorContractSchema = z.object({
  penalty: z.literal('l2'),
  solver: z.literal('lbfgs'),
  fit_intercept: z.literal(true),
  class_weight: z.null(),
  max_iter: z.literal(5000),
  tol: z.number().positive(),
  selected_c: z.number().positive(),
})

const calibrationContractSchema = z.object({
  type: z.literal('platt'),
  source: z.literal('time_blocked_cross_fitted_oof_margin'),
  penalty: z.null(),
  solver: z.literal('lbfgs'),
  fit_intercept: z.literal(true),
  class_weight: z.null(),
  max_iter: z.literal(5000),
  tol: z.number().positive(),
  origin_weighting: z.literal('one_per_origin'),
  probability_clamp: z.tuple([z.literal(1e-6), z.literal(1 - 1e-6)]),
})

const innerOofSchema = z.object({
  origin_count: z.number().int().positive(),
  fold_count: z.number().int().min(5).max(8),
  ordered_origins: z.array(z.string()).min(1),
  folds: z.array(z.object({
    fold_id: z.string().min(1),
    validation_origin: z.string().min(1),
    train_origins: z.array(z.string()).min(1),
  })).min(1),
  split_origins_sha256: sha256Schema,
})

const trainingReportSchema = z.object({
  observed_n: z.number().int().positive(),
  events: z.number().int().positive(),
  event_rate: z.number().gt(0).lt(1),
  parameters: z.number().int().positive(),
  selected_c: z.number().positive(),
  candidate_scores: z.array(z.object({
    c: z.number().positive(),
    mean_brier: z.number().min(0).max(1),
    fold_briers: z.array(z.number().min(0).max(1)).min(1),
  })).min(1),
  oof_rows: z.number().int().positive(),
  oof_positive: z.number().int().positive(),
  oof_negative: z.number().int().positive(),
})

const runtimeManifestSchema = z.object({
  uv_version: z.string().min(1),
  python_version: z.string().min(1),
  python_implementation: z.string().min(1),
  os: z.string().min(1),
  arch: z.string().min(1),
  blas: z.string().min(1),
  thread_env: z.record(z.string(), z.string()),
  resolved_packages: z.array(z.string()),
  script_lock_sha256: sha256Schema,
  training_code_git_sha: z.string().min(1),
  training_code_git_status: z.string().min(1),
})

export const M1ModelArtifactSchema = z.object({
  artifact_version: z.literal('tli-model-artifact-v2'),
  model_type: z.literal('m1_logistic'),
  feature_schema: z.array(z.string()),
  scaler: z.object({
    median: numberArraySchema,
    mad: z.array(z.number().nonnegative()),
  }),
  coefficients: z.object({
    intercept: z.number(),
    weights: numberArraySchema,
  }),
  calibrator: z.object({
    type: z.literal('platt'),
    a: z.number(),
    b: z.number(),
  }),
  estimator_contract: estimatorContractSchema,
  calibration_contract: calibrationContractSchema,
  inner_oof: innerOofSchema,
  trained_at: z.string().min(1),
  train_range: z.tuple([z.string().min(1), z.string().min(1)]),
  labeler_version: z.string().min(1),
  seed: z.number().int(),
  train_event_rate: z.number().gt(0).lt(1),
  sample_report: trainingReportSchema,
  runtime: runtimeManifestSchema,
}).superRefine((artifact, context) => {
  if (artifact.feature_schema.length !== CONFIRMATORY_FEATURE_NAMES.length) {
    context.addIssue({
      code: 'custom',
      path: ['feature_schema'],
      message: 'M1 artifact feature schema length mismatch',
    })
  }
  for (let index = 0; index < CONFIRMATORY_FEATURE_NAMES.length; index++) {
    if (artifact.feature_schema[index] !== CONFIRMATORY_FEATURE_NAMES[index]) {
      context.addIssue({
        code: 'custom',
        path: ['feature_schema', index],
        message: `M1 artifact feature schema mismatch at index ${index}`,
      })
    }
  }
  if (
    artifact.scaler.median.length !== CONFIRMATORY_FEATURE_NAMES.length
    || artifact.scaler.mad.length !== CONFIRMATORY_FEATURE_NAMES.length
    || artifact.coefficients.weights.length !== CONFIRMATORY_FEATURE_NAMES.length * 2
  ) {
    context.addIssue({
      code: 'custom',
      path: ['coefficients', 'weights'],
      message: 'M1 artifact scaler or coefficient length mismatch',
    })
  }
})

const artifactVersionSchema = z.object({ artifact_version: z.string() })

export function parseM1ModelArtifact(value: unknown): M1ModelArtifactV2 {
  const version = artifactVersionSchema.safeParse(value)
  if (version.success && version.data.artifact_version === 'tli-model-artifact-v1') {
    throw new UnsupportedLegacyArtifactError()
  }
  return M1ModelArtifactSchema.parse(value)
}

export async function loadM1ArtifactFromJsonFile(path: string): Promise<M1ModelArtifactV2> {
  const content = await readFile(path, 'utf8')
  const parsed: unknown = JSON.parse(content)
  return parseM1ModelArtifact(parsed)
}

export function predictM1T1Probability(input: {
  readonly artifact: M1ModelArtifact
  readonly row: M1FeatureRow
}): number | null {
  return predictM1Probability(input.artifact, input.row)
}
