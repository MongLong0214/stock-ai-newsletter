import { describe, it, expect } from 'vitest'
import {
  normalizeTimeline,
  normalizeValues,
  findPeakDay,
  resampleCurve,
} from '../comparison/timeline'
import type { TimeSeriesPoint } from '../comparison/timeline'

describe('normalizeTimeline', () => {
  it('converts dates to relative days from firstSpikeDate', () => {
    const data = [
      { date: '2025-01-01', value: 10 },
      { date: '2025-01-04', value: 20 },
    ]
    const result = normalizeTimeline(data, '2025-01-01')
    expect(result).toEqual([
      { day: 0, value: 10 },
      { day: 3, value: 20 },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(normalizeTimeline([], '2025-01-01')).toEqual([])
  })
})

describe('normalizeValues', () => {
  it('scales values to 0-1 range based on peak', () => {
    const data: TimeSeriesPoint[] = [
      { day: 0, value: 50 },
      { day: 1, value: 100 },
      { day: 2, value: 25 },
    ]
    const result = normalizeValues(data)
    expect(result[0].value).toBeCloseTo(0.5)
    expect(result[1].value).toBeCloseTo(1.0)
    expect(result[2].value).toBeCloseTo(0.25)
  })

  it('uses minimum denominator of 1 to avoid division by zero', () => {
    const data: TimeSeriesPoint[] = [{ day: 0, value: 0 }]
    const result = normalizeValues(data)
    expect(result[0].value).toBe(0)
  })

  it('preserves day values', () => {
    const data: TimeSeriesPoint[] = [{ day: 5, value: 10 }, { day: 10, value: 20 }]
    const result = normalizeValues(data)
    expect(result[0].day).toBe(5)
    expect(result[1].day).toBe(10)
  })
})

describe('findPeakDay', () => {
  it('returns -1 for empty array', () => {
    expect(findPeakDay([])).toBe(-1)
  })

  it('returns day of maximum value', () => {
    const data: TimeSeriesPoint[] = [
      { day: 0, value: 10 },
      { day: 5, value: 100 },
      { day: 10, value: 50 },
    ]
    expect(findPeakDay(data)).toBe(5)
  })

  it('returns -1 when all values are 0', () => {
    const data: TimeSeriesPoint[] = [
      { day: 3, value: 0 },
      { day: 7, value: 0 },
    ]
    expect(findPeakDay(data)).toBe(-1)
  })

  it('returns day of first peak when tied', () => {
    const data: TimeSeriesPoint[] = [
      { day: 1, value: 50 },
      { day: 2, value: 50 },
    ]
    // > 연산자로 첫 번째 발생이 선택됨 (>= 아님)
    expect(findPeakDay(data)).toBe(1)
  })
})

describe('resampleCurve', () => {
  it('returns array of zeros for empty curve', () => {
    const result = resampleCurve([], 5)
    expect(result).toEqual([0, 0, 0, 0, 0])
  })

  it('returns array of single value for single-point curve', () => {
    const result = resampleCurve([{ day: 0, value: 42 }], 3)
    expect(result).toEqual([42, 42, 42])
  })

  it('returns filled array when maxDay <= 0', () => {
    const result = resampleCurve([{ day: 0, value: 10 }, { day: 0, value: 20 }], 3)
    expect(result).toEqual([10, 10, 10])
  })

  it('interpolates between two points', () => {
    const curve: TimeSeriesPoint[] = [
      { day: 0, value: 0 },
      { day: 10, value: 100 },
    ]
    const result = resampleCurve(curve, 3)
    // 3 points: day 0, day 5, day 10
    expect(result[0]).toBeCloseTo(0)
    expect(result[1]).toBeCloseTo(50)
    expect(result[2]).toBeCloseTo(100)
  })

  it('defaults to 50 resample points', () => {
    const curve: TimeSeriesPoint[] = [
      { day: 0, value: 0 },
      { day: 100, value: 100 },
    ]
    const result = resampleCurve(curve)
    expect(result.length).toBe(50)
  })

  it('handles non-uniform spacing', () => {
    const curve: TimeSeriesPoint[] = [
      { day: 0, value: 0 },
      { day: 2, value: 20 },
      { day: 10, value: 100 },
    ]
    const result = resampleCurve(curve, 11)
    expect(result[0]).toBeCloseTo(0)
    expect(result[10]).toBeCloseTo(100)
  })
})
