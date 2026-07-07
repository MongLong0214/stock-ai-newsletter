import { describe, expect, it } from 'vitest'
import { evaluateRollbackGate, type RollbackGateInput } from '../rollback-gate'

const input = (overrides: Partial<RollbackGateInput> = {}): RollbackGateInput => ({
  championModelVersion: 'm1-current',
  previousModelVersion: 'b-abl-v1',
  championMeanBrier: 0.122,
  previousMeanBrier: 0.10,
  championMetricDays: 20,
  previousMetricDays: 20,
  ...overrides,
})

describe('T-302 rollback gate', () => {
  it('rolls back when champion rolling Brier is more than 10% worse', () => {
    const result = evaluateRollbackGate(input())

    expect(result.shouldRollback).toBe(true)
    expect(result.action).toBe('rollback')
    expect(result.reason).toBe('champion_brier_regressed_over_10pct')
    expect(result.relativeBrierChange).toBeCloseTo(0.22, 6)
  })

  it('keeps champion when no previous model exists', () => {
    const result = evaluateRollbackGate(input({ previousModelVersion: null }))

    expect(result.shouldRollback).toBe(false)
    expect(result.reason).toBe('missing_previous_model')
  })

  it('keeps champion when champion metrics are insufficient', () => {
    const result = evaluateRollbackGate(input({ championMetricDays: 0, championMeanBrier: null }))

    expect(result.reason).toBe('insufficient_champion_metrics')
  })

  it('keeps champion when previous metrics are insufficient', () => {
    const result = evaluateRollbackGate(input({ previousMetricDays: 0, previousMeanBrier: null }))

    expect(result.reason).toBe('insufficient_previous_metrics')
  })

  it('keeps champion when Brier regression is within threshold', () => {
    const result = evaluateRollbackGate(input({ championMeanBrier: 0.109 }))

    expect(result.shouldRollback).toBe(false)
    expect(result.reason).toBe('champion_not_worse_than_previous')
    expect(result.relativeBrierChange).toBeCloseTo(0.09, 6)
  })
})
