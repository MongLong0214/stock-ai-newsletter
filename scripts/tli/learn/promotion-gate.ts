import { z } from 'zod'

export const PROMOTION_GATE_LIMITS = {
  minimumEffectiveN: 250,
  maximumCycleExtensionWeeks: 8,
  maximumPromotionsPerYear: 6,
  minimumRelativeBrierImprovement: 0.02,
  maximumEcePoint: 0.08,
  maximumEceUpper95: 0.12,
  maximumPAt10Drop: 0.05,
  maximumTopThemeShareBeforeWildBootstrap: 0.30,
} as const

const finiteMetric = z.number().finite()

export const promotionGateInputSchema = z.object({
  nEff: z.number().int().nonnegative(),
  cycleExtendedWeeks: z.number().int().nonnegative(),
  promotionsThisYear: z.number().int().nonnegative(),
  brierChampion: finiteMetric.positive(),
  deltaBrierPoint: finiteMetric,
  deltaBrierUpper99: finiteMetric,
  ecePoint: finiteMetric.nonnegative(),
  eceUpper95: finiteMetric.nonnegative(),
  pAt10Challenger: finiteMetric.min(0).max(1),
  pAt10Champion: finiteMetric.min(0).max(1),
  clusterBalance: z.object({
    topFivePercentLabelShare: finiteMetric.min(0).max(1),
    wildClusterBootstrapUsed: z.boolean(),
  }),
})

export type PromotionGateInput = z.infer<typeof promotionGateInputSchema>

export const promotionGateDecisionSchema = z.enum([
  'promote',
  'keep_champion',
  'extend_checkpoint',
  'hold_and_issue',
])

export const promotionGateActionSchema = z.enum([
  'promote_artifact',
  'keep_champion',
  'extend_to_next_checkpoint',
  'hold_and_issue',
])

export const promotionGateReasonSchema = z.enum([
  'all_gates_passed',
  'sample_size_below_minimum',
  'sample_starvation',
  'promotion_cap_reached',
  'wild_cluster_bootstrap_required',
  'brier_point_not_improved',
  'brier_relative_improvement_below_2pct',
  'brier_ci_upper_above_zero',
  'ece_point_or_ci_above_limit',
  'p_at_10_guardrail',
])

export const promotionGateResultSchema = z.object({
  passed: z.boolean(),
  decision: promotionGateDecisionSchema,
  action: promotionGateActionSchema,
  reason: promotionGateReasonSchema,
  reasons: z.array(promotionGateReasonSchema),
  summary: z.string(),
  bootstrapMethod: z.enum(['theme_cluster', 'wild_cluster']),
  requiresIssue: z.boolean(),
})

export type PromotionGateResult = z.infer<typeof promotionGateResultSchema>

const result = (input: {
  readonly passed: boolean
  readonly decision: PromotionGateResult['decision']
  readonly action: PromotionGateResult['action']
  readonly reason: PromotionGateResult['reason']
  readonly summary: string
  readonly bootstrapMethod: PromotionGateResult['bootstrapMethod']
  readonly requiresIssue?: boolean
}): PromotionGateResult => ({
  passed: input.passed,
  decision: input.decision,
  action: input.action,
  reason: input.reason,
  reasons: [input.reason],
  summary: input.summary,
  bootstrapMethod: input.bootstrapMethod,
  requiresIssue: input.requiresIssue ?? false,
})

const bootstrapMethod = (input: PromotionGateInput): PromotionGateResult['bootstrapMethod'] => (
  input.clusterBalance.topFivePercentLabelShare > PROMOTION_GATE_LIMITS.maximumTopThemeShareBeforeWildBootstrap
    ? 'wild_cluster'
    : 'theme_cluster'
)

export function evaluateTliPromotionGate(input: PromotionGateInput): PromotionGateResult {
  const method = bootstrapMethod(input)

  if (input.nEff < PROMOTION_GATE_LIMITS.minimumEffectiveN) {
    if (input.cycleExtendedWeeks >= PROMOTION_GATE_LIMITS.maximumCycleExtensionWeeks) {
      return result({
        passed: false,
        decision: 'hold_and_issue',
        action: 'hold_and_issue',
        reason: 'sample_starvation',
        summary: 'sample starvation after the 8-week maximum extension',
        bootstrapMethod: method,
        requiresIssue: true,
      })
    }
    return result({
      passed: false,
      decision: 'extend_checkpoint',
      action: 'extend_to_next_checkpoint',
      reason: 'sample_size_below_minimum',
      summary: 'effective non-overlapping shadow labels below 250',
      bootstrapMethod: method,
    })
  }

  if (input.promotionsThisYear >= PROMOTION_GATE_LIMITS.maximumPromotionsPerYear) {
    return result({
      passed: false,
      decision: 'keep_champion',
      action: 'keep_champion',
      reason: 'promotion_cap_reached',
      summary: 'yearly promotion cap reached',
      bootstrapMethod: method,
    })
  }

  if (method === 'wild_cluster' && !input.clusterBalance.wildClusterBootstrapUsed) {
    return result({
      passed: false,
      decision: 'keep_champion',
      action: 'keep_champion',
      reason: 'wild_cluster_bootstrap_required',
      summary: 'cluster imbalance requires wild cluster bootstrap before promotion',
      bootstrapMethod: method,
    })
  }

  if (input.deltaBrierPoint >= 0) {
    return result({
      passed: false,
      decision: 'keep_champion',
      action: 'keep_champion',
      reason: 'brier_point_not_improved',
      summary: 'challenger Brier point estimate did not improve',
      bootstrapMethod: method,
    })
  }

  const minimumBrierDelta = -PROMOTION_GATE_LIMITS.minimumRelativeBrierImprovement * input.brierChampion
  if (input.deltaBrierPoint > minimumBrierDelta) {
    return result({
      passed: false,
      decision: 'keep_champion',
      action: 'keep_champion',
      reason: 'brier_relative_improvement_below_2pct',
      summary: 'challenger Brier improvement is below the 2% relative floor',
      bootstrapMethod: method,
    })
  }

  if (input.deltaBrierUpper99 > 0) {
    return result({
      passed: false,
      decision: 'keep_champion',
      action: 'keep_champion',
      reason: 'brier_ci_upper_above_zero',
      summary: '99% clustered Brier delta CI does not confirm improvement',
      bootstrapMethod: method,
    })
  }

  if (
    input.ecePoint > PROMOTION_GATE_LIMITS.maximumEcePoint
    || input.eceUpper95 > PROMOTION_GATE_LIMITS.maximumEceUpper95
  ) {
    return result({
      passed: false,
      decision: 'keep_champion',
      action: 'keep_champion',
      reason: 'ece_point_or_ci_above_limit',
      summary: 'ECE point or upper95 exceeds the calibration gate',
      bootstrapMethod: method,
    })
  }

  if (input.pAt10Challenger < input.pAt10Champion - PROMOTION_GATE_LIMITS.maximumPAt10Drop) {
    return result({
      passed: false,
      decision: 'keep_champion',
      action: 'keep_champion',
      reason: 'p_at_10_guardrail',
      summary: 'Rising-P@10 dropped by more than 5pp versus champion',
      bootstrapMethod: method,
    })
  }

  return result({
    passed: true,
    decision: 'promote',
    action: 'promote_artifact',
    reason: 'all_gates_passed',
    summary: 'all TLI v3 promotion gates passed',
    bootstrapMethod: method,
  })
}
