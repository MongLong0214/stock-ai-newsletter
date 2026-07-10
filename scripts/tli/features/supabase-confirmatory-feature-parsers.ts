import { z } from 'zod'

const sourceStatusSchema = z.enum(['complete', 'partial', 'failed'])
const sourceSchema = z.enum(['naver_datalab', 'naver_news', 'babl_phase'])
const bablMissingReasonSchema = z.enum([
  'no_matching_observation',
  'multiple_matching_observations',
  'source_run_not_complete',
  'source_after_cutoff',
  'source_pool_mismatch',
])

const studyOriginBundleSchema = z.object({
  id: z.string(),
  payload_sha256: z.string(),
  forecast_origin_manifest_id: z.string(),
  study_contract: z.object({
    id: z.string(),
    payload_sha256: z.string(),
    feature_contract_version: z.literal('tli-attention-v2-f1'),
    feature_contract_sha256: z.string(),
    babl_algorithm_version: z.string(),
    babl_comparison_spec_version: z.string(),
    babl_evaluation_horizon_days: z.number().int().positive(),
    babl_candidate_pool_rule: z.literal('source_prod_run_v1'),
  }),
}).nullable().transform((row) => row === null ? null : ({
  id: row.id,
  payloadSha256: row.payload_sha256,
  forecastOriginManifestId: row.forecast_origin_manifest_id,
  studyContract: {
    id: row.study_contract.id,
    payloadSha256: row.study_contract.payload_sha256,
    featureContractVersion: row.study_contract.feature_contract_version,
    featureContractSha256: row.study_contract.feature_contract_sha256,
    bablAlgorithmVersion: row.study_contract.babl_algorithm_version,
    bablComparisonSpecVersion: row.study_contract.babl_comparison_spec_version,
    bablEvaluationHorizonDays: row.study_contract.babl_evaluation_horizon_days,
    bablCandidatePoolRule: row.study_contract.babl_candidate_pool_rule,
  },
}))

const studyThemeInputsSchema = z.array(z.object({
  study_origin_manifest_id: z.string(),
  theme_id: z.string(),
  babl_observation_id: z.string().nullable(),
  babl_input_sha256: z.string().nullable(),
  babl_candidate_pool: z.string().nullable(),
  babl_missing_reason: bablMissingReasonSchema.nullable(),
})).transform((rows) => rows.map((row) => ({
  studyOriginManifestId: row.study_origin_manifest_id,
  themeId: row.theme_id,
  bablObservationId: row.babl_observation_id,
  bablInputSha256: row.babl_input_sha256,
  bablCandidatePool: row.babl_candidate_pool,
  bablMissingReason: row.babl_missing_reason,
})))

const forecastOriginManifestSchema = z.object({
  id: z.string(),
  payload_sha256: z.string(),
  origin_date: z.string(),
  forecast_cutoff: z.string(),
  expected_theme_ids: z.array(z.string()),
  expected_theme_count: z.number().int().positive(),
}).nullable().transform((row) => row === null ? null : ({
  id: row.id,
  payloadSha256: row.payload_sha256,
  originDate: row.origin_date,
  forecastCutoff: row.forecast_cutoff,
  expectedThemeIds: row.expected_theme_ids,
  expectedThemeCount: row.expected_theme_count,
}))

const forecastThemeInputsSchema = z.array(z.object({
  forecast_origin_manifest_id: z.string(),
  theme_id: z.string(),
  keyword_group_sha256: z.string(),
  forecast_interest_run_id: z.string().nullable(),
  forecast_interest_response_sha256: z.string().nullable(),
  news_observation_ids: z.array(z.string()),
  news_input_sha256: z.string().nullable(),
  input_status: z.enum(['usable', 'abstain']),
  abstain_reason: z.string().nullable(),
})).transform((rows) => rows.map((row) => ({
  forecastOriginManifestId: row.forecast_origin_manifest_id,
  themeId: row.theme_id,
  keywordGroupSha256: row.keyword_group_sha256,
  forecastInterestRunId: row.forecast_interest_run_id,
  forecastInterestResponseSha256: row.forecast_interest_response_sha256,
  newsObservationIds: row.news_observation_ids,
  newsInputSha256: row.news_input_sha256,
  inputStatus: row.input_status,
  abstainReason: row.abstain_reason,
})))

const collectionRunsSchema = z.array(z.object({
  id: z.string(),
  source: sourceSchema,
  status: sourceStatusSchema,
  response_sha256: z.string().nullable(),
  keyword_group_hash: z.string().nullable(),
  source_max_date: z.string().nullable(),
  collected_at: z.string(),
  completed_at: z.string(),
})).transform((rows) => rows.map((row) => ({
  id: row.id,
  source: row.source,
  status: row.status,
  responseSha256: row.response_sha256,
  keywordGroupHash: row.keyword_group_hash,
  sourceMaxDate: row.source_max_date,
  collectedAt: row.collected_at,
  completedAt: row.completed_at,
})))

const interestObservationsSchema = z.array(z.object({
  id: z.string(),
  collection_run_id: z.string(),
  theme_id: z.string(),
  trading_date: z.string(),
  raw_value: z.number(),
  normalized: z.number(),
  anchor_scaled_value: z.number().nullable(),
})).transform((rows) => rows.map((row) => ({
  id: row.id,
  collectionRunId: row.collection_run_id,
  themeId: row.theme_id,
  tradingDate: row.trading_date,
  rawValue: row.raw_value,
  normalized: row.normalized,
  anchorScaledValue: row.anchor_scaled_value,
})))

const newsObservationsSchema = z.array(z.object({
  id: z.string(),
  collection_run_id: z.string(),
  theme_id: z.string(),
  article_date: z.string(),
  article_count: z.number().int().nonnegative(),
  query_hash: z.string(),
  collected_at: z.string(),
})).transform((rows) => rows.map((row) => ({
  id: row.id,
  collectionRunId: row.collection_run_id,
  themeId: row.theme_id,
  articleDate: row.article_date,
  articleCount: row.article_count,
  queryHash: row.query_hash,
  collectedAt: row.collected_at,
})))

const bablObservationsSchema = z.array(z.object({
  id: z.string(),
  collection_run_id: z.string(),
  theme_id: z.string(),
  snapshot_date: z.string(),
  phase: z.string(),
  algorithm_version: z.string(),
  comparison_spec_version: z.string(),
  evaluation_horizon_days: z.number().int().positive(),
  candidate_pool: z.string(),
  source_prediction_snapshot_id: z.string(),
  computed_at: z.string(),
  payload_hash: z.string(),
  source_run: z.object({ status: sourceStatusSchema }),
})).transform((rows) => rows.map((row) => ({
  id: row.id,
  collectionRunId: row.collection_run_id,
  themeId: row.theme_id,
  snapshotDate: row.snapshot_date,
  phase: row.phase,
  algorithmVersion: row.algorithm_version,
  comparisonSpecVersion: row.comparison_spec_version,
  evaluationHorizonDays: row.evaluation_horizon_days,
  candidatePool: row.candidate_pool,
  sourcePredictionSnapshotId: row.source_prediction_snapshot_id,
  computedAt: row.computed_at,
  payloadHash: row.payload_hash,
  sourceRunStatus: row.source_run.status,
})))

export const parseStudyOriginBundle = (value: unknown) => studyOriginBundleSchema.safeParse(value)
export const parseStudyThemeInputs = (value: unknown) => studyThemeInputsSchema.safeParse(value)
export const parseForecastOriginManifest = (value: unknown) => forecastOriginManifestSchema.safeParse(value)
export const parseForecastThemeInputs = (value: unknown) => forecastThemeInputsSchema.safeParse(value)
export const parseCollectionRuns = (value: unknown) => collectionRunsSchema.safeParse(value)
export const parseInterestObservations = (value: unknown) => interestObservationsSchema.safeParse(value)
export const parseNewsObservations = (value: unknown) => newsObservationsSchema.safeParse(value)
export const parseBablObservations = (value: unknown) => bablObservationsSchema.safeParse(value)
