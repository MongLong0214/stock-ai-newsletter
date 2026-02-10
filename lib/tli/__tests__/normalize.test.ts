import { describe, it, expect } from 'vitest'
import { normalize, standardDeviation, avg, daysBetween } from '@/lib/tli/normalize'

describe('normalize', () => {
  it('returns 0 for non-finite values', () => {
    expect(normalize(NaN, 0, 100)).toBe(0)
    expect(normalize(Infinity, 0, 100)).toBe(0)
    expect(normalize(-Infinity, 0, 100)).toBe(0)
  })

  it('returns 0 when min === max', () => {
    expect(normalize(50, 50, 50)).toBe(0)
  })

  it('normalizes value within range to [0, 1]', () => {
    expect(normalize(50, 0, 100)).toBe(0.5)
    expect(normalize(0, 0, 100)).toBe(0)
    expect(normalize(100, 0, 100)).toBe(1)
    expect(normalize(25, 0, 100)).toBe(0.25)
  })

  it('clamps below-min values to 0', () => {
    expect(normalize(-10, 0, 100)).toBe(0)
  })

  it('clamps above-max values to 1', () => {
    expect(normalize(150, 0, 100)).toBe(1)
  })
})

describe('standardDeviation', () => {
  it('returns 0 for empty array', () => {
    expect(standardDeviation([])).toBe(0)
  })

  it('returns 0 for single element', () => {
    expect(standardDeviation([5])).toBe(0)
  })

  it('returns 0 for identical values', () => {
    expect(standardDeviation([3, 3, 3, 3])).toBe(0)
  })

  it('calculates population std dev correctly', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4, stddev=2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })
})

describe('avg', () => {
  it('returns 0 for empty array', () => {
    expect(avg([])).toBe(0)
  })

  it('returns the single value for one-element array', () => {
    expect(avg([42])).toBe(42)
  })

  it('calculates arithmetic mean', () => {
    expect(avg([10, 20, 30])).toBe(20)
    expect(avg([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('daysBetween', () => {
  it('returns days between two dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9)
  })

  it('returns negative for reversed dates', () => {
    expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9)
  })

  it('returns 0 for same date', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('returns 0 for invalid dates', () => {
    expect(daysBetween('invalid', '2026-01-01')).toBe(0)
    expect(daysBetween('2026-01-01', 'invalid')).toBe(0)
  })
})
