import { describe, expect, it } from 'vitest'
import { computeEceClusterBootstrapUpper95 } from '@/lib/tli/eval/harness'
import {
  buildPromotionGateInputFromRows,
  countPromotionsThisYear,
  estimateCycleExtendedWeeks,
  isCheckpointDueSince,
} from '../gate-input-from-db'

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
