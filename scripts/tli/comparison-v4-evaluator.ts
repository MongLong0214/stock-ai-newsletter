import { computeBinaryRelevance, computeGradedGain, COMPARISON_PRIMARY_HORIZON_DAYS } from '../../lib/tli/comparison'
import { pearsonCorrelation } from '../../lib/tli/comparison/similarity'
import { daysBetween } from '../../lib/tli/normalize'
import { classifyRunLevelCensoring } from '../../lib/tli/comparison'

export type ComparisonCandidateCensorReason =
  | 'candidate_alignment_overflow'
  | 'candidate_short_horizon'

export type ComparisonRunCensorReason =
  | 'run_horizon_immature'
  | 'run_missing_point_in_time_snapshot'

export function sliceFixedHorizonWindow<T>(values: T[], horizonDays = COMPARISON_PRIMARY_HORIZON_DAYS): T[] {
  return values.slice(0, horizonDays)
}

export function alignPastWindowByCurrentDay(input: {
  alignedPastValues: number[]
  currentDay: number
  horizonDays?: number
}) {
  const horizonDays = input.horizonDays ?? COMPARISON_PRIMARY_HORIZON_DAYS
  if (input.currentDay >= input.alignedPastValues.length) {
    return { values: [] as number[], censoredReason: 'candidate_alignment_overflow' as const }
  }

  return {
    values: input.alignedPastValues.slice(input.currentDay, input.currentDay + horizonDays),
    censoredReason: null,
  }
}

export function classifyCurrentRunHorizonCensoring(values: number[]) {
  return classifyRunLevelCensoring({
    hasSufficientFutureWindow: values.length >= COMPARISON_PRIMARY_HORIZON_DAYS,
    hasPointInTimeSnapshot: true,
  })
}

export function evaluateFixedHorizonComparison(input: {
  currentFutureValues: number[]
  pastFutureValues: number[]
  currentStageAtH14: string | null
  pastStageAtAlignedH14: string | null
}) {
  const currentWindow = sliceFixedHorizonWindow(input.currentFutureValues)
  const pastWindow = sliceFixedHorizonWindow(input.pastFutureValues)
  const runCensoredReason = classifyRunLevelCensoring({
    hasSufficientFutureWindow: currentWindow.length >= COMPARISON_PRIMARY_HORIZON_DAYS,
    hasPointInTimeSnapshot: input.currentStageAtH14 != null && input.pastStageAtAlignedH14 != null,
  })

  if (runCensoredReason) {
    return {
      trajectoryCorrH14: 0,
      positionStageMatchH14: false,
      binaryRelevant: false,
      gradedGain: 0 as const,
      censoredReason: runCensoredReason,
    }
  }

  const minLen = Math.min(currentWindow.length, pastWindow.length)

  if (minLen < COMPARISON_PRIMARY_HORIZON_DAYS) {
    return {
      trajectoryCorrH14: 0,
      positionStageMatchH14: false,
      binaryRelevant: false,
      gradedGain: 0 as const,
      censoredReason: 'candidate_short_horizon' as const,
    }
  }

  const trajectoryCorrH14 = pearsonCorrelation(currentWindow.slice(0, minLen), pastWindow.slice(0, minLen))
  const positionStageMatchH14 = input.currentStageAtH14 != null
    && input.pastStageAtAlignedH14 != null
    && input.currentStageAtH14 === input.pastStageAtAlignedH14

  return {
    trajectoryCorrH14,
    positionStageMatchH14,
    binaryRelevant: computeBinaryRelevance({ trajectoryCorrH14, positionStageMatchH14 }),
    gradedGain: computeGradedGain({ trajectoryCorrH14, positionStageMatchH14 }),
    censoredReason: null,
  }
}

export function findClosestStageByDate(
  scores: Array<{ calculated_at: string; stage: string }>,
  targetDate: string,
  toleranceDays: number,
) {
  const targetTime = new Date(targetDate).getTime()
  let best: { stage: string; diff: number } | null = null

  for (const score of scores) {
    const diffDays = Math.abs(new Date(score.calculated_at).getTime() - targetTime) / 86_400_000
    if (diffDays > toleranceDays) continue
    if (!best || diffDays < best.diff) best = { stage: score.stage, diff: diffDays }
  }

  return best?.stage ?? null
}

export function findClosestStageByLifecycleDay(
  scores: Array<{ calculated_at: string; stage: string }>,
  firstSpikeDate: string,
  targetLifecycleDay: number,
  toleranceDays: number,
) {
  let best: { stage: string; diff: number } | null = null

  for (const score of scores) {
    const lifecycleDay = daysBetween(firstSpikeDate, score.calculated_at)
    const diff = Math.abs(lifecycleDay - targetLifecycleDay)
    if (diff > toleranceDays) continue
    if (!best || diff < best.diff) best = { stage: score.stage, diff }
  }

  return best?.stage ?? null
}
