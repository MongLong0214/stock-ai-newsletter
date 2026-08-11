import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const path = 'supabase/migrations/061_model_type_and_prediction_freshness.sql'

const requiredQuarantineState = [
  "status = 'archived'",
  "scientific_claim_status = 'invalidated'",
  "scientific_release_status = 'blocked'",
  "scientific_claim_reason = 'unsupported_model_type'",
  'invalidated_at IS NOT NULL',
]

const constraintExpression = (sql: string) => {
  const match = sql.match(
    /ADD CONSTRAINT model_registry_supported_model_type_check\s+CHECK \(([\s\S]*?)\n  \);/,
  )

  expect(match?.[1]).toBeDefined()
  return match![1]
}

const expectQuarantineCompatibleConstraint = (sql: string) => {
  const constraint = constraintExpression(sql)

  expect(constraint).toContain("model_type IN ('b_abl', 'm1_logistic')")
  expect(constraint).toContain('OR (')
  for (const state of requiredQuarantineState) {
    expect(constraint).toContain(state)
  }
}

describe('model type and prediction freshness migration', () => {
  it('quarantines unsupported rows before adding a compatible, exhaustive runtime CHECK', async () => {
    const sql = await readFile(path, 'utf8')
    const quarantine = sql.indexOf("WHERE model_type NOT IN ('b_abl', 'm1_logistic')")
    const drop = sql.indexOf('DROP CONSTRAINT IF EXISTS model_registry_supported_model_type_check')
    const constraint = sql.indexOf('ADD CONSTRAINT model_registry_supported_model_type_check')

    expect(quarantine).toBeGreaterThan(-1)
    expect(drop).toBeGreaterThan(quarantine)
    expect(constraint).toBeGreaterThan(quarantine)
    expect(sql).toContain("scientific_claim_status = 'invalidated'")
    expect(sql).toContain("scientific_release_status = 'blocked'")
    expect(sql).toContain("scientific_claim_reason = 'unsupported_model_type'")
    expectQuarantineCompatibleConstraint(sql)
  })

  it('rejects a mutation that would let an unsupported model type leave quarantine', async () => {
    const sql = await readFile(path, 'utf8')
    const mutatedSql = sql.replace("status = 'archived'\n      AND scientific_claim_status", "status = 'challenger'\n      AND scientific_claim_status")

    expect(mutatedSql).not.toBe(sql)
    expect(() => expectQuarantineCompatibleConstraint(mutatedSql)).toThrow()
  })

  it('filters future and older-than-ten-day rows inside the atomic latest-cohort RPC', async () => {
    const sql = await readFile(path, 'utf8')
    const rpc = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.load_tli_latest_public_scientific_predictions_v3'))

    expect(rpc).toContain('prediction.prediction_date >= CURRENT_DATE - 10')
    expect(rpc).toContain('prediction.prediction_date <= CURRENT_DATE')
    expect(rpc.indexOf('prediction.prediction_date >= CURRENT_DATE - 10')).toBeLessThan(
      rpc.indexOf('SELECT max(candidate.prediction_date)'),
    )
    expect(rpc).toContain('GRANT EXECUTE ON FUNCTION public.load_tli_latest_public_scientific_predictions_v3(UUID)')
  })
})
