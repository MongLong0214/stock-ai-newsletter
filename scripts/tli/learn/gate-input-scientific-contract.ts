import type { PromotionGateInput } from './legacy-promotion-gate'

export interface ScientificExpectedTheme {
  readonly originId: string
  readonly themeId: string
  readonly predictionDate: string
  readonly horizonDays: number
  readonly labelerVersion: string
}

export interface ScientificGatePredictionRow {
  readonly id: string
  readonly experiment_cycle_id: string
  readonly experiment_origin_manifest_id: string
  readonly theme_id: string
  readonly prediction_date: string
  readonly horizon_days: number
  readonly labeler_version: string
  readonly scientific_prediction_role: string
  readonly p_rise: number | null
  readonly ci_lower: number | null
  readonly ci_upper: number | null
  readonly abstain: boolean
  readonly actual_y: boolean | null
  readonly actual_label_id: string | null
  readonly score_status: string
  readonly score_exclusion_reason: string | null
}

export type ScientificGateIssueCode = 'ROLE_CARDINALITY' | 'TERMINAL_MISMATCH'
  | 'LABEL_MISMATCH' | 'EXCLUSION_REASON_MISMATCH' | 'NULL_SCORED_OUTCOME'
  | 'INVALID_PROBABILITY' | 'INVALID_INTERVAL' | 'UNEXPECTED_PREDICTION'

export interface ScientificGateIssue {
  readonly originId: string
  readonly themeId: string
  readonly code: ScientificGateIssueCode
}

export interface ScientificExcludedReasonCount {
  readonly reason: string
  readonly count: number
}

export interface ScientificOriginCompleteness {
  readonly originId: string
  readonly expectedPairCount: number
  readonly terminalPairCount: number
  readonly ratio: number
  readonly candidateNonAbstainCount: number
  readonly coverage: number
  readonly sourceGapSlaCount: number
  readonly sourceGapSlaRatio: number
}

export interface ScientificCompletenessReport {
  readonly partial: boolean
  readonly expectedPairCount: number
  readonly terminalPairCount: number
  readonly exactPairedScoredCount: number
  readonly ratio: number
  readonly candidateNonAbstainCount: number
  readonly coverage: number
  readonly excludedReasonCounts: readonly ScientificExcludedReasonCount[]
  readonly originCompleteness: readonly ScientificOriginCompleteness[]
  readonly issues: readonly ScientificGateIssue[]
}

export interface ScientificPromotionGateInputResult {
  readonly gateInput: PromotionGateInput
  readonly completeness: ScientificCompletenessReport
}

export class ScientificGateInputBlockedError extends Error {
  readonly name = 'ScientificGateInputBlockedError'

  constructor(readonly report: ScientificCompletenessReport) {
    const minimumOriginRatio = report.originCompleteness.reduce(
      (minimum, origin) => Math.min(minimum, origin.ratio),
      report.ratio,
    )
    super(
      `scientific prediction gate input blocked: pooled ${(report.ratio * 100).toFixed(2)}%, `
      + `minimum origin ${(minimumOriginRatio * 100).toFixed(2)}%`,
    )
  }
}
