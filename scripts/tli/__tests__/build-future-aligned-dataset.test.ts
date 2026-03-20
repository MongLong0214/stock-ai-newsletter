/**
 * TCAR-012: Build Future-Aligned Training Dataset and Targets
 *
 * TDD RED phase — tests for pairwise dataset generation with future alignment targets.
 */

import { describe, expect, it } from 'vitest'
import {
  buildFutureAlignedPairs,
  buildDatasetLineage,
  classifyFutureAlignment,
  type DatasetInput,
  type DatasetLineage,
  type FutureAlignedPair,
} from '../research/build-future-aligned-dataset'

// --- Test helpers ---

const defaultInput = (overrides: Partial<DatasetInput> = {}): DatasetInput => ({
  querySnapshot: {
    episodeId: 'ep-query',
    themeId: 'th-query',
    snapshotDate: '2026-01-20',
    peakDay: 20,
    totalDays: 45,
    isCompleted: true,
    stage: 'Growth',
  },
  candidates: [
    {
      episodeId: 'ep-cand-1',
      themeId: 'th-cand-1',
      peakDay: 18,
      totalDays: 42,
      isCompleted: true,
      similarity: 0.85,
    },
    {
      episodeId: 'ep-cand-2',
      themeId: 'th-cand-2',
      peakDay: 50,
      totalDays: 80,
      isCompleted: true,
      similarity: 0.60,
    },
  ],
  ...overrides,
})

describe('TCAR-012: classifyFutureAlignment', () => {
  it('returns positive when future paths are close', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 20,
      queryTotalDays: 45,
      candidatePeakDay: 18,
      candidateTotalDays: 42,
    })

    expect(result.label).toBe('positive')
    expect(result.peakDayGap).toBe(2)
  })

  it('returns negative when future paths diverge significantly', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 20,
      queryTotalDays: 45,
      candidatePeakDay: 60,
      candidateTotalDays: 120,
    })

    expect(result.label).toBe('negative')
  })

  it('returns ambiguous for borderline cases', () => {
    const result = classifyFutureAlignment({
      queryPeakDay: 20,
      queryTotalDays: 45,
      candidatePeakDay: 30,
      candidateTotalDays: 55,
    })

    // Neither strongly positive nor strongly negative
    expect(['positive', 'negative', 'ambiguous']).toContain(result.label)
  })
})

describe('TCAR-012: buildFutureAlignedPairs', () => {
  it('generates pairs for all candidates', () => {
    const input = defaultInput()
    const result = buildFutureAlignedPairs(input)

    expect(result).toHaveLength(2)
    expect(result[0].queryEpisodeId).toBe('ep-query')
    expect(result[0].candidateEpisodeId).toBe('ep-cand-1')
    expect(result[1].candidateEpisodeId).toBe('ep-cand-2')
  })

  it('attaches future alignment label to each pair', () => {
    const result = buildFutureAlignedPairs(defaultInput())

    expect(result.every(p => ['positive', 'negative', 'ambiguous'].includes(p.futureAlignmentLabel))).toBe(true)
  })

  it('close peaks produce positive label', () => {
    const input = defaultInput({
      querySnapshot: {
        episodeId: 'ep-q', themeId: 'th-q', snapshotDate: '2026-01-20',
        peakDay: 20, totalDays: 45, isCompleted: true, stage: 'Growth',
      },
      candidates: [{
        episodeId: 'ep-c', themeId: 'th-c',
        peakDay: 19, totalDays: 43, isCompleted: true, similarity: 0.9,
      }],
    })

    const result = buildFutureAlignedPairs(input)

    expect(result[0].futureAlignmentLabel).toBe('positive')
  })

  it('excludes right-censored query episodes', () => {
    const input = defaultInput({
      querySnapshot: {
        episodeId: 'ep-q', themeId: 'th-q', snapshotDate: '2026-01-20',
        peakDay: 20, totalDays: 45, isCompleted: false, stage: 'Growth',
      },
    })

    const result = buildFutureAlignedPairs(input)

    expect(result).toHaveLength(0)
  })

  it('excludes right-censored candidates', () => {
    const input = defaultInput({
      candidates: [
        { episodeId: 'ep-1', themeId: 'th-1', peakDay: 18, totalDays: 42, isCompleted: false, similarity: 0.9 },
        { episodeId: 'ep-2', themeId: 'th-2', peakDay: 19, totalDays: 43, isCompleted: true, similarity: 0.8 },
      ],
    })

    const result = buildFutureAlignedPairs(input)

    expect(result).toHaveLength(1)
    expect(result[0].candidateEpisodeId).toBe('ep-2')
  })

  it('includes metadata for dataset lineage', () => {
    const result = buildFutureAlignedPairs(defaultInput())
    const pair = result[0]

    expect(typeof pair.queryEpisodeId).toBe('string')
    expect(typeof pair.candidateEpisodeId).toBe('string')
    expect(typeof pair.futureAlignmentLabel).toBe('string')
    expect(typeof pair.peakDayGap).toBe('number')
    expect(typeof pair.totalDaysGap).toBe('number')
    expect(typeof pair.candidateSimilarity).toBe('number')
  })

  it('attaches queryStage from query snapshot to each pair', () => {
    const input = defaultInput({
      querySnapshot: {
        episodeId: 'ep-q', themeId: 'th-q', snapshotDate: '2026-01-20',
        peakDay: 20, totalDays: 45, isCompleted: true, stage: 'Peak',
      },
    })

    const result = buildFutureAlignedPairs(input)

    expect(result.length).toBeGreaterThan(0)
    for (const pair of result) {
      expect(pair.queryStage).toBe('Peak')
    }
  })
})

describe('TCAR-012: buildDatasetLineage', () => {
  it('produces a lineage summary from input and pairs', () => {
    const input = defaultInput()
    const pairs = buildFutureAlignedPairs(input)

    const lineage = buildDatasetLineage(input, pairs)

    expect(lineage.totalInputCandidates).toBe(2)
    expect(lineage.rightCensoredQueryExcluded).toBe(false)
    expect(lineage.rightCensoredCandidatesExcluded).toBe(0)
    expect(lineage.totalPairs).toBe(pairs.length)
    expect(typeof lineage.generatedAt).toBe('string')
  })

  it('counts right-censored candidates excluded', () => {
    const input = defaultInput({
      candidates: [
        { episodeId: 'ep-1', themeId: 'th-1', peakDay: 18, totalDays: 42, isCompleted: false, similarity: 0.9 },
        { episodeId: 'ep-2', themeId: 'th-2', peakDay: 19, totalDays: 43, isCompleted: true, similarity: 0.8 },
        { episodeId: 'ep-3', themeId: 'th-3', peakDay: 50, totalDays: 80, isCompleted: false, similarity: 0.7 },
      ],
    })
    const pairs = buildFutureAlignedPairs(input)

    const lineage = buildDatasetLineage(input, pairs)

    expect(lineage.totalInputCandidates).toBe(3)
    expect(lineage.rightCensoredCandidatesExcluded).toBe(2)
    expect(lineage.totalPairs).toBe(1)
  })

  it('flags right-censored query exclusion', () => {
    const input = defaultInput({
      querySnapshot: {
        episodeId: 'ep-q', themeId: 'th-q', snapshotDate: '2026-01-20',
        peakDay: 20, totalDays: 45, isCompleted: false, stage: 'Growth',
      },
    })
    const pairs = buildFutureAlignedPairs(input)

    const lineage = buildDatasetLineage(input, pairs)

    expect(lineage.rightCensoredQueryExcluded).toBe(true)
    expect(lineage.totalPairs).toBe(0)
  })

  it('counts label distribution correctly', () => {
    const input = defaultInput({
      querySnapshot: {
        episodeId: 'ep-q', themeId: 'th-q', snapshotDate: '2026-01-20',
        peakDay: 20, totalDays: 45, isCompleted: true, stage: 'Growth',
      },
      candidates: [
        { episodeId: 'ep-1', themeId: 'th-1', peakDay: 19, totalDays: 43, isCompleted: true, similarity: 0.9 },
        { episodeId: 'ep-2', themeId: 'th-2', peakDay: 60, totalDays: 120, isCompleted: true, similarity: 0.5 },
      ],
    })
    const pairs = buildFutureAlignedPairs(input)

    const lineage = buildDatasetLineage(input, pairs)

    expect(lineage.positiveCount + lineage.negativeCount + lineage.ambiguousCount).toBe(lineage.totalPairs)
  })
})
