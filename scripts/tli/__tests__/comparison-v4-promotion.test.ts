import { describe, expect, it } from 'vitest'
import {
  canPromoteComparisonRun,
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
})
