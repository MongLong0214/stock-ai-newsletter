/**
 * Supabase RPC wrappers for COR-016 fix:
 * Replace global-limit queries with paged per-theme window RPCs.
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

// ─── Limits (must match migration 063) ──────────────────────────────────────

/** `load_theme_score_windows`가 한 번에 받는 테마 수 상한. 호출부 청크 크기의 기준이다. */
export const THEME_SCORE_WINDOW_MAX_THEMES = 500

/** `load_latest_published_comparison_runs`가 한 번에 받는 테마 수 상한. */
export const COMPARISON_RUN_MAX_THEMES = 100

// One PostgREST page. A full page may be truncated at max_rows, so keep reading.
const SCORE_WINDOW_PAGE_SIZE = 1000

// ─── RPC: load_theme_score_windows ──────────────────────────────────────────

/**
 * Load lifecycle scores for multiple themes using the DB RPC function.
 * Returns: latest row per theme + recent rows since date + previous comparison row.
 * Pages through PostgREST max_rows=1000 so score rows are not silently omitted.
 *
 * @param supabase - Supabase client (anon, authenticated, or service_role)
 * @param themeIds - Array of theme UUIDs (max THEME_SCORE_WINDOW_MAX_THEMES)
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

  if (themeIds.length > THEME_SCORE_WINDOW_MAX_THEMES) {
    return {
      data: [],
      error: new Error(
        `load_theme_score_windows: exceeded ${THEME_SCORE_WINDOW_MAX_THEMES} theme limit`,
      ),
    }
  }

  try {
    const rows: ScoreWindowRow[] = []
    let from = 0
    for (;;) {
      const { data, error } = await supabase.rpc('load_theme_score_windows', {
        p_theme_ids: themeIds,
        p_recent_since: recentSince,
        ...(previousOnOrBefore != null ? { p_previous_on_or_before: previousOnOrBefore } : {}),
      }).range(from, from + SCORE_WINDOW_PAGE_SIZE - 1)

      if (error) {
        return { data: [], error: new Error(`load_theme_score_windows RPC failed: ${error.message}`) }
      }

      const page = (data ?? []) as ScoreWindowRow[]
      rows.push(...page)
      if (page.length < SCORE_WINDOW_PAGE_SIZE) break
      from += SCORE_WINDOW_PAGE_SIZE
    }

    return { data: rows, error: null }
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
 * @param themeIds - Array of theme UUIDs (max COMPARISON_RUN_MAX_THEMES)
 */
export async function loadLatestPublishedComparisonRuns(
  supabase: SupabaseClient,
  themeIds: string[],
): Promise<{ data: LatestComparisonRunRow[]; error: Error | null }> {
  if (themeIds.length === 0) {
    return { data: [], error: null }
  }

  if (themeIds.length > COMPARISON_RUN_MAX_THEMES) {
    return {
      data: [],
      error: new Error(
        `load_latest_published_comparison_runs: exceeded ${COMPARISON_RUN_MAX_THEMES} theme limit`,
      ),
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
