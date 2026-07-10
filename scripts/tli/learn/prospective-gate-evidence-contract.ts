import { z } from 'zod'

const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const finite = z.number().finite()
const unit = finite.min(0).max(1)
const canonicalUuid = z.string().uuid().refine((value) => value === value.toLowerCase())
const canonicalDate = z.iso.date()
const nonnegativeInteger = z.number().int().nonnegative()

const orderedReasons = z.array(z.string().min(1)).min(1).superRefine((reasons, context) => {
  const expected = [...new Set(reasons)].sort()
  if (expected.length !== reasons.length || expected.some((reason, index) => reason !== reasons[index])) {
    context.addIssue({ code: 'custom', message: 'gate reasons must be unique and sorted' })
  }
})

const incidentSchema = z.object({
  origin_id: z.string().min(1),
  reasons: orderedReasons,
}).strict()

const incidentsSchema = z.array(incidentSchema).superRefine((incidents, context) => {
  const originIds = incidents.map((incident) => incident.origin_id)
  if (new Set(originIds).size !== originIds.length
    || originIds.some((originId, index) => index > 0 && originIds[index - 1] >= originId)) {
    context.addIssue({ code: 'custom', message: 'critical incidents must be unique and origin-id sorted' })
  }
})

export const frozenHashesArtifactSchema = z.object({
  study_contract_sha256: sha256,
  candidate_model_sha256: sha256,
  comparator_artifact_sha256: sha256,
  dataset_manifest_sha256: sha256,
  feature_contract_sha256: sha256,
  label_contract_sha256: sha256,
  calibration_artifact_sha256: sha256,
}).strict()

export const safetyReportArtifactSchema = z.object({
  artifact_version: z.literal('prospective-safety-report-v1'),
  cycle_id: canonicalUuid,
  sequence_start: z.literal(1),
  sequence_end: z.literal(8),
  decision: z.enum(['pass', 'safety_hold']),
  reasons: orderedReasons,
  sample_status: z.enum(['empty', 'evaluated']),
  exact_paired_count: nonnegativeInteger,
  probabilities_valid: z.boolean(),
  pooled_brier: unit,
  fixed_bin_ece: unit,
  critical_incident_count: nonnegativeInteger,
  critical_incidents: incidentsSchema,
  gate_input_sha256: sha256,
  frozen_hashes: frozenHashesArtifactSchema,
}).strict().superRefine((artifact, context) => {
  if (artifact.critical_incident_count !== artifact.critical_incidents.length) {
    context.addIssue({ code: 'custom', path: ['critical_incident_count'], message: 'incident count mismatch' })
  }
  if ((artifact.sample_status === 'empty') !== (artifact.exact_paired_count === 0)
    || (artifact.sample_status === 'empty' && (artifact.pooled_brier !== 0 || artifact.fixed_bin_ece !== 0))) {
    context.addIssue({ code: 'custom', path: ['sample_status'], message: 'safety sample status mismatch' })
  }
})

const regime = z.enum(['risk_off', 'neutral', 'risk_on'])
const regimeMetricSchema = z.object({
  regime,
  origin_count: nonnegativeInteger,
  paired_row_count: nonnegativeInteger,
  candidate_brier: unit,
  comparator_brier: unit,
  delta_lower_95: finite.nullable(),
}).strict()

const orderedRegimes = <Schema extends z.ZodType<{ readonly regime: string }>>(schema: Schema) => (
  z.array(schema).length(3).superRefine((values, context) => {
    const expected = ['risk_off', 'neutral', 'risk_on']
    if (values.some((value, index) => value.regime !== expected[index])) {
      context.addIssue({ code: 'custom', message: 'regime rows must use frozen risk_off, neutral, risk_on order' })
    }
  })
)

const bootstrapReplicateSchema = z.object({
  seed: nonnegativeInteger.safe(),
  replicate_sha256: sha256,
}).strict()

const bootstrapLowerSchema = bootstrapReplicateSchema.extend({ lower_95: finite }).strict()

const bootstrapSchema = z.object({
  contract_version: z.literal('bootstrap-v1'),
  method: z.literal('theme_x_two_week_moving_block'),
  replicates: z.literal(10_000),
  moving_block_length: z.literal(2),
  ece_bin_count: z.literal(10),
  input_sha256: sha256,
  delta_brier: bootstrapReplicateSchema.extend({ point: finite, upper_99: finite }).strict(),
  ece: bootstrapReplicateSchema.extend({ point: unit, upper_95: unit }).strict(),
  regime_lower_95: z.object({
    risk_off: bootstrapLowerSchema.nullable(),
    neutral: bootstrapLowerSchema.nullable(),
    risk_on: bootstrapLowerSchema.nullable(),
  }).strict(),
  result_sha256: sha256,
}).strict()

const evaluatedRegimeSchema = regimeMetricSchema.extend({
  gate_eligible: z.boolean(),
  status: z.enum([
    'pass', 'insufficient_regime_sample', 'invalid_regime_metric', 'catastrophic_reversal',
  ]),
  relative_brier_worsening: finite.nullable(),
}).strict()

export const finalDecisionArtifactSchema = z.object({
  artifact_version: z.literal('prospective-final-decision-v1'),
  cycle_id: canonicalUuid,
  planned_origins: z.number().int().min(16).max(52),
  sequence_start: z.literal(1),
  sequence_end: z.number().int().min(16).max(52),
  decision_origin_date: canonicalDate,
  decision: z.enum(['pass', 'reject']),
  promotion_action: z.enum(['would_promote', 'keep_champion']),
  reasons: orderedReasons,
  relative_brier_improvement: finite.nullable(),
  completeness: z.object({
    expected_pair_count: nonnegativeInteger,
    terminal_pair_count: nonnegativeInteger,
    exact_paired_count: nonnegativeInteger,
    pooled_ratio: unit,
    minimum_origin_ratio: unit,
    terminal_accounting_ratio: unit,
    maximum_origin_source_gap_ratio: unit,
    pooled_coverage: unit,
    excluded_reason_counts: z.array(z.object({
      reason: z.string().min(1), count: z.number().int().positive(),
    }).strict()),
  }).strict(),
  metrics: z.object({
    candidate_brier: unit,
    comparator_brier: unit,
    p_at_10_candidate: unit,
    p_at_10_comparator: unit,
    p_at_10_valid_origins: nonnegativeInteger,
    p_at_10_required_origins: nonnegativeInteger,
    p_at_10_tie_break: z.literal('probability_desc_theme_id_asc'),
    regimes: orderedRegimes(regimeMetricSchema),
  }).strict(),
  regimes: orderedRegimes(evaluatedRegimeSchema),
  critical_incident_count: nonnegativeInteger,
  critical_incidents: incidentsSchema,
  gate_input_sha256: sha256,
  frozen_hashes: frozenHashesArtifactSchema,
  expected_frozen_hashes: frozenHashesArtifactSchema,
  bootstrap: bootstrapSchema,
  bootstrap_receipt: z.object({
    request_sha256: sha256,
    bridge_result_sha256: sha256,
  }).strict(),
}).strict().superRefine((artifact, context) => {
  if (artifact.sequence_end !== artifact.planned_origins) {
    context.addIssue({ code: 'custom', path: ['sequence_end'], message: 'sequence_end must equal planned_origins' })
  }
  const expectedAction = artifact.decision === 'pass' ? 'would_promote' : 'keep_champion'
  if (artifact.promotion_action !== expectedAction) {
    context.addIssue({ code: 'custom', path: ['promotion_action'], message: 'promotion action must match decision' })
  }
  if (artifact.critical_incident_count !== artifact.critical_incidents.length) {
    context.addIssue({ code: 'custom', path: ['critical_incident_count'], message: 'incident count mismatch' })
  }
})

export type SafetyReportArtifact = z.infer<typeof safetyReportArtifactSchema>
export type FinalDecisionArtifact = z.infer<typeof finalDecisionArtifactSchema>
export type GateEvidenceArtifact = SafetyReportArtifact | FinalDecisionArtifact

export const gateEvidenceArtifactSchema = z.discriminatedUnion('artifact_version', [
  safetyReportArtifactSchema,
  finalDecisionArtifactSchema,
])
