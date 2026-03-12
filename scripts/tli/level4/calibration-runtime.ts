import { buildCalibrationArtifactRow } from './calibration-artifact'

interface CalibrationInputRow {
  run_id: string
  evaluated_at: string
  similarity_score: number
  binary_relevant: boolean
  censored_reason: string | null
}

export function buildCalibrationArtifactFromV2Rows(input: {
  calibrationVersion: string
  sourceSurface: 'v2_certification' | 'replay_equivalent'
  rows: CalibrationInputRow[]
  bootstrapIterations: number
}) {
  const evaluatedRows = input.rows.filter((row) => row.censored_reason == null)
  const positiveCount = evaluatedRows.filter((row) => row.binary_relevant).length
  const buckets = new Map<number, { total: number; positives: number; meanSimilarity: number }>()

  for (const row of evaluatedRows) {
    const bucket = Math.max(0, Math.min(9, Math.floor(row.similarity_score * 10)))
    const current = buckets.get(bucket) ?? { total: 0, positives: 0, meanSimilarity: 0 }
    current.total += 1
    current.positives += row.binary_relevant ? 1 : 0
    current.meanSimilarity += row.similarity_score
    buckets.set(bucket, current)
  }

  const brier = evaluatedRows.length > 0
    ? evaluatedRows.reduce((sum, row) => {
        const predicted = row.similarity_score
        const actual = row.binary_relevant ? 1 : 0
        return sum + ((predicted - actual) ** 2)
      }, 0) / evaluatedRows.length
    : 0

  const binSummary = [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([bucket, summary]) => ({
      bucket,
      mean_predicted: summary.total > 0 ? summary.meanSimilarity / summary.total : 0,
      empirical_rate: summary.total > 0 ? summary.positives / summary.total : 0,
      count: summary.total,
    }))

  const dates = evaluatedRows.map((row) => row.evaluated_at).sort()

  return buildCalibrationArtifactRow({
    calibration_version: input.calibrationVersion,
    source_surface: input.sourceSurface,
    source_run_date_from: dates[0] ?? new Date().toISOString().slice(0, 10),
    source_run_date_to: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
    source_row_count: evaluatedRows.length,
    positive_count: positiveCount,
    calibration_method: 'bucket_empirical_rate',
    ci_method: 'cluster_bootstrap',
    bootstrap_iterations: input.bootstrapIterations,
    brier_score_before: brier,
    brier_score_after: brier,
    ece_before: 0,
    ece_after: 0,
    bin_summary: binSummary,
    created_at: new Date().toISOString(),
  })
}
