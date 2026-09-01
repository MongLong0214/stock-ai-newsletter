import { describe, expect, it, vi } from 'vitest'

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn((table: string) => {
    if (table === 'comparison_v4_control') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    production_version: 'comparison-v4-shadow-v1',
                    serving_enabled: true,
                    calibration_version: 'cal-pinned',
                    weight_version: 'weight-pinned',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'query_snapshot_v1') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'theme_comparison_runs_v2') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({
                data: [{
                  id: 'v2-run-1',
                  candidate_pool: 'peer',
                  publish_ready: true,
                  status: 'published',
                  created_at: '2026-09-01T00:00:00.000Z',
                  algorithm_version: 'comparison-v4-shadow-v1',
                }],
                error: null,
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'theme_comparison_candidates_v2') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [{
                  candidate_theme_id: 'active-peer-1',
                  similarity_score: 0.9,
                  current_day: 12,
                  past_peak_day: 0,
                  past_total_days: 20,
                  message: 'legacy message',
                  feature_sim: null,
                  curve_sim: null,
                  keyword_sim: null,
                  past_peak_score: null,
                  past_final_stage: null,
                  past_decline_days: null,
                }],
                error: null,
              }),
            }),
          }),
        }),
      }
    }

    throw new Error(`unexpected table: ${table}`)
  }),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: () => ({ from: fromMock }),
}))

vi.mock('@/scripts/tli/level4/calibration-artifact', () => ({
  fetchLatestCertificationCalibrationArtifact: vi.fn().mockResolvedValue({
    source_surface: 'v2_certification',
    calibration_version: 'cal-pinned',
    weight_version: 'weight-pinned',
    bin_summary: [],
  }),
}))

vi.mock('@/scripts/tli/level4/weight-artifact', () => ({
  fetchLatestCertificationWeightArtifact: vi.fn().mockResolvedValue({
    weight_version: 'weight-pinned',
    source_surface: 'v2_certification',
  }),
  fetchWeightArtifactByVersion: vi.fn().mockResolvedValue({
    weight_version: 'weight-pinned',
    source_surface: 'v2_certification',
  }),
}))

import { fetchPublishedComparisonRowsV4 } from './comparison-v4-reader'

describe('comparison v4 active-peer fallback', () => {
  it('serves the published V2 peer run when no completed analog snapshot is available', async () => {
    const result = await fetchPublishedComparisonRowsV4('theme-1')

    expect(result).toMatchObject({
      comparisonSource: 'v2_active_peer',
      comparisonGenerationVersion: 'algorithm_version:comparison-v4-shadow-v1',
      error: null,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        past_theme_id: 'active-peer-1',
        comparison_lane: 'active_peer',
        retrieval_surface: 'comparison_v2',
        generation_version: 'algorithm_version:comparison-v4-shadow-v1',
      }),
    ])
  })
})
