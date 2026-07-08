import { computeQuantileEce } from '../../../lib/tli/eval/metrics'
import type { EvalPredictionRow } from '../../../lib/tli/eval/types'
import { FEATURE_NAMES, type FeatureName } from '../../../lib/tli/features/build-features'
import type { BaselineFeatureRow } from '../../../lib/tli/model/baselines'

export const M1_CALIBRATION_DIAGNOSTIC_REPORT_VERSION = 'tli-m1-calibration-diagnostic-v1'

export type SampleLimitVerdict = 'sample_limited' | 'structural' | 'mixed'
export type ReliabilityVerdict = 'monotonic' | 'irregular'
export type FeatureLivenessVerdict = 'all_features_live' | 'dead_features_present'

export interface EceVsSampleSizeRow {
  readonly sampleLabel: string; readonly sampleSize: number; readonly iterations: number
  readonly meanEce: number | null; readonly p025Ece: number | null; readonly p975Ece: number | null
}

export interface EceVsSampleSizeResult { readonly verdict: SampleLimitVerdict; readonly rows: readonly EceVsSampleSizeRow[] }

export interface ReliabilityBin {
  readonly binIndex: number; readonly binLabel: string; readonly lowerInclusive: number; readonly upperExclusive: number | null
  readonly count: number; readonly meanPredictedProbability: number | null; readonly observedPositiveRate: number | null; readonly gap: number | null
}

export interface ReliabilityGap { readonly binLabel: string; readonly gap: number; readonly absoluteGap: number }

export interface ReliabilityCurveResult {
  readonly verdict: ReliabilityVerdict; readonly monotonicObservedRate: boolean
  readonly largestGap: ReliabilityGap | null; readonly bins: readonly ReliabilityBin[]
}

export interface FeatureLivenessRow {
  readonly featureName: FeatureName; readonly missingRate: number; readonly variance: number | null; readonly zeroValueRate: number
  readonly min: number | null; readonly max: number | null; readonly dead: boolean; readonly deadReasons: readonly string[]
}

export interface FeatureLivenessAudit {
  readonly verdict: FeatureLivenessVerdict; readonly deadFeatureCount: number; readonly features: readonly FeatureLivenessRow[]
}

export interface M1CalibrationDiagnosticReport {
  readonly reportVersion: typeof M1_CALIBRATION_DIAGNOSTIC_REPORT_VERSION
  readonly generatedAt: string; readonly startDate: string; readonly endDate: string
  readonly totalPredictionRows: number; readonly scoredPredictionRows: number; readonly nonAbstainFeatureRows: number
  readonly sampleLimitVerdict: SampleLimitVerdict; readonly reliabilityVerdict: ReliabilityVerdict; readonly featureLivenessVerdict: FeatureLivenessVerdict
  readonly eceVsSampleSize: EceVsSampleSizeResult; readonly reliabilityCurve: ReliabilityCurveResult; readonly featureLiveness: FeatureLivenessAudit
}

const DEFAULT_SAMPLE_SIZES = [250, 500, 1000, 2000, 4000]
const DEFAULT_ITERATIONS = 200, DEFAULT_SEED = 42, DEFAULT_RELIABILITY_BIN_COUNT = 10
const DEAD_MISSING_RATE_THRESHOLD = 0.5, DEAD_VARIANCE_THRESHOLD = 1e-6

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length)

const populationVariance = (values: readonly number[]): number | null => {
  const average = mean(values)
  return average === null ? null : values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
}

const nextRandomFactory = (seedInput: number) => {
  let seed = seedInput
  return () => {
    seed = (seed * 1664525 + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }
}

const quantile = (values: readonly number[], probability: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(probability * (sorted.length - 1))))] ?? null
}

const sampleWithoutReplacement = <T>(
  rows: readonly T[],
  sampleSize: number,
  nextRandom: () => number,
): T[] => {
  if (sampleSize >= rows.length) return [...rows]
  const indexes = new Set<number>()
  while (indexes.size < sampleSize) indexes.add(Math.floor(nextRandom() * rows.length))
  return [...indexes].flatMap((index) => {
    const row = rows[index]
    return row === undefined ? [] : [row]
  })
}

const scoredRows = (rows: readonly EvalPredictionRow[]): EvalPredictionRow[] => rows.filter((row) => row.probability !== null && Number.isFinite(row.probability))

const interpretSampleLimit = (rows: readonly EceVsSampleSizeRow[]): SampleLimitVerdict => {
  const full = rows.find((row) => row.sampleLabel === 'full')?.meanEce
  const baseline = rows.find((row) => row.sampleLabel !== 'full' && row.meanEce !== null)?.meanEce
  if (full === undefined || full === null || baseline === undefined || baseline === null) return 'mixed'
  if (full < 0.7 * baseline && full < 0.08) return 'sample_limited'
  if (full >= 0.9 * baseline) return 'structural'
  return 'mixed'
}

export function computeEceVsSampleSize(
  predictions: readonly EvalPredictionRow[],
  options: {
    readonly sampleSizes?: readonly number[]
    readonly iterations?: number
    readonly seed?: number
    readonly eceBinCount?: number
    readonly eceMinBinSize?: number
  } = {},
): EceVsSampleSizeResult {
  const rows = scoredRows(predictions)
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const nextRandom = nextRandomFactory(options.seed ?? DEFAULT_SEED)
  const sampleSizes = (options.sampleSizes ?? DEFAULT_SAMPLE_SIZES).filter((size) => size > 0 && size < rows.length)
  const samples = [...sampleSizes.map((sampleSize) => ({ sampleLabel: String(sampleSize), sampleSize })), {
    sampleLabel: 'full',
    sampleSize: rows.length,
  }]

  const tableRows = samples.map((sample): EceVsSampleSizeRow => {
    const eces = Array.from({ length: iterations }, () => {
      const sampledRows = sampleWithoutReplacement(rows, sample.sampleSize, nextRandom)
      return computeQuantileEce(sampledRows, {
        binCount: options.eceBinCount,
        minBinSize: options.eceMinBinSize,
      }).ece
    }).flatMap((ece) => (ece === null || !Number.isFinite(ece) ? [] : [ece]))

    return {
      sampleLabel: sample.sampleLabel,
      sampleSize: sample.sampleSize,
      iterations,
      meanEce: mean(eces),
      p025Ece: quantile(eces, 0.025),
      p975Ece: quantile(eces, 0.975),
    }
  })

  return { verdict: interpretSampleLimit(tableRows), rows: tableRows }
}

const reliabilityBinLabel = (index: number): string => {
  const lower = index / DEFAULT_RELIABILITY_BIN_COUNT
  const upper = (index + 1) / DEFAULT_RELIABILITY_BIN_COUNT
  return index === DEFAULT_RELIABILITY_BIN_COUNT - 1
    ? `[${lower.toFixed(1)},${upper.toFixed(1)}]`
    : `[${lower.toFixed(1)},${upper.toFixed(1)})`
}

export function buildReliabilityCurve(predictions: readonly EvalPredictionRow[]): ReliabilityCurveResult {
  const bins = Array.from({ length: DEFAULT_RELIABILITY_BIN_COUNT }, () => [] as EvalPredictionRow[])
  for (const row of scoredRows(predictions)) {
    const probability = row.probability
    const index = probability === null ? 0 : Math.min(DEFAULT_RELIABILITY_BIN_COUNT - 1, Math.floor(probability * DEFAULT_RELIABILITY_BIN_COUNT))
    bins[index].push(row)
  }

  let largestGap: ReliabilityGap | null = null
  const reliabilityBins = bins.map((bin, index): ReliabilityBin => {
    const probabilities = bin.flatMap((row) => (row.probability === null ? [] : [row.probability]))
    const meanPredictedProbability = mean(probabilities)
    const observedPositiveRate = mean(bin.map((row) => (row.y ? 1 : 0)))
    const gap = meanPredictedProbability === null || observedPositiveRate === null
      ? null
      : meanPredictedProbability - observedPositiveRate
    if (gap !== null) {
      const absoluteGap = Math.abs(gap)
      if (largestGap === null || absoluteGap > largestGap.absoluteGap) {
        largestGap = { binLabel: reliabilityBinLabel(index), gap, absoluteGap }
      }
    }
    return {
      binIndex: index,
      binLabel: reliabilityBinLabel(index),
      lowerInclusive: index / DEFAULT_RELIABILITY_BIN_COUNT,
      upperExclusive: index === DEFAULT_RELIABILITY_BIN_COUNT - 1 ? null : (index + 1) / DEFAULT_RELIABILITY_BIN_COUNT,
      count: bin.length,
      meanPredictedProbability,
      observedPositiveRate,
      gap,
    }
  })
  const observedRates = reliabilityBins.flatMap((bin) => (bin.observedPositiveRate === null ? [] : [bin.observedPositiveRate]))
  const monotonicObservedRate = observedRates.every((rate, index) => index === 0 || rate >= observedRates[index - 1])
  return {
    verdict: monotonicObservedRate ? 'monotonic' : 'irregular',
    monotonicObservedRate,
    largestGap,
    bins: reliabilityBins,
  }
}

export function buildFeatureLivenessAudit(featureRows: readonly BaselineFeatureRow[]): FeatureLivenessAudit {
  const nonAbstainRows = featureRows.filter((row) => !row.abstain)
  const features = FEATURE_NAMES.map((featureName, featureIndex): FeatureLivenessRow => {
    const finiteValues = nonAbstainRows.flatMap((row) => {
      const value = row.values[featureIndex]
      const missing = row.missingFlags[featureIndex] === true || value === undefined || !Number.isFinite(value)
      return missing ? [] : [value]
    })
    const missingCount = nonAbstainRows.filter((row) => {
      const value = row.values[featureIndex]
      return row.missingFlags[featureIndex] === true || value === undefined || !Number.isFinite(value)
    }).length
    const zeroCount = nonAbstainRows.filter((row) => row.values[featureIndex] === 0).length
    const variance = populationVariance(finiteValues)
    const deadReasons = [
      ...(nonAbstainRows.length > 0 && missingCount / nonAbstainRows.length > DEAD_MISSING_RATE_THRESHOLD ? ['missing_rate_gt_0.5'] : []),
      ...(variance === null || variance < DEAD_VARIANCE_THRESHOLD ? ['variance_lt_1e-6'] : []),
    ]
    return {
      featureName,
      missingRate: nonAbstainRows.length === 0 ? 0 : missingCount / nonAbstainRows.length,
      variance,
      zeroValueRate: nonAbstainRows.length === 0 ? 0 : zeroCount / nonAbstainRows.length,
      min: finiteValues.length === 0 ? null : Math.min(...finiteValues),
      max: finiteValues.length === 0 ? null : Math.max(...finiteValues),
      dead: deadReasons.length > 0,
      deadReasons,
    }
  }).sort((left, right) => right.missingRate - left.missingRate || FEATURE_NAMES.indexOf(left.featureName) - FEATURE_NAMES.indexOf(right.featureName))
  const deadFeatureCount = features.filter((feature) => feature.dead).length
  return {
    verdict: deadFeatureCount === 0 ? 'all_features_live' : 'dead_features_present',
    deadFeatureCount,
    features,
  }
}

export function buildM1CalibrationDiagnosticReport(input: {
  readonly startDate: string
  readonly endDate: string
  readonly generatedAt: string
  readonly predictions: readonly EvalPredictionRow[]
  readonly featureRows: readonly BaselineFeatureRow[]
}): M1CalibrationDiagnosticReport {
  const eceVsSampleSize = computeEceVsSampleSize(input.predictions)
  const reliabilityCurve = buildReliabilityCurve(input.predictions)
  const featureLiveness = buildFeatureLivenessAudit(input.featureRows)
  return {
    reportVersion: M1_CALIBRATION_DIAGNOSTIC_REPORT_VERSION,
    generatedAt: input.generatedAt,
    startDate: input.startDate,
    endDate: input.endDate,
    totalPredictionRows: input.predictions.length,
    scoredPredictionRows: scoredRows(input.predictions).length,
    nonAbstainFeatureRows: input.featureRows.filter((row) => !row.abstain).length,
    sampleLimitVerdict: eceVsSampleSize.verdict,
    reliabilityVerdict: reliabilityCurve.verdict,
    featureLivenessVerdict: featureLiveness.verdict,
    eceVsSampleSize,
    reliabilityCurve,
    featureLiveness,
  }
}

const formatNumber = (value: number | null): string => (value === null || !Number.isFinite(value) ? 'n/a' : value.toFixed(6))

export function renderM1CalibrationDiagnosticMarkdown(report: M1CalibrationDiagnosticReport): string {
  const verdicts = [
    `- Sample-limit verdict: ${report.sampleLimitVerdict}`,
    `- Reliability verdict: ${report.reliabilityVerdict}`,
    `- Feature-liveness verdict: ${report.featureLivenessVerdict} (${report.featureLiveness.deadFeatureCount} dead features)`,
  ]
  const eceRows = report.eceVsSampleSize.rows.map((row) => (
    `| ${row.sampleLabel} | ${row.iterations} | ${formatNumber(row.meanEce)} | ${formatNumber(row.p025Ece)} | ${formatNumber(row.p975Ece)} |`
  ))
  const reliabilityRows = report.reliabilityCurve.bins.map((bin) => (
    `| ${bin.binLabel} | ${bin.count} | ${formatNumber(bin.meanPredictedProbability)} | ${formatNumber(bin.observedPositiveRate)} | ${formatNumber(bin.gap)} |`
  ))
  const featureRows = report.featureLiveness.features.map((feature) => (
    `| ${feature.featureName} | ${formatNumber(feature.missingRate)} | ${formatNumber(feature.variance)} | ${formatNumber(feature.zeroValueRate)} | ${formatNumber(feature.min)} | ${formatNumber(feature.max)} | ${feature.dead ? 'yes' : 'no'} | ${feature.deadReasons.join(', ') || 'n/a'} |`
  ))
  return [
    ['# TLI M1 Calibration Diagnostic', `Window: ${report.startDate} to ${report.endDate}`, `Generated at: ${report.generatedAt}`, `Rows: ${report.scoredPredictionRows} scored M1 predictions, ${report.nonAbstainFeatureRows} non-abstain feature rows`].join('\n\n'),
    ['## Verdicts', ...verdicts].join('\n\n'),
    ['## ECE vs Sample Size', '| n | iterations | mean ECE | p2.5 ECE | p97.5 ECE |', '| ---: | ---: | ---: | ---: | ---: |', ...eceRows].join('\n'),
    ['## Reliability Curve', `Monotonic observed rate: ${report.reliabilityCurve.monotonicObservedRate ? 'yes' : 'no'}`, `Largest absolute gap: ${report.reliabilityCurve.largestGap === null ? 'n/a' : `${report.reliabilityCurve.largestGap.binLabel} (${formatNumber(report.reliabilityCurve.largestGap.gap)})`}`, '| bin | count | mean predicted | observed positive rate | gap predicted-observed |', '| --- | ---: | ---: | ---: | ---: |', ...reliabilityRows].join('\n'),
    ['## Feature Liveness', '| feature | missing flag rate | variance | zero value rate | min | max | dead | reasons |', '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |', ...featureRows].join('\n'),
    '',
  ].join('\n\n')
}
