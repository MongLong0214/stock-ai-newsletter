import { describe, expect, it } from 'vitest'
import type { ThemeStateHistoryV2 } from '@/lib/tli/types/db'
import {
  buildEpisodesFromHistory,
  inferEpisodesFromScores,
  type DailyScore,
} from '../themes/build-episode-registry'

const makeHistory = (
  overrides: Partial<ThemeStateHistoryV2> & { effective_from: string; is_active: boolean },
): ThemeStateHistoryV2 => ({
  theme_id: 'th-001',
  effective_from: overrides.effective_from,
  effective_to: overrides.effective_to ?? null,
  is_active: overrides.is_active,
  closed_at: overrides.closed_at ?? null,
  first_spike_date: overrides.first_spike_date ?? null,
  state_version: overrides.state_version ?? 'live-v1',
})

const makeDailyScores = (startDate: string, scores: number[]): DailyScore[] => {
  const start = new Date(startDate)
  return scores.map((score, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    return { date: date.toISOString().split('T')[0], score }
  })
}

describe('buildEpisodesFromHistory', () => {
  it('creates a single episode from activation to deactivation', () => {
    const history: ThemeStateHistoryV2[] = [
      makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-02-01' }),
      makeHistory({ effective_from: '2026-02-01', is_active: false, closed_at: '2026-02-01' }),
    ]
    const scores = makeDailyScores('2026-01-01', [10, 20, 30, 50, 80, 70, 60, 40, 30, 20])

    const result = buildEpisodesFromHistory('th-001', history, scores)

    expect(result).toHaveLength(1)
    expect(result[0].episode_number).toBe(1)
    expect(result[0].boundary_source_start).toBe('observed')
    expect(result[0].boundary_source_end).toBe('observed')
    expect(result[0].episode_start).toBe('2026-01-01')
    expect(result[0].episode_end).toBe('2026-02-01')
    expect(result[0].is_active).toBe(false)
  })

  it('creates a new episode when dormant gap is at least 14 days', () => {
    const history: ThemeStateHistoryV2[] = [
      makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-20' }),
      makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
      makeHistory({ effective_from: '2026-02-04', is_active: true }),
    ]
    const scores = makeDailyScores('2026-01-01', Array(40).fill(50))

    const result = buildEpisodesFromHistory('th-001', history, scores)

    expect(result).toHaveLength(2)
    expect(result[0].episode_number).toBe(1)
    expect(result[1].episode_number).toBe(2)
    expect(result[1].episode_start).toBe('2026-02-04')
  })

  it('marks reactivation within a short gap as multi-peak', () => {
    const history: ThemeStateHistoryV2[] = [
      makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-20' }),
      makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
      makeHistory({ effective_from: '2026-01-30', is_active: true }),
    ]
    const scores: DailyScore[] = [
      ...makeDailyScores('2026-01-01', [10, 20, 40, 60, 80, 70, 50, 30, 20, 15, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]),
      ...makeDailyScores('2026-01-30', [15, 30, 50, 78, 60, 40]),
    ]

    const result = buildEpisodesFromHistory('th-001', history, scores)

    expect(result).toHaveLength(1)
    expect(result[0].multi_peak).toBe(true)
    expect(result[0].is_active).toBe(true)
  })

  it('returns imported episodes for backfill-only inactive history', () => {
    const history: ThemeStateHistoryV2[] = [
      makeHistory({
        effective_from: '2025-06-01',
        is_active: false,
        state_version: 'backfill-v1',
        effective_to: '2025-08-01',
      }),
    ]

    const result = buildEpisodesFromHistory('th-001', history, [])

    expect(result).toHaveLength(1)
    expect(result[0].boundary_source_start).toBe('imported')
  })

  it('returns empty array when history is empty', () => {
    expect(buildEpisodesFromHistory('th-001', [], [])).toEqual([])
  })
})

describe('inferEpisodesFromScores', () => {
  it('splits completed and active episodes at long dormant gaps', () => {
    const scores: DailyScore[] = [
      ...makeDailyScores('2026-01-01', [20, 25, 30, 28, 22, 18, 16]),
      ...makeDailyScores('2026-01-08', Array(14).fill(5)),
      ...makeDailyScores('2026-01-22', [18, 24, 32, 35, 30, 28, 22]),
    ]

    const result = inferEpisodesFromScores('th-001', scores, true)

    expect(result).toHaveLength(2)
    expect(result[0].is_active).toBe(false)
    expect(result[1].is_active).toBe(true)
    expect(result[0].boundary_source_start).toBe('inferred-v1')
    expect(result[0].boundary_source_end).toBe('inferred-v1')
  })

  it('keeps a single episode when there is no long dormant gap', () => {
    const scores = makeDailyScores('2026-01-01', [18, 25, 14, 16, 12, 18, 22, 19])
    const result = inferEpisodesFromScores('th-001', scores, true)

    expect(result).toHaveLength(1)
    expect(result[0].is_active).toBe(true)
  })
})
