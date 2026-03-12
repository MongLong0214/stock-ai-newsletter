import { describe, expect, it } from 'vitest'
import { buildLegacyBridgePageRanges, buildLegacyRunUpsertRows } from '../run-level4-legacy-bridge'

describe('run-level4-legacy-bridge paging', () => {
  it('builds deterministic page ranges that cover the full source row count', () => {
    expect(buildLegacyBridgePageRanges(0, 5000)).toEqual([])
    expect(buildLegacyBridgePageRanges(1, 5000)).toEqual([{ from: 0, to: 0 }])
    expect(buildLegacyBridgePageRanges(5001, 5000)).toEqual([
      { from: 0, to: 4999 },
      { from: 5000, to: 5000 },
    ])
  })

  it('strips random UUID ids from bridged run rows before upsert', () => {
    const rows = buildLegacyRunUpsertRows([
      {
        id: 'random-run-id',
        run_date: '2026-03-01',
        current_theme_id: 'theme-1',
        algorithm_version: 'comparison-v4-legacy-bridge-v1',
        run_type: 'backtest',
        candidate_pool: 'mixed_legacy',
        threshold_policy_version: 'legacy-bridge-v1',
        source_data_cutoff_date: '2026-03-01',
        comparison_spec_version: 'comparison-v4-spec-v1',
        theme_definition_version: 'theme-def-v2.0',
        lifecycle_score_version: 'lifecycle-score-v2.0',
        status: 'complete',
        publish_ready: false,
        expected_candidate_count: 3,
        materialized_candidate_count: 3,
        expected_snapshot_count: 0,
        materialized_snapshot_count: 0,
        attempt_no: 1,
        checkpoint_cursor: null,
        last_error: null,
        started_at: null,
        completed_at: null,
        published_at: null,
        created_at: '2026-03-01T00:00:00Z',
      },
    ])

    expect(rows[0]).not.toHaveProperty('id')
    expect(rows[0]).toMatchObject({
      current_theme_id: 'theme-1',
      run_date: '2026-03-01',
    })
  })
})
