import { beforeEach, describe, expect, it, vi } from 'vitest'
import { upsertComparisonShadowRun } from '@/scripts/tli/comparison/v4/shadow'

const shadowPersistenceMocks = vi.hoisted(() => {
  const runUpdates: Record<string, unknown>[] = []
  return {
    batchUpsert: vi.fn(),
    runUpdates,
  }
})

vi.mock('@/scripts/tli/shared/supabase-batch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/tli/shared/supabase-batch')>()
  return {
    ...actual,
    batchUpsert: shadowPersistenceMocks.batchUpsert,
  }
})

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  const buildDeleteChain = () => {
    const chain = {
      error: null,
      eq: vi.fn(() => chain),
      neq: vi.fn(async () => ({ error: null })),
    }
    return chain
  }

  return {
    supabaseAdmin: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          match: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        insert: vi.fn(async () => ({ error: null })),
        delete: vi.fn(() => buildDeleteChain()),
        update: vi.fn((payload: Record<string, unknown>) => ({
          eq: vi.fn(async () => {
            shadowPersistenceMocks.runUpdates.push(payload)
            return { error: null }
          }),
        })),
      })),
    },
  }
})

describe('comparison v4 shadow persistence', () => {
  beforeEach(() => {
    shadowPersistenceMocks.batchUpsert.mockReset()
    shadowPersistenceMocks.runUpdates.length = 0
  })

  it('persists failed materialization status before throwing on partial candidate upsert', async () => {
    shadowPersistenceMocks.batchUpsert.mockResolvedValue(1)

    await expect(upsertComparisonShadowRun({
      config: {
        enabled: true,
        algorithmVersion: 'algo-v4',
        thresholdPolicyVersion: 'policy-v1',
        comparisonSpecVersion: 'spec-v4',
      },
      runDate: '2026-03-11',
      currentThemeId: 'theme-1',
      sourceDataCutoffDate: '2026-03-11',
      matches: [
        {
          pastThemeId: 'past-1',
          similarity: 0.7,
          currentDay: 12,
          pastPeakDay: 20,
          pastTotalDays: 35,
          estimatedDaysToPeak: 8,
          message: 'sample',
          featureSim: 0.5,
          curveSim: 0.6,
          keywordSim: 0.1,
          pastPeakScore: 82,
          pastFinalStage: 'Decline',
          pastDeclineDays: 9,
          isPastActive: false,
        },
      ],
    })).rejects.toThrow(/candidate rows failed to materialize/)

    expect(shadowPersistenceMocks.batchUpsert).toHaveBeenCalledWith(
      'theme_comparison_candidates_v2',
      expect.any(Array),
      'run_id,candidate_theme_id',
      'comparison-v4 shadow candidates',
      { failOnPartial: false },
    )
    expect(shadowPersistenceMocks.runUpdates).toContainEqual({
      materialized_candidate_count: 0,
      publish_ready: false,
      status: 'failed',
      last_error: '1 candidate rows failed to materialize',
    })
  })
})
