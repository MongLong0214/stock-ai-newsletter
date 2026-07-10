export const CONFIRMATORY_FEATURE_NAMES = [
  'interest_slope_7d',
  'interest_accel',
  'dvi_7d',
  'interest_return_10d',
  'interest_drawdown_20d',
  'news_volume_7d',
  'news_momentum',
  'babl_phase_signal',
  'interest_source_age_days',
  'news_source_age_days',
] as const

export type ConfirmatoryFeatureName = (typeof CONFIRMATORY_FEATURE_NAMES)[number]

export type ConfirmatoryInterestRun = {
  readonly id: string
  readonly responseSha256: string
  readonly status: 'complete' | 'partial' | 'failed'
  readonly sourceMaxDate: string
  readonly completedAt: string
}

export type ConfirmatoryInterestObservation = {
  readonly id: string
  readonly collectionRunId: string
  readonly themeId: string
  readonly tradingDate: string
  readonly rawValue: number
  readonly normalized: number
  readonly anchorScaledValue: number | null
}

export type ConfirmatoryNewsObservation = {
  readonly id: string
  readonly collectionRunId: string
  readonly themeId: string
  readonly articleDate: string
  readonly articleCount: number
  readonly queryHash: string
  readonly collectedAt: string
}

export type ConfirmatoryNewsRun = {
  readonly id: string
  readonly responseSha256: string
  readonly status: 'complete' | 'partial' | 'failed'
  readonly sourceMaxDate: string
  readonly collectedAt: string
  readonly completedAt: string
}

export type ConfirmatoryBablLock = {
  readonly algorithmVersion: string
  readonly comparisonSpecVersion: string
  readonly evaluationHorizonDays: number
  readonly candidatePoolRule: 'source_prod_run_v1'
}

export type ConfirmatoryBablObservation = {
  readonly id: string
  readonly collectionRunId: string
  readonly themeId: string
  readonly snapshotDate: string
  readonly phase: string
  readonly algorithmVersion: string
  readonly comparisonSpecVersion: string
  readonly evaluationHorizonDays: number
  readonly candidatePool: string
  readonly sourcePredictionSnapshotId: string
  readonly computedAt: string
  readonly payloadHash: string
  readonly sourceRunStatus: 'complete' | 'partial' | 'failed'
}

export type ConfirmatoryBablMissingReason =
  | 'no_matching_observation'
  | 'multiple_matching_observations'
  | 'source_run_not_complete'
  | 'source_after_cutoff'
  | 'source_pool_mismatch'

export type ConfirmatoryFeatureInput = {
  readonly studyOriginManifestId: string
  readonly studyOriginManifestSha256: string
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly featureContractVersion: 'tli-attention-v2-f1'
  readonly featureContractSha256: string
  readonly forecastOriginManifestId: string
  readonly forecastOriginManifestSha256: string
  readonly themeId: string
  readonly baseDate: string
  readonly cutoffAt: string
  readonly interestRun: ConfirmatoryInterestRun | null
  readonly interestObservations: readonly ConfirmatoryInterestObservation[]
  readonly newsObservationIds: readonly string[]
  readonly newsInputSha256: string | null
  readonly newsObservations: readonly ConfirmatoryNewsObservation[]
  readonly newsRuns: readonly ConfirmatoryNewsRun[]
  readonly bablLock: ConfirmatoryBablLock
  readonly bablObservationId: string | null
  readonly bablInputSha256: string | null
  readonly bablCandidatePool: string | null
  readonly bablMissingReason: ConfirmatoryBablMissingReason | null
  readonly bablObservation: ConfirmatoryBablObservation | null
}

export type ConfirmatoryFeatureProvenance = {
  readonly studyOriginManifestId: string
  readonly studyOriginManifestSha256: string
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly featureContractVersion: 'tli-attention-v2-f1'
  readonly featureContractSha256: string
  readonly forecastOriginManifestId: string
  readonly forecastOriginManifestSha256: string
  readonly themeId: string
  readonly baseDate: string
  readonly cutoffAt: string
  readonly interestRunId: string | null
  readonly interestResponseSha256: string | null
  readonly interestSourceMaxDate: string | null
  readonly interestSourceAgeDays: number | null
  readonly newsObservationIds: readonly string[]
  readonly newsInputSha256: string | null
  readonly newsSourceMaxDate: string | null
  readonly newsSourceAgeDays: number | null
  readonly newsRunIds: readonly string[]
  readonly newsRunResponseSha256s: readonly string[]
  readonly bablObservationId: string | null
  readonly bablInputSha256: string | null
  readonly bablCandidatePool: string | null
}

export type ConfirmatoryFeatureSnapshot = {
  readonly featureNames: typeof CONFIRMATORY_FEATURE_NAMES
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
  readonly abstain: boolean
  readonly abstainReasons: readonly string[]
  readonly provenance: ConfirmatoryFeatureProvenance
  readonly featureSnapshotSha256: string
}
