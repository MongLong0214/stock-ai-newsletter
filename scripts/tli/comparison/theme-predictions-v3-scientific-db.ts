import { z } from 'zod'
import { supabaseAdmin } from '../shared/supabase-admin'
import type {
  ScientificPredictionScoringInput,
  ScientificScoreFinalizer,
} from './theme-predictions-v3-scientific-types'
import { loadEligibleStudyOriginBindings } from '../origins/study-origin-eligibility-source'

const cycleSchema = z.object({
  id: z.string(), status: z.string(), study_contract_id: z.string(),
  candidate_model_version: z.string(), candidate_model_sha256: z.string(),
  comparator_version: z.string(), comparator_artifact_sha256: z.string(),
  feature_contract_sha256: z.string(), labeler_version: z.string(),
})
const originSchema = z.object({
  id: z.string(), cycle_id: z.string(), study_origin_manifest_id: z.string(),
  forecast_origin_manifest_id: z.string(), candidate_model_sha256: z.string(),
  comparator_artifact_sha256: z.string(),
})
const studyOriginSchema = z.object({
  id: z.string(), study_contract_id: z.string(), forecast_origin_manifest_id: z.string(),
})
const forecastSchema = z.object({
  id: z.string(), origin_date: z.string(), forecast_cutoff: z.string(),
  expected_theme_ids: z.array(z.string()), expected_theme_count: z.number().int().positive(),
})
const evidenceArtifactSchema = z.object({
  id: z.string(), cycle_id: z.string(), experiment_origin_manifest_id: z.string().nullable(),
  artifact_type: z.string(), artifact_key: z.string(), content_sha256: z.string(),
  payload: z.object({}).catchall(z.unknown()), created_at: z.string(),
})
const evidenceAttestationSchema = z.object({
  artifact_id: z.string(), content_sha256: z.string(), verified_at: z.string(),
})
const predictionSchema = z.object({
  id: z.string(), experiment_cycle_id: z.string(), experiment_origin_manifest_id: z.string(),
  theme_id: z.string(), prediction_date: z.string(), horizon_days: z.number().int().positive(),
  serving_role: z.string(), scientific_prediction_role: z.string(), model_version: z.string(),
  model_artifact_sha256: z.string(), feature_contract_hash: z.string(), feature_snapshot_hash: z.string(),
  features: z.object({}).catchall(z.unknown()),
  forecast_cutoff: z.string(), forecast_origin_week: z.string(), labeler_version: z.string(),
  p_rise: z.number().nullable(), ci_lower: z.number().nullable(), ci_upper: z.number().nullable(),
  abstain: z.boolean(), score_status: z.string(), created_at: z.string(),
})
const labelSchema = z.object({
  id: z.string(), theme_id: z.string(), base_date: z.string(), horizon_days: z.number().int().positive(),
  labeler_version: z.string(), label_type: z.string(), label_status: z.string(),
  scientific_use_status: z.string().nullable(), g_log_ratio: z.number().nullable(),
  y_binary: z.boolean().nullable(), exclude_reason: z.string().nullable(),
  forecast_origin_manifest_id: z.string().nullable(), finalized_at: z.string().nullable(),
})

interface DbError {
  readonly message: string
}

interface DbResult {
  readonly data: unknown
  readonly error: DbError | null
}

const readRows = async <Row>(
  label: string,
  query: PromiseLike<DbResult>,
  schema: z.ZodType<Row>,
): Promise<Row[]> => {
  const { data, error } = await query
  if (error) throw new Error(`${label} 조회 실패: ${error.message}`)
  return z.array(schema).parse(data ?? [])
}

const DB_PAGE_SIZE = 1000

const readAllRows = async <Row>(
  label: string,
  queryPage: (from: number, to: number) => PromiseLike<DbResult>,
  schema: z.ZodType<Row>,
): Promise<Row[]> => {
  const rows: Row[] = []
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const page = await readRows(label, queryPage(from, from + DB_PAGE_SIZE - 1), schema)
    rows.push(...page)
    if (page.length < DB_PAGE_SIZE) return rows
  }
}

const exactLoaded = <Row>(rows: readonly Row[], label: string): Row => {
  if (rows.length !== 1) throw new Error(`${label} 조회는 정확히 한 행이어야 합니다: ${rows.length}`)
  const row = rows.at(0)
  if (row === undefined) throw new Error(`${label} 조회 결과가 사라졌습니다`)
  return row
}

export async function loadScientificPredictionScoringInput(input: {
  readonly cycleId: string
  readonly originId: string
  readonly scoredAt: string
}): Promise<ScientificPredictionScoringInput> {
  const [cycles, origins] = await Promise.all([
    readRows('experiment cycle', supabaseAdmin.from('tli_experiment_cycles').select(
      'id, status, study_contract_id, candidate_model_version, candidate_model_sha256, comparator_version, comparator_artifact_sha256, feature_contract_sha256, labeler_version',
    ).eq('id', input.cycleId), cycleSchema),
    readRows('experiment origin', supabaseAdmin.from('tli_experiment_origin_manifests').select(
      'id, cycle_id, study_origin_manifest_id, forecast_origin_manifest_id, candidate_model_sha256, comparator_artifact_sha256',
    ).eq('id', input.originId).eq('cycle_id', input.cycleId), originSchema),
  ])
  const cycle = exactLoaded(cycles, 'experiment cycle')
  const origin = exactLoaded(origins, 'experiment origin')
  const [studyOrigins, forecasts, evidenceArtifacts, predictions] = await Promise.all([
    loadEligibleStudyOriginBindings(cycle.study_contract_id).then((bindings) => studyOriginSchema.array().parse(
      bindings
        .filter((binding) => binding.study_origin_manifest_id === origin.study_origin_manifest_id)
        .map((binding) => ({
          id: binding.study_origin_manifest_id,
          study_contract_id: cycle.study_contract_id,
          forecast_origin_manifest_id: binding.forecast_origin_manifest_id,
        })),
    )),
    readRows('forecast origin', supabaseAdmin.from('tli_forecast_origin_manifests').select(
      'id, origin_date, forecast_cutoff, expected_theme_ids, expected_theme_count',
    ).eq('id', origin.forecast_origin_manifest_id), forecastSchema),
    readRows('scientific evidence', supabaseAdmin.from('tli_evidence_artifacts').select(
      'id, cycle_id, experiment_origin_manifest_id, artifact_type, artifact_key, content_sha256, payload, created_at',
    ).eq('cycle_id', cycle.id).in('artifact_type', ['origin_manifest', 'model_manifest']), evidenceArtifactSchema),
    readAllRows('scientific predictions', (from, to) => supabaseAdmin.from('theme_predictions_v3').select(
      'id, experiment_cycle_id, experiment_origin_manifest_id, theme_id, prediction_date, horizon_days, serving_role, scientific_prediction_role, model_version, model_artifact_sha256, feature_contract_hash, feature_snapshot_hash, features, forecast_cutoff, forecast_origin_week, labeler_version, p_rise, ci_lower, ci_upper, abstain, score_status, created_at',
    ).eq('experiment_cycle_id', cycle.id).eq('experiment_origin_manifest_id', origin.id)
      .order('id', { ascending: true }).range(from, to), predictionSchema),
  ])
  const forecast = exactLoaded(forecasts, 'forecast origin')
  const artifactIds = evidenceArtifacts.map((row) => row.id)
  const [evidenceAttestations, labels] = await Promise.all([
    artifactIds.length === 0 ? Promise.resolve([]) : readRows(
      'scientific attestations',
      supabaseAdmin.from('tli_evidence_attestations').select(
        'artifact_id, content_sha256, verified_at',
      ).in('artifact_id', artifactIds),
      evidenceAttestationSchema,
    ),
    readAllRows('scientific labels', (from, to) => supabaseAdmin.from('theme_labels').select(
      'id, theme_id, base_date, horizon_days, labeler_version, label_type, label_status, scientific_use_status, g_log_ratio, y_binary, exclude_reason, forecast_origin_manifest_id, finalized_at',
    ).eq('forecast_origin_manifest_id', forecast.id).eq('base_date', forecast.origin_date)
      .order('id', { ascending: true }).range(from, to), labelSchema),
  ])
  return {
    requestedCycleId: input.cycleId,
    requestedOriginId: input.originId,
    scoredAt: input.scoredAt,
    cycles,
    origins,
    studyOrigins,
    forecasts,
    evidenceArtifacts,
    evidenceAttestations,
    predictions,
    labels,
  }
}

export const finalizeScientificScoreWithRpc: ScientificScoreFinalizer = async (request) => {
  const payload = z.object({ prediction_id: z.string() }).passthrough().parse(JSON.parse(request.canonicalJson))
  const { data, error } = await supabaseAdmin.rpc('finalize_tli_scientific_prediction_score', {
    p_score_canonical_json: request.canonicalJson,
    p_score_payload_sha256: request.payloadSha256,
  })
  if (error) throw new Error(`scientific score RPC 실패 (${payload.prediction_id}): ${error.message}`)
  if (data !== payload.prediction_id) throw new Error(`scientific score RPC identity mismatch: ${payload.prediction_id}`)
}
