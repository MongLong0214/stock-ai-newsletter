import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import type { ConfidenceLevel, Phase, RiskLevel } from '@/lib/tli/prediction'

export interface PredictionParitySnapshot {
  readonly id: string
  readonly theme_id: string
  readonly snapshot_date: string
  readonly comparison_run_id: string
  readonly phase: Phase
  readonly confidence: ConfidenceLevel
  readonly risk_level: RiskLevel
  readonly avg_peak_day: number
  readonly avg_total_days: number
  readonly avg_days_to_peak: number
  readonly days_since_spike: number
}

export interface PredictionParityLivePrediction {
  readonly phase: Phase
  readonly confidence: ConfidenceLevel
  readonly riskLevel: RiskLevel
  readonly avgPeakDay: number
  readonly avgTotalDays: number
  readonly avgDaysToPeak: number
  readonly daysSinceSpike: number
}

export interface PredictionParityItem {
  readonly snapshot: PredictionParitySnapshot
  readonly livePrediction: PredictionParityLivePrediction | null
  /** snapshot_date ±1일 이내에 매칭되는 과거 lifecycle_scores가 없어 재계산 자체를 시도하지 못한 경우 */
  readonly scoreMissing?: boolean
}

export interface PredictionParityMismatch {
  readonly snapshotId: string
  readonly themeId: string
  readonly snapshotDate: string
  readonly fields: readonly string[]
}

export interface PredictionParityReport {
  readonly asOfDate: string
  readonly windowDays: number
  readonly snapshotCount: number
  readonly recalculatedCount: number
  readonly matchedCount: number
  readonly coverageRate: number
  readonly parityRate: number
  readonly freshnessBusinessDays: number
  readonly mismatches: readonly PredictionParityMismatch[]
  /** B-Abl 고정 스냅샷 + 이후 갱신된 후보(혼합 빈티지)로 재계산 계약 대상에서 제외된 수 */
  readonly staleInputExcludedCount?: number
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Number((numerator / denominator).toFixed(4))
}

export function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function countBusinessDaysAfter(input: {
  readonly fromDate: string
  readonly toDate: string
}): number {
  if (input.fromDate >= input.toDate) return 0

  let count = 0
  for (let date = shiftDate(input.fromDate, 1); date <= input.toDate; date = shiftDate(date, 1)) {
    if (isKoreanTradingDate(date)) count++
  }
  return count
}

function mismatchFields(item: PredictionParityItem): string[] {
  if (item.scoreMissing) return ['score_missing']

  const live = item.livePrediction
  if (!live) return ['missing_live_recalculation']

  const fields: string[] = []
  if (item.snapshot.phase !== live.phase) fields.push('phase')
  if (item.snapshot.confidence !== live.confidence) fields.push('confidence')
  if (item.snapshot.risk_level !== live.riskLevel) fields.push('riskLevel')
  if (item.snapshot.avg_peak_day !== live.avgPeakDay) fields.push('avgPeakDay')
  if (item.snapshot.avg_total_days !== live.avgTotalDays) fields.push('avgTotalDays')
  if (item.snapshot.avg_days_to_peak !== live.avgDaysToPeak) fields.push('avgDaysToPeak')
  if (item.snapshot.days_since_spike !== live.daysSinceSpike) fields.push('daysSinceSpike')
  return fields
}

export function buildPredictionParityReport(input: {
  readonly asOfDate: string
  readonly windowDays: number
  readonly items: readonly PredictionParityItem[]
}): PredictionParityReport {
  const mismatches = input.items
    .map((item) => ({ item, fields: mismatchFields(item) }))
    .filter((result) => result.fields.length > 0)
    .map(({ item, fields }) => ({
      snapshotId: item.snapshot.id,
      themeId: item.snapshot.theme_id,
      snapshotDate: item.snapshot.snapshot_date,
      fields,
    }))

  const recalculatedCount = input.items.filter((item) => item.livePrediction !== null).length
  const matchedCount = recalculatedCount - mismatches.filter((item) =>
    !item.fields.includes('missing_live_recalculation') && !item.fields.includes('score_missing')
  ).length
  const latestSnapshotDate = input.items
    .map((item) => item.snapshot.snapshot_date)
    .sort()
    .at(-1)

  return {
    asOfDate: input.asOfDate,
    windowDays: input.windowDays,
    snapshotCount: input.items.length,
    recalculatedCount,
    matchedCount,
    coverageRate: roundRate(recalculatedCount, input.items.length),
    parityRate: roundRate(matchedCount, recalculatedCount),
    freshnessBusinessDays: latestSnapshotDate
      ? countBusinessDaysAfter({ fromDate: latestSnapshotDate, toDate: input.asOfDate })
      : input.windowDays,
    mismatches,
  }
}
