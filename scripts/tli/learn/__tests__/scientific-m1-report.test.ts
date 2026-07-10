import { describe, expect, it } from 'vitest'

import { buildScientificM1PairedRows, ScientificM1ReportError } from '../scientific-m1-report'

const candidates = [
  {
    rowId: 'label-a', id: 'theme-a|2026-01-05', themeId: 'theme-a', baseDate: '2026-01-05',
    probability: 0.8, y: true, gLogRatio: 0.4,
  },
  {
    rowId: 'label-b', id: 'theme-b|2026-01-05', themeId: 'theme-b', baseDate: '2026-01-05',
    probability: 0.2, y: false, gLogRatio: -0.4,
  },
] as const

describe('scientific M1 report assembly', () => {
  it('builds exact candidate/comparator pairs without reading continuous outcomes', () => {
    const paired = buildScientificM1PairedRows({
      candidates,
      comparators: candidates.map((row) => ({
        id: row.id, themeId: row.themeId, baseDate: row.baseDate, probability: 0.5, y: row.y,
      })),
    })

    expect(paired).toEqual([
      {
        themeId: 'theme-a', originDate: '2026-01-05',
        candidateProbability: 0.8, comparatorProbability: 0.5, y: true,
      },
      {
        themeId: 'theme-b', originDate: '2026-01-05',
        candidateProbability: 0.2, comparatorProbability: 0.5, y: false,
      },
    ])
    expect(JSON.stringify(paired)).not.toContain('gLogRatio')
  })

  it('fails closed when a scored candidate has no exact comparator', () => {
    expect(() => buildScientificM1PairedRows({ candidates, comparators: [] }))
      .toThrowError(new ScientificM1ReportError('missing_primary_comparator', candidates[0].id))
  })
})
