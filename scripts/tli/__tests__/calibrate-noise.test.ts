import { describe, it, expect } from 'vitest'
import { computeAUC, findOptimalThreshold, labelScoreRecords } from '@/scripts/tli/scoring/calibrate-noise'

describe('computeAUC', () => {
  it('returns 1.0 for perfect classifier', () => {
    const points = [
      { fpr: 0, tpr: 0 },
      { fpr: 0, tpr: 1 },
      { fpr: 1, tpr: 1 },
    ]
    expect(computeAUC(points)).toBeCloseTo(1.0, 1)
  })

  it('returns 0.5 for random classifier', () => {
    const points = [
      { fpr: 0, tpr: 0 },
      { fpr: 0.5, tpr: 0.5 },
      { fpr: 1, tpr: 1 },
    ]
    expect(computeAUC(points)).toBeCloseTo(0.5, 1)
  })

  it('returns 0 for always-wrong classifier', () => {
    const points = [
      { fpr: 0, tpr: 0 },
      { fpr: 1, tpr: 0 },
    ]
    expect(computeAUC(points)).toBeCloseTo(0, 1)
  })
})

describe('findOptimalThreshold', () => {
  it('returns null for less than 10 data points', () => {
    const data = Array.from({ length: 5 }, () => ({ rawAvg: 5, isSignal: true }))
    expect(findOptimalThreshold(data, [1, 2, 3])).toBeNull()
  })

  it('finds threshold that maximizes Youden J', () => {
    // Clear separation: signals have rawAvg > 5, noise < 5
    const data = [
      ...Array.from({ length: 20 }, () => ({ rawAvg: 2, isSignal: false })),
      ...Array.from({ length: 20 }, () => ({ rawAvg: 8, isSignal: true })),
    ]
    const result = findOptimalThreshold(data, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(result).not.toBeNull()
    if (result) {
      expect(result.threshold).toBeGreaterThan(2)
      expect(result.threshold).toBeLessThan(8)
      expect(result.auc).toBeGreaterThan(0.8)
      expect(result.youdenJ).toBeGreaterThan(0.5)
    }
  })

})

describe('labelScoreRecords', () => {
  it('labels theme as Signal if any historical stage is Growth or Peak', () => {
    // Theme A: was Peak, then declined to Dormant
    // Theme B: stayed Dormant/Emerging
    const scores = [
      { theme_id: 'A', stage: 'Dormant', components: { raw: { raw_interest_avg: 8 } } },
      { theme_id: 'A', stage: 'Peak', components: { raw: { raw_interest_avg: 30 } } },
      { theme_id: 'A', stage: 'Growth', components: { raw: { raw_interest_avg: 20 } } },
      { theme_id: 'B', stage: 'Dormant', components: { raw: { raw_interest_avg: 2 } } },
      { theme_id: 'B', stage: 'Emerging', components: { raw: { raw_interest_avg: 5 } } },
    ]
    const result = labelScoreRecords(scores)
    expect(result).toHaveLength(2)
    const themeA = result.find(r => r.rawAvg === 8) // first record's rawAvg
    const themeB = result.find(r => r.rawAvg === 2)
    expect(themeA?.isSignal).toBe(true)  // ever reached Peak
    expect(themeB?.isSignal).toBe(false)  // never reached Growth/Peak
  })

  it('uses rawAvg from first record per theme', () => {
    const scores = [
      { theme_id: 'X', stage: 'Growth', components: { raw: { raw_interest_avg: 15 } } },
      { theme_id: 'X', stage: 'Emerging', components: { raw: { raw_interest_avg: 5 } } },
    ]
    const result = labelScoreRecords(scores)
    expect(result[0].rawAvg).toBe(15) // first record
    expect(result[0].isSignal).toBe(true)
  })

  it('handles missing components gracefully', () => {
    const scores = [
      { theme_id: 'Y', stage: 'Dormant', components: null },
    ]
    const result = labelScoreRecords(scores)
    expect(result[0].rawAvg).toBe(0)
    expect(result[0].isSignal).toBe(false)
  })
})
