import { describe, expect, it } from 'vitest'
import {
  buildReplayPlan,
  buildRolloutReport,
  evaluateRolloutGate,
} from '../research/comparison-v4-replay'

describe('comparison v4 replay', () => {
  it('builds replay plan from dated runs without future leakage', () => {
    const plan = buildReplayPlan({
      runDates: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
      minimumFolds: 3,
      embargoDays: 14,
    })

    expect(plan.folds.length).toBeGreaterThanOrEqual(1)
    expect(plan.folds[0].trainDates.every((date) => !plan.folds[0].testDates.includes(date))).toBe(true)
  })

  it('builds a rollout report that includes baseline deltas', () => {
    const report = buildRolloutReport({
      primaryMetric: 'Phase-Aligned Precision@3',
      currentProduction: { mean: 0.42, lower: 0.40, upper: 0.44 },
      candidate: { mean: 0.44, lower: 0.41, upper: 0.46 },
      baselines: [
        { name: 'random', mean: 0.18, lower: 0.17, upper: 0.19 },
        { name: 'feature-only', mean: 0.40, lower: 0.38, upper: 0.42 },
      ],
    })

    expect(report).toContain('Phase-Aligned Precision@3')
    expect(report).toContain('current production')
    expect(report).toContain('random')
    expect(report).toContain('feature-only')
  })

  it('fails rollout gate when primary lower bound is below margin', () => {
    const decision = evaluateRolloutGate({
      primaryDeltaLowerBound: -0.05,
      coverageDeltaLowerBound: -0.02,
      predictionAvailabilityDeltaLowerBound: -0.02,
      predictionPhaseAccuracyDeltaLowerBound: -0.01,
      concentrationDeltaUpperBound: 0.0,
      top3CensoringRate: 0.02,
      maxSingleCensorReasonRate: 0.01,
    })

    expect(decision.passed).toBe(false)
    expect(decision.reasons).toContain('primary_endpoint')
  })

  it('passes rollout gate when all guardrails are satisfied', () => {
    const decision = evaluateRolloutGate({
      primaryDeltaLowerBound: -0.01,
      coverageDeltaLowerBound: -0.02,
      predictionAvailabilityDeltaLowerBound: -0.03,
      predictionPhaseAccuracyDeltaLowerBound: -0.01,
      concentrationDeltaUpperBound: 0.01,
      top3CensoringRate: 0.02,
      maxSingleCensorReasonRate: 0.01,
    })

    expect(decision.passed).toBe(true)
    expect(decision.reasons).toHaveLength(0)
  })
})
