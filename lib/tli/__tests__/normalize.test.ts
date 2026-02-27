import { describe, it, expect } from 'vitest'
import { standardDeviation, avg, daysBetween } from '@/lib/tli/normalize'

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
