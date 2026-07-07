import { describe, expect, it } from 'vitest'
import {
  buildAnchorStabilityReport,
  inferPrimaryAnchorObservationsFromInterestRows,
  type AnchorObservation,
} from '../ops/anchor-stability-report'

const dates = Array.from({ length: 14 }, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`)

const observationsFor = (candidate: string, values: readonly number[]): AnchorObservation[] => (
  values.map((value, index) => ({
    candidate,
    date: dates[index],
    value,
    source: 'candidate_sampling',
  }))
)

describe('buildAnchorStabilityReport', () => {
  it('reports primary-only status when the calculator anchor has 14 days but backups are missing', () => {
    const report = buildAnchorStabilityReport({
      asOfDate: '2026-07-14',
      observations: observationsFor('계산기', [40, 41, 40, 39, 40, 42, 41, 40, 40, 39, 41, 40, 40, 41]),
    })

    expect(report.windowStart).toBe('2026-07-01')
    expect(report.comparisonStatus).toBe('primary_only')
    expect(report.decision).toBe('primary_only_report')
    expect(report.issueProposal).toBeNull()
    expect(report.candidates.find((candidate) => candidate.candidate === '계산기')?.status).toBe('ready')
    expect(report.candidates.find((candidate) => candidate.candidate === '번역')?.status).toBe('insufficient_data')
  })

  it('proposes a review when a sampled backup has lower CV than the primary anchor', () => {
    const report = buildAnchorStabilityReport({
      asOfDate: '2026-07-14',
      observations: [
        ...observationsFor('계산기', [20, 50, 25, 55, 30, 60, 35, 65, 40, 70, 45, 75, 50, 80]),
        ...observationsFor('번역', [45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45]),
      ],
    })

    expect(report.comparisonStatus).toBe('partial_comparison')
    expect(report.decision).toBe('replacement_review_required')
    expect(report.issueProposal?.candidate).toBe('번역')
  })

  it('keeps the gate insufficient until the primary anchor has the full observation window', () => {
    const report = buildAnchorStabilityReport({
      asOfDate: '2026-07-14',
      observations: observationsFor('계산기', [40, 41, 40, 39, 40, 42, 41, 40, 40, 39, 41, 40, 40]),
    })

    expect(report.comparisonStatus).toBe('insufficient_primary')
    expect(report.decision).toBe('insufficient_data')
  })

  it('infers primary anchor observations from persisted raw and anchor-scaled metrics', () => {
    const observations = inferPrimaryAnchorObservationsFromInterestRows([
      { time: '2026-07-01', raw_value: 100, anchor_scaled_value: 2 },
      { time: '2026-07-01', raw_value: 200, anchor_scaled_value: 4 },
      { time: '2026-07-02', raw_value: 90, anchor_scaled_value: 3 },
      { time: '2026-07-03', raw_value: 0, anchor_scaled_value: 3 },
      { time: '2026-07-04', raw_value: 80, anchor_scaled_value: null },
    ])

    expect(observations).toEqual([
      {
        candidate: '계산기',
        date: '2026-07-01',
        value: 50,
        source: 'primary_anchor_scale_inference',
      },
      {
        candidate: '계산기',
        date: '2026-07-01',
        value: 50,
        source: 'primary_anchor_scale_inference',
      },
      {
        candidate: '계산기',
        date: '2026-07-02',
        value: 30,
        source: 'primary_anchor_scale_inference',
      },
    ])
  })
})
