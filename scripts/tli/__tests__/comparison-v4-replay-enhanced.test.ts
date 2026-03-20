import { describe, expect, it } from 'vitest'
import {
  buildReplayCheckpoint,
  resumeReplayFromCheckpoint,
  isReplayDateSafe,
  separateReplayQueues,
  type ReplayCheckpoint,
} from '../research/comparison-v4-replay'

describe('CMPV4-008: replay checkpoint/restart', () => {
  it('builds a checkpoint from completed folds', () => {
    const checkpoint = buildReplayCheckpoint({
      planId: 'plan-1',
      completedFoldIds: ['fold-1', 'fold-2'],
      totalFolds: 4,
      lastCompletedDate: '2026-03-10',
    })

    expect(checkpoint.planId).toBe('plan-1')
    expect(checkpoint.completedFoldIds).toEqual(['fold-1', 'fold-2'])
    expect(checkpoint.totalFolds).toBe(4)
    expect(checkpoint.lastCompletedDate).toBe('2026-03-10')
    expect(checkpoint.isComplete).toBe(false)
  })

  it('marks checkpoint as complete when all folds are done', () => {
    const checkpoint = buildReplayCheckpoint({
      planId: 'plan-1',
      completedFoldIds: ['fold-1', 'fold-2', 'fold-3'],
      totalFolds: 3,
      lastCompletedDate: '2026-03-15',
    })

    expect(checkpoint.isComplete).toBe(true)
  })

  it('resumes from checkpoint, returning only remaining folds', () => {
    const allFoldIds = ['fold-1', 'fold-2', 'fold-3', 'fold-4']
    const checkpoint: ReplayCheckpoint = {
      planId: 'plan-1',
      completedFoldIds: ['fold-1', 'fold-2'],
      totalFolds: 4,
      lastCompletedDate: '2026-03-10',
      isComplete: false,
    }

    const remaining = resumeReplayFromCheckpoint(allFoldIds, checkpoint)
    expect(remaining).toEqual(['fold-3', 'fold-4'])
  })

  it('returns empty array when checkpoint is already complete', () => {
    const allFoldIds = ['fold-1', 'fold-2']
    const checkpoint: ReplayCheckpoint = {
      planId: 'plan-1',
      completedFoldIds: ['fold-1', 'fold-2'],
      totalFolds: 2,
      lastCompletedDate: '2026-03-15',
      isComplete: true,
    }

    const remaining = resumeReplayFromCheckpoint(allFoldIds, checkpoint)
    expect(remaining).toEqual([])
  })

  it('returns all folds when checkpoint is null (fresh start)', () => {
    const allFoldIds = ['fold-1', 'fold-2', 'fold-3']
    const remaining = resumeReplayFromCheckpoint(allFoldIds, null)
    expect(remaining).toEqual(['fold-1', 'fold-2', 'fold-3'])
  })
})

describe('CMPV4-008: future data leakage guard', () => {
  it('returns safe when all data dates are before run_date', () => {
    const result = isReplayDateSafe({
      runDate: '2026-03-10',
      dataDates: ['2026-03-01', '2026-03-05', '2026-03-09'],
    })
    expect(result.safe).toBe(true)
    expect(result.leakedDates).toEqual([])
  })

  it('detects future data leakage', () => {
    const result = isReplayDateSafe({
      runDate: '2026-03-10',
      dataDates: ['2026-03-01', '2026-03-10', '2026-03-15'],
    })
    expect(result.safe).toBe(false)
    expect(result.leakedDates).toEqual(['2026-03-10', '2026-03-15'])
  })

  it('treats same-day data as leakage', () => {
    const result = isReplayDateSafe({
      runDate: '2026-03-10',
      dataDates: ['2026-03-10'],
    })
    expect(result.safe).toBe(false)
    expect(result.leakedDates).toEqual(['2026-03-10'])
  })

  it('returns safe for empty data dates', () => {
    const result = isReplayDateSafe({
      runDate: '2026-03-10',
      dataDates: [],
    })
    expect(result.safe).toBe(true)
  })
})

describe('CMPV4-008: backfill/shadow queue separation', () => {
  it('separates dates into backfill (past) and shadow (current) queues', () => {
    const result = separateReplayQueues({
      allDates: ['2026-03-01', '2026-03-05', '2026-03-08', '2026-03-10', '2026-03-11'],
      cutoffDate: '2026-03-09',
    })

    expect(result.backfillQueue).toEqual(['2026-03-01', '2026-03-05', '2026-03-08'])
    expect(result.shadowQueue).toEqual(['2026-03-10', '2026-03-11'])
  })

  it('puts all dates in backfill when cutoff is in the future', () => {
    const result = separateReplayQueues({
      allDates: ['2026-03-01', '2026-03-05'],
      cutoffDate: '2026-03-10',
    })

    expect(result.backfillQueue).toEqual(['2026-03-01', '2026-03-05'])
    expect(result.shadowQueue).toEqual([])
  })

  it('puts all dates in shadow when cutoff is in the past', () => {
    const result = separateReplayQueues({
      allDates: ['2026-03-10', '2026-03-11'],
      cutoffDate: '2026-03-01',
    })

    expect(result.backfillQueue).toEqual([])
    expect(result.shadowQueue).toEqual(['2026-03-10', '2026-03-11'])
  })

  it('handles cutoff date inclusively (cutoff itself goes to backfill)', () => {
    const result = separateReplayQueues({
      allDates: ['2026-03-09', '2026-03-10'],
      cutoffDate: '2026-03-09',
    })

    expect(result.backfillQueue).toEqual(['2026-03-09'])
    expect(result.shadowQueue).toEqual(['2026-03-10'])
  })
})
