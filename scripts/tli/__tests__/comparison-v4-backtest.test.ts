import { describe, expect, it } from 'vitest'
import {
  buildTemporalBacktestFolds,
  aggregateThresholdSweepResults,
  buildBacktestArtifacts,
  selectArchetypeCandidatesAtRunDate,
  runThresholdSweepAcrossFolds,
  selectBestThreshold,
  renderThresholdSweepSummary,
} from '../research/comparison-v4-backtest'

describe('comparison v4 backtest helpers', () => {
  it('builds temporal folds from firstSpikeDate ordering', () => {
    const themes = Array.from({ length: 15 }, (_, idx) => {
      const date = new Date('2026-01-01T00:00:00.000Z')
      date.setUTCDate(date.getUTCDate() + idx * 7)
      return {
        id: `t${idx + 1}`,
        firstSpikeDate: date.toISOString().split('T')[0],
      }
    })

    const folds = buildTemporalBacktestFolds(themes, 3)
    expect(folds).toHaveLength(3)
    expect(folds[0].train.length).toBeGreaterThan(0)
    expect(folds[0].validation.length).toBeGreaterThan(0)
    expect(folds[0].test.length).toBeGreaterThan(0)
  })

  it('aggregates threshold sweep results across folds', () => {
    const aggregated = aggregateThresholdSweepResults([
      { threshold: 0.35, fold: 'A', matches: 10, accurate: 6, precision: 0.6 },
      { threshold: 0.35, fold: 'B', matches: 8, accurate: 4, precision: 0.5 },
      { threshold: 0.40, fold: 'A', matches: 6, accurate: 4, precision: 0.667 },
      { threshold: 0.40, fold: 'B', matches: 5, accurate: 3, precision: 0.6 },
    ])

    expect(aggregated).toEqual([
      expect.objectContaining({ threshold: 0.35, meanPrecision: 0.55, totalMatches: 18 }),
      expect.objectContaining({ threshold: 0.40, meanPrecision: 0.6335, totalMatches: 11 }),
    ])
  })

  it('selects the best threshold by highest mean precision', () => {
    const best = selectBestThreshold([
      { threshold: 0.35, meanPrecision: 0.55, totalMatches: 18, totalAccurate: 10 },
      { threshold: 0.40, meanPrecision: 0.63, totalMatches: 11, totalAccurate: 7 },
      { threshold: 0.45, meanPrecision: 0.62, totalMatches: 9, totalAccurate: 6 },
    ])

    expect(best?.threshold).toBe(0.40)
  })

  it('renders a threshold sweep summary with the selected threshold', () => {
    const markdown = renderThresholdSweepSummary({
      selectedThreshold: 0.4,
      rows: [
        { threshold: 0.35, meanPrecision: 0.55, totalMatches: 18, totalAccurate: 10 },
        { threshold: 0.40, meanPrecision: 0.63, totalMatches: 11, totalAccurate: 7 },
      ],
    })

    expect(markdown).toContain('Selected Threshold')
    expect(markdown).toContain('0.4')
    expect(markdown).toContain('0.63')
  })

  it('runs threshold sweeps across folds using an evaluator callback', () => {
    const results = runThresholdSweepAcrossFolds({
      folds: [
        { foldId: 'A', train: [1], validation: [2], embargo: [], test: [3] },
        { foldId: 'B', train: [4], validation: [5], embargo: [], test: [6] },
      ],
      thresholds: [0.35, 0.4],
      evaluateFold: ({ foldId, threshold }) => {
        if (foldId === 'A' && threshold === 0.35) return { matches: 10, accurate: 6 }
        if (foldId === 'A' && threshold === 0.4) return { matches: 8, accurate: 6 }
        if (foldId === 'B' && threshold === 0.35) return { matches: 9, accurate: 5 }
        return { matches: 7, accurate: 5 }
      },
    })

    expect(results).toEqual([
      { threshold: 0.35, fold: 'A', matches: 10, accurate: 6, precision: 0.6 },
      { threshold: 0.4, fold: 'A', matches: 8, accurate: 6, precision: 0.75 },
      { threshold: 0.35, fold: 'B', matches: 9, accurate: 5, precision: 5 / 9 },
      { threshold: 0.4, fold: 'B', matches: 7, accurate: 5, precision: 5 / 7 },
    ])
  })

  it('builds rollout and power-analysis artifacts from aggregated sweep rows', () => {
    const artifacts = buildBacktestArtifacts({
      aggregatedRows: [
        { threshold: 0.35, meanPrecision: 0.55, totalMatches: 18, totalAccurate: 10 },
        { threshold: 0.40, meanPrecision: 0.63, totalMatches: 11, totalAccurate: 7 },
      ],
      selectedThreshold: 0.4,
      currentProductionThreshold: 0.35,
      powerAnalysis: {
        primaryMetric: 'Phase-Aligned Precision@3',
        margin: -0.03,
        minimumDetectableEffect: 0.05,
        clusterCount: 30,
        eligibleRuns: 120,
        confidenceLevel: 0.95,
      },
    })

    expect(artifacts.rolloutReport).toContain('current production')
    expect(artifacts.rolloutReport).toContain('candidate')
    expect(artifacts.powerAnalysisReport).toContain('# Comparison v4 Power Analysis')
    expect(artifacts.selected?.threshold).toBe(0.4)
  })

  it('selects archetype candidates using point-in-time theme state history', () => {
    const candidates = [
      { id: 'past-1' },
      { id: 'past-2' },
      { id: 'active-1' },
    ]

    const selected = selectArchetypeCandidatesAtRunDate(candidates, {
      runDate: '2026-03-20',
      stateHistory: [
        { theme_id: 'past-1', effective_from: '2026-03-01', effective_to: null, is_active: false, closed_at: '2026-03-10', state_version: 'backfill-v1' },
        { theme_id: 'past-2', effective_from: '2026-03-01', effective_to: null, is_active: false, closed_at: '2026-03-19', state_version: 'live-v1' },
        { theme_id: 'active-1', effective_from: '2026-03-01', effective_to: null, is_active: true, closed_at: null, state_version: 'backfill-v1' },
      ],
    })

    expect(selected.map((item) => item.id)).toEqual(['past-1', 'past-2'])
  })

  it('excludes unknown state_version themes from archetype candidates', () => {
    const candidates = [
      { id: 'known-1' },
      { id: 'unknown-1' },
    ]

    const selected = selectArchetypeCandidatesAtRunDate(candidates, {
      runDate: '2026-03-20',
      stateHistory: [
        { theme_id: 'known-1', effective_from: '2026-01-01', effective_to: null, is_active: false, closed_at: '2026-02-15', state_version: 'backfill-v1' },
        { theme_id: 'unknown-1', effective_from: '2025-01-01', effective_to: null, is_active: false, closed_at: '2025-06-01', state_version: 'unknown' },
      ],
    })

    expect(selected.map((item) => item.id)).toEqual(['known-1'])
  })
})
