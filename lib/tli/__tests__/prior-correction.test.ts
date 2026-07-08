import { describe, expect, it } from 'vitest'
import {
  applyPriorCorrection,
  computeTrailingFinalBaseRate,
  getTrailingFinalBaseRateWindow,
} from '@/lib/tli/model/prior-correction'

describe('M1 prior correction', () => {
  it('applies the prior-shift odds correction formula', () => {
    const corrected = applyPriorCorrection(0.7, 0.4, 0.2)

    expect(corrected).toBeCloseTo(0.4666666667, 10)
  })

  it('is a no-op when train and recent base rates match', () => {
    expect(applyPriorCorrection(0.37, 0.25, 0.25)).toBeCloseTo(0.37, 12)
  })

  it('clips probabilities and base rates to the open unit interval', () => {
    const high = applyPriorCorrection(0, 0, 1)
    const low = applyPriorCorrection(1, 1, 0)

    expect(high).toBeGreaterThan(0.999)
    expect(high).toBeLessThan(1)
    expect(low).toBeGreaterThan(0)
    expect(low).toBeLessThan(0.001)
  })

  it('returns null for thin recent windows so callers can leave p unchanged', () => {
    const labels = [
      { baseDate: '2026-06-15', y: true },
      { baseDate: '2026-06-15', y: false },
    ]
    const recentRate = computeTrailingFinalBaseRate(labels, '2026-07-06', { minCount: 3 })
    const probability = 0.42
    const corrected = recentRate === null ? probability : applyPriorCorrection(probability, 0.5, recentRate)

    expect(recentRate).toBeNull()
    expect(corrected).toBe(probability)
  })

  it('uses the inclusive UTC trailing window behind the finalization lag', () => {
    const labels = [
      { baseDate: '2026-07-01', y: true },
      { baseDate: '2026-07-02', y: true },
      { baseDate: '2026-07-03', y: false },
      { baseDate: '2026-07-06', y: true },
      { baseDate: '2026-07-07', y: false },
    ]

    expect(getTrailingFinalBaseRateWindow('2026-07-08', { windowDays: 4, lagDays: 2 })).toEqual({
      startDate: '2026-07-02',
      endDate: '2026-07-06',
    })
    expect(computeTrailingFinalBaseRate(labels, '2026-07-08', {
      windowDays: 4,
      lagDays: 2,
      minCount: 3,
    })).toBeCloseTo(2 / 3, 12)
  })

  it('does deterministic UTC date arithmetic across month boundaries', () => {
    const labels = [
      { baseDate: '2026-02-25', y: true },
      { baseDate: '2026-02-27', y: true },
      { baseDate: '2026-02-28', y: false },
      { baseDate: '2026-03-01', y: true },
    ]

    expect(getTrailingFinalBaseRateWindow('2026-03-01', { windowDays: 2, lagDays: 1 })).toEqual({
      startDate: '2026-02-26',
      endDate: '2026-02-28',
    })
    expect(computeTrailingFinalBaseRate(labels, '2026-03-01', {
      windowDays: 2,
      lagDays: 1,
      minCount: 2,
    })).toBe(0.5)
  })
})
