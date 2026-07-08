import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeEceClusterBootstrapUpper95 } from '@/lib/tli/eval/harness'
import {
  buildPromotionGateInputFromDb,
  buildPromotionGateInputFromRows,
  countPromotionsThisYear,
  estimateCycleExtendedWeeks,
  isCheckpointDueSince,
} from '../gate-input-from-db'

interface GateDbQueryRecord {
  readonly table: string
  readonly select: string | null
  readonly eqFilters: Readonly<Record<string, unknown>>
}

interface GateDbMocks {
  registryRows: Record<string, unknown>[]
  predictionRows: Record<string, unknown>[]
  queries: GateDbQueryRecord[]
}

const gateDbMocks = vi.hoisted<GateDbMocks>(() => ({
  registryRows: [],
  predictionRows: [],
  queries: [],
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  interface QueryState {
    readonly table: string
    select: string | null
    readonly eqFilters: Map<string, unknown>
  }

  interface QueryResult {
    readonly data: Record<string, unknown>[]
    readonly error: null
  }

  interface QueryBuilder extends PromiseLike<QueryResult> {
    select(columns: string): QueryBuilder
    eq(column: string, value: unknown): QueryBuilder
  }

  const resolveRows = (state: QueryState): Record<string, unknown>[] => {
    const rows = state.table === 'model_registry' ? gateDbMocks.registryRows : gateDbMocks.predictionRows
    return rows.filter((row) => (
      [...state.eqFilters].every(([column, value]) => row[column] === value)
    ))
  }

  const createQueryBuilder = (table: string): QueryBuilder => {
    const state: QueryState = {
      table,
      select: null,
      eqFilters: new Map<string, unknown>(),
    }
    const builder: QueryBuilder = {
      select(columns: string): QueryBuilder {
        state.select = columns
        return builder
      },
      eq(column: string, value: unknown): QueryBuilder {
        state.eqFilters.set(column, value)
        return builder
      },
      then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        gateDbMocks.queries.push({
          table: state.table,
          select: state.select,
          eqFilters: Object.fromEntries(state.eqFilters),
        })
        return Promise.resolve({ data: resolveRows(state), error: null }).then(onfulfilled, onrejected)
      },
    }
    return builder
  }

  return {
    supabaseAdmin: {
      from: vi.fn(createQueryBuilder),
    },
  }
})

beforeEach(() => {
  gateDbMocks.registryRows = []
  gateDbMocks.predictionRows = []
  gateDbMocks.queries = []
})

describe('isCheckpointDueSince (H.3)', () => {
  it('is always due when the champion has never been evaluated', () => {
    expect(isCheckpointDueSince(null, '2026-07-06')).toBe(true)
  })

  it('is not due before 28 days have elapsed', () => {
    expect(isCheckpointDueSince('2026-06-15', '2026-07-06')).toBe(false) // 21 days
  })

  it('is due once 28 days have elapsed', () => {
    expect(isCheckpointDueSince('2026-06-08', '2026-07-06')).toBe(true) // 28 days
  })
})

describe('estimateCycleExtendedWeeks', () => {
  it('is 0 when there is no promotion date', () => {
    expect(estimateCycleExtendedWeeks(null, '2026-07-06')).toBe(0)
  })

  it('returns 0 for up to the initial 4-week shadow cycle', () => {
    expect(estimateCycleExtendedWeeks('2026-06-08T00:00:00Z', '2026-07-06')).toBe(0) // 4 weeks
  })

  it('returns weeks elapsed past the initial 4-week cycle', () => {
    expect(estimateCycleExtendedWeeks('2026-05-11T00:00:00Z', '2026-07-06')).toBe(4) // 8 weeks since promotion
  })

  it('reaches the 8-week sample-starvation boundary at 12 weeks since promotion', () => {
    expect(estimateCycleExtendedWeeks('2026-04-13T00:00:00Z', '2026-07-06')).toBe(8) // 12 weeks since promotion
  })

  it('floors weeks-since-promotion (non-negative even before the initial cycle)', () => {
    expect(estimateCycleExtendedWeeks('2026-07-01T00:00:00Z', '2026-07-06')).toBe(0)
  })
})

describe('countPromotionsThisYear', () => {
  it('counts only promotions within the as-of year', () => {
    const history = [
      { model_version: 'a', status: 'archived', promoted_at: '2025-12-01T00:00:00Z' },
      { model_version: 'b', status: 'archived', promoted_at: '2026-02-01T00:00:00Z' },
      { model_version: 'c', status: 'champion', promoted_at: '2026-06-01T00:00:00Z' },
      { model_version: 'd', status: 'challenger', promoted_at: null },
    ]
    expect(countPromotionsThisYear(history, '2026-07-06')).toBe(2)
  })
})

// F4: eceUpper95 now delegates to the shared lib/tli/eval/bootstrap.ts implementation
// (computeEceClusterBootstrapUpper95, dedicated coverage in lib/tli/__tests__/eval-harness.test.ts)
// so buildPromotionGateInputFromRows only needs to assert it is actually wired through below.

describe('buildPromotionGateInputFromRows', () => {
  it('assembles a PromotionGateInput from scored champion/challenger rows and registry history', () => {
    const championScored = Array.from({ length: 10 }, (_, i) => ({
      theme_id: `theme-${i}`,
      prediction_date: '2026-06-01',
      p_rise: i % 2 === 0 ? 0.7 : 0.3,
      abstain: false,
      actual_y: i % 2 === 0,
    }))
    const challengerScored = Array.from({ length: 10 }, (_, i) => ({
      theme_id: `theme-${i}`,
      prediction_date: '2026-06-01',
      p_rise: i % 2 === 0 ? 0.9 : 0.1,
      abstain: false,
      actual_y: i % 2 === 0,
    }))
    const registryHistory = [
      { model_version: 'b-abl-v1', status: 'champion', promoted_at: '2026-05-01T00:00:00Z' },
      { model_version: 'm1-2026w20', status: 'challenger', promoted_at: null },
    ]

    const input = buildPromotionGateInputFromRows({
      asOfDate: '2026-07-06',
      championScored,
      challengerScored,
      registryHistory,
    })

    expect(input.nEff).toBeGreaterThanOrEqual(0)
    expect(input.promotionsThisYear).toBe(1)
    expect(input.clusterBalance.topFivePercentLabelShare).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(input.brierChampion)).toBe(true)
    expect(Number.isFinite(input.deltaBrierPoint)).toBe(true)
    expect(Number.isFinite(input.eceUpper95)).toBe(true)
  })

  it('binds the Brier delta CI sample to the non-overlapping (Monday) subset, matching nEff (B-4/N3)', () => {
    // 2026-06-01 is a Monday; 2026-06-02 is a Tuesday (overlapping, excluded from the gating CI).
    const championScored = [
      { theme_id: 'theme-mon-1', prediction_date: '2026-06-01', p_rise: 0.7, abstain: false, actual_y: true },
      { theme_id: 'theme-mon-2', prediction_date: '2026-06-01', p_rise: 0.3, abstain: false, actual_y: false },
      { theme_id: 'theme-tue-1', prediction_date: '2026-06-02', p_rise: 0.6, abstain: false, actual_y: true },
    ]
    const challengerScored = [
      { theme_id: 'theme-mon-1', prediction_date: '2026-06-01', p_rise: 0.9, abstain: false, actual_y: true },
      { theme_id: 'theme-mon-2', prediction_date: '2026-06-01', p_rise: 0.1, abstain: false, actual_y: false },
      { theme_id: 'theme-tue-1', prediction_date: '2026-06-02', p_rise: 0.8, abstain: false, actual_y: true },
    ]

    const input = buildPromotionGateInputFromRows({
      asOfDate: '2026-07-06',
      championScored,
      challengerScored,
      registryHistory: [],
    })

    // nEff counts only the 2 Monday rows; the gating CI must be paired over the same 2 rows.
    expect(input.nEff).toBe(2)
    // Both Monday-only paired deltas are exactly -0.08; including the Tuesday row (-0.12) would
    // pull meanDelta toward -0.0933. A value of -0.08 proves the Tuesday row was excluded.
    expect(input.deltaBrierPoint).toBeCloseTo(-0.08, 6)
  })

  it('handles empty inputs without throwing (eceUpper95 follows the shared fail-closed policy)', () => {
    const input = buildPromotionGateInputFromRows({
      asOfDate: '2026-07-06',
      championScored: [],
      challengerScored: [],
      registryHistory: [],
    })
    expect(input.nEff).toBe(0)
    // N4 contract: an empty/unresolved bootstrap sample reads as worst-case (1), not 0.
    expect(input.eceUpper95).toBe(computeEceClusterBootstrapUpper95([]))
    expect(input.eceUpper95).toBe(1)
  })
})

describe('buildPromotionGateInputFromDb', () => {
  it('evaluates only the current champion and challenger model versions from model_registry', async () => {
    gateDbMocks.registryRows = [
      { model_version: 'champion-vX', status: 'champion', promoted_at: '2026-05-01T00:00:00Z' },
      { model_version: 'challenger-vY', status: 'challenger', promoted_at: null },
      { model_version: 'challenger-vOLD', status: 'archived', promoted_at: null },
    ]
    gateDbMocks.predictionRows = [
      { theme_id: 'theme-a', prediction_date: '2026-06-01', model_version: 'champion-vX', serving_role: 'champion', score_status: 'scored', p_rise: 0.7, abstain: false, actual_y: true },
      { theme_id: 'theme-b', prediction_date: '2026-06-01', model_version: 'champion-vX', serving_role: 'champion', score_status: 'scored', p_rise: 0.3, abstain: false, actual_y: false },
      { theme_id: 'theme-stale-champion', prediction_date: '2026-06-01', model_version: 'champion-vOLD', serving_role: 'champion', score_status: 'scored', p_rise: 0.9, abstain: false, actual_y: false },
      { theme_id: 'theme-a', prediction_date: '2026-06-01', model_version: 'challenger-vY', serving_role: 'challenger', score_status: 'scored', p_rise: 0.9, abstain: false, actual_y: true },
      { theme_id: 'theme-b', prediction_date: '2026-06-01', model_version: 'challenger-vY', serving_role: 'challenger', score_status: 'scored', p_rise: 0.1, abstain: false, actual_y: false },
      { theme_id: 'theme-stale-challenger', prediction_date: '2026-06-01', model_version: 'challenger-vOLD', serving_role: 'challenger', score_status: 'scored', p_rise: 0.8, abstain: false, actual_y: false },
    ]

    const input = await buildPromotionGateInputFromDb({ asOfDate: '2026-07-06' })

    expect(input.nEff).toBe(2)
    expect(input.brierChampion).toBeCloseTo(0.09, 6)
    expect(input.deltaBrierPoint).toBeCloseTo(-0.08, 6)
    expect(gateDbMocks.queries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'theme_predictions_v3',
        eqFilters: expect.objectContaining({
          serving_role: 'champion',
          score_status: 'scored',
          model_version: 'champion-vX',
        }),
      }),
      expect.objectContaining({
        table: 'theme_predictions_v3',
        eqFilters: expect.objectContaining({
          serving_role: 'challenger',
          score_status: 'scored',
          model_version: 'challenger-vY',
        }),
      }),
    ]))
  })

  it('fails loudly when model_registry has no current challenger', async () => {
    gateDbMocks.registryRows = [
      { model_version: 'champion-vX', status: 'champion', promoted_at: '2026-05-01T00:00:00Z' },
    ]

    await expect(buildPromotionGateInputFromDb({ asOfDate: '2026-07-06' }))
      .rejects.toThrow('model_registry current challenger 조회 실패: challenger 행이 없습니다')
  })

  it('fails loudly when model_registry has no current champion', async () => {
    gateDbMocks.registryRows = [
      { model_version: 'challenger-vY', status: 'challenger', promoted_at: null },
    ]

    await expect(buildPromotionGateInputFromDb({ asOfDate: '2026-07-06' }))
      .rejects.toThrow('model_registry current champion 조회 실패: champion 행이 없습니다')
  })
})
