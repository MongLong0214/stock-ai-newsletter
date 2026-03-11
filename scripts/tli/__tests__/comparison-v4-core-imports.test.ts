import { describe, expect, it } from 'vitest'
import {
  auditSkipReasons,
  validateResampleCacheConsistency,
  evaluateThresholdStabilityByRegime,
  buildDailyDriftReport,
  type SkipReasonAudit,
  type CacheConsistencyResult,
  type ThresholdStabilityResult,
  type DriftReport,
} from '../comparison-v4-core-imports'

// ── 1. skip rate / skip reasons audit ──

describe('CMPV4-015: skip rate / skip reasons audit', () => {
  it('counts skip reasons from a set of candidate results', () => {
    const candidates = [
      { themeId: 'a', skipped: false, skipReason: null },
      { themeId: 'b', skipped: true, skipReason: 'insufficient_curve_data' },
      { themeId: 'c', skipped: true, skipReason: 'below_threshold' },
      { themeId: 'd', skipped: true, skipReason: 'insufficient_curve_data' },
      { themeId: 'e', skipped: false, skipReason: null },
    ]

    const audit: SkipReasonAudit = auditSkipReasons(candidates)

    expect(audit.totalCandidates).toBe(5)
    expect(audit.skippedCount).toBe(3)
    expect(audit.skipRate).toBeCloseTo(0.6)
    expect(audit.reasonCounts['insufficient_curve_data']).toBe(2)
    expect(audit.reasonCounts['below_threshold']).toBe(1)
  })

  it('returns zero skip rate when no candidates are skipped', () => {
    const candidates = [
      { themeId: 'a', skipped: false, skipReason: null },
      { themeId: 'b', skipped: false, skipReason: null },
    ]

    const audit = auditSkipReasons(candidates)
    expect(audit.skipRate).toBe(0)
    expect(audit.skippedCount).toBe(0)
    expect(Object.keys(audit.reasonCounts)).toHaveLength(0)
  })

  it('handles empty candidate list', () => {
    const audit = auditSkipReasons([])
    expect(audit.totalCandidates).toBe(0)
    expect(audit.skipRate).toBe(0)
  })

  it('returns 100% skip rate when all are skipped', () => {
    const candidates = [
      { themeId: 'a', skipped: true, skipReason: 'censored' },
      { themeId: 'b', skipped: true, skipReason: 'censored' },
    ]

    const audit = auditSkipReasons(candidates)
    expect(audit.skipRate).toBe(1)
    expect(audit.reasonCounts['censored']).toBe(2)
  })
})

// ── 2. resample cache length guard ──

describe('CMPV4-015: resample cache length consistency', () => {
  it('passes when all cached curves have the same length', () => {
    const curves = [
      { themeId: 'a', resampledCurve: [1, 2, 3, 4, 5] },
      { themeId: 'b', resampledCurve: [5, 4, 3, 2, 1] },
      { themeId: 'c', resampledCurve: [2, 3, 4, 5, 6] },
    ]

    const result: CacheConsistencyResult = validateResampleCacheConsistency(curves)
    expect(result.consistent).toBe(true)
    expect(result.expectedLength).toBe(5)
    expect(result.inconsistentThemeIds).toEqual([])
  })

  it('detects inconsistent cache lengths', () => {
    const curves = [
      { themeId: 'a', resampledCurve: [1, 2, 3, 4, 5] },
      { themeId: 'b', resampledCurve: [5, 4, 3] },
      { themeId: 'c', resampledCurve: [2, 3, 4, 5, 6] },
    ]

    const result = validateResampleCacheConsistency(curves)
    expect(result.consistent).toBe(false)
    expect(result.inconsistentThemeIds).toContain('b')
  })

  it('passes for empty list', () => {
    const result = validateResampleCacheConsistency([])
    expect(result.consistent).toBe(true)
  })

  it('passes for single curve', () => {
    const result = validateResampleCacheConsistency([
      { themeId: 'a', resampledCurve: [1, 2, 3] },
    ])
    expect(result.consistent).toBe(true)
    expect(result.expectedLength).toBe(3)
  })

  it('treats empty curves as length 0 (inconsistent with non-empty)', () => {
    const curves = [
      { themeId: 'a', resampledCurve: [1, 2, 3] },
      { themeId: 'b', resampledCurve: [] },
    ]

    const result = validateResampleCacheConsistency(curves)
    expect(result.consistent).toBe(false)
    expect(result.inconsistentThemeIds).toContain('b')
  })
})

// ── 3. threshold stability by regime ──

describe('CMPV4-015: threshold stability by regime', () => {
  it('marks regime as stable when IQR is within limit', () => {
    const result: ThresholdStabilityResult = evaluateThresholdStabilityByRegime({
      regimeId: 'curve_len_gte_14',
      foldThresholds: [0.35, 0.36, 0.34, 0.37, 0.35],
      maxIQR: 0.05,
    })

    expect(result.stable).toBe(true)
    expect(result.iqr).toBeLessThan(0.05)
    expect(result.regimeId).toBe('curve_len_gte_14')
  })

  it('marks regime as unstable when IQR exceeds limit', () => {
    const result = evaluateThresholdStabilityByRegime({
      regimeId: 'curve_len_7_13',
      foldThresholds: [0.20, 0.50, 0.30, 0.60, 0.25],
      maxIQR: 0.05,
    })

    expect(result.stable).toBe(false)
    expect(result.iqr).toBeGreaterThan(0.05)
  })

  it('handles fewer than 4 fold thresholds gracefully', () => {
    const result = evaluateThresholdStabilityByRegime({
      regimeId: 'curve_len_lt_7',
      foldThresholds: [0.35, 0.36],
      maxIQR: 0.05,
    })

    expect(result.stable).toBe(true)
    expect(result.iqr).toBeDefined()
  })

  it('returns zero IQR for single threshold', () => {
    const result = evaluateThresholdStabilityByRegime({
      regimeId: 'curve_len_gte_14',
      foldThresholds: [0.40],
      maxIQR: 0.05,
    })

    expect(result.stable).toBe(true)
    expect(result.iqr).toBe(0)
  })
})

// ── 4. daily drift monitoring ──

describe('CMPV4-015: daily drift monitoring', () => {
  it('computes day-over-day deltas for a metric series', () => {
    const report: DriftReport = buildDailyDriftReport({
      metricName: 'precision@3',
      dailyValues: [
        { date: '2026-03-01', value: 0.50 },
        { date: '2026-03-02', value: 0.52 },
        { date: '2026-03-03', value: 0.48 },
        { date: '2026-03-04', value: 0.55 },
      ],
      alertThreshold: 0.10,
    })

    expect(report.metricName).toBe('precision@3')
    expect(report.deltas).toHaveLength(3)
    expect(report.deltas[0].delta).toBeCloseTo(0.02)
    expect(report.deltas[1].delta).toBeCloseTo(-0.04)
    expect(report.deltas[2].delta).toBeCloseTo(0.07)
    expect(report.hasAlert).toBe(false)
  })

  it('triggers alert when delta exceeds threshold', () => {
    const report = buildDailyDriftReport({
      metricName: 'precision@3',
      dailyValues: [
        { date: '2026-03-01', value: 0.50 },
        { date: '2026-03-02', value: 0.35 },
      ],
      alertThreshold: 0.10,
    })

    expect(report.hasAlert).toBe(true)
    expect(report.alertDates).toContain('2026-03-02')
  })

  it('handles single data point (no deltas)', () => {
    const report = buildDailyDriftReport({
      metricName: 'coverage',
      dailyValues: [{ date: '2026-03-01', value: 0.80 }],
      alertThreshold: 0.05,
    })

    expect(report.deltas).toHaveLength(0)
    expect(report.hasAlert).toBe(false)
  })

  it('handles empty data', () => {
    const report = buildDailyDriftReport({
      metricName: 'coverage',
      dailyValues: [],
      alertThreshold: 0.05,
    })

    expect(report.deltas).toHaveLength(0)
    expect(report.hasAlert).toBe(false)
  })
})
