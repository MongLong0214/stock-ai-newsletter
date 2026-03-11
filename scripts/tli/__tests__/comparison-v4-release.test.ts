import { describe, expect, it } from 'vitest'
import { buildComparisonV4ReleasePlan } from '../comparison-v4-release'

describe('comparison v4 release plan', () => {
  it('selects promotable runs and produces a summary', () => {
    const plan = buildComparisonV4ReleasePlan([
      {
        id: 'run-1',
        status: 'complete',
        publish_ready: true,
        expected_candidate_count: 3,
        materialized_candidate_count: 3,
        expected_snapshot_count: 1,
        materialized_snapshot_count: 1,
      },
      {
        id: 'run-2',
        status: 'failed',
        publish_ready: true,
        expected_candidate_count: 3,
        materialized_candidate_count: 2,
        expected_snapshot_count: 1,
        materialized_snapshot_count: 0,
      },
    ])

    expect(plan.promotableRunIds).toEqual(['run-1'])
    expect(plan.skippedRunIds).toEqual(['run-2'])
    expect(plan.report).toContain('Promotable Runs: 1')
  })
})
