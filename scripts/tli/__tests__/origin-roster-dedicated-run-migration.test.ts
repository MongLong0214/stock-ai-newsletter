import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/061_tli_origin_roster_dedicated_runs.sql', 'utf8')
const normalizedSql = sql.replace(/\s+/g, ' ').trim()

describe('origin roster dedicated-run migration', () => {
  it('atomically replaces only the roster function', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
    expect(normalizedSql).toContain('CREATE OR REPLACE FUNCTION public.tli_origin_roster(p_origin_date DATE)')
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
  })

  it('requires exactly one non-anchor keyword group in addition to one observed theme', () => {
    expect(normalizedSql).toContain('HAVING count(DISTINCT observation.theme_id) = 1')
    expect(normalizedSql).toContain("FROM jsonb_array_elements(run.request_payload->'keywordGroups') AS g")
    expect(normalizedSql).toContain("WHERE g->>'groupName' IS DISTINCT FROM '__tli_anchor__' ) = 1")
  })

  it('restores the 059 execution grants and function comment', () => {
    expect(normalizedSql).toContain('REVOKE EXECUTE ON FUNCTION public.tli_origin_roster(DATE) FROM PUBLIC, anon, authenticated')
    expect(normalizedSql).toContain('GRANT EXECUTE ON FUNCTION public.tli_origin_roster(DATE) TO service_role')
    expect(normalizedSql).toContain('COMMENT ON FUNCTION public.tli_origin_roster(DATE) IS')
  })
})
