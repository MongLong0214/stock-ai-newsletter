import { computeDeterministicParitySampleSize } from './comparison-v4-manifest'
import type { ThemeComparisonCandidateV2 } from '../../lib/tli/types/db'

export function buildBackfillExecutionPlan(input: {
  sourceTable: string
  sourceRowCount: number
}) {
  return {
    sourceTable: input.sourceTable,
    sampleSize: computeDeterministicParitySampleSize(input.sourceRowCount),
  }
}

// ── Row-Level Remap ──

interface LegacyComparisonRow {
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
}

export function remapLegacyRowToV2Candidate(input: {
  runId: string
  rank: number
  legacy: LegacyComparisonRow
}): ThemeComparisonCandidateV2 {
  const { legacy } = input
  const estimatedDaysToPeak = Math.max(0, legacy.past_peak_day - legacy.current_day)

  return {
    run_id: input.runId,
    candidate_theme_id: legacy.past_theme_id,
    rank: input.rank,
    similarity_score: legacy.similarity_score,
    feature_sim: legacy.feature_sim,
    curve_sim: legacy.curve_sim,
    keyword_sim: legacy.keyword_sim,
    current_day: legacy.current_day,
    past_peak_day: legacy.past_peak_day,
    past_total_days: legacy.past_total_days,
    estimated_days_to_peak: estimatedDaysToPeak,
    message: legacy.message ?? '',
    past_peak_score: legacy.past_peak_score,
    past_final_stage: legacy.past_final_stage,
    past_decline_days: legacy.past_decline_days,
    is_selected_top3: input.rank <= 3,
  }
}

// ── Null/Default Mapping Report ──

const NULLABLE_FIELDS = ['curve_sim', 'keyword_sim', 'past_peak_score', 'past_final_stage', 'past_decline_days'] as const
const DEFAULTED_FIELDS = ['message'] as const

interface NullMappingReport {
  totalRows: number
  nullCounts: Record<string, number>
  defaultCounts: Record<string, number>
}

export function buildNullMappingReport(rows: ThemeComparisonCandidateV2[]): NullMappingReport {
  const nullCounts: Record<string, number> = {}
  const defaultCounts: Record<string, number> = {}

  for (const field of NULLABLE_FIELDS) nullCounts[field] = 0
  for (const field of DEFAULTED_FIELDS) defaultCounts[field] = 0

  for (const row of rows) {
    for (const field of NULLABLE_FIELDS) {
      if (row[field] == null) nullCounts[field]++
    }
    for (const field of DEFAULTED_FIELDS) {
      if (row[field] === '') defaultCounts[field]++
    }
  }

  return { totalRows: rows.length, nullCounts, defaultCounts }
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
