import { describe, expect, it, vi } from 'vitest'
import { promoteComparisonV4Runs } from '../comparison-v4-orchestration'

describe('comparison v4 orchestration', () => {
  it('promotes eligible runs and writes a control row', async () => {
    const deps = {
      loadRuns: vi.fn().mockResolvedValue([
        {
          id: 'run-1',
          status: 'complete',
          publish_ready: true,
          expected_candidate_count: 3,
          materialized_candidate_count: 3,
          expected_snapshot_count: 1,
          materialized_snapshot_count: 1,
        },
      ]),
      updateRuns: vi.fn().mockResolvedValue(undefined),
      disableActiveControlRows: vi.fn().mockResolvedValue(undefined),
      upsertControlRow: vi.fn().mockResolvedValue(undefined),
    }

    const result = await promoteComparisonV4Runs(deps, {
      runIds: ['run-1'],
      actor: 'codex',
      productionVersion: 'algo-v4-prod',
      promotedAt: '2026-03-11T00:00:00.000Z',
    })

    expect(result.promotedRunIds).toEqual(['run-1'])
    expect(deps.updateRuns).toHaveBeenCalledTimes(1)
    expect(deps.disableActiveControlRows).toHaveBeenCalledTimes(1)
    // 2회 호출: 1) 비활성 control row 생성, 2) 활성화 (원자성 보장)
    expect(deps.upsertControlRow).toHaveBeenCalledTimes(2)
    expect(deps.upsertControlRow).toHaveBeenNthCalledWith(1, expect.objectContaining({ serving_enabled: false }))
    expect(deps.upsertControlRow).toHaveBeenNthCalledWith(2, expect.objectContaining({ serving_enabled: true }))
  })

  it('throws when there are no promotable runs', async () => {
    const deps = {
      loadRuns: vi.fn().mockResolvedValue([
        {
          id: 'run-1',
          status: 'failed',
          publish_ready: true,
          expected_candidate_count: 3,
          materialized_candidate_count: 1,
          expected_snapshot_count: 1,
          materialized_snapshot_count: 0,
        },
      ]),
      updateRuns: vi.fn(),
      disableActiveControlRows: vi.fn(),
      upsertControlRow: vi.fn(),
    }

    await expect(
      promoteComparisonV4Runs(deps, {
        runIds: ['run-1'],
        actor: 'codex',
        productionVersion: 'algo-v4-prod',
      }),
    ).rejects.toThrow('승격 가능한 run이 없습니다')
  })
})
