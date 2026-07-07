import { describe, expect, it } from 'vitest'
import {
  evaluateTliPromotionGate,
  promotionGateInputSchema,
  type PromotionGateInput,
} from '../promotion-gate'

const passingInput = (overrides: Partial<PromotionGateInput> = {}): PromotionGateInput => ({
  nEff: 320,
  cycleExtendedWeeks: 0,
  promotionsThisYear: 1,
  brierChampion: 0.20,
  deltaBrierPoint: -0.006,
  deltaBrierUpper99: -0.001,
  ecePoint: 0.05,
  eceUpper95: 0.09,
  pAt10Challenger: 0.47,
  pAt10Champion: 0.50,
  clusterBalance: {
    topFivePercentLabelShare: 0.24,
    wildClusterBootstrapUsed: false,
  },
  ...overrides,
})

describe('T-301 promotion gate', () => {
  it('extends the checkpoint when n_eff is below 250 before the 8-week cap', () => {
    const result = evaluateTliPromotionGate(passingInput({ nEff: 249, cycleExtendedWeeks: 4 }))

    expect(result.decision).toBe('extend_checkpoint')
    expect(result.action).toBe('extend_to_next_checkpoint')
    expect(result.reason).toBe('sample_size_below_minimum')
  })

  it('holds and requires an issue after sample starvation at the 8-week cap', () => {
    const result = evaluateTliPromotionGate(passingInput({ nEff: 249, cycleExtendedWeeks: 8 }))

    expect(result.decision).toBe('hold_and_issue')
    expect(result.reason).toBe('sample_starvation')
    expect(result.requiresIssue).toBe(true)
  })

  it('keeps champion when the yearly promotion cap is reached', () => {
    const result = evaluateTliPromotionGate(passingInput({ promotionsThisYear: 6 }))

    expect(result.decision).toBe('keep_champion')
    expect(result.reason).toBe('promotion_cap_reached')
  })

  it('requires wild cluster bootstrap when label clusters are imbalanced', () => {
    const result = evaluateTliPromotionGate(passingInput({
      clusterBalance: {
        topFivePercentLabelShare: 0.31,
        wildClusterBootstrapUsed: false,
      },
    }))

    expect(result.decision).toBe('keep_champion')
    expect(result.reason).toBe('wild_cluster_bootstrap_required')
    expect(result.bootstrapMethod).toBe('wild_cluster')
  })

  it('keeps champion when the Brier point estimate is not improved', () => {
    const result = evaluateTliPromotionGate(passingInput({ deltaBrierPoint: 0 }))

    expect(result.reason).toBe('brier_point_not_improved')
  })

  it('keeps champion when relative Brier improvement is below 2%', () => {
    const result = evaluateTliPromotionGate(passingInput({ deltaBrierPoint: -0.003 }))

    expect(result.reason).toBe('brier_relative_improvement_below_2pct')
  })

  it('keeps champion when the 99% Brier CI upper bound is above zero', () => {
    const result = evaluateTliPromotionGate(passingInput({ deltaBrierUpper99: 0.0001 }))

    expect(result.reason).toBe('brier_ci_upper_above_zero')
  })

  it('keeps champion when ECE point exceeds 0.08', () => {
    const result = evaluateTliPromotionGate(passingInput({ ecePoint: 0.081 }))

    expect(result.reason).toBe('ece_point_or_ci_above_limit')
  })

  it('keeps champion when ECE upper95 exceeds 0.12', () => {
    const result = evaluateTliPromotionGate(passingInput({ eceUpper95: 0.121 }))

    expect(result.reason).toBe('ece_point_or_ci_above_limit')
  })

  it('keeps champion when Rising-P@10 drops more than 5pp', () => {
    const result = evaluateTliPromotionGate(passingInput({ pAt10Challenger: 0.449, pAt10Champion: 0.50 }))

    expect(result.reason).toBe('p_at_10_guardrail')
  })

  it('promotes when all gates pass', () => {
    const result = evaluateTliPromotionGate(passingInput())

    expect(result.passed).toBe(true)
    expect(result.decision).toBe('promote')
    expect(result.action).toBe('promote_artifact')
  })

  it('allows promotion with wild cluster bootstrap when imbalance fallback was used', () => {
    const result = evaluateTliPromotionGate(passingInput({
      clusterBalance: {
        topFivePercentLabelShare: 0.31,
        wildClusterBootstrapUsed: true,
      },
    }))

    expect(result.decision).toBe('promote')
    expect(result.bootstrapMethod).toBe('wild_cluster')
  })

  it('parses only finite gate metrics', () => {
    expect(() => promotionGateInputSchema.parse(passingInput({ ecePoint: Number.NaN }))).toThrow()
  })
})
