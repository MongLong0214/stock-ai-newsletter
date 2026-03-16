/**
 * TCAR-012: Reusable target definitions for future alignment classification.
 */
import { describe, it, expect } from 'vitest'
import {
  classifyFutureAlignment,
  PEAK_GAP_POSITIVE_THRESHOLD,
  PEAK_GAP_NEGATIVE_THRESHOLD,
  TOTAL_DAYS_RATIO_POSITIVE,
  TOTAL_DAYS_RATIO_NEGATIVE,
  type FutureAlignmentLabel,
} from '../analog/targets'

describe('TCAR-012: analog/targets constants', () => {
  it('exports threshold constants', () => {
    expect(PEAK_GAP_POSITIVE_THRESHOLD).toBe(5)
    expect(PEAK_GAP_NEGATIVE_THRESHOLD).toBe(15)
    expect(TOTAL_DAYS_RATIO_POSITIVE).toBe(0.3)
    expect(TOTAL_DAYS_RATIO_NEGATIVE).toBe(0.6)
  })
})

describe('TCAR-012: classifyFutureAlignment (from targets.ts)', () => {
  it('returns positive when peak gap <= 5 and ratio <= 0.3', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 20,
      queryTotalDays: 45,
      candidatePeakDay: 22,
      candidateTotalDays: 50,
    })
    expect(result.label).toBe('positive')
    expect(result.peakDayGap).toBe(2)
  })

  it('returns negative when peak gap > 15', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 10,
      queryTotalDays: 40,
      candidatePeakDay: 30,
      candidateTotalDays: 45,
    })
    expect(result.label).toBe('negative')
    expect(result.peakDayGap).toBe(20)
  })

  it('returns negative when total days ratio > 0.6', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 20,
      queryTotalDays: 30,
      candidatePeakDay: 25,
      candidateTotalDays: 100,
    })
    expect(result.label).toBe('negative')
  })

  it('returns ambiguous for borderline cases', () => {
    // peakDayGap=10 (>5 but <=15), totalDaysRatio ~0.4 (>0.3 but <=0.6)
    const result = classifyFutureAlignment({
      queryPeakDay: 20,
      queryTotalDays: 50,
      candidatePeakDay: 30,
      candidateTotalDays: 70,
    })
    expect(result.label).toBe('ambiguous')
  })

  it('handles zero total days safely', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 0,
      queryTotalDays: 0,
      candidatePeakDay: 0,
      candidateTotalDays: 0,
    })
    expect(result.label).toBe('positive')
    expect(result.peakDayGap).toBe(0)
  })

  it('result label satisfies FutureAlignmentLabel type', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 20,
      queryTotalDays: 45,
      candidatePeakDay: 18,
      candidateTotalDays: 42,
    })
    const validLabels: FutureAlignmentLabel[] = ['positive', 'negative', 'ambiguous']
    expect(validLabels).toContain(result.label)
  })
})
