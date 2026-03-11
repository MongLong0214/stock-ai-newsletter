import { describe, expect, it } from 'vitest'
import {
  alignPastWindowByCurrentDay,
  classifyCurrentRunHorizonCensoring,
  evaluateFixedHorizonComparison,
  findClosestStageByDate,
  findClosestStageByLifecycleDay,
  sliceFixedHorizonWindow,
} from '../comparison-v4-evaluator'

describe('comparison v4 evaluator', () => {
  it('slices a fixed 14-day horizon from future observations', () => {
    const values = Array.from({ length: 30 }, (_, idx) => idx + 1)
    const sliced = sliceFixedHorizonWindow(values, 14)
    expect(sliced).toHaveLength(14)
    expect(sliced[0]).toBe(1)
    expect(sliced[13]).toBe(14)
  })

  it('returns candidate censoring when current day exceeds past aligned series', () => {
    const result = alignPastWindowByCurrentDay({
      alignedPastValues: [1, 2, 3],
      currentDay: 4,
      horizonDays: 14,
    })

    expect(result.censoredReason).toBe('candidate_alignment_overflow')
  })

  it('returns candidate censoring when horizon values are too short', () => {
    const result = evaluateFixedHorizonComparison({
      currentFutureValues: [1, 2, 3, 4, 5, 6],
      pastFutureValues: [1, 2, 3, 4, 5, 6],
      currentStageAtH14: 'Growth',
      pastStageAtAlignedH14: 'Growth',
    })

    expect(result.censoredReason).toBe('run_horizon_immature')
    expect(result.binaryRelevant).toBe(false)
    expect(result.gradedGain).toBe(0)
  })

  it('classifies incomplete H14 windows as run-level horizon censoring', () => {
    expect(classifyCurrentRunHorizonCensoring([1, 2, 3, 4, 5, 6])).toBe('run_horizon_immature')
    expect(classifyCurrentRunHorizonCensoring(Array.from({ length: 13 }, (_, idx) => idx))).toBe('run_horizon_immature')
    expect(classifyCurrentRunHorizonCensoring(Array.from({ length: 14 }, (_, idx) => idx))).toBeNull()
  })

  it('requires both trajectory correlation and stage alignment for binary relevance', () => {
    const rising = Array.from({ length: 14 }, (_, idx) => idx + 1)
    const result = evaluateFixedHorizonComparison({
      currentFutureValues: rising,
      pastFutureValues: rising,
      currentStageAtH14: 'Growth',
      pastStageAtAlignedH14: 'Decline',
    })

    expect(result.trajectoryCorrH14).toBeGreaterThan(0.9)
    expect(result.positionStageMatchH14).toBe(false)
    expect(result.binaryRelevant).toBe(false)
    expect(result.gradedGain).toBe(2)
  })

  it('computes a phase-aligned relevant hit when both correlation and stage match hold', () => {
    const rising = Array.from({ length: 14 }, (_, idx) => idx + 1)
    const result = evaluateFixedHorizonComparison({
      currentFutureValues: rising,
      pastFutureValues: rising,
      currentStageAtH14: 'Growth',
      pastStageAtAlignedH14: 'Growth',
    })

    expect(result.censoredReason).toBeNull()
    expect(result.binaryRelevant).toBe(true)
    expect(result.gradedGain).toBe(3)
  })

  it('censors when point-in-time stage snapshots are missing', () => {
    const rising = Array.from({ length: 14 }, (_, idx) => idx + 1)
    const result = evaluateFixedHorizonComparison({
      currentFutureValues: rising,
      pastFutureValues: rising,
      currentStageAtH14: null,
      pastStageAtAlignedH14: 'Growth',
    })

    expect(result.censoredReason).toBe('run_missing_point_in_time_snapshot')
    expect(result.binaryRelevant).toBe(false)
    expect(result.gradedGain).toBe(0)
  })

  it('finds the closest stage by absolute date within tolerance', () => {
    const stage = findClosestStageByDate(
      [
        { calculated_at: '2026-03-20', stage: 'Growth' },
        { calculated_at: '2026-03-25', stage: 'Peak' },
      ],
      '2026-03-24',
      3,
    )

    expect(stage).toBe('Peak')
  })

  it('finds the closest stage by lifecycle day within tolerance', () => {
    const stage = findClosestStageByLifecycleDay(
      [
        { calculated_at: '2026-03-10', stage: 'Emerging' },
        { calculated_at: '2026-03-15', stage: 'Growth' },
        { calculated_at: '2026-03-20', stage: 'Peak' },
      ],
      '2026-03-10',
      9,
      3,
    )

    expect(stage).toBe('Peak')
  })
})
