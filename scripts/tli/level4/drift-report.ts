import type { Level4CertificationSourceSurface } from '@/lib/tli/comparison/level4-types'
import { resolveLevel4ConfidenceTier } from '@/lib/tli/comparison/level4-serving'
import { DRIFT_BASELINE_THRESHOLDS, type DriftBaselineMaturityAssessment } from './drift-baseline'

interface DriftReportRow {
  runId: string
  evaluatedAt: string
  binaryRelevant: boolean
  censoredReason: string | null
  relevanceProbability: number | null
  supportCount: number | null
  probabilityCiLower: number | null
  probabilityCiUpper: number | null
  firstSpikeInferred: boolean
}

export interface DriftReportArtifactRecord {
  drift_version: string
  report_date: string
  source_surface: Level4CertificationSourceSurface
  relevance_base_rate: number
  calibration_curve_error: number
  brier: number
  ece: number
  candidate_concentration_gini: number
  baseline_candidate_concentration_gini: number
  censoring_ratio: number
  baseline_censoring_ratio: number
  first_spike_inference_rate: number
  support_bucket_precision: {
    high: number
    medium: number
    low: number
  }
  low_confidence_serving_rate: number
  baseline_window_months: number
  baseline_row_count: number
  auto_hold_enabled: boolean
  drift_status: 'observation_only' | 'stable' | 'held'
  triggered_rules: string[]
  base_rate: number
  hold_report_date: string | null
}

interface DriftReportArtifactQueryResult<T> {
  data: T | null
  error: { message?: string } | null
}

type DriftReportArtifactQueryHandle<T> = PromiseLike<DriftReportArtifactQueryResult<T>>

interface DriftReportArtifactTableHandle {
  upsert?(row: DriftReportArtifactRecord): {
    select(): {
      single(): DriftReportArtifactQueryHandle<DriftReportArtifactRecord>
    }
  }
  select?(): {
    eq?(column: string, value: string): {
      maybeSingle(): DriftReportArtifactQueryHandle<DriftReportArtifactRecord>
    }
    order(column: string, options: { ascending: boolean }): {
      limit(limit: number): {
        maybeSingle(): DriftReportArtifactQueryHandle<DriftReportArtifactRecord>
      }
    }
  }
}

interface DriftReportArtifactTableClient {
  from(table: string): DriftReportArtifactTableHandle
}

function computeGini(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].filter((value) => value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return 0

  const total = sorted.reduce((sum, value) => sum + value, 0)
  if (total === 0) return 0

  const weighted = sorted.reduce((sum, value, index) => sum + (2 * (index + 1) - sorted.length - 1) * value, 0)
  return weighted / (sorted.length * total)
}

function computeCalibrationCurveError(rows: DriftReportRow[]) {
  if (rows.length === 0) return 0
  const buckets = new Map<string, { predicted: number; actual: number; total: number }>()

  for (const row of rows) {
    const key = [row.supportCount ?? 'na', row.probabilityCiLower ?? 'na', row.probabilityCiUpper ?? 'na'].join(':')
    const bucket = buckets.get(key) || { predicted: 0, actual: 0, total: 0 }
    bucket.predicted += row.relevanceProbability ?? 0
    bucket.actual += row.binaryRelevant ? 1 : 0
    bucket.total += 1
    buckets.set(key, bucket)
  }

  let error = 0
  for (const bucket of buckets.values()) {
    const predicted = bucket.total > 0 ? bucket.predicted / bucket.total : 0
    const actual = bucket.total > 0 ? bucket.actual / bucket.total : 0
    error += (bucket.total / rows.length) * Math.abs(actual - predicted)
  }

  return error
}

function computeBrier(rows: DriftReportRow[]) {
  if (rows.length === 0) return 0
  return rows.reduce((sum, row) => {
    const actual = row.binaryRelevant ? 1 : 0
    const probability = row.relevanceProbability ?? 0
    return sum + ((probability - actual) ** 2)
  }, 0) / rows.length
}

function computeSupportBucketPrecision(rows: DriftReportRow[]) {
  const buckets = {
    high: { total: 0, relevant: 0 },
    medium: { total: 0, relevant: 0 },
    low: { total: 0, relevant: 0 },
  }

  for (const row of rows) {
    const tier = resolveLevel4ConfidenceTier({
      supportCount: row.supportCount,
      probabilityCiLower: row.probabilityCiLower,
      probabilityCiUpper: row.probabilityCiUpper,
    })
    buckets[tier].total += 1
    buckets[tier].relevant += row.binaryRelevant ? 1 : 0
  }

  return {
    high: buckets.high.total > 0 ? buckets.high.relevant / buckets.high.total : 0,
    medium: buckets.medium.total > 0 ? buckets.medium.relevant / buckets.medium.total : 0,
    low: buckets.low.total > 0 ? buckets.low.relevant / buckets.low.total : 0,
  }
}

function computeLowConfidenceServingRate(rows: DriftReportRow[]) {
  if (rows.length === 0) return 0
  const lowCount = rows.filter((row) =>
    resolveLevel4ConfidenceTier({
      supportCount: row.supportCount,
      probabilityCiLower: row.probabilityCiLower,
      probabilityCiUpper: row.probabilityCiUpper,
    }) === 'low',
  ).length
  return lowCount / rows.length
}

function buildArtifact(input: {
  driftVersion: string
  reportDate: string
  sourceSurface: Level4CertificationSourceSurface
  rows: DriftReportRow[]
  baselineWindowMonths: number
  baselineRowCount: number
  autoHoldEnabled: boolean
  driftStatus?: 'observation_only' | 'stable' | 'held'
  triggeredRules?: string[]
}): DriftReportArtifactRecord {
  const totalCount = input.rows.length
  const relevantCount = input.rows.filter((row) => row.binaryRelevant).length
  const censoredCount = input.rows.filter((row) => row.censoredReason != null).length
  const inferredCount = input.rows.filter((row) => row.firstSpikeInferred).length
  const supportBucketPrecision = computeSupportBucketPrecision(input.rows)
  const groupedRuns = [...new Set(input.rows.map((row) => row.runId))]
    .map((runId) => input.rows.filter((row) => row.runId === runId).length)
  const relevanceBaseRate = totalCount > 0 ? relevantCount / totalCount : 0
  const calibrationCurveError = computeCalibrationCurveError(input.rows)

  return {
    drift_version: input.driftVersion,
    report_date: input.reportDate,
    source_surface: input.sourceSurface,
    relevance_base_rate: relevanceBaseRate,
    calibration_curve_error: calibrationCurveError,
    brier: computeBrier(input.rows),
    ece: calibrationCurveError,
    candidate_concentration_gini: computeGini(groupedRuns),
    baseline_candidate_concentration_gini: computeGini(groupedRuns),
    censoring_ratio: totalCount > 0 ? censoredCount / totalCount : 0,
    baseline_censoring_ratio: totalCount > 0 ? censoredCount / totalCount : 0,
    first_spike_inference_rate: totalCount > 0 ? inferredCount / totalCount : 0,
    support_bucket_precision: supportBucketPrecision,
    low_confidence_serving_rate: computeLowConfidenceServingRate(input.rows),
    baseline_window_months: input.baselineWindowMonths || DRIFT_BASELINE_THRESHOLDS.baselineWindowMonths,
    baseline_row_count: input.baselineRowCount,
    auto_hold_enabled: input.autoHoldEnabled,
    drift_status: input.driftStatus ?? (input.autoHoldEnabled ? 'stable' : 'observation_only'),
    triggered_rules: input.triggeredRules ?? [],
    base_rate: relevanceBaseRate,
    hold_report_date: null,
  }
}

export function buildDriftReportArtifact(input: {
  driftVersion: string
  reportDate: string
  sourceSurface: Level4CertificationSourceSurface
  rows: DriftReportRow[]
  baselineWindowMonths: number
  baselineRowCount: number
  autoHoldEnabled: boolean
}) {
  return buildArtifact(input)
}

export function buildMonthlyDriftReportArtifact(input: {
  reportDate: string
  driftVersion: string
  sourceSurface: Level4CertificationSourceSurface
  baseline: {
    baselineWindowMonths: number
    baselineRowCount: number
    baselineDistinctMonths: number
    baselineDistinctRunDates: number
    maturity: DriftBaselineMaturityAssessment
  }
  records: Array<DriftReportRow & { candidateThemeId?: string }>
  priorBaseline?: {
    baseRate: number
    ece: number
    candidateConcentrationGini: number
    censoringRatio: number
    supportBucketPrecision: { low: number }
  }
}) {
  const artifact = buildArtifact({
    driftVersion: input.driftVersion,
    reportDate: input.reportDate,
    sourceSurface: input.sourceSurface,
    rows: input.records.map((record, index) => ({
      runId: record.runId || record.candidateThemeId || `row-${index}`,
      evaluatedAt: record.evaluatedAt,
      binaryRelevant: record.binaryRelevant,
      censoredReason: record.censoredReason,
      relevanceProbability: record.relevanceProbability,
      supportCount: record.supportCount,
      probabilityCiLower: record.probabilityCiLower,
      probabilityCiUpper: record.probabilityCiUpper,
      firstSpikeInferred: record.firstSpikeInferred,
    })),
    baselineWindowMonths: input.baseline.baselineWindowMonths,
    baselineRowCount: input.baseline.baselineRowCount,
    autoHoldEnabled: input.baseline.maturity.autoHoldEnabled,
  })

  if (!input.baseline.maturity.autoHoldEnabled || !input.priorBaseline) {
    return artifact
  }

  const triggeredRules: string[] = []
  const absoluteBaseRateShift = Math.abs(artifact.relevance_base_rate - input.priorBaseline.baseRate)
  const relativeBaseRateShift = input.priorBaseline.baseRate === 0
    ? (absoluteBaseRateShift > 0 ? Number.POSITIVE_INFINITY : 0)
    : absoluteBaseRateShift / input.priorBaseline.baseRate

  if (artifact.ece > input.priorBaseline.ece + 0.03) triggeredRules.push('ece_threshold')
  if (absoluteBaseRateShift > 0.02 && relativeBaseRateShift > 0.5) triggeredRules.push('base_rate_shift')
  if (artifact.censoring_ratio > input.priorBaseline.censoringRatio + 0.10) triggeredRules.push('censoring_ratio_threshold')
  if (artifact.candidate_concentration_gini > input.priorBaseline.candidateConcentrationGini + 0.05) {
    triggeredRules.push('candidate_concentration_gini_threshold')
  }
  if (artifact.support_bucket_precision.low < input.priorBaseline.supportBucketPrecision.low - 0.05) {
    triggeredRules.push('low_support_precision_drop')
  }

  return {
    ...artifact,
    drift_status: triggeredRules.length > 0 ? 'held' : artifact.drift_status,
    triggered_rules: triggeredRules,
  }
}

export function buildDriftReportMarkdown(artifact: DriftReportArtifactRecord) {
  return [
    '[OBJECTIVE]',
    'Monitor level-4 comparison drift and auto-hold readiness.',
    '[DATA]',
    `rows=${artifact.baseline_row_count}, report_date=${artifact.report_date}, source_surface=${artifact.source_surface}`,
    '[FINDING]',
    `Relevance base rate ${artifact.relevance_base_rate.toFixed(4)}, censoring ratio ${artifact.censoring_ratio.toFixed(4)}, ECE ${artifact.ece.toFixed(4)}.`,
    `[STAT:n] baseline_row_count=${artifact.baseline_row_count}`,
    `[STAT:effect_size] candidate_concentration_gini=${artifact.candidate_concentration_gini.toFixed(4)}`,
    '[LIMITATION]',
    'Monthly drift artifacts summarize monitored output and do not establish causality.',
  ].join('\n')
}

export function renderMonthlyDriftReport(report: DriftReportArtifactRecord) {
  return buildDriftReportMarkdown(report)
}

export async function upsertDriftReportArtifact(
  client: DriftReportArtifactTableClient,
  row: DriftReportArtifactRecord,
): Promise<DriftReportArtifactRecord> {
  const table = client.from('drift_report_artifact')
  if (!table.upsert) {
    throw new Error('Drift artifact client does not support upsert')
  }

  const { data, error } = await table
    .upsert(row)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Drift report artifact upsert/readback failed: ${error?.message || 'unknown error'}`)
  }

  return data
}

export async function fetchLatestDriftArtifact(
  client: DriftReportArtifactTableClient,
): Promise<DriftReportArtifactRecord> {
  const query = client
    .from('drift_report_artifact')
    .select?.()

  if (!query) {
    throw new Error('Drift artifact client does not support select')
  }

  const chain = query as unknown as {
    order(column: string, options: { ascending: boolean }): {
      limit(limit: number): {
        maybeSingle(): PromiseLike<{ data: DriftReportArtifactRecord | null; error: { message?: string } | null }>
      }
    }
  }

  const { data, error } = await chain
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`No drift artifact available: ${error?.message || 'not found'}`)
  }

  return data
}

export function aggregateRollingDriftBaseline(
  artifacts: DriftReportArtifactRecord[],
): null | {
  relevanceBaseRate: number
  ece: number
  censoringRatio: number
  candidateConcentrationGini: number
  supportBucketPrecision: { high: number; medium: number; low: number }
} {
  if (artifacts.length === 0) return null

  const totalWeight = artifacts.reduce((sum, artifact) => sum + Math.max(artifact.baseline_row_count, 1), 0)
  const weighted = <T extends number>(pick: (artifact: DriftReportArtifactRecord) => T) =>
    artifacts.reduce((sum, artifact) => sum + pick(artifact) * Math.max(artifact.baseline_row_count, 1), 0) / totalWeight

  return {
    relevanceBaseRate: weighted((artifact) => artifact.relevance_base_rate),
    ece: weighted((artifact) => artifact.ece),
    censoringRatio: weighted((artifact) => artifact.censoring_ratio),
    candidateConcentrationGini: weighted((artifact) => artifact.candidate_concentration_gini),
    supportBucketPrecision: {
      high: weighted((artifact) => artifact.support_bucket_precision.high),
      medium: weighted((artifact) => artifact.support_bucket_precision.medium),
      low: weighted((artifact) => artifact.support_bucket_precision.low),
    },
  }
}
