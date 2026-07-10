import { canonicalJsonV1Sha256, type JsonObject } from '../../../lib/tli/canonical-json'
import type { ProspectiveGateSource } from '../learn/prospective-gate-input-contract'
import type { FreezeEvidenceEnvelope } from './cycle-freeze-contract'
import type { FixtureOriginStack } from './fixture-origins'
import {
  COMPARATOR_ARTIFACT_SHA256,
  FEATURE_CONTRACT_SHA256,
  LABEL_CONTRACT_SHA256,
  deterministicUuid,
  experimentOriginId,
  sha256Identity,
  scientificPredictionId,
  STUDY_CONTRACT_ID,
  THEME_IDS,
} from './fixture-identities'
import type { ProspectivePanelRow } from './prospective-panel'

type GatePanelRow = Pick<
  ProspectivePanelRow,
  'sequence' | 'origin' | 'themeId' | 'candidateProbability' | 'candidateCiLower' | 'candidateCiUpper'
  | 'comparatorProbability' | 'outcome' | 'labelId'
>

const SOURCE_PROOF = {
  interest_run_status: 'complete' as const,
  interest_run_source: 'naver_datalab',
  interest_run_before_cutoff: true,
  interest_observation_count: 20,
  interest_observation_run_count: 1,
  news_observation_count: 14,
  news_run_statuses: ['complete'],
  news_before_cutoff: true,
}

export function buildGateSource(input: {
  readonly stack: FixtureOriginStack
  readonly panel: { readonly rows: readonly GatePanelRow[] }
  readonly candidateModelSha256: string
  readonly calibrationArtifactSha256: string
  readonly datasetManifestSha256: string
  readonly plannedOrigins: 16 | 24
  readonly observedOrigins: number
  readonly safetyPassed: boolean
  readonly primaryCycleId?: string
  readonly primaryCycleEvidence?: readonly FreezeEvidenceEnvelope[]
}): ProspectiveGateSource {
  // Candidate interval = frozen 500-model replay stored on the panel row; comparator = its own point.
  const intervalFor = (row: GatePanelRow, role: 'candidate' | 'comparator'): { lower: number; upper: number } => (
    role === 'comparator'
      ? { lower: row.comparatorProbability, upper: row.comparatorProbability }
      : { lower: row.candidateCiLower, upper: row.candidateCiUpper }
  )
  const cycleId = input.plannedOrigins === 24 && input.primaryCycleId !== undefined
    ? input.primaryCycleId
    : deterministicUuid('gate-cycle', input.plannedOrigins)
  const selected = input.stack.prospectiveOrigins.slice(0, input.observedOrigins)
  const origins = selected.map((origin, index) => {
    const sequence = index + 1
    const regime = sequence <= 4 ? 'risk_off' as const
      : sequence > input.plannedOrigins - 4 ? 'risk_on' as const
        : 'neutral' as const
    return {
      id: experimentOriginId(cycleId, origin.originDate),
      cycle_id: cycleId,
      study_origin_manifest_id: origin.studyOriginManifestId,
      study_origin: {
        study_contract_id: STUDY_CONTRACT_ID,
        forecast_origin_manifest_id: origin.forecastManifestId,
        payload_sha256: origin.studyOriginManifestSha256,
      },
      forecast_origin_manifest_id: origin.forecastManifestId,
      sequence_no: sequence,
      enrollment_role: 'confirmatory',
      candidate_model_sha256: input.candidateModelSha256,
      comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
      kospi_base_trade_date: origin.originDate,
      kospi_base_close: regime === 'risk_off' ? 96 : regime === 'risk_on' ? 104 : 100,
      kospi_lookback_trade_date: origin.originDate,
      kospi_lookback_close: 100,
      kospi_source_ids: [
        deterministicUuid('kospi-base', origin.originDate),
        deterministicUuid('kospi-lookback', origin.originDate),
      ],
      kospi_input_sha256: sha256Identity('kospi-input', origin.originDate),
      regime,
    }
  })
  const forecasts = selected.map((origin) => ({
    id: origin.forecastManifestId,
    origin_date: origin.originDate,
    forecast_cutoff: origin.forecastCutoff,
    expected_theme_count: THEME_IDS.length,
    expected_universe_sha256: sha256Identity('expected-universe', origin.originDate),
    keyword_group_manifest_sha256: sha256Identity('keyword-manifest', origin.originDate),
    payload_sha256: origin.forecastManifestSha256,
  }))
  const expectedThemes = selected.flatMap((origin) => THEME_IDS.map((themeId) => ({
    forecast_origin_manifest_id: origin.forecastManifestId,
    theme_id: themeId,
    keyword_group_sha256: sha256Identity('keyword-group', themeId),
    forecast_interest_run_id: deterministicUuid('feature-interest-run', `${origin.originDate}:${themeId}`),
    forecast_interest_response_sha256: sha256Identity('feature-interest-response', `${origin.originDate}:${themeId}`),
    news_observation_ids: Array.from({ length: 14 }, (_unused, index) => (
      deterministicUuid('feature-news-observation', `${origin.originDate}:${themeId}:${index}`)
    )),
    news_input_sha256: sha256Identity('gate-news-input', `${origin.originDate}:${themeId}`),
    input_status: 'usable' as const,
    abstain_reason: null,
    source_proof: SOURCE_PROOF,
  })))
  const predictions = origins.flatMap((origin) => {
    const rows = input.panel.rows.filter((row) => row.sequence === origin.sequence_no)
    return rows.flatMap((row) => (['candidate', 'comparator'] as const).map((role) => {
      const interval = intervalFor(row, role)
      return {
        id: scientificPredictionId(origin.id, row.themeId, role),
        experiment_cycle_id: cycleId,
        experiment_origin_manifest_id: origin.id,
        theme_id: row.themeId,
        prediction_date: row.origin.originDate,
        horizon_days: 5,
        labeler_version: 'gta-v2',
        scientific_prediction_role: role,
        model_artifact_sha256: role === 'candidate'
          ? input.candidateModelSha256
          : COMPARATOR_ARTIFACT_SHA256,
        feature_contract_hash: FEATURE_CONTRACT_SHA256,
        forecast_cutoff: row.origin.forecastCutoff,
        forecast_origin_week: row.origin.originDate,
        p_rise: role === 'candidate' ? row.candidateProbability : row.comparatorProbability,
        ci_lower: interval.lower,
        ci_upper: interval.upper,
        abstain: false,
        actual_y: row.outcome,
        actual_label_id: row.labelId,
        score_status: 'scored' as const,
        score_exclusion_reason: null,
      }
    }))
  })
  const fixtureCyclePayload = (type: string): JsonObject => ({
    manifest_version: `tli-${type.replace('_', '-')}-fixture-v1`,
    cycle_id: cycleId,
    study_contract_id: STUDY_CONTRACT_ID,
    study_contract_sha256: input.stack.studyContractSha256,
    candidate_model_sha256: input.candidateModelSha256,
    comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
    dataset_manifest_sha256: input.datasetManifestSha256,
    feature_contract_sha256: FEATURE_CONTRACT_SHA256,
    label_contract_sha256: LABEL_CONTRACT_SHA256,
    calibration_artifact_sha256: input.calibrationArtifactSha256,
    planned_origins: input.plannedOrigins,
  })
  const sourceCycleEvidence = input.plannedOrigins === 24
    ? input.primaryCycleEvidence
    : undefined
  const cycleEvidence = sourceCycleEvidence === undefined
    ? ['preregistration', 'cycle_manifest', 'dataset_manifest', 'model_manifest'].map((type) => {
      const payload = fixtureCyclePayload(type)
      return {
        id: deterministicUuid('gate-cycle-evidence', `${cycleId}:${type}`),
        cycle_id: cycleId,
        experiment_origin_manifest_id: null,
        artifact_type: type,
        artifact_key: 'singleton',
        content_sha256: canonicalJsonV1Sha256(payload),
        payload,
      }
    })
    : sourceCycleEvidence.map((envelope) => ({
      id: deterministicUuid('gate-cycle-evidence', `${cycleId}:${envelope.artifact_type}`),
      cycle_id: cycleId,
      experiment_origin_manifest_id: null,
      artifact_type: envelope.artifact_type,
      artifact_key: envelope.artifact_key,
      content_sha256: envelope.content_sha256,
      payload: envelope.payload,
    }))
  const originEvidence = origins.map((origin) => {
    const forecast = forecasts.find((row) => row.id === origin.forecast_origin_manifest_id)
    if (forecast === undefined) throw new Error(`gate forecast missing for ${origin.id}`)
    const payload = {
      manifest_version: 'origin-manifest-v1',
      experiment_origin_manifest_id: origin.id,
      cycle_id: cycleId,
      study_origin_manifest_id: origin.study_origin_manifest_id,
      forecast_origin_manifest_id: origin.forecast_origin_manifest_id,
      study_contract_id: STUDY_CONTRACT_ID,
      study_contract_sha256: input.stack.studyContractSha256,
      enrollment_role: origin.enrollment_role,
      sequence_no: origin.sequence_no,
      public_canary_no: null,
      origin_date: forecast.origin_date,
      forecast_cutoff: forecast.forecast_cutoff,
      expected_universe_sha256: forecast.expected_universe_sha256,
      keyword_group_manifest_sha256: forecast.keyword_group_manifest_sha256,
      forecast_payload_sha256: forecast.payload_sha256,
      study_origin_payload_sha256: origin.study_origin.payload_sha256,
      candidate_model_sha256: origin.candidate_model_sha256,
      comparator_artifact_sha256: origin.comparator_artifact_sha256,
      kospi_base_trade_date: origin.kospi_base_trade_date,
      kospi_base_close: origin.kospi_base_close,
      kospi_lookback_trade_date: origin.kospi_lookback_trade_date,
      kospi_lookback_close: origin.kospi_lookback_close,
      kospi_source_ids: origin.kospi_source_ids,
      kospi_input_sha256: origin.kospi_input_sha256,
      regime: origin.regime,
    } satisfies JsonObject
    return {
      id: deterministicUuid('gate-origin-evidence', origin.id),
      cycle_id: cycleId,
      experiment_origin_manifest_id: origin.id,
      artifact_type: 'origin_manifest',
      artifact_key: forecast.origin_date,
      content_sha256: canonicalJsonV1Sha256(payload),
      payload,
    }
  })
  const safetyPayload = { cycle_id: cycleId, decision: 'pass' } satisfies JsonObject
  const safetyEvidence = input.safetyPassed ? [{
    id: deterministicUuid('gate-safety-evidence', cycleId),
    cycle_id: cycleId,
    experiment_origin_manifest_id: null,
    artifact_type: 'safety_report',
    artifact_key: 'singleton',
    content_sha256: canonicalJsonV1Sha256(safetyPayload),
    payload: safetyPayload,
  }] : []
  const evidence = [...cycleEvidence, ...originEvidence, ...safetyEvidence]
  return {
    cycle: {
      id: cycleId,
      status: 'running',
      study_contract_id: STUDY_CONTRACT_ID,
      study_contract_sha256: input.stack.studyContractSha256,
      candidate_model_sha256: input.candidateModelSha256,
      comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
      dataset_manifest_sha256: input.datasetManifestSha256,
      feature_contract_sha256: FEATURE_CONTRACT_SHA256,
      labeler_version: 'gta-v2',
      label_contract_sha256: LABEL_CONTRACT_SHA256,
      calibration_artifact_sha256: input.calibrationArtifactSha256,
      planned_origins: input.plannedOrigins,
      safety_origins: 8,
      safety_checked_at: input.safetyPassed ? '2028-01-01T00:00:00.000Z' : null,
      decision_at: null,
    },
    origins,
    forecasts,
    expectedThemes,
    predictions,
    evidence,
    attestations: evidence.map((artifact) => ({
      artifact_id: artifact.id,
      content_sha256: artifact.content_sha256,
    })),
  }
}
