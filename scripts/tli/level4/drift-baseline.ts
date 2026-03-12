export interface DriftBaselineMaturityAssessment {
  mature: boolean
  autoHoldEnabled: boolean
  mode: 'active' | 'observation_only'
  unmetCriteria: string[]
}

export const DRIFT_BASELINE_REQUIREMENTS = {
  distinctCalendarMonths: 3,
  baselineRowCount: 3000,
  distinctEvaluatedRunDates: 30,
  baselineWindowMonths: 3,
} as const

export const DRIFT_BASELINE_THRESHOLDS = DRIFT_BASELINE_REQUIREMENTS
export type DriftBaselineMaturityResult = DriftBaselineMaturityAssessment

export function assessDriftBaselineMaturity(input: {
  distinctCalendarMonths: number
  baselineRowCount: number
  distinctEvaluatedRunDates: number
}): DriftBaselineMaturityAssessment {
  const unmetCriteria: string[] = []

  if (input.distinctCalendarMonths < DRIFT_BASELINE_REQUIREMENTS.distinctCalendarMonths) {
    unmetCriteria.push('distinct_calendar_months')
  }
  if (input.baselineRowCount < DRIFT_BASELINE_REQUIREMENTS.baselineRowCount) {
    unmetCriteria.push('baseline_row_count')
  }
  if (input.distinctEvaluatedRunDates < DRIFT_BASELINE_REQUIREMENTS.distinctEvaluatedRunDates) {
    unmetCriteria.push('distinct_evaluated_run_dates')
  }

  const mature = unmetCriteria.length === 0
  return {
    mature,
    autoHoldEnabled: mature,
    mode: mature ? 'active' : 'observation_only',
    unmetCriteria,
  }
}
