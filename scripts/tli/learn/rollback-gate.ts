import { z } from 'zod'

export const ROLLBACK_LIMITS = {
  rollingWindowDays: 28,
  brierRegressionThreshold: 0.10,
  minimumDailyMetricRows: 1,
} as const

const finiteMetric = z.number().finite()

export const rollbackGateInputSchema = z.object({
  championModelVersion: z.string().min(1),
  previousModelVersion: z.string().min(1).nullable(),
  championMeanBrier: finiteMetric.nonnegative().nullable(),
  previousMeanBrier: finiteMetric.nonnegative().nullable(),
  championMetricDays: z.number().int().nonnegative(),
  previousMetricDays: z.number().int().nonnegative(),
})

export type RollbackGateInput = z.infer<typeof rollbackGateInputSchema>

export const rollbackGateResultSchema = z.object({
  shouldRollback: z.boolean(),
  action: z.enum(['rollback', 'keep_champion']),
  reason: z.enum([
    'champion_brier_regressed_over_10pct',
    'missing_previous_model',
    'insufficient_champion_metrics',
    'insufficient_previous_metrics',
    'champion_not_worse_than_previous',
  ]),
  relativeBrierChange: finiteMetric.nullable(),
})

export type RollbackGateResult = z.infer<typeof rollbackGateResultSchema>

const keep = (
  reason: RollbackGateResult['reason'],
  relativeBrierChange: number | null,
): RollbackGateResult => ({
  shouldRollback: false,
  action: 'keep_champion',
  reason,
  relativeBrierChange,
})

export function evaluateRollbackGate(input: RollbackGateInput): RollbackGateResult {
  if (!input.previousModelVersion) return keep('missing_previous_model', null)
  if (
    input.championMetricDays < ROLLBACK_LIMITS.minimumDailyMetricRows
    || input.championMeanBrier === null
  ) {
    return keep('insufficient_champion_metrics', null)
  }
  if (
    input.previousMetricDays < ROLLBACK_LIMITS.minimumDailyMetricRows
    || input.previousMeanBrier === null
  ) {
    return keep('insufficient_previous_metrics', null)
  }

  const relativeBrierChange = input.previousMeanBrier === 0
    ? Number.POSITIVE_INFINITY
    : (input.championMeanBrier - input.previousMeanBrier) / input.previousMeanBrier

  if (relativeBrierChange > ROLLBACK_LIMITS.brierRegressionThreshold) {
    return {
      shouldRollback: true,
      action: 'rollback',
      reason: 'champion_brier_regressed_over_10pct',
      relativeBrierChange,
    }
  }

  return keep('champion_not_worse_than_previous', relativeBrierChange)
}
