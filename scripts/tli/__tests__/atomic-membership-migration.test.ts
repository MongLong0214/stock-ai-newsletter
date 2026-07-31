import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/062_atomic_membership_history.sql'

describe('atomic membership history migration', () => {
  it('locks expected open rows and performs close plus replacement inside one function transaction', async () => {
    const sql = await readFile(migrationPath, 'utf8')
    const functionBody = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.apply_theme_stock_membership_history_diff'),
      sql.indexOf('REVOKE ALL ON FUNCTION public.apply_theme_stock_membership_history_diff'),
    )

    expect(functionBody).toContain('SECURITY DEFINER')
    expect(functionBody).toContain('FOR UPDATE')
    expect(functionBody).toContain("RAISE EXCEPTION 'membership transition target is stale or mismatched")
    expect(functionBody).toContain('UPDATE public.theme_stock_membership_history')
    expect(functionBody).toContain('INSERT INTO public.theme_stock_membership_history')
    expect(functionBody).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT')
    expect(functionBody).toContain('RETURN QUERY SELECT v_opened, v_closed, v_appended')
  })

  it('is service-role-only and caps caller-provided operation count', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain("IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'")
    expect(sql).toContain('jsonb_array_length(v_opens) + jsonb_array_length(v_transitions) > 10000')
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.apply_theme_stock_membership_history_diff\(JSONB\)[\s\S]*?FROM PUBLIC, anon, authenticated/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.apply_theme_stock_membership_history_diff\(JSONB\)[\s\S]*?TO service_role/,
    )
  })
})
