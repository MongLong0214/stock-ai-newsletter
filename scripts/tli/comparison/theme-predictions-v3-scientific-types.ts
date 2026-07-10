export type ScientificPredictionRole = 'candidate' | 'comparator'
export type ScientificTerminalStatus = 'scored' | 'excluded'

export interface ScientificCycleRow {
  readonly id: string
  readonly status: string
  readonly study_contract_id: string
  readonly candidate_model_version: string
  readonly candidate_model_sha256: string
  readonly comparator_version: string
  readonly comparator_artifact_sha256: string
  readonly feature_contract_sha256: string
  readonly labeler_version: string
}

export interface ScientificOriginRow {
  readonly id: string
  readonly cycle_id: string
  readonly study_origin_manifest_id: string
  readonly forecast_origin_manifest_id: string
  readonly candidate_model_sha256: string
  readonly comparator_artifact_sha256: string
}

export interface ScientificStudyOriginRow {
  readonly id: string
  readonly study_contract_id: string
  readonly forecast_origin_manifest_id: string
}

export interface ScientificForecastRow {
  readonly id: string
  readonly origin_date: string
  readonly forecast_cutoff: string
  readonly expected_theme_ids: readonly string[]
  readonly expected_theme_count: number
}

export interface ScientificEvidenceArtifactRow {
  readonly id: string
  readonly cycle_id: string
  readonly experiment_origin_manifest_id: string | null
  readonly artifact_type: string
  readonly artifact_key: string
  readonly content_sha256: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly created_at: string
}

export interface ScientificEvidenceAttestationRow {
  readonly artifact_id: string
  readonly content_sha256: string
  readonly verified_at: string
}

export interface ScientificPredictionRow {
  readonly id: string
  readonly experiment_cycle_id: string
  readonly experiment_origin_manifest_id: string
  readonly theme_id: string
  readonly prediction_date: string
  readonly horizon_days: number
  readonly serving_role: string
  readonly scientific_prediction_role: string
  readonly model_version: string
  readonly model_artifact_sha256: string
  readonly feature_contract_hash: string
  readonly feature_snapshot_hash: string
  readonly features: Readonly<Record<string, unknown>>
  readonly forecast_cutoff: string
  readonly forecast_origin_week: string
  readonly labeler_version: string
  readonly p_rise: number | null
  readonly ci_lower: number | null
  readonly ci_upper: number | null
  readonly abstain: boolean
  readonly score_status: string
  readonly created_at: string
}

export interface ScientificLabelRow {
  readonly id: string
  readonly theme_id: string
  readonly base_date: string
  readonly horizon_days: number
  readonly labeler_version: string
  readonly label_type: string
  readonly label_status: string
  readonly scientific_use_status: string | null
  readonly g_log_ratio: number | null
  readonly y_binary: boolean | null
  readonly exclude_reason: string | null
  readonly forecast_origin_manifest_id: string | null
  readonly finalized_at: string | null
}

export interface ScientificPredictionScoringInput {
  readonly requestedCycleId: string
  readonly requestedOriginId: string
  readonly scoredAt: string
  readonly cycles: readonly ScientificCycleRow[]
  readonly origins: readonly ScientificOriginRow[]
  readonly studyOrigins: readonly ScientificStudyOriginRow[]
  readonly forecasts: readonly ScientificForecastRow[]
  readonly evidenceArtifacts: readonly ScientificEvidenceArtifactRow[]
  readonly evidenceAttestations: readonly ScientificEvidenceAttestationRow[]
  readonly predictions: readonly ScientificPredictionRow[]
  readonly labels: readonly ScientificLabelRow[]
}

export interface ScientificScoreFinalization {
  readonly predictionId: string
  readonly role: ScientificPredictionRole
  readonly actualLabelId: string
  readonly scoreStatus: ScientificTerminalStatus
  readonly scoreExclusionReason: string | null
  readonly canonicalJson: string
  readonly payloadSha256: string
}

export interface ScientificIntervalEvidence {
  readonly ensembleVersion: 'interval-ensemble-v2'
  readonly envelopeVersion: 'block_bootstrap_envelope_v1'
  readonly replicateCount: 500
  readonly ensembleSha256: string
}

export interface ScientificPredictionScoringPlan {
  readonly cycleId: string
  readonly originId: string
  readonly expectedThemeCount: number
  readonly intervalCompleteCount: number
  readonly intervalEvidence: ScientificIntervalEvidence
  readonly finalizations: readonly ScientificScoreFinalization[]
}

export interface ScientificScoringExecutionResult {
  readonly status: 'complete' | 'partial'
  readonly plannedFinalizations: number
  readonly completedFinalizations: number
  readonly failedPredictionId: string | null
}

export interface ScientificScoreRpcRequest {
  readonly canonicalJson: string
  readonly payloadSha256: string
}

export type ScientificScoreFinalizer = (request: ScientificScoreRpcRequest) => Promise<void>
