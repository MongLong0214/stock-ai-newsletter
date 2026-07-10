export interface EvalObservation {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
}

export interface EvalPredictionRow extends EvalObservation {
  readonly probability: number | null
  readonly y: boolean
}

export interface DateRange {
  readonly start: string
  readonly end: string
}

export interface WalkForwardFold<T extends EvalObservation> {
  readonly foldId: string
  readonly train: readonly T[]
  readonly purge: readonly T[]
  readonly test: readonly T[]
  readonly trainDateRange: DateRange | null
  readonly testDateRange: DateRange
  readonly trainClusterCount: number
  readonly testClusterCount: number
}

/** A clean eligible weekly origin of one immutable study contract. */
export interface StudyOrigin {
  readonly originDate: string
  readonly forecastCutoff: string
}

/** One theme row observed at a study origin; `baseDate` is that origin's date. */
export interface StudyEvalRow extends EvalObservation {
  readonly futureDates: readonly string[]
  readonly labelFinalizedAt: string
  readonly labelSourceRunCompletedAt: string
}

export interface StudyWalkForwardFold<T extends StudyEvalRow> {
  readonly foldId: string
  readonly sequence: number
  readonly testOrigin: StudyOrigin
  /** Every origin strictly before the test origin, before the purge predicate is applied. */
  readonly candidateTrainOrigins: readonly string[]
  /** Distinct origins that survive the purge predicate; this is what the fold actually trains on. */
  readonly trainOrigins: readonly string[]
  readonly train: readonly T[]
  readonly purged: readonly T[]
  readonly test: readonly T[]
  readonly splitOriginsSha256: string
}

export interface StudyWalkForwardSplit<T extends StudyEvalRow> {
  readonly originCount: number
  readonly initialTrainOriginCount: number
  readonly testOriginCount: number
  readonly folds: readonly StudyWalkForwardFold<T>[]
  readonly splitOriginsSha256: string
}

export interface InnerOofFold {
  readonly foldId: string
  readonly validationOrigin: string
  readonly trainOrigins: readonly string[]
}

export interface InnerOofSplit {
  readonly originCount: number
  readonly foldCount: number
  readonly folds: readonly InnerOofFold[]
  readonly splitOriginsSha256: string
}

export interface PredictionMetrics {
  readonly totalCandidates: number
  readonly nScored: number
  readonly coverage: number
  readonly baseRate: number | null
  readonly brier: number | null
  readonly ece: number | null
  readonly eceBinCount: number
  /** N4: cluster-bootstrap upper95 of ECE. `null` when not computed by the caller (see bootstrap.ts). */
  readonly eceUpper95: number | null
  readonly ic: number | null
  readonly risingPAt10: number | null
}

export interface PredictionEvaluationSummary {
  readonly rawN: number
  readonly nonOverlappingN: number
  readonly raw: PredictionMetrics
  readonly weeklyMonday: PredictionMetrics
}

export interface ClusterImbalanceReport {
  readonly clusterCount: number
  readonly observationCount: number
  readonly topClusterCount: number
  readonly topClusterShare: number
  readonly useWildClusterBootstrap: boolean
}

export interface BrierDeltaCi {
  readonly metric: 'brier'
  readonly method: 'cluster_bootstrap' | 'wild_cluster_bootstrap'
  readonly meanDelta: number
  readonly lower: number
  readonly upper: number
  readonly clusterCount: number
  readonly observationCount: number
  readonly iterations: number
  readonly confidenceLevel: number
  readonly imbalance: ClusterImbalanceReport
}
