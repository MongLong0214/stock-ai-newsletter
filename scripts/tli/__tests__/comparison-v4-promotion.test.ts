import { describe, expect, it } from 'vitest'
import {
  canPromoteComparisonRun,
  isPromotionBlocked,
  buildPromoteRunPatch,
  buildRollbackRunPatch,
} from '../comparison-v4-promotion'

describe('comparison v4 promotion helpers', () => {
  it('allows promotion only for complete and publish-ready runs', () => {
    expect(canPromoteComparisonRun({
      status: 'complete',
      publish_ready: true,
      expected_candidate_count: 3,
      materialized_candidate_count: 3,
      expected_snapshot_count: 1,
      materialized_snapshot_count: 1,
    })).toBe(true)

    expect(canPromoteComparisonRun({
      status: 'failed',
      publish_ready: true,
      expected_candidate_count: 3,
      materialized_candidate_count: 3,
      expected_snapshot_count: 1,
      materialized_snapshot_count: 1,
    })).toBe(false)

    expect(canPromoteComparisonRun({
      status: 'complete',
      publish_ready: true,
      expected_candidate_count: 0,
      materialized_candidate_count: 0,
      expected_snapshot_count: 0,
      materialized_snapshot_count: 0,
    })).toBe(false)
  })

  it('builds a publish patch with status and timestamp', () => {
    const patch = buildPromoteRunPatch('2026-03-11T00:00:00.000Z')
    expect(patch.status).toBe('published')
    expect(patch.published_at).toBe('2026-03-11T00:00:00.000Z')
  })

  it('builds a rollback patch with rolled_back status', () => {
    const patch = buildRollbackRunPatch()
    expect(patch.status).toBe('rolled_back')
    expect(patch.publish_ready).toBe(false)
  })

  it('blocks promotion when state history backfill is incomplete', () => {
    const result = isPromotionBlocked({
      stateHistoryBackfillComplete: false,
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('backfill')
  })

  it('does not block promotion when backfill is complete', () => {
    const result = isPromotionBlocked({
      stateHistoryBackfillComplete: true,
    })
    expect(result.blocked).toBe(false)
    expect(result.reason).toBeNull()
  })

  it('blocks promotion when manifest parity has not passed', () => {
    const result = isPromotionBlocked({
      stateHistoryBackfillComplete: true,
      manifestParityPassed: false,
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('manifest')
  })

  it('does not block when manifest parity is undefined (not yet run)', () => {
    const result = isPromotionBlocked({
      stateHistoryBackfillComplete: true,
      manifestParityPassed: undefined,
    })
    expect(result.blocked).toBe(false)
    expect(result.reason).toBeNull()
  })
})
