import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/047_tli_membership_history.sql',
)

const TABLE = 'public.theme_stock_membership_history'

let sql = ''
let normalizedSql = ''
/** `--` 주석을 제거한 실행 SQL — 주석의 설명 문구가 금지 패턴 스캔을 오탐시키지 않게 한다 */
let executableSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
  executableSql = sql.replace(/^\s*--.*$/gm, '')
})

function tableBody(): string {
  const match = normalizedSql.match(
    new RegExp(`CREATE TABLE ${TABLE.replace('.', '\\.')} \\((.*?)\\);`),
  )
  expect(match, `missing CREATE TABLE ${TABLE}`).not.toBeNull()
  return match?.[1] ?? ''
}

describe('TLI membership history migration', () => {
  it('applies the whole bitemporal contract atomically', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
    expect([...normalizedSql.matchAll(/CREATE TABLE public\.([a-z_]+) \(/g)]
      .map(([, name]) => name)).toEqual(['theme_stock_membership_history'])
  })

  it('defines the exact plan columns in the exact plan order', () => {
    const body = tableBody()
    const columns = [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      'theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT',
      'symbol VARCHAR(20) NOT NULL',
      'valid_from DATE NOT NULL',
      'valid_to DATE',
      'recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      'superseded_at TIMESTAMPTZ',
      "source VARCHAR(20) NOT NULL DEFAULT 'naver'",
      'collection_run_id UUID REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT',
      'relevance NUMERIC(3,2)',
      'market VARCHAR(10)',
    ]

    let cursor = -1
    for (const column of columns) {
      const index = body.indexOf(column)
      expect(index, `missing or out-of-order column: ${column}`).toBeGreaterThan(cursor)
      cursor = index
    }
  })

  it('constrains business time and system-known time intervals', () => {
    const body = tableBody()
    expect(body).toContain('CHECK (valid_to IS NULL OR valid_to > valid_from)')
    expect(body).toContain('CHECK (superseded_at IS NULL OR superseded_at >= recorded_at)')
  })

  it('allows exactly one system-current open version per mapping', () => {
    expect(normalizedSql).toContain(
      `CREATE UNIQUE INDEX uniq_theme_stock_membership_history_open ON ${TABLE} (theme_id, symbol) WHERE valid_to IS NULL AND superseded_at IS NULL`,
    )
    expect(normalizedSql).toContain(
      `CREATE UNIQUE INDEX uniq_theme_stock_membership_history_current_version ON ${TABLE} (theme_id, symbol, valid_from) WHERE superseded_at IS NULL`,
    )
  })

  it('indexes both as-of predicates', () => {
    expect(normalizedSql).toContain(
      `CREATE INDEX idx_theme_stock_membership_history_theme_valid ON ${TABLE} (theme_id, valid_from, valid_to)`,
    )
    expect(normalizedSql).toContain(
      `CREATE INDEX idx_theme_stock_membership_history_recorded ON ${TABLE} (recorded_at, superseded_at)`,
    )
  })

  it('is private and service-role only', () => {
    expect(normalizedSql).toContain(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`)
    expect(normalizedSql).toContain(
      `CREATE POLICY service_role_all_theme_stock_membership_history ON ${TABLE} FOR ALL TO service_role USING (true) WITH CHECK (true)`,
    )
    expect(normalizedSql).toContain(`REVOKE ALL ON TABLE ${TABLE} FROM PUBLIC, anon, authenticated`)
    expect(normalizedSql).not.toMatch(/TO anon/)
  })

  it('rejects every delete and truncate', () => {
    expect(normalizedSql).toContain(`BEFORE DELETE OR TRUNCATE ON ${TABLE} FOR EACH STATEMENT`)
    expect(normalizedSql).toMatch(
      /reject_theme_stock_membership_history_removal[\s\S]*?RAISE EXCEPTION 'theme_stock_membership_history is append-only[\s\S]*?ERRCODE = '42501'/,
    )
  })

  it('permits only a one-time close and rejects field edits, rewrites, and reopens', () => {
    expect(normalizedSql).toContain(`BEFORE UPDATE ON ${TABLE} FOR EACH ROW`)

    const guard = normalizedSql.match(
      /CREATE OR REPLACE FUNCTION public\.enforce_theme_stock_membership_history_close_only\([\s\S]*?\$\$;/,
    )?.[0] ?? ''
    expect(guard).not.toBe('')

    // every immutable field is compared
    for (const column of [
      'id', 'theme_id', 'symbol', 'valid_from', 'recorded_at',
      'source', 'collection_run_id', 'relevance', 'market',
    ]) {
      expect(guard).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`)
    }
    // valid_to / superseded_at are never in the immutable-field guard: they are the close targets
    expect(guard).not.toContain('NEW.valid_to IS DISTINCT FROM OLD.valid_to OR')
    expect(guard).not.toContain('NEW.superseded_at IS DISTINCT FROM OLD.superseded_at OR')

    // close timestamp rewrite + reopen
    expect(guard).toContain('IF OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN')
    expect(guard).toContain('IF OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN')

    // a no-op update is not a close
    expect(guard).toContain('IF NEW.valid_to IS NOT DISTINCT FROM OLD.valid_to AND NEW.superseded_at IS NOT DISTINCT FROM OLD.superseded_at THEN')

    expect([...guard.matchAll(/ERRCODE = '42501'/g)]).toHaveLength(4)
  })

  it('fabricates no history and touches no other table', () => {
    expect(executableSql).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(executableSql).not.toMatch(/\bUPDATE\s+public\./i)
    expect(executableSql).not.toMatch(/\bDROP\b/i)
    expect(executableSql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(executableSql).not.toMatch(/\bTRUNCATE\s+TABLE\b/i)
    expect(executableSql).not.toMatch(/ALTER\s+TABLE\s+public\.(?:theme_stocks|interest_metrics|news_metrics|theme_labels|theme_predictions_v3|model_registry)/i)
    // backfilling the unknown pre-history from the current cache is the exact banned move
    expect(executableSql).not.toMatch(/\btheme_stocks\b/i)
    expect(executableSql).not.toMatch(/\bcreated_at\b/i)
    expect(executableSql).not.toMatch(/\bis_active\b/i)
  })
})
