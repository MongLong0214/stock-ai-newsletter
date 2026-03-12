import { beforeEach, describe, expect, it, vi } from 'vitest'

const { curveRangeCalls, fromMock } = vi.hoisted(() => {
  const curveRangeCalls: number[] = []

  const firstCurvePage = Array.from({ length: 1000 }, (_, index) => ({
    theme_id: 'past-1',
    calculated_at: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    score: index,
  }))
  const secondCurvePage = [
    { theme_id: 'past-1', calculated_at: '2026-02-01T00:00:00.000Z', score: 1000 },
    { theme_id: 'past-1', calculated_at: '2026-02-02T00:00:00.000Z', score: 1001 },
  ]

  const fromMock = vi.fn((table: string) => {
    if (table === 'themes') {
      return {
        select: () => ({
          in: (_column: string, ids: string[]) => Promise.resolve({
            data: ids.map((id) => ({ id, name: `Theme ${id}` })),
            error: null,
          }),
        }),
      }
    }

    if (table === 'lifecycle_scores') {
      return {
        select: () => ({
          in: (column: string, ids: string[]) => {
            void column
            void ids
            return ({
              order: () => ({
                limit: () => Promise.resolve({ data: firstCurvePage, error: null }),
                range: (from: number) => {
                  curveRangeCalls.push(from)
                  if (from === 0) return Promise.resolve({ data: firstCurvePage, error: null })
                  if (from === 1000) return Promise.resolve({ data: secondCurvePage, error: null })
                  return Promise.resolve({ data: [], error: null })
                },
              }),
            })
          },
        }),
      }
    }

    return {
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }
  })

  return { curveRangeCalls, fromMock }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}))

import { buildComparisonResultFromV2Candidate, buildComparisonResults, type V2CandidateForBuild } from './build-comparisons'

beforeEach(() => {
  curveRangeCalls.length = 0
  fromMock.mockClear()
})

describe('build-comparisons v2 support', () => {
  it('builds a ComparisonResult from a v2 candidate row', () => {
    const candidate: V2CandidateForBuild = {
      candidate_theme_id: 'past-1',
      similarity_score: 0.72,
      current_day: 10,
      past_peak_day: 18,
      past_total_days: 30,
      estimated_days_to_peak: 8,
      message: 'test message',
      feature_sim: 0.5,
      curve_sim: 0.7,
      keyword_sim: 0.1,
      past_peak_score: 82,
      past_final_stage: 'Decline',
      past_decline_days: 10,
    }

    const result = buildComparisonResultFromV2Candidate(candidate, {
      pastThemeName: '과거 테마',
      lifecycleCurve: [{ date: '2026-01-01', score: 50 }],
    })

    expect(result.pastTheme).toBe('과거 테마')
    expect(result.pastThemeId).toBe('past-1')
    expect(result.similarity).toBe(0.72)
    expect(result.estimatedDaysToPeak).toBe(8)
    expect(result.lifecycleCurve).toEqual([{ date: '2026-01-01', score: 50 }])
    expect(result.featureSim).toBe(0.5)
    expect(result.pastPeakScore).toBe(82)
    expect(result.pastDeclineDays).toBe(10)
  })

  it('caps values at 365 for safety', () => {
    const candidate: V2CandidateForBuild = {
      candidate_theme_id: 'past-1',
      similarity_score: 0.72,
      current_day: 400,
      past_peak_day: 500,
      past_total_days: 600,
      estimated_days_to_peak: 100,
      message: '',
      feature_sim: null,
      curve_sim: null,
      keyword_sim: null,
      past_peak_score: null,
      past_final_stage: null,
      past_decline_days: null,
    }

    const result = buildComparisonResultFromV2Candidate(candidate, {
      pastThemeName: 'Unknown',
      lifecycleCurve: [],
    })

    expect(result.currentDay).toBe(365)
    expect(result.pastTotalDays).toBe(365)
    expect(result.pastPeakDay).toBeLessThanOrEqual(result.pastTotalDays)
  })

  it('paginates lifecycle curve loading so the full comparison pool keeps its history', async () => {
    const result = await buildComparisonResults([
      {
        id: 'cmp-1',
        past_theme_id: 'past-1',
        similarity_score: 0.75,
        current_day: 10,
        past_peak_day: 40,
        past_total_days: 80,
        message: 'comparison',
        feature_sim: null,
        curve_sim: null,
        keyword_sim: null,
        past_peak_score: null,
        past_final_stage: null,
        past_decline_days: null,
      },
    ])

    expect(curveRangeCalls).toEqual([0, 1000])
    expect(result[0].lifecycleCurve).toHaveLength(1002)
    expect(result[0].lifecycleCurve.at(-1)?.score).toBe(1001)
  })

  it('preserves level4 serving metadata when present on comparison rows', async () => {
    const result = await buildComparisonResults([
      {
        id: 'cmp-2',
        past_theme_id: 'past-1',
        similarity_score: 0.75,
        current_day: 10,
        past_peak_day: 40,
        past_total_days: 80,
        message: 'comparison',
        feature_sim: null,
        curve_sim: null,
        keyword_sim: null,
        past_peak_score: null,
        past_final_stage: null,
        past_decline_days: null,
        relevance_probability: 0.18,
        probability_ci_lower: 0.13,
        probability_ci_upper: 0.23,
        support_count: 220,
        confidence_tier: 'high',
        calibration_version: 'cal-2026-03-12',
        weight_version: null,
        source_surface: 'v2_certification',
      },
    ] as never)

    expect(result[0]).toMatchObject({
      relevanceProbability: 0.18,
      probabilityCiLower: 0.13,
      probabilityCiUpper: 0.23,
      supportCount: 220,
      confidenceTier: 'high',
      calibrationVersion: 'cal-2026-03-12',
      sourceSurface: 'v2_certification',
    })
  })
})
