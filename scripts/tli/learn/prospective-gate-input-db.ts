import { z } from 'zod'

import { supabaseAdmin } from '../shared/supabase-admin'
import { assembleProspectiveGateInput } from './prospective-gate-input-assembly'
import type {
  ProspectiveExpectedThemeRow,
  ProspectiveGateInputBundle,
} from './prospective-gate-input-contract'

const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const cycleSchema = z.object({
  id: z.string().uuid(), status: z.string(), study_contract_id: z.string().uuid(), study_contract_sha256: sha256,
  candidate_model_sha256: sha256, comparator_artifact_sha256: sha256,
  dataset_manifest_sha256: sha256, feature_contract_sha256: sha256,
  labeler_version: z.string().min(1), label_contract_sha256: sha256,
  calibration_artifact_sha256: sha256, planned_origins: z.number().int().min(16).max(52),
  safety_origins: z.literal(8), safety_checked_at: z.string().nullable(), decision_at: z.string().nullable(),
})
const originSchema = z.object({
  id: z.string().uuid(), cycle_id: z.string().uuid(), study_origin_manifest_id: z.string().uuid(),
  study_origin: z.object({
    study_contract_id: z.string().uuid(), forecast_origin_manifest_id: z.string().uuid(), payload_sha256: sha256,
  }),
  forecast_origin_manifest_id: z.string().uuid(),
  sequence_no: z.number().int().positive(), enrollment_role: z.string(),
  candidate_model_sha256: sha256, comparator_artifact_sha256: sha256,
  kospi_base_trade_date: z.iso.date(), kospi_base_close: z.coerce.number().positive().finite(),
  kospi_lookback_trade_date: z.iso.date(), kospi_lookback_close: z.coerce.number().positive().finite(),
  kospi_source_ids: z.array(z.string().min(1)).length(2), kospi_input_sha256: sha256,
  regime: z.enum(['risk_off', 'neutral', 'risk_on']),
})
const forecastSchema = z.object({
  id: z.string().uuid(), origin_date: z.string(), forecast_cutoff: z.string(),
  expected_theme_count: z.number().int().positive(), expected_universe_sha256: sha256,
  keyword_group_manifest_sha256: sha256, payload_sha256: sha256,
})
const rawExpectedThemeSchema = z.object({
  forecast_origin_manifest_id: z.string().uuid(), theme_id: z.string().min(1),
  keyword_group_sha256: sha256, forecast_interest_run_id: z.string().uuid().nullable(),
  forecast_interest_response_sha256: sha256.nullable(),
  news_observation_ids: z.array(z.string().uuid()), news_input_sha256: sha256.nullable(),
  input_status: z.enum(['usable', 'abstain']), abstain_reason: z.string().nullable(),
})
const predictionSchema = z.object({
  id: z.string().min(1), experiment_cycle_id: z.string().uuid(),
  experiment_origin_manifest_id: z.string().uuid(), theme_id: z.string().min(1),
  prediction_date: z.string(), horizon_days: z.number().int().positive(), labeler_version: z.string(),
  scientific_prediction_role: z.enum(['candidate', 'comparator']), model_artifact_sha256: sha256,
  feature_contract_hash: sha256, forecast_cutoff: z.string(), forecast_origin_week: z.string(),
  p_rise: z.number().nullable(), ci_lower: z.number().nullable(), ci_upper: z.number().nullable(),
  abstain: z.boolean(), actual_y: z.boolean().nullable(),
  actual_label_id: z.string().nullable(), score_status: z.enum(['pending', 'scored', 'excluded']),
  score_exclusion_reason: z.string().nullable(),
})
const evidenceSchema = z.object({
  id: z.string().uuid(), cycle_id: z.string().uuid(), experiment_origin_manifest_id: z.string().uuid().nullable(),
  artifact_type: z.string(), artifact_key: z.string(), content_sha256: sha256,
  payload: z.record(z.string(), z.unknown()),
})
const attestationSchema = z.object({ artifact_id: z.string().uuid(), content_sha256: sha256 })
const collectionRunSchema = z.object({
  id: z.string().uuid(), source: z.string(), status: z.enum(['complete', 'partial', 'failed']),
  collected_at: z.string(), completed_at: z.string().nullable(), response_sha256: sha256.nullable(),
})
const interestObservationSchema = z.object({ collection_run_id: z.string().uuid(), theme_id: z.string().min(1) })
const newsObservationSchema = z.object({
  id: z.string().uuid(), collection_run_id: z.string().uuid(), collected_at: z.string(),
})

interface DbResult { readonly data: unknown; readonly error: { readonly message: string } | null }
type DbQuery = PromiseLike<DbResult>
const PAGE_SIZE = 1000

const readRows = async <Row>(label: string, query: DbQuery, schema: z.ZodType<Row>): Promise<Row[]> => {
  const { data, error } = await query
  if (error) throw new Error(`${label} query failed: ${error.message}`)
  return z.array(schema).parse(data ?? [])
}

const readAllRows = async <Row>(
  label: string,
  page: (from: number, to: number) => DbQuery,
  schema: z.ZodType<Row>,
): Promise<Row[]> => {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const batch = await readRows(label, page(from, from + PAGE_SIZE - 1), schema)
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

const exactOne = <Row>(rows: readonly Row[], label: string): Row => {
  if (rows.length !== 1 || rows[0] === undefined) throw new Error(`${label} must contain exactly one row`)
  return rows[0]
}

export async function loadRunningProspectiveCycleIdFromDb(): Promise<string | null> {
  const rows = await readRows(
    'running prospective cycle',
    supabaseAdmin.from('tli_experiment_cycles').select('id').eq('status', 'running').limit(2),
    z.object({ id: z.string().uuid() }),
  )
  if (rows.length > 1) throw new Error('running prospective cycle must contain at most one row')
  return rows[0]?.id ?? null
}

export async function loadProspectiveGateInputFromDb(input: {
  readonly cycleId: string
}): Promise<ProspectiveGateInputBundle> {
  const [cycles, origins, evidence] = await Promise.all([
    readRows('prospective cycle', supabaseAdmin.from('tli_experiment_cycles').select(
      'id,status,study_contract_id,study_contract_sha256,candidate_model_sha256,comparator_artifact_sha256,dataset_manifest_sha256,feature_contract_sha256,labeler_version,label_contract_sha256,calibration_artifact_sha256,planned_origins,safety_origins,safety_checked_at,decision_at',
    ).eq('id', input.cycleId), cycleSchema),
    readRows('prospective origins', supabaseAdmin.from('tli_experiment_origin_manifests').select(
      'id,cycle_id,study_origin_manifest_id,study_origin:tli_study_origin_manifests!study_origin_manifest_id(study_contract_id,forecast_origin_manifest_id,payload_sha256),forecast_origin_manifest_id,sequence_no,enrollment_role,candidate_model_sha256,comparator_artifact_sha256,kospi_base_trade_date,kospi_base_close,kospi_lookback_trade_date,kospi_lookback_close,kospi_source_ids,kospi_input_sha256,regime',
    ).eq('cycle_id', input.cycleId), originSchema),
    readAllRows('prospective evidence', (from, to) => supabaseAdmin.from('tli_evidence_artifacts').select(
      'id,cycle_id,experiment_origin_manifest_id,artifact_type,artifact_key,content_sha256,payload',
    ).eq('cycle_id', input.cycleId).order('id', { ascending: true }).range(from, to), evidenceSchema),
  ])
  const cycle = exactOne(cycles, 'prospective cycle')
  const scopedOrigins = origins.filter((origin) => origin.cycle_id === cycle.id)
  const forecastIds = [...new Set(scopedOrigins.map((origin) => origin.forecast_origin_manifest_id))]
  const originIds = scopedOrigins.map((origin) => origin.id)
  const artifactIds = evidence.map((artifact) => artifact.id)
  const [forecasts, rawExpectedThemes, predictions, attestations] = await Promise.all([
    forecastIds.length === 0 ? Promise.resolve([]) : readRows(
      'prospective forecasts', supabaseAdmin.from('tli_forecast_origin_manifests').select(
        'id,origin_date,forecast_cutoff,expected_theme_count,expected_universe_sha256,keyword_group_manifest_sha256,payload_sha256',
      ).in('id', forecastIds), forecastSchema,
    ),
    forecastIds.length === 0 ? Promise.resolve([]) : readAllRows(
      'prospective expected themes', (from, to) => supabaseAdmin.from('tli_forecast_origin_theme_inputs').select(
        'forecast_origin_manifest_id,theme_id,keyword_group_sha256,forecast_interest_run_id,forecast_interest_response_sha256,news_observation_ids,news_input_sha256,input_status,abstain_reason',
      ).in('forecast_origin_manifest_id', forecastIds)
        .order('forecast_origin_manifest_id', { ascending: true }).order('theme_id', { ascending: true })
        .range(from, to), rawExpectedThemeSchema,
    ),
    originIds.length === 0 ? Promise.resolve([]) : readAllRows(
      'prospective predictions', (from, to) => supabaseAdmin.from('theme_predictions_v3').select(
        'id,experiment_cycle_id,experiment_origin_manifest_id,theme_id,prediction_date,horizon_days,labeler_version,scientific_prediction_role,model_artifact_sha256,feature_contract_hash,forecast_cutoff,forecast_origin_week,p_rise,ci_lower,ci_upper,abstain,actual_y,actual_label_id,score_status,score_exclusion_reason',
      ).eq('experiment_cycle_id', cycle.id).in('experiment_origin_manifest_id', originIds)
        .order('id', { ascending: true }).range(from, to), predictionSchema,
    ),
    artifactIds.length === 0 ? Promise.resolve([]) : readAllRows(
      'prospective attestations', (from, to) => supabaseAdmin.from('tli_evidence_attestations').select(
        'artifact_id,content_sha256',
      ).in('artifact_id', artifactIds).order('artifact_id', { ascending: true }).range(from, to),
      attestationSchema,
    ),
  ])
  const interestRunIds = rawExpectedThemes.flatMap((row) => row.forecast_interest_run_id === null
    ? [] : [row.forecast_interest_run_id])
  const newsObservationIds = rawExpectedThemes.flatMap((row) => row.news_observation_ids)
  const [interestRuns, interestObservations, newsObservations] = await Promise.all([
    interestRunIds.length === 0 ? Promise.resolve([]) : readRows(
      'prospective interest runs', supabaseAdmin.from('tli_collection_runs').select(
        'id,source,status,collected_at,completed_at,response_sha256',
      ).in('id', interestRunIds), collectionRunSchema,
    ),
    interestRunIds.length === 0 ? Promise.resolve([]) : readAllRows(
      'prospective interest observations', (from, to) => supabaseAdmin.from('tli_interest_observations').select(
        'collection_run_id,theme_id',
      ).in('collection_run_id', interestRunIds).order('collection_run_id', { ascending: true })
        .order('theme_id', { ascending: true }).range(from, to), interestObservationSchema,
    ),
    newsObservationIds.length === 0 ? Promise.resolve([]) : readAllRows(
      'prospective news observations', (from, to) => supabaseAdmin.from('tli_news_observations').select(
        'id,collection_run_id,collected_at',
      ).in('id', newsObservationIds).order('id', { ascending: true }).range(from, to), newsObservationSchema,
    ),
  ])
  const newsRunIds = [...new Set(newsObservations.map((row) => row.collection_run_id))]
  const newsRuns = newsRunIds.length === 0 ? [] : await readRows(
    'prospective news runs', supabaseAdmin.from('tli_collection_runs').select(
      'id,source,status,collected_at,completed_at,response_sha256',
    ).in('id', newsRunIds), collectionRunSchema,
  )
  const beforeCutoff = (value: string | null, cutoff: string): boolean => value !== null
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.parse(cutoff)
  const expectedThemes: ProspectiveExpectedThemeRow[] = rawExpectedThemes.map((row) => {
    const forecast = forecasts.find((candidate) => candidate.id === row.forecast_origin_manifest_id)
    const cutoff = forecast?.forecast_cutoff ?? ''
    const interestRun = row.forecast_interest_run_id === null ? null
      : interestRuns.find((candidate) => candidate.id === row.forecast_interest_run_id) ?? null
    const interestRows = row.forecast_interest_run_id === null ? [] : interestObservations.filter((candidate) => (
      candidate.collection_run_id === row.forecast_interest_run_id && candidate.theme_id === row.theme_id
    ))
    const newsRows = newsObservations.filter((candidate) => row.news_observation_ids.includes(candidate.id))
    const sourceProof = {
      interest_run_status: interestRun?.status ?? null,
      interest_run_source: interestRun?.source ?? null,
      interest_run_before_cutoff: interestRun !== null
        && beforeCutoff(interestRun.collected_at, cutoff) && beforeCutoff(interestRun.completed_at, cutoff),
      interest_observation_count: interestRows.length,
      interest_observation_run_count: new Set(interestRows.map((candidate) => candidate.collection_run_id)).size,
      news_observation_count: newsRows.length,
      news_run_statuses: [...new Set(newsRows.map((candidate) => (
        newsRuns.find((run) => run.id === candidate.collection_run_id)?.status ?? 'missing'
      )))].sort(),
      news_before_cutoff: newsRows.length === row.news_observation_ids.length && newsRows.every((candidate) => {
        const run = newsRuns.find((value) => value.id === candidate.collection_run_id)
        return run !== undefined && run.source === 'naver_news' && beforeCutoff(candidate.collected_at, cutoff)
          && beforeCutoff(run.collected_at, cutoff) && beforeCutoff(run.completed_at, cutoff)
      }),
    }
    return { ...row, source_proof: sourceProof }
  })
  return assembleProspectiveGateInput({
    cycle, origins: scopedOrigins, forecasts, expectedThemes, predictions, evidence, attestations,
  })
}
