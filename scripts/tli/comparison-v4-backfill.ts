import { computeDeterministicParitySampleSize } from './comparison-v4-manifest'

export function buildBackfillExecutionPlan(input: {
  sourceTable: string
  sourceRowCount: number
}) {
  return {
    sourceTable: input.sourceTable,
    sampleSize: computeDeterministicParitySampleSize(input.sourceRowCount),
  }
}

export function normalizeLegacyComparisonForParity(row: {
  id: string
  past_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  message: string | null
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  past_peak_score: number | null
  past_final_stage: string | null
  past_decline_days: number | null
}) {
  return {
    id: row.id,
    past_theme_id: row.past_theme_id,
    similarity_score: row.similarity_score,
    current_day: row.current_day,
    past_peak_day: row.past_peak_day,
    past_total_days: row.past_total_days,
    message: row.message ?? '',
    feature_sim: row.feature_sim ?? null,
    curve_sim: row.curve_sim ?? null,
    keyword_sim: row.keyword_sim ?? null,
    past_peak_score: row.past_peak_score ?? null,
    past_final_stage: row.past_final_stage ?? null,
    past_decline_days: row.past_decline_days ?? null,
  }
}
