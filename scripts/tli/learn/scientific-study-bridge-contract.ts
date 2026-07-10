import { z } from 'zod'

export const STUDY_EVAL_BRIDGE_VERSION = 'tli-study-eval-bridge-v1'
export const STUDY_EVAL_STAT_REPLICATES = 10_000
export const STUDY_EVAL_ENSEMBLE_REPLICATES = 500

const id = z.string().min(1)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const finite = z.number().finite()
const probability = finite.min(0).max(1)

const trainingParitySchema = z.object({
  fold_id: id,
  expected_sha256: sha256,
  actual_sha256: sha256,
  canonical_dataset_sha256: sha256,
  row_count: z.number().int().positive(),
  feature_schema: z.array(id).min(1),
}).strict()

const bootstrapSummarySchema = z.object({
  seed: z.number().int().nonnegative(),
  point: finite,
  upper: finite,
  replicate_sha256: sha256,
}).strict()

const deltaSummarySchema = z.object({
  seed: z.number().int().nonnegative(),
  point: finite,
  upper_99: finite,
  replicate_sha256: sha256,
  positive_skill: z.boolean(),
}).strict().superRefine((summary, context) => {
  const expected = summary.point < 0 && summary.upper_99 < 0
  if (summary.positive_skill !== expected) {
    context.addIssue({
      code: 'custom',
      path: ['positive_skill'],
      message: 'positive_skill does not match the frozen point-and-upper-99 rule',
    })
  }
})

const powerPointSchema = z.object({
  origins: z.number().int().positive(),
  seed: z.number().int().nonnegative(),
  margin: finite,
  power: probability,
  replicate_sha256: sha256,
}).strict()

const statisticsSchema = z.object({
  delta_brier: deltaSummarySchema,
  candidate_ece: bootstrapSummarySchema,
  power: z.object({
    comparator_brier: probability,
    minimum_relevant_effect: finite.positive(),
    planned_origins: z.number().int().positive().nullable(),
    points: z.array(powerPointSchema),
  }).strict(),
}).strict()

const acceptedAttemptSchema = z.object({
  replicate_index: z.number().int().nonnegative(),
  attempt_index: z.number().int().nonnegative(),
  index_sha256: sha256,
  reason: z.null(),
  seed: z.number().int().nonnegative(),
  artifact_sha256: sha256,
}).strict()

const rejectedAttemptSchema = z.object({
  replicate_index: z.number().int().nonnegative(),
  attempt_index: z.number().int().nonnegative(),
  index_sha256: sha256,
  reason: id,
  seed: z.null(),
  artifact_sha256: z.null(),
}).strict()

const REPLICATE_FEATURE_SLOT_COUNT = 10
const REPLICATE_DESIGN_WEIGHT_COUNT = 20

const replicateBodySchema = z.object({
  replicate_index: z.number().int().nonnegative(),
  scaler: z.object({
    median: z.array(finite).length(REPLICATE_FEATURE_SLOT_COUNT),
    mad: z.array(finite.nonnegative()).length(REPLICATE_FEATURE_SLOT_COUNT),
  }).strict(),
  coefficients: z.object({
    intercept: finite,
    weights: z.array(finite).length(REPLICATE_DESIGN_WEIGHT_COUNT),
  }).strict(),
  calibrator: z.object({ a: finite, b: finite }).strict(),
}).strict()

const intervalEnsembleSchema = z.object({
  full_fit_estimator_sha256: sha256,
  accepted: z.array(acceptedAttemptSchema).length(STUDY_EVAL_ENSEMBLE_REPLICATES),
  rejected: z.array(rejectedAttemptSchema),
  probe: z.object({
    full_fit_probability: probability,
    lower: probability,
    upper: probability,
    replicate_probability_sha256: sha256,
  }).strict(),
  replicate_bodies: z.array(replicateBodySchema).length(STUDY_EVAL_ENSEMBLE_REPLICATES),
}).strict().superRefine((ensemble, context) => {
  ensemble.accepted.forEach((attempt, index) => {
    if (attempt.replicate_index !== index) {
      context.addIssue({
        code: 'custom', path: ['accepted', index, 'replicate_index'],
        message: 'accepted replicates must be complete and ordered',
      })
    }
  })
  ensemble.replicate_bodies.forEach((body, index) => {
    if (body.replicate_index !== index) {
      context.addIssue({
        code: 'custom', path: ['replicate_bodies', index, 'replicate_index'],
        message: 'replicate bodies must be complete and ordered',
      })
    }
  })
  if (
    ensemble.probe.lower > ensemble.probe.full_fit_probability
    || ensemble.probe.full_fit_probability > ensemble.probe.upper
  ) {
    context.addIssue({ code: 'custom', path: ['probe'], message: 'probe interval must contain the full-fit probability' })
  }
})

export const scientificStudyBridgeOutputSchema = z.object({
  bridge_version: z.literal(STUDY_EVAL_BRIDGE_VERSION),
  study_contract_id: id,
  study_contract_sha256: sha256,
  cycle_id: z.string().uuid(),
  runtime: z.object({
    uv_version: id,
    python_version: id,
    packages: z.array(id),
    thread_env: z.record(z.string(), z.string()),
    bridge_lock_sha256: sha256,
  }).strict(),
  training_parity: z.array(trainingParitySchema).min(1),
  statistics: statisticsSchema,
  interval_ensemble: intervalEnsembleSchema,
}).strict()

export type ScientificStudyBridgeOutput = z.infer<typeof scientificStudyBridgeOutputSchema>

export type ScientificStudyBridgePairedRow = {
  readonly themeId: string
  readonly originDate: string
  readonly candidateProbability: number
  readonly comparatorProbability: number
  readonly y: boolean
}

export function parseScientificStudyBridgeOutput(value: unknown): ScientificStudyBridgeOutput {
  return scientificStudyBridgeOutputSchema.parse(value)
}
