/**
 * COR-016 / PERF-004 integration contract: verify that critical API routes
 * use the load_theme_score_windows RPC instead of direct lifecycle_scores queries
 * with global row limits (which PostgREST caps at max_rows=1000).
 *
 * These tests read source code to verify the import and usage pattern.
 * They will FAIL (RED) until the call sites are wired to the RPC.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../../..')

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8')
}

describe('COR-016: call sites use load_theme_score_windows RPC', () => {
  it('changes/route.ts imports from the RPC module instead of direct .from("lifecycle_scores")', () => {
    const source = readSource('app/api/tli/changes/route.ts')
    // Must import the RPC function
    expect(source).toContain('loadThemeScoreWindows')
    // Must NOT use direct table query for the multi-theme fetch
    // (single-theme .eq('theme_id', ...) is acceptable, but .limit(5000) or generic bulk query is not)
    expect(source).not.toMatch(/\.from\(['"]lifecycle_scores['"]\)[\s\S]*?\.limit\(\s*\d{3,}/)
  })

  it('ranking/route.ts imports from the RPC module for score batch loading', () => {
    const source = readSource('app/api/tli/scores/ranking/route.ts')
    expect(source).toContain('loadThemeScoreWindows')
    // No more direct .from('lifecycle_scores').limit(1000) pattern
    expect(source).not.toMatch(/\.from\(['"]lifecycle_scores['"]\)[\s\S]*?\.limit\(\s*1000\s*\)/)
  })

  it('get-ranking-server.ts uses the RPC for score loading', () => {
    const source = readSource('app/themes/_services/get-ranking-server.ts')
    expect(source).toContain('loadThemeScoreWindows')
    expect(source).not.toMatch(/\.from\(['"]lifecycle_scores['"]\)[\s\S]*?\.limit\(\s*1000\s*\)/)
  })

  it('compare/route.ts uses loadThemeScoreWindows for lifecycle scores', () => {
    const source = readSource('app/api/tli/compare/route.ts')
    expect(source).toContain('loadThemeScoreWindows')
  })

  it('compare/route.ts uses loadLatestPublishedComparisonRuns for comparison run selection', () => {
    const source = readSource('app/api/tli/compare/route.ts')
    expect(source).toContain('loadLatestPublishedComparisonRuns')
    // The old pattern was: .from('theme_comparison_runs_v2').in(...).order(...)
    // After wiring, the multi-theme published run fetch should use the RPC
    expect(source).not.toMatch(
      /\.from\(['"]theme_comparison_runs_v2['"]\)[\s\S]*?\.in\(['"]current_theme_id['"][\s\S]*?\.eq\(['"]status['"],\s*['"]published['"]\)/
    )
  })
})

describe('공개 compare의 comparison run 공개 범위', () => {
  it('migration RPC가 published 및 publish_ready run만 선택한다', () => {
    const source = readSource('supabase/migrations/063_latest_per_theme_and_search_indexes.sql')
    const functionStart = source.indexOf('CREATE OR REPLACE FUNCTION public.load_latest_published_comparison_runs')
    const functionEnd = source.indexOf('$$;', functionStart)
    const functionSource = source.slice(functionStart, functionEnd)

    expect(functionStart).toBeGreaterThanOrEqual(0)
    expect(functionSource).toContain("r.status = 'published'")
    expect(functionSource).toContain('r.publish_ready = true')
  })
})

describe('PERF-004: trigram index is declared in migration 063', () => {
  it('migration creates pg_trgm GIN indexes on themes and theme_stocks', () => {
    const source = readSource('supabase/migrations/063_latest_per_theme_and_search_indexes.sql')
    expect(source).toContain('gin_trgm_ops')
    expect(source).toContain('idx_themes_active_name_trgm')
    expect(source).toContain('idx_themes_active_name_en_trgm')
    expect(source).toContain('idx_theme_stocks_active_name_trgm')
    expect(source).toContain('idx_theme_stocks_active_symbol_trgm')
  })
})
