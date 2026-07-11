import { describe, expect, it, vi } from 'vitest'

const predictionRecord = (index: number): Record<string, unknown> => ({
  theme_id: `theme-${index}`,
  prediction_date: '2026-07-13',
  horizon_days: 5,
  serving_role: 'champion',
  p_rise: 0.6,
  ci_lower: null,
  ci_upper: null,
  abstain: false,
  abstain_reasons: [],
  features: { feature_schema: [], values: [], missing_flags: [] },
  model_version: 'b-abl-v1',
  labeler_version: 'gta-v1',
  param_version: 'legacy-v1',
  score_status: 'pending',
})

const loadWriter = () => import('@/scripts/tli/comparison/legacy-prediction-writer')

describe('legacy prediction writer', () => {
  it('uses bounded RPC chunks and reports the exact affected row count', async () => {
    const transport = vi.fn(async (rows: readonly Record<string, unknown>[]) => ({
      data: rows.length,
      error: null,
    }))
    const { upsertLegacyPredictionsV3 } = await loadWriter()
    const rows = Array.from({ length: 1_001 }, (_, index) => predictionRecord(index))

    const affected = await upsertLegacyPredictionsV3(rows, transport)

    expect(affected).toBe(1_001)
    expect(transport.mock.calls.map(([chunk]) => chunk.length)).toEqual([500, 500, 1])
  })

  it('fails immediately when the service RPC rejects a chunk', async () => {
    const transport = vi.fn(async () => ({
      data: null,
      error: { message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' },
    }))
    const { upsertLegacyPredictionsV3 } = await loadWriter()

    await expect(upsertLegacyPredictionsV3([predictionRecord(1)], transport)).rejects.toThrow(
      'legacy prediction upsert failed',
    )
  })

  it('fails when the RPC affected count does not match the requested chunk', async () => {
    const transport = vi.fn(async () => ({ data: 0, error: null }))
    const { upsertLegacyPredictionsV3 } = await loadWriter()

    await expect(upsertLegacyPredictionsV3([predictionRecord(1)], transport)).rejects.toThrow(
      'affected 0 of 1 rows',
    )
  })

  it('rejects terminal legacy prediction rows before making an RPC call', async () => {
    const transport = vi.fn(async () => ({ data: 1, error: null }))
    const { upsertLegacyPredictionsV3 } = await loadWriter()
    const terminal = { ...predictionRecord(1), score_status: 'scored' }

    await expect(upsertLegacyPredictionsV3([terminal], transport)).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
})
