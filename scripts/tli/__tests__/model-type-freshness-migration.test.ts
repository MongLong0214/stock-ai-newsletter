import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const path = 'supabase/migrations/061_model_type_and_prediction_freshness.sql'

describe('model type and prediction freshness migration', () => {
  it('quarantines unsupported rows before adding an exhaustive model_type CHECK', async () => {
    const sql = await readFile(path, 'utf8')
    const quarantine = sql.indexOf("WHERE model_type NOT IN ('b_abl', 'm1_logistic')")
    const constraint = sql.indexOf('ADD CONSTRAINT model_registry_supported_model_type_check')

    expect(quarantine).toBeGreaterThan(-1)
    expect(constraint).toBeGreaterThan(quarantine)
    expect(sql).toContain("scientific_claim_status = 'invalidated'")
    expect(sql).toContain("scientific_release_status = 'blocked'")
    expect(sql).toContain("scientific_claim_reason = 'unsupported_model_type'")
    expect(sql).toContain("CHECK (model_type IN ('b_abl', 'm1_logistic'))")
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
