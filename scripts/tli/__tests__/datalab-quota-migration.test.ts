import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/060_tli_datalab_quota_ledger.sql', 'utf8')

describe('DataLab quota ledger migration', () => {
  it('keeps attempts non-negative and the ceiling positive under RLS', () => {
    expect(sql).toMatch(/kst_date DATE PRIMARY KEY/)
    expect(sql).toMatch(/attempts INTEGER NOT NULL DEFAULT 0 CHECK \(attempts >= 0\)/)
    expect(sql).toMatch(/ceiling INTEGER NOT NULL CHECK \(ceiling > 0\)/)
    expect(sql).toMatch(/ALTER TABLE public\.tli_datalab_quota_ledger ENABLE ROW LEVEL SECURITY/)
  })

  it('atomically increments only below the minimum established ceiling', () => {
    expect(sql).toMatch(/ON CONFLICT \(kst_date\) DO UPDATE SET/)
    expect(sql).toMatch(/attempts = ledger\.attempts \+ p_count/)
    expect(sql).toMatch(/ceiling = LEAST\(ledger\.ceiling, p_ceiling\)/)
    expect(sql).toMatch(/WHERE ledger\.attempts \+ p_count <= LEAST\(ledger\.ceiling, p_ceiling\)/)
    expect(sql).toMatch(/RETURNING true, ledger\.attempts, ledger\.ceiling/)
  })

  it('allows only service_role to execute the reservation RPC', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.reserve_tli_datalab_quota\(DATE, INTEGER, INTEGER\)[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_tli_datalab_quota\(DATE, INTEGER, INTEGER\)[\s\S]*TO service_role/)
  })
})
