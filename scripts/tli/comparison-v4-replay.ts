import { assignRollingOriginFolds } from '../../lib/tli/stats/comparison-stats'

interface ReplayPlanInput {
  runDates: string[]
  minimumFolds: number
  embargoDays: number
}

export function buildReplayPlan(input: ReplayPlanInput) {
  const observations = [...new Set(input.runDates)].sort().map((runDate) => ({ runDate }))
  const folds = assignRollingOriginFolds(observations, input.minimumFolds).map((fold) => ({
    trainDates: fold.train.map((item) => item.runDate),
    validationDates: fold.validation.map((item) => item.runDate),
    embargoDates: fold.embargo.map((item) => item.runDate),
    testDates: fold.test.map((item) => item.runDate),
  }))

  return {
    embargoDays: input.embargoDays,
    folds,
  }
}

interface IntervalSummary {
  mean: number
  lower: number
  upper: number
}

interface BaselineSummary extends IntervalSummary {
  name: string
}

export function buildRolloutReport(input: {
  primaryMetric: string
  currentProduction: IntervalSummary
  candidate: IntervalSummary
  baselines: BaselineSummary[]
}) {
  const baselineLines = input.baselines.map(
    (baseline) => `- ${baseline.name}: mean=${baseline.mean}, ci=[${baseline.lower}, ${baseline.upper}]`,
  )

  return [
    '# Comparison v4 Rollout Report',
    '',
    `Primary metric: ${input.primaryMetric}`,
    `current production: mean=${input.currentProduction.mean}, ci=[${input.currentProduction.lower}, ${input.currentProduction.upper}]`,
    `candidate: mean=${input.candidate.mean}, ci=[${input.candidate.lower}, ${input.candidate.upper}]`,
    '',
    'Baselines:',
    ...baselineLines,
  ].join('\n')
}

interface RolloutGateInput {
  primaryDeltaLowerBound: number
  coverageDeltaLowerBound: number
  predictionAvailabilityDeltaLowerBound: number
  predictionPhaseAccuracyDeltaLowerBound: number
  concentrationDeltaUpperBound: number
  top3CensoringRate: number
  maxSingleCensorReasonRate: number
}

export function evaluateRolloutGate(input: RolloutGateInput) {
  const reasons: string[] = []
  if (input.primaryDeltaLowerBound <= -0.03) reasons.push('primary_endpoint')
  if (input.coverageDeltaLowerBound <= -0.10) reasons.push('coverage_guardrail')
  if (input.predictionAvailabilityDeltaLowerBound <= -0.10) reasons.push('prediction_availability_guardrail')
  if (input.predictionPhaseAccuracyDeltaLowerBound <= -0.05) reasons.push('prediction_phase_accuracy_guardrail')
  if (input.concentrationDeltaUpperBound >= 0.02) reasons.push('concentration_guardrail')
  if (input.top3CensoringRate >= 0.10) reasons.push('top3_censoring_guardrail')
  if (input.maxSingleCensorReasonRate >= 0.05) reasons.push('single_censor_reason_guardrail')

  return {
    passed: reasons.length === 0,
    reasons,
  }
}
