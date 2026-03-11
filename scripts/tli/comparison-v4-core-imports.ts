/**
 * CMPV4-015: Core v3 Imports
 *
 * v3에서 채택된 low-risk 개선을 v2 stack 위에서 구현:
 * 1. skip rate / skip reasons audit
 * 2. resample cache length consistency guard
 * 3. threshold stability by regime
 * 4. daily drift monitoring
 *
 * historical stage alignment은 evaluate-comparisons.ts에서 이미 구현됨
 */

// ── 1. skip rate / skip reasons audit ──

interface CandidateSkipInput {
  themeId: string
  skipped: boolean
  skipReason: string | null
}

export interface SkipReasonAudit {
  totalCandidates: number
  skippedCount: number
  skipRate: number
  reasonCounts: Record<string, number>
}

export const auditSkipReasons = (candidates: CandidateSkipInput[]): SkipReasonAudit => {
  const skipped = candidates.filter((c) => c.skipped)
  const reasonCounts: Record<string, number> = {}

  for (const c of skipped) {
    if (c.skipReason) {
      reasonCounts[c.skipReason] = (reasonCounts[c.skipReason] || 0) + 1
    }
  }

  return {
    totalCandidates: candidates.length,
    skippedCount: skipped.length,
    skipRate: candidates.length > 0 ? skipped.length / candidates.length : 0,
    reasonCounts,
  }
}

// ── 2. resample cache length consistency guard ──

export interface CacheConsistencyResult {
  consistent: boolean
  expectedLength: number | null
  inconsistentThemeIds: string[]
}

export const validateResampleCacheConsistency = (
  curves: Array<{ themeId: string; resampledCurve: number[] }>,
): CacheConsistencyResult => {
  if (curves.length === 0) return { consistent: true, expectedLength: null, inconsistentThemeIds: [] }

  const expectedLength = curves[0].resampledCurve.length
  const inconsistent = curves.filter((c) => c.resampledCurve.length !== expectedLength)

  return {
    consistent: inconsistent.length === 0,
    expectedLength,
    inconsistentThemeIds: inconsistent.map((c) => c.themeId),
  }
}

// ── 3. threshold stability by regime ──

export interface ThresholdStabilityResult {
  regimeId: string
  stable: boolean
  iqr: number
  median: number
}

const computeIQR = (values: number[]): { iqr: number; median: number } => {
  if (values.length === 0) return { iqr: 0, median: 0 }
  if (values.length === 1) return { iqr: 0, median: values[0] }

  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length

  const q1Idx = Math.floor(n * 0.25)
  const q3Idx = Math.floor(n * 0.75)
  const medianIdx = Math.floor(n * 0.5)

  return {
    iqr: sorted[q3Idx] - sorted[q1Idx],
    median: sorted[medianIdx],
  }
}

export const evaluateThresholdStabilityByRegime = (input: {
  regimeId: string
  foldThresholds: number[]
  maxIQR: number
}): ThresholdStabilityResult => {
  const { iqr, median } = computeIQR(input.foldThresholds)

  return {
    regimeId: input.regimeId,
    stable: iqr <= input.maxIQR,
    iqr,
    median,
  }
}

// ── 4. daily drift monitoring ──

interface DailyValue {
  date: string
  value: number
}

interface DriftDelta {
  date: string
  previousDate: string
  delta: number
  absDelta: number
}

export interface DriftReport {
  metricName: string
  deltas: DriftDelta[]
  hasAlert: boolean
  alertDates: string[]
}

export const buildDailyDriftReport = (input: {
  metricName: string
  dailyValues: DailyValue[]
  alertThreshold: number
}): DriftReport => {
  const deltas: DriftDelta[] = []
  const alertDates: string[] = []

  for (let i = 1; i < input.dailyValues.length; i++) {
    const prev = input.dailyValues[i - 1]
    const curr = input.dailyValues[i]
    const delta = curr.value - prev.value
    const absDelta = Math.abs(delta)

    deltas.push({ date: curr.date, previousDate: prev.date, delta, absDelta })

    if (absDelta > input.alertThreshold) {
      alertDates.push(curr.date)
    }
  }

  return {
    metricName: input.metricName,
    deltas,
    hasAlert: alertDates.length > 0,
    alertDates,
  }
}
