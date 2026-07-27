import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GTA_HORIZON_DAYS } from '@/lib/tli/labels/gt-a'
import {
  addKoreanTradingDays,
  getKoreanTradingDatesBetween,
  getLatestMaturedBaseDate,
  isKoreanTradingDate,
} from '@/lib/tli/trading-calendar'
import { getDailyLabelBaseDates } from '../labels/daily-label-phase'

interface QueryState {
  readonly table: string
  update?: Record<string, unknown>
  lte?: [string, string]
  in?: [string, readonly string[]]
  [key: `eq_${string}`]: unknown
}

const dbMocks = vi.hoisted(() => ({
  pendingRows: [] as Record<string, unknown>[],
  labelRows: [] as Record<string, unknown>[],
  pendingQueries: [] as { cutoff: string | undefined }[],
  scoreUpdates: [] as { payload: Record<string, unknown>; dates: readonly string[] | undefined }[],
  touchedTables: [] as string[],
  batchUpsert: vi.fn(async () => 0),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      dbMocks.touchedTables.push(table)
      const state = { table } as QueryState
      const builder = {
        select: () => builder,
        is: (col: string, val: unknown) => { state[`eq_${col}`] = val; return builder },
        eq: (col: string, val: unknown) => { state[`eq_${col}`] = val; return builder },
        in: (col: string, val: readonly string[]) => { state.in = [col, val]; return builder },
        lte: (col: string, val: string) => { state.lte = [col, val]; return builder },
        order: () => builder,
        limit: () => builder,
        update: (payload: Record<string, unknown>) => { state.update = payload; return builder },
        then: (resolve: (value: { data?: unknown; error: null; count?: number }) => void) => {
          if (table === 'theme_predictions_v3' && state.update) {
            dbMocks.scoreUpdates.push({ payload: state.update, dates: state.in?.[1] })
            return resolve({ error: null, count: state.in?.[1]?.length ?? 1 })
          }
          if (table === 'theme_predictions_v3' && state.eq_score_status === 'pending') {
            dbMocks.pendingQueries.push({ cutoff: state.lte?.[1] })
            return resolve({ data: dbMocks.pendingRows, error: null })
          }
          if (table === 'theme_labels') return resolve({ data: dbMocks.labelRows, error: null })
          return resolve({ data: [], error: null })
        },
      }
      return builder
    }),
  },
}))

vi.mock('@/scripts/tli/shared/supabase-batch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/tli/shared/supabase-batch')>()
  return { ...actual, batchUpsert: dbMocks.batchUpsert }
})

const pendingRow = (id: string, themeId: string, predictionDate: string) => ({
  id,
  theme_id: themeId,
  prediction_date: predictionDate,
  model_version: 'b-abl-v1',
  labeler_version: 'gta-v1',
  p_rise: 0.7,
  abstain: false,
})

const finalLabel = (themeId: string, baseDate: string) => ({
  theme_id: themeId,
  base_date: baseDate,
  labeler_version: 'gta-v1',
  label_status: 'final',
  g_log_ratio: 0.3,
  y_binary: true,
})

describe('만기 기준 SSOT — 라벨 확정과 예측 채점', () => {
  it('비거래일에도 두 cutoff가 어긋나지 않는다', () => {
    // 2026-07-25(토)~26(일)에 채점 cutoff가 라벨 cutoff보다 2거래일 앞서 나가면서
    // 아직 지평이 끝나지 않은 07-19/07-20 예측이 "만기 미채점 적체"로 계상돼 죽었다.
    for (const today of ['2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27']) {
      expect(getLatestMaturedBaseDate({ today, horizonDays: GTA_HORIZON_DAYS }))
        .toBe(getDailyLabelBaseDates(today).finalizeCutoffDate)
    }
  })

  it('일요일 cutoff를 금요일이 아니라 직전 완료 거래일 기준으로 잡는다', () => {
    expect(getLatestMaturedBaseDate({ today: '2026-07-26', horizonDays: GTA_HORIZON_DAYS }))
      .toBe('2026-07-16')
  })

  it('만기로 판정한 base_date는 지평이 실제로 끝나 있다', () => {
    for (const today of getKoreanTradingDatesBetween({ startDate: '2026-07-01', endDate: '2026-07-31' })) {
      const cutoff = getLatestMaturedBaseDate({ today, horizonDays: GTA_HORIZON_DAYS })
      expect(addKoreanTradingDays(cutoff, GTA_HORIZON_DAYS) <= today).toBe(true)
    }
  })
})

describe('evaluateThemePredictionsV3 — 비거래일 고아 예측 자기치유', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.batchUpsert.mockResolvedValue(0)
    dbMocks.pendingQueries.length = 0
    dbMocks.scoreUpdates.length = 0
    dbMocks.pendingRows = []
    dbMocks.labelRows = []
  })

  it('아직 지평이 안 끝난 예측을 만기 대상으로 끌어오지 않는다', async () => {
    const { evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')

    const result = await evaluateThemePredictionsV3({ today: '2026-07-26' })

    expect(result.cutoffDate).toBe('2026-07-16')
    expect(dbMocks.pendingQueries[0]?.cutoff).toBe('2026-07-16')
  })

  it('비거래일 prediction_date 행을 excluded로 닫고 채점 큐에서 뺀다', async () => {
    expect(isKoreanTradingDate('2026-07-12')).toBe(false)
    dbMocks.pendingRows = [
      pendingRow('orphan-1', 'theme-a', '2026-07-12'),
      pendingRow('orphan-2', 'theme-b', '2026-07-12'),
      pendingRow('scorable', 'theme-c', '2026-07-13'),
    ]
    dbMocks.labelRows = [finalLabel('theme-c', '2026-07-13')]

    const { evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')
    const result = await evaluateThemePredictionsV3({ today: '2026-07-21' })

    expect(result.nonTradingClosed).toBe(1)
    expect(dbMocks.scoreUpdates[0]).toEqual({
      payload: { score_status: 'excluded', scored_at: expect.any(String) },
      dates: ['2026-07-12'],
    })
    // 라벨이 영원히 생기지 않을 행은 skipped로 남지 않는다 — 남으면 적체 게이트가 오탐한다
    expect(result.skippedPending).toBe(0)
    expect(result.updates).toBe(1)
  })

  it('거래일 예측만 있으면 excluded 업데이트를 아예 보내지 않는다', async () => {
    dbMocks.pendingRows = [pendingRow('p1', 'theme-a', '2026-07-13')]
    dbMocks.labelRows = [finalLabel('theme-a', '2026-07-13')]

    const { evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')
    const result = await evaluateThemePredictionsV3({ today: '2026-07-21' })

    expect(result.nonTradingClosed).toBe(0)
    expect(dbMocks.scoreUpdates.filter((call) => call.payload.score_status === 'excluded')).toEqual([])
  })
})

describe('snapshotThemePredictionsV3 — 비거래일 스냅샷 차단', () => {
  it('일요일에는 라벨이 붙을 수 없는 legacy 예측 행을 만들지 않는다', async () => {
    dbMocks.touchedTables.length = 0
    const { snapshotThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3')

    await expect(snapshotThemePredictionsV3({ today: '2026-07-26' }))
      .resolves.toEqual({ championRows: 0, challengerRows: 0 })
    // 빈 결과가 아니라 "조회조차 하지 않음"이어야 한다 — 소스 데이터가 있는 날에도 막혀야 하므로
    expect(dbMocks.touchedTables).toEqual([])
  })

  it('거래일에는 그대로 스냅샷 경로를 탄다', async () => {
    dbMocks.touchedTables.length = 0
    const { snapshotThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3')

    await snapshotThemePredictionsV3({ today: '2026-07-27' })

    expect(dbMocks.touchedTables).toContain('prediction_snapshots_v2')
  })
})
