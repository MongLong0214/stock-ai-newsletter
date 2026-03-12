import { describe, expect, it } from 'vitest'
import { computePeakTimingErrorDays, resolvePredictionEvaluationAction } from '../evaluate-predictions'

describe('evaluate predictions helpers', () => {
  it('measures peak timing error against the observed evaluation date, not the runtime date', () => {
    const errorDays = computePeakTimingErrorDays({
      snapshotDate: '2026-01-01',
      observedDate: '2026-01-08',
      avgPeakDay: 14,
      daysSinceSpike: 4,
    })

    expect(errorDays).toBe(3)
  })

  it('marks snapshots without usable evaluation evidence as failed so they do not block the queue forever', () => {
    expect(resolvePredictionEvaluationAction({ hasThemeScores: false, withinTolerance: false })).toEqual({
      status: 'failed',
      shouldEvaluate: false,
    })
    expect(resolvePredictionEvaluationAction({ hasThemeScores: true, withinTolerance: false })).toEqual({
      status: 'failed',
      shouldEvaluate: false,
    })
    expect(resolvePredictionEvaluationAction({ hasThemeScores: true, withinTolerance: true })).toEqual({
      status: 'evaluated',
      shouldEvaluate: true,
    })
  })
})
