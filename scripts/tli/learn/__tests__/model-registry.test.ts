import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildIsoWeekModelVersion } from '../model-registry'

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('../../shared/supabase-admin', () => ({
  supabaseAdmin: { rpc: rpcMock },
}))

describe('buildIsoWeekModelVersion', () => {
  it('formats an ISO week model version for a mid-week date', () => {
    // 2026-07-06 is a Monday in ISO week 28 of 2026.
    expect(buildIsoWeekModelVersion('2026-07-06')).toBe('m1-2026w28')
  })

  it('rolls over to the following ISO year for late-December dates in week 1', () => {
    // 2025-12-29 (Monday) is ISO week 1 of 2026.
    expect(buildIsoWeekModelVersion('2025-12-29')).toBe('m1-2026w01')
  })

  it('supports a custom prefix', () => {
    expect(buildIsoWeekModelVersion('2026-07-06', 'challenger')).toBe('challenger-2026w28')
  })
})

describe('registerModelRegistryChallenger', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('calls the register_model_registry_challenger RPC with a daterange-friendly payload', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        model_version: 'm1-2026w28',
        status: 'challenger',
        promoted_at: null,
        archived_model_version: 'm1-2026w24',
      }],
      error: null,
    })
    const { registerModelRegistryChallenger } = await import('../model-registry')

    const result = await registerModelRegistryChallenger({
      modelVersion: 'm1-2026w28',
      modelType: 'm1_logistic',
      coefficients: { artifact_version: 'tli-model-artifact-v1' },
      trainRange: ['2026-01-07', '2026-07-05'],
      valMetrics: { auc: 0.7 },
      gateResult: { status: 'pending' },
    })

    expect(rpcMock).toHaveBeenCalledWith('register_model_registry_challenger', {
      p_model_version: 'm1-2026w28',
      p_model_type: 'm1_logistic',
      p_coefficients: { artifact_version: 'tli-model-artifact-v1' },
      p_train_start: '2026-01-07',
      p_train_end: '2026-07-05',
      p_val_metrics: { auc: 0.7 },
      p_gate_result: { status: 'pending' },
    })
    expect(result).toEqual({
      modelVersion: 'm1-2026w28',
      status: 'challenger',
      archivedModelVersion: 'm1-2026w24',
    })
  })

  it('throws when the RPC reports an error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'constraint violated' } })
    const { registerModelRegistryChallenger } = await import('../model-registry')

    await expect(registerModelRegistryChallenger({
      modelVersion: 'm1-2026w28',
      modelType: 'm1_logistic',
      coefficients: {},
      trainRange: ['2026-01-07', '2026-07-05'],
      valMetrics: null,
      gateResult: { status: 'pending' },
    })).rejects.toThrow(/constraint violated/)
  })
})
