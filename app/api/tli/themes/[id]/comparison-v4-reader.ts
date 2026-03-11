import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import { resolveComparisonV4ServingVersion } from '@/scripts/tli/comparison-v4-control'

export const DEFAULT_COMPARISON_V4_SERVING_VERSION = 'latest'

export interface PublishedComparisonRun {
  id: string
  candidate_pool: string
  publish_ready: boolean
  status: string
  created_at: string
  algorithm_version: string
}

interface ComparisonV2CandidateRow {
  candidate_theme_id: string
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

export function isComparisonV4ServingEnabled() {
  return process.env.TLI_COMPARISON_V4_SERVING_ENABLED === 'true'
}

export function getComparisonV4ReaderMode(): 'view' | 'table' {
  return process.env.TLI_COMPARISON_V4_SERVING_VIEW === 'true' ? 'view' : 'table'
}

export function getComparisonV4ServingVersion() {
  return process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION || DEFAULT_COMPARISON_V4_SERVING_VERSION
}

export function selectPublishedComparisonRun(
  runs: PublishedComparisonRun[],
  algorithmVersion = DEFAULT_COMPARISON_V4_SERVING_VERSION,
) {
  const eligible = runs
    .filter((run) => run.candidate_pool === 'archetype' && run.publish_ready && run.status === 'published')
    .filter((run) => algorithmVersion === DEFAULT_COMPARISON_V4_SERVING_VERSION || run.algorithm_version === algorithmVersion)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return eligible[0] ?? null
}

export function mapV2CandidatesToLegacyComparisons(rows: ComparisonV2CandidateRow[]) {
  return rows.map((row) => ({
    id: row.candidate_theme_id,
    past_theme_id: row.candidate_theme_id,
    similarity_score: row.similarity_score,
    current_day: row.current_day,
    past_peak_day: row.past_peak_day,
    past_total_days: row.past_total_days,
    message: row.message,
    feature_sim: row.feature_sim,
    curve_sim: row.curve_sim,
    keyword_sim: row.keyword_sim,
    past_peak_score: row.past_peak_score,
    past_final_stage: row.past_final_stage,
    past_decline_days: row.past_decline_days,
  }))
}

async function fetchFromServingView(themeId: string) {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('v_comparison_v4_serving')
    .select('candidate_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
    .eq('theme_id', themeId)
    .order('rank', { ascending: true })
    .limit(3)

  if (error) return { data: null, error }
  return {
    data: mapV2CandidatesToLegacyComparisons((data || []) as ComparisonV2CandidateRow[]),
    error: null,
  }
}

export async function fetchPublishedComparisonRowsV4(themeId: string) {
  // view mode: use the pre-filtered serving view (anon-safe)
  if (getComparisonV4ReaderMode() === 'view') {
    return fetchFromServingView(themeId)
  }

  const supabase = getServerSupabaseClient()
  let controlRow: { production_version: string; serving_enabled: boolean } | null = null
  try {
    const { data } = await supabase
      .from('comparison_v4_control')
      .select('production_version, serving_enabled')
      .eq('serving_enabled', true)
      .order('promoted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    controlRow = data ?? null
  } catch {
    controlRow = null
  }
  const algorithmVersion = resolveComparisonV4ServingVersion({
    envVersion: process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION,
    controlRow,
  })

  const { data: runs, error: runError } = await supabase
    .from('theme_comparison_runs_v2')
    .select('id, candidate_pool, publish_ready, status, created_at, algorithm_version')
    .eq('current_theme_id', themeId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (runError) {
    return { data: null, error: runError }
  }

  const selected = selectPublishedComparisonRun((runs || []) as PublishedComparisonRun[], algorithmVersion)
  if (!selected) {
    return { data: [], error: null }
  }

  const { data, error } = await supabase
    .from('theme_comparison_candidates_v2')
    .select('candidate_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
    .eq('run_id', selected.id)
    .order('rank', { ascending: true })
    .limit(3)

  if (error) {
    return { data: null, error }
  }

  return {
    data: mapV2CandidatesToLegacyComparisons((data || []) as ComparisonV2CandidateRow[]),
    error: null,
  }
}
