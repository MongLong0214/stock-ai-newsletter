/**
 * B-Abl 관측(046 FK ON DELETE RESTRICT)이 고정한 prediction_snapshots_v2 행에 대해
 * 같은 날 재실행이 교체/삭제를 시도해도 파이프라인이 실패하지 않고 고정 행을 보존하는지 검증.
 * (2026-07-22 cron 이중발화 사고 회귀 테스트 — study lock 이후 첫 재실행에서 183건 upsert 실패)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pinnedMocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; payload?: unknown }>,
  deletedIds: [] as string[][],
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  const record = (table: string, op: string, payload?: unknown) => {
    pinnedMocks.calls.push({ table, op, payload })
  }

  const from = (table: string) => ({
    upsert: async (payload: unknown) => {
      record(table, 'upsert', payload)
      // 고정된 스냅샷과 unique key 충돌 → PK 교체가 FK RESTRICT에 막힘
      return { error: { code: '23503', message: 'violates foreign key constraint' } }
    },
    select: () => {
      if (table === 'prediction_snapshots_v2') {
        return {
          eq: () => ({
            // 정리 대상 스냅샷 목록 (deleteUnpinnedSnapshots 스코프 조회)
            eq: async () => ({
              data: [{ id: 'snap-pinned' }, { id: 'snap-stale' }],
              error: null,
              count: 2,
            }),
          }),
        }
      }
      if (table === 'tli_babl_phase_observations') {
        return {
          in: async () => ({
            data: [{ source_prediction_snapshot_id: 'snap-pinned' }],
            error: null,
          }),
        }
      }
      // theme_comparison_runs_v2 상태 조회
      return {
        eq: () => ({
          single: async () => ({
            data: { publish_ready: false, expected_candidate_count: 0, materialized_candidate_count: 0 },
            error: null,
          }),
        }),
      }
    },
    delete: () => ({
      eq: () => ({
        // markShadowRunCompleteWithoutSnapshot의 1차 광역 delete → 고정 행이 섞여 거부
        eq: async () => ({ error: { code: '23503', message: 'violates foreign key constraint' } }),
      }),
      in: async (_col: string, ids: string[]) => {
        pinnedMocks.deletedIds.push(ids)
        return { error: null }
      },
    }),
    update: () => ({
      eq: async () => ({ error: null }),
    }),
  })

  return { supabaseAdmin: { from: vi.fn(from) } }
})

import { markShadowRunCompleteWithoutSnapshot } from '@/scripts/tli/comparison/v4/shadow'

describe('comparison v4 shadow — B-Abl 고정 스냅샷 보존', () => {
  beforeEach(() => {
    pinnedMocks.calls.length = 0
    pinnedMocks.deletedIds.length = 0
  })

  it('stale 정리가 고정 행에 막히면 비고정 행만 골라 지우고 성공한다', async () => {
    await expect(markShadowRunCompleteWithoutSnapshot({
      config: {
        enabled: true,
        algorithmVersion: 'comparison-v4-shadow-v1',
        comparisonSpecVersion: 'comparison-v4-spec-v1',
      } as never,
      runId: 'run-1',
      snapshotDate: '2026-07-22',
    })).resolves.toBeUndefined()

    // 고정된 snap-pinned는 제외되고 snap-stale만 삭제돼야 한다
    expect(pinnedMocks.deletedIds).toEqual([['snap-stale']])
  })
})
