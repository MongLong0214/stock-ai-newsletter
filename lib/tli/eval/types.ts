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
