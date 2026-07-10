import type {
  FrozenHashes,
  ProspectiveCheckpoint,
  ProspectiveLifecycleInput,
} from './prospective-gate-contract'
import type { SafetyCheckpointInput } from './prospective-gate-metrics'
import type { ProspectiveGateStatisticRow } from './prospective-gate-statistics'

export type ProspectiveCycleRow = {
  readonly id: string
  readonly status: string
  readonly study_contract_id: string
  readonly study_contract_sha256: string
  readonly candidate_model_sha256: string
  readonly comparator_artifact_sha256: string
  readonly dataset_manifest_sha256: string
  readonly feature_contract_sha256: string
  readonly labeler_version: string
  readonly label_contract_sha256: string
  readonly calibration_artifact_sha256: string
  readonly planned_origins: number
  readonly safety_origins: number
  readonly safety_checked_at: string | null
  readonly decision_at: string | null
}

export type ProspectiveOriginRow = {
  readonly id: string
  readonly cycle_id: string
  readonly study_origin_manifest_id: string
  readonly study_origin: {
    readonly study_contract_id: string
    readonly forecast_origin_manifest_id: string
    readonly payload_sha256: string
  }
  readonly forecast_origin_manifest_id: string
  readonly sequence_no: number
  readonly enrollment_role: string
  readonly candidate_model_sha256: string
  readonly comparator_artifact_sha256: string
  readonly kospi_base_trade_date: string
  readonly kospi_base_close: number
  readonly kospi_lookback_trade_date: string
  readonly kospi_lookback_close: number
  readonly kospi_source_ids: readonly string[]
  readonly kospi_input_sha256: string
  readonly regime: 'risk_off' | 'neutral' | 'risk_on'
}

export type ProspectiveForecastRow = {
  readonly id: string
  readonly origin_date: string
  readonly forecast_cutoff: string
  readonly expected_theme_count: number
  readonly expected_universe_sha256: string
  readonly keyword_group_manifest_sha256: string
  readonly payload_sha256: string
}

export type ProspectiveExpectedThemeRow = {
  readonly forecast_origin_manifest_id: string
  readonly theme_id: string
  readonly keyword_group_sha256: string
  readonly forecast_interest_run_id: string | null
  readonly forecast_interest_response_sha256: string | null
  readonly news_observation_ids: readonly string[]
  readonly news_input_sha256: string | null
  readonly input_status: 'usable' | 'abstain'
  readonly abstain_reason: string | null
  readonly source_proof: {
    readonly interest_run_status: 'complete' | 'partial' | 'failed' | null
    readonly interest_run_source: string | null
    readonly interest_run_before_cutoff: boolean
    readonly interest_observation_count: number
    readonly interest_observation_run_count: number
    readonly news_observation_count: number
    readonly news_run_statuses: readonly string[]
    readonly news_before_cutoff: boolean
  }
}

export type ProspectivePredictionRow = {
  readonly id: string
  readonly experiment_cycle_id: string
  readonly experiment_origin_manifest_id: string
  readonly theme_id: string
  readonly prediction_date: string
  readonly horizon_days: number
  readonly labeler_version: string
  readonly scientific_prediction_role: 'candidate' | 'comparator'
  readonly model_artifact_sha256: string
  readonly feature_contract_hash: string
  readonly forecast_cutoff: string
  readonly forecast_origin_week: string
  readonly p_rise: number | null
  readonly ci_lower: number | null
  readonly ci_upper: number | null
  readonly abstain: boolean
  readonly actual_y: boolean | null
  readonly actual_label_id: string | null
  readonly score_status: 'pending' | 'scored' | 'excluded'
  readonly score_exclusion_reason: string | null
}

export type ProspectiveEvidenceRow = {
  readonly id: string
  readonly cycle_id: string
  readonly experiment_origin_manifest_id: string | null
  readonly artifact_type: string
  readonly artifact_key: string
  readonly content_sha256: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type ProspectiveAttestationRow = {
  readonly artifact_id: string
  readonly content_sha256: string
}

export type ProspectiveGateIncident = {
  readonly originId: string
  readonly reasons: readonly string[]
}

export type ProspectiveCompleteness = {
  readonly expectedPairCount: number
  readonly terminalPairCount: number
  readonly exactPairedCount: number
  readonly pooledRatio: number
  readonly minimumOriginRatio: number
  readonly terminalAccountingRatio: number
  readonly maximumOriginSourceGapRatio: number
  readonly pooledCoverage: number
  readonly excludedReasonCounts: readonly { readonly reason: string; readonly count: number }[]
}

export type ProspectiveEligibleOrigin = {
  readonly originId: string
  readonly sequenceNo: number
  readonly originDate: string
  readonly regime: 'risk_off' | 'neutral' | 'risk_on'
  readonly kospiBaseTradeDate: string
  readonly kospiBaseClose: number
  readonly kospiLookbackTradeDate: string
  readonly kospiLookbackClose: number
  readonly kospiSourceIds: readonly string[]
  readonly kospiInputSha256: string
}

export type ProspectiveOriginAccounting = {
  readonly originId: string
  readonly sequenceNo: number
  readonly originDate: string
  readonly expectedCount: number
  readonly terminalCount: number
  readonly exactPairedCount: number
  readonly candidateNonAbstainCount: number
  readonly sourceGapCount: number
  readonly excludedReasonCounts: readonly { readonly reason: string; readonly count: number }[]
}

export type ProspectiveFinalDataset = {
  readonly cycleId: string
  readonly plannedOrigins: number
  readonly sequenceStart: 1
  readonly sequenceEnd: number
  readonly decisionOriginDate: string
  readonly eligibleOrigins: readonly ProspectiveEligibleOrigin[]
  readonly originAccounting: readonly ProspectiveOriginAccounting[]
  readonly rows: readonly ProspectiveGateStatisticRow[]
  readonly completeness: ProspectiveCompleteness
  readonly criticalIncidentCount: number
  readonly incidents: readonly ProspectiveGateIncident[]
  readonly gateInputSha256: string
  readonly frozenHashes: FrozenHashes
  readonly expectedFrozenHashes: FrozenHashes
}

type WaitingBundle = {
  readonly lifecycle: ProspectiveLifecycleInput
  readonly checkpoint: Exclude<ProspectiveCheckpoint, { readonly kind: 'safety_due' | 'final_due' }>
  readonly incidents: readonly ProspectiveGateIncident[]
}

export type ProspectiveGateInputBundle = WaitingBundle | {
  readonly lifecycle: ProspectiveLifecycleInput
  readonly checkpoint: Extract<ProspectiveCheckpoint, { readonly kind: 'safety_due' }>
  readonly incidents: readonly ProspectiveGateIncident[]
  readonly safetyInput: SafetyCheckpointInput
} | {
  readonly lifecycle: ProspectiveLifecycleInput
  readonly checkpoint: Extract<ProspectiveCheckpoint, { readonly kind: 'final_due' }>
  readonly incidents: readonly ProspectiveGateIncident[]
  readonly finalDataset: ProspectiveFinalDataset
}

export type ProspectiveGateSource = {
  readonly cycle: ProspectiveCycleRow
  readonly origins: readonly ProspectiveOriginRow[]
  readonly forecasts: readonly ProspectiveForecastRow[]
  readonly expectedThemes: readonly ProspectiveExpectedThemeRow[]
  readonly predictions: readonly ProspectivePredictionRow[]
  readonly evidence: readonly ProspectiveEvidenceRow[]
  readonly attestations: readonly ProspectiveAttestationRow[]
}
