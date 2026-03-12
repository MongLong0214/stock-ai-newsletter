import type { Level4CertificationSourceSurface } from '@/lib/tli/comparison/level4-types'
import { assignRollingOriginFolds, clusterBootstrapPairedDelta } from '@/lib/tli/stats/comparison-stats'

export interface WeightTuningCandidateRow {
  run_id: string
  run_date: string
  candidate_theme_id: string
  feature_sim: number
  curve_sim: number
  keyword_sim: number
  curve_bucket?: 'gte14' | 'gte7' | 'lt7'
  sector_match: boolean
  binary_relevant: boolean
  censored_reason: string | null
}

export interface WeightTuningConfig {
  weight_version: string
  source_surface: Level4CertificationSourceSurface
  w_feature: number
  w_curve: number
  w_keyword: number
  sector_penalty: number
  curve_bucket_policy?: Record<string, unknown>
  validation_metric_summary?: Record<string, unknown>
  ci_lower?: number
  ci_upper?: number
}

export function generateWeightGridCandidates(input: {
  sourceSurface: Level4CertificationSourceSurface
  weightVersionPrefix: string
}) {
  const configs: WeightTuningConfig[] = [
    {
      weight_version: `${input.weightVersionPrefix}-baseline`,
      source_surface: input.sourceSurface,
      w_feature: 0.4,
      w_curve: 0.6,
      w_keyword: 0,
      sector_penalty: 0.85,
    },
  ]

  const keywordWeights = [0, 0.05, 0.1, 0.15]
  const featureWeights = [0.25, 0.35, 0.45, 0.55, 0.65]
  const sectorPenalties = [0.85, 0.9, 0.95]

  let index = 0
  for (const wKeyword of keywordWeights) {
    for (const wFeature of featureWeights) {
      const remaining = 1 - wKeyword - wFeature
      if (remaining < 0) continue
      const wCurve = Number(remaining.toFixed(2))
      for (const sectorPenalty of sectorPenalties) {
        configs.push({
          weight_version: `${input.weightVersionPrefix}-${String(index).padStart(2, '0')}`,
          source_surface: input.sourceSurface,
          w_feature: Number(wFeature.toFixed(2)),
          w_curve: wCurve,
          w_keyword: Number(wKeyword.toFixed(2)),
          sector_penalty: sectorPenalty,
        })
        index += 1
      }
    }
  }

  return configs.filter((config, idx, array) =>
    array.findIndex((candidate) =>
      candidate.w_feature === config.w_feature
      && candidate.w_curve === config.w_curve
      && candidate.w_keyword === config.w_keyword
      && candidate.sector_penalty === config.sector_penalty,
    ) === idx,
  )
}

interface RunMetricSummary {
  runId: string
  runDate: string
  evidenceWeight: number
  reciprocalRank: number
  ndcg: number
  precisionAt3: number
}

interface WeightConfigEvaluation {
  weight_version: string
  mrr: number
  ndcg: number
  precisionAt3: number
  totalCandidates: number
  perRunMetrics: RunMetricSummary[]
}

function groupRowsByRun(rows: WeightTuningCandidateRow[]) {
  const grouped = new Map<string, WeightTuningCandidateRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.run_id) || []
    list.push(row)
    grouped.set(row.run_id, list)
  }
  return grouped
}

export function computeRunEvidenceWeight(input: {
  totalCandidates: number
  evaluatedCandidates: number
}) {
  if (input.totalCandidates <= 0) return 0
  return input.evaluatedCandidates / input.totalCandidates
}

function scoreRow(row: WeightTuningCandidateRow, config: WeightTuningConfig) {
  const bucketWeights = row.curve_bucket && config.curve_bucket_policy
    ? config.curve_bucket_policy[row.curve_bucket] as { w_feature: number; w_curve: number; w_keyword: number } | undefined
    : undefined

  const wFeature = bucketWeights?.w_feature ?? config.w_feature
  const wCurve = bucketWeights?.w_curve ?? config.w_curve
  const wKeyword = bucketWeights?.w_keyword ?? config.w_keyword

  const totalWeight = wFeature + wCurve + wKeyword
  const normalizedTotal = totalWeight > 0 ? totalWeight : 1
  const raw = (
    wFeature * row.feature_sim
    + wCurve * row.curve_sim
    + wKeyword * row.keyword_sim
  ) / normalizedTotal
  return raw * (row.sector_match ? 1 : config.sector_penalty)
}

function computeNdcg(sortedRows: WeightTuningCandidateRow[]) {
  const gains = sortedRows.map((row, index) => {
    if (!row.binary_relevant) return 0
    return 1 / Math.log2(index + 2)
  })
  const dcg = gains.reduce((sum, value) => sum + value, 0)
  const idealRelevantCount = sortedRows.filter((row) => row.binary_relevant).length
  const idealDcg = Array.from({ length: idealRelevantCount }, (_, index) => 1 / Math.log2(index + 2))
    .reduce((sum, value) => sum + value, 0)
  return idealDcg > 0 ? dcg / idealDcg : 0
}

export function evaluateWeightConfigAcrossRuns(
  rows: WeightTuningCandidateRow[],
  config: WeightTuningConfig,
): WeightConfigEvaluation {
  const perRunMetrics: RunMetricSummary[] = []
  const grouped = groupRowsByRun(rows)

  for (const [runId, runRows] of grouped.entries()) {
    const evaluatedRows = runRows.filter((row) => row.censored_reason == null)
    const sortedRows = [...evaluatedRows].sort((a, b) => scoreRow(b, config) - scoreRow(a, config))
    const evidenceWeight = computeRunEvidenceWeight({
      totalCandidates: runRows.length,
      evaluatedCandidates: evaluatedRows.length,
    })
    const firstRelevantIndex = sortedRows.findIndex((row) => row.binary_relevant)
    const reciprocalRank = firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0
    const precisionAt3 = sortedRows.length > 0
      ? sortedRows.slice(0, 3).filter((row) => row.binary_relevant).length / Math.min(3, sortedRows.length)
      : 0

    perRunMetrics.push({
      runId,
      runDate: runRows[0]?.run_date || '',
      evidenceWeight,
      reciprocalRank,
      ndcg: computeNdcg(sortedRows),
      precisionAt3,
    })
  }

  const totalWeight = perRunMetrics.reduce((sum, row) => sum + row.evidenceWeight, 0)
  const safeDivisor = totalWeight > 0 ? totalWeight : 1

  return {
    weight_version: config.weight_version,
    mrr: perRunMetrics.length > 0 ? perRunMetrics.reduce((sum, row) => sum + row.reciprocalRank * row.evidenceWeight, 0) / safeDivisor : 0,
    ndcg: perRunMetrics.length > 0 ? perRunMetrics.reduce((sum, row) => sum + row.ndcg * row.evidenceWeight, 0) / safeDivisor : 0,
    precisionAt3: perRunMetrics.length > 0 ? perRunMetrics.reduce((sum, row) => sum + row.precisionAt3 * row.evidenceWeight, 0) / safeDivisor : 0,
    totalCandidates: rows.length,
    perRunMetrics,
  }
}

function buildFoldRunIds(rows: WeightTuningCandidateRow[], minFolds: number) {
  const runSummaries = [...groupRowsByRun(rows).entries()].map(([runId, runRows]) => ({
    runId,
    runDate: runRows[0]?.run_date || '',
  }))

  if (minFolds <= 1 || runSummaries.length < 4) {
    return [runSummaries.map((run) => run.runId)]
  }

  return assignRollingOriginFolds(runSummaries, minFolds)
    .map((fold) => fold.test.map((run) => run.runId))
    .filter((runIds) => runIds.length > 0)
}

export function runWeightGridSearch(input: {
  rows: WeightTuningCandidateRow[]
  candidateConfigs: WeightTuningConfig[]
  baselineConfig: WeightTuningConfig
  minFolds?: number
  bootstrapIterations?: number
}) {
  const foldRunIds = buildFoldRunIds(input.rows, input.minFolds ?? 3)
  const evaluations = input.candidateConfigs.map((config) => evaluateWeightConfigAcrossRuns(input.rows, config))
  const baselineEvaluation = evaluateWeightConfigAcrossRuns(input.rows, input.baselineConfig)

  const scoredCandidates = input.candidateConfigs.map((config) => {
    const candidateRows = foldRunIds.flatMap((runIds) => {
      const baselineMetrics = baselineEvaluation.perRunMetrics.filter((row) => runIds.includes(row.runId))
      const candidateMetrics = evaluateWeightConfigAcrossRuns(
        input.rows.filter((row) => runIds.includes(row.run_id)),
        config,
      ).perRunMetrics

      return candidateMetrics.map((metric) => {
        const baselineMetric = baselineMetrics.find((row) => row.runId === metric.runId)
        return {
          metric,
          baselineMetric,
        }
      }).filter((row): row is { metric: RunMetricSummary; baselineMetric: RunMetricSummary } => row.baselineMetric != null)
    })

    const mrrDelta = clusterBootstrapPairedDelta(
      candidateRows.map((row) => ({
        clusterId: row.metric.runId,
        id: `${row.metric.runId}:mrr`,
        baseline: row.baselineMetric.reciprocalRank,
        candidate: row.metric.reciprocalRank,
      })),
      { iterations: input.bootstrapIterations ?? 1000 },
    )
    const ndcgDelta = clusterBootstrapPairedDelta(
      candidateRows.map((row) => ({
        clusterId: row.metric.runId,
        id: `${row.metric.runId}:ndcg`,
        baseline: row.baselineMetric.ndcg,
        candidate: row.metric.ndcg,
      })),
      { iterations: input.bootstrapIterations ?? 1000 },
    )
    const precisionAt3Delta = clusterBootstrapPairedDelta(
      candidateRows.map((row) => ({
        clusterId: row.metric.runId,
        id: `${row.metric.runId}:precisionAt3`,
        baseline: row.baselineMetric.precisionAt3,
        candidate: row.metric.precisionAt3,
      })),
      { iterations: input.bootstrapIterations ?? 1000 },
    )

    return {
      ...config,
      ci_lower: mrrDelta.lower,
      ci_upper: mrrDelta.upper,
      validation_metric_summary: {
        mrr: { meanDelta: mrrDelta.meanDelta, lower: mrrDelta.lower, upper: mrrDelta.upper },
        ndcg: { meanDelta: ndcgDelta.meanDelta, lower: ndcgDelta.lower, upper: ndcgDelta.upper },
        precisionAt3: {
          meanDelta: precisionAt3Delta.meanDelta,
          lower: precisionAt3Delta.lower,
          upper: precisionAt3Delta.upper,
        },
      },
    }
  }).sort((a, b) => {
    const left = (a.validation_metric_summary as { mrr: { meanDelta: number } }).mrr.meanDelta
    const right = (b.validation_metric_summary as { mrr: { meanDelta: number } }).mrr.meanDelta
    return right - left
  })

  return {
    baselineEvaluation,
    evaluations,
    selectedConfig: scoredCandidates[0],
  }
}

export function renderWeightTuningReport(input: {
  baselineEvaluation: WeightConfigEvaluation
  evaluations: WeightConfigEvaluation[]
  selectedConfig: WeightTuningConfig & {
    ci_lower?: number
    ci_upper?: number
    validation_metric_summary: {
      mrr: { meanDelta: number; lower: number; upper: number }
      ndcg: { meanDelta: number; lower: number; upper: number }
      precisionAt3: { meanDelta: number; lower: number; upper: number }
    }
  }
}) {
  return [
    '# Level-4 Weight Tuning Report',
    '',
    `Selected Weight Version: ${input.selectedConfig.weight_version}`,
    `Baseline MRR: ${input.baselineEvaluation.mrr.toFixed(4)}`,
    `Selected Delta MRR: ${input.selectedConfig.validation_metric_summary.mrr.meanDelta.toFixed(4)}`,
    `Selected Delta NDCG: ${input.selectedConfig.validation_metric_summary.ndcg.meanDelta.toFixed(4)}`,
    `Selected Delta Precision@3: ${input.selectedConfig.validation_metric_summary.precisionAt3.meanDelta.toFixed(4)}`,
    `CI: [${input.selectedConfig.ci_lower}, ${input.selectedConfig.ci_upper}]`,
  ].join('\n')
}
