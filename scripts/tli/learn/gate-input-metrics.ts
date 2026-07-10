import {
  computeBrierDeltaCi,
  computeEceClusterBootstrapUpper95,
  detectClusterImbalance,
  evaluateWithWeeklyMondaySubset,
  selectWeeklyMondaySubset,
} from '../../../lib/tli/eval/harness'
import type { EvalPredictionRow } from '../../../lib/tli/eval/harness'
import type { PromotionGateInput } from './legacy-promotion-gate'

export interface ScoredPredictionRow {
  readonly theme_id: string
  readonly prediction_date: string
  readonly p_rise: number | null
  readonly abstain: boolean
  readonly actual_y: boolean | null
}

export interface ModelRegistryHistoryRow {
  readonly model_version: string
  readonly status: string
  readonly promoted_at: string | null
}

const toEvalRows = (rows: readonly ScoredPredictionRow[]): EvalPredictionRow[] => rows.map((row) => {
  if (row.actual_y === null) throw new Error('scored gate input requires non-null actual_y')
  return {
    id: `${row.theme_id}|${row.prediction_date}`,
    themeId: row.theme_id,
    baseDate: row.prediction_date,
    probability: row.abstain ? null : row.p_rise,
    y: row.actual_y,
  }
})

const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4))

export function countPromotionsThisYear(
  history: readonly ModelRegistryHistoryRow[],
  asOfDate: string,
): number {
  const year = yearOf(asOfDate)
  return history.filter((row) => row.promoted_at !== null && yearOf(row.promoted_at) === year).length
}

const INITIAL_SHADOW_CYCLE_WEEKS = 4

export function estimateCycleExtendedWeeks(promotedAt: string | null, asOfDate: string): number {
  if (!promotedAt) return 0
  const asOfMs = Date.parse(`${asOfDate}T00:00:00Z`)
  const promotedMs = Date.parse(promotedAt)
  if (!Number.isFinite(asOfMs) || !Number.isFinite(promotedMs) || asOfMs < promotedMs) return 0
  const weeksSincePromotion = Math.floor((asOfMs - promotedMs) / (7 * 24 * 60 * 60 * 1000))
  return Math.max(0, weeksSincePromotion - INITIAL_SHADOW_CYCLE_WEEKS)
}

export function buildPromotionGateInputFromRows(input: {
  readonly asOfDate: string
  readonly championScored: readonly ScoredPredictionRow[]
  readonly challengerScored: readonly ScoredPredictionRow[]
  readonly registryHistory: readonly ModelRegistryHistoryRow[]
}): PromotionGateInput {
  const championRows = toEvalRows(input.championScored)
  const challengerRows = toEvalRows(input.challengerScored)
  const championSummary = evaluateWithWeeklyMondaySubset(championRows)
  const challengerSummary = evaluateWithWeeklyMondaySubset(challengerRows)
  const brierDeltaCi = computeBrierDeltaCi({
    baseline: selectWeeklyMondaySubset(championRows),
    candidate: selectWeeklyMondaySubset(challengerRows),
    confidenceLevel: 0.99,
  })
  const imbalance = detectClusterImbalance(challengerRows.map((row) => ({ clusterId: row.themeId })))
  const currentChampion = input.registryHistory.find((row) => row.status === 'champion')

  return {
    nEff: challengerSummary.nonOverlappingN,
    cycleExtendedWeeks: estimateCycleExtendedWeeks(currentChampion?.promoted_at ?? null, input.asOfDate),
    promotionsThisYear: countPromotionsThisYear(input.registryHistory, input.asOfDate),
    brierChampion: championSummary.weeklyMonday.brier ?? championSummary.raw.brier ?? 0.25,
    deltaBrierPoint: brierDeltaCi.meanDelta,
    deltaBrierUpper99: brierDeltaCi.upper,
    ecePoint: challengerSummary.weeklyMonday.ece ?? challengerSummary.raw.ece ?? 0,
    eceUpper95: computeEceClusterBootstrapUpper95(selectWeeklyMondaySubset(challengerRows)),
    pAt10Challenger: challengerSummary.weeklyMonday.risingPAt10 ?? challengerSummary.raw.risingPAt10 ?? 0,
    pAt10Champion: championSummary.weeklyMonday.risingPAt10 ?? championSummary.raw.risingPAt10 ?? 0,
    clusterBalance: {
      topFivePercentLabelShare: imbalance.topClusterShare,
      wildClusterBootstrapUsed: imbalance.useWildClusterBootstrap,
    },
  }
}
