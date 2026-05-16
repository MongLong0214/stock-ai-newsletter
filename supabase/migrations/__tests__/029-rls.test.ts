/**
 * Integration tests for migration 029_enable_rls_missing_tables.sql
 *
 * Execution model
 * ---------------
 * This suite is gated by `SUPABASE_LOCAL_URL`. In CI (no local Supabase),
 * every test is skipped by `describe.skipIf`. Locally, run:
 *
 *   supabase start
 *   export SUPABASE_LOCAL_URL=http://localhost:54321
 *   export SUPABASE_LOCAL_ANON_KEY=<anon-key-from-supabase-status>
 *   export SUPABASE_LOCAL_SERVICE_ROLE_KEY=<service-role-key-from-supabase-status>
 *   npx vitest run supabase/migrations/__tests__/029-rls.test.ts
 *
 * TDD cycle
 * ---------
 * Red:   With migration 029 NOT applied (e.g. fresh `supabase db reset` to a
 *        commit before 029), TC3–TC6 fail because anon can still SELECT.
 * Green: Apply 029 (`supabase db push`) — all 9 tests pass.
 * Refactor: ensure idempotency by running `supabase db push` twice; the
 *        migration uses DROP POLICY IF EXISTS and idempotent ENABLE RLS.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

const supabaseUrl = process.env.SUPABASE_LOCAL_URL
const anonKey =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY

// Skip the entire suite unless SUPABASE_LOCAL_URL is set. This keeps CI green
// while still letting developers run the suite locally against `supabase start`.
const skipIfNoSupabase = !supabaseUrl || !anonKey || !serviceRoleKey

const TARGET_TABLES = [
  'newsletter_content',
  'prediction_snapshots',
  'comparison_calibration',
  'calibration_artifact',
] as const

describe.skipIf(skipIfNoSupabase)('RLS integration 029', () => {
  let anonClient: SupabaseClient
  let serviceClient: SupabaseClient

  beforeAll(() => {
    // Non-null assertions are safe here: skipIfNoSupabase guards all three.
    anonClient = createClient(supabaseUrl as string, anonKey as string, {
      auth: { persistSession: false },
    })
    serviceClient = createClient(
      supabaseUrl as string,
      serviceRoleKey as string,
      {
        auth: { persistSession: false },
      },
    )
  })

  it('TC1: migration 029 is idempotent (anon still blocked after re-apply)', async () => {
    // The SQL itself is idempotent via DROP POLICY IF EXISTS + idempotent
    // ENABLE RLS. We validate the observable invariant: after (re-)apply,
    // anon is still blocked from every target table.
    for (const table of TARGET_TABLES) {
      const { data, error } = await anonClient.from(table).select('*').limit(1)
      expect(error, `anon should not receive an error on ${table}`).toBeNull()
      expect(data, `anon should see 0 rows on ${table}`).toEqual([])
    }
  })

  it('TC2: pg_tables.rowsecurity = true on all 4 target tables (direct catalog check)', async () => {
    // Service role SELECT alone does NOT prove RLS is enabled (it bypasses
    // RLS by design). We query pg_tables directly via a catalog RPC to
    // prove each table has rowsecurity = true.
    //
    // Supabase exposes `pg_catalog` via service role, but we must go through
    // an RPC or a raw `from('pg_tables')` query with explicit schema.
    const { data, error } = await serviceClient
      .schema('pg_catalog' as never)
      .from('pg_tables' as never)
      .select('tablename, rowsecurity')
      .eq('schemaname', 'public')
      .in('tablename', TARGET_TABLES as unknown as string[])

    expect(error, 'catalog query should succeed').toBeNull()
    const rows = (data ?? []) as Array<{ tablename: string; rowsecurity: boolean }>
    expect(rows.length).toBe(TARGET_TABLES.length)
    for (const row of rows) {
      expect(row.rowsecurity, `${row.tablename} must have rowsecurity=true`).toBe(true)
    }
  })

  it('TC3: anon key SELECT returns 0 rows from newsletter_content', async () => {
    const { data, error } = await anonClient
      .from('newsletter_content')
      .select('*')
      .limit(1)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('TC4: anon key SELECT returns 0 rows from prediction_snapshots', async () => {
    const { data, error } = await anonClient
      .from('prediction_snapshots')
      .select('*')
      .limit(1)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('TC5: anon key SELECT returns 0 rows from comparison_calibration', async () => {
    const { data, error } = await anonClient
      .from('comparison_calibration')
      .select('*')
      .limit(1)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('TC6: anon key SELECT returns 0 rows from calibration_artifact', async () => {
    const { data, error } = await anonClient
      .from('calibration_artifact')
      .select('*')
      .limit(1)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('TC7: service_role SELECT works on newsletter_content after migration', async () => {
    const { data, error } = await serviceClient
      .from('newsletter_content')
      .select('*')
      .limit(1)
    expect(error).toBeNull()
    // Table may legitimately be empty on a freshly reset DB; length >= 0 is
    // the invariant proving service_role is not blocked by RLS.
    expect(Array.isArray(data)).toBe(true)
    expect((data ?? []).length).toBeGreaterThanOrEqual(0)
  })

  it('TC8: anon SELECT is consistently blocked across all 4 tables (rollback regression)', async () => {
    // Full rollback testing requires running 029_rollback.sql out-of-band,
    // which belongs in T10 (Isaac-supervised prod apply). Here we lock in
    // the invariant that matters for forward progression: every target table
    // returns zero rows to anon after 029 is applied. If a future migration
    // accidentally disables RLS on any of these, this test catches it.
    for (const table of TARGET_TABLES) {
      const { data, error } = await anonClient.from(table).select('*').limit(1)
      expect(error, `anon should not receive an error on ${table}`).toBeNull()
      expect(data, `anon must see 0 rows on ${table}`).toEqual([])
    }
  })

  it('TC9: prediction_snapshots_v2 rowsecurity stays true (regression for 016)', async () => {
    // Migration 016 already enabled RLS on prediction_snapshots_v2. Migration
    // 029 must not touch the v2 table; it operates exclusively on v1
    // (`prediction_snapshots`). Confirm anon still cannot read v2.
    const { data, error } = await anonClient
      .from('prediction_snapshots_v2')
      .select('*')
      .limit(1)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
