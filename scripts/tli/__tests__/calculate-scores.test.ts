import { describe, expect, it } from 'vitest'
import { buildPrevScoreMap, buildRecentSmoothedMap } from '../calculate-scores'

describe('calculate-scores helpers', () => {
  it('keeps up to five historical score records per theme for smoothing', () => {
    const records = Array.from({ length: 6 }, (_, index) => ({
      theme_id: 'theme-1',
      stage: 'Growth',
      score: 90 - index,
      smoothed_score: 90 - index,
      raw_score: 90 - index,
      components: null,
      calculated_at: `2026-03-0${index + 1}`,
    }))

    const prevScoreMap = buildPrevScoreMap(records)

    expect(prevScoreMap.get('theme-1')).toHaveLength(5)
  })

  it('builds a smoothing window from the latest five smoothed scores', () => {
    const records = Array.from({ length: 5 }, (_, index) => ({
      theme_id: 'theme-1',
      stage: 'Growth',
      score: 0,
      smoothed_score: 100 - index * 5,
      raw_score: 0,
      components: null,
      calculated_at: `2026-03-0${index + 1}`,
    }))

    const smoothedMap = buildRecentSmoothedMap(buildPrevScoreMap(records))

    expect(smoothedMap.get('theme-1')).toEqual([100, 95, 90, 85, 80])
  })
})
