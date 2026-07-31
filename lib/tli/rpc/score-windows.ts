/**
 * Supabase RPC wrappers for COR-016 fix:
 * Replace global-limit queries with per-theme window RPCs to bypass PostgREST max_rows=1000.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScoreWindowRow {
  readonly id: string
  readonly theme_id: string
  readonly score: number
  readonly stage: string
  readonly is_reigniting: boolean
  readonly calculated_at: string
  readonly components: unknown
}

export interface LatestComparisonRunRow {
  readonly id: string
  readonly current_theme_id: string
  readonly created_at: string
}

// ─── RPC: load_theme_score_windows ──────────────────────────────────────────

/**
 * Load lifecycle scores for multiple themes using the DB RPC function.
 * Returns: latest row per theme + recent rows since date + previous comparison row.
 * Bypasses PostgREST max_rows=1000 that causes theme omission (COR-016).
 *
 * @param supabase - Supabase client (anon, authenticated, or service_role)
 * @param themeIds - Array of theme UUIDs (max 500)
 * @param recentSince - Date string (YYYY-MM-DD) for the recent window start
 * @param previousOnOrBefore - Optional date for the comparison point (defaults to recentSince)
 */
export async function loadThemeScoreWindows(
  supabase: SupabaseClient,
  themeIds: string[],
  recentSince: string,
  previousOnOrBefore?: string,
): Promise<{ data: ScoreWindowRow[]; error: Error | null }> {
  if (themeIds.length === 0) {
    return { data: [], error: null }
  }

  if (themeIds.length > 500) {
    return {
      data: [],
      error: new Error('load_theme_score_windows: exceeded 500 theme limit'),
    }
  }

  try {
    const { data, error } = await supabase.rpc('load_theme_score_windows', {
      p_theme_ids: themeIds,
      p_recent_since: recentSince,
      ...(previousOnOrBefore != null ? { p_previous_on_or_before: previousOnOrBefore } : {}),
    })

    if (error) {
      return { data: [], error: new Error(`load_theme_score_windows RPC failed: ${error.message}`) }
    }

    return { data: (data ?? []) as ScoreWindowRow[], error: null }
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

// ─── RPC: load_latest_published_comparison_runs ─────────────────────────────

/**
 * Load the latest published comparison run per theme.
 * Bypasses PostgREST max_rows=1000 for multi-theme comparison queries (COR-016).
 *
 * @param supabase - Supabase client
 * @param themeIds - Array of theme UUIDs (max 100)
 */
export async function loadLatestPublishedComparisonRuns(
  supabase: SupabaseClient,
  themeIds: string[],
): Promise<{ data: LatestComparisonRunRow[]; error: Error | null }> {
  if (themeIds.length === 0) {
    return { data: [], error: null }
  }

  if (themeIds.length > 100) {
    return {
      data: [],
      error: new Error('load_latest_published_comparison_runs: exceeded 100 theme limit'),
    }
  }

  try {
    const { data, error } = await supabase.rpc('load_latest_published_comparison_runs', {
      p_theme_ids: themeIds,
    })

    if (error) {
      return { data: [], error: new Error(`load_latest_published_comparison_runs RPC failed: ${error.message}`) }
    }

    return { data: (data ?? []) as LatestComparisonRunRow[], error: null }
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}
