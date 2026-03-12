export const COMPARISON_PRIMARY_HORIZON_DAYS = 14 as const

export const COMPARISON_RUN_TYPES = ['prod', 'shadow', 'backtest'] as const
export type ComparisonRunType = typeof COMPARISON_RUN_TYPES[number]

export const COMPARISON_CANDIDATE_POOLS = ['archetype', 'peer', 'mixed_legacy'] as const
export type ComparisonCandidatePool = typeof COMPARISON_CANDIDATE_POOLS[number]

export const COMPARISON_TIE_BREAK = ['similarity_score_desc', 'candidate_theme_id_asc'] as const

export interface ThresholdRegime {
  id: 'curve_len_gte_14' | 'curve_len_7_13' | 'curve_len_lt_7'
  minCurveLength: number
  maxCurveLength: number | null
}

export const THRESHOLD_REGIMES: ThresholdRegime[] = [
  { id: 'curve_len_gte_14', minCurveLength: 14, maxCurveLength: null },
  { id: 'curve_len_7_13', minCurveLength: 7, maxCurveLength: 13 },
  { id: 'curve_len_lt_7', minCurveLength: 0, maxCurveLength: 6 },
]

export interface BinaryRelevanceInput {
  trajectoryCorrH14: number
  positionStageMatchH14: boolean
  stageAlignmentScore?: number
}

const STAGE_ORDER = ['Dormant', 'Emerging', 'Growth', 'Peak', 'Decline'] as const
const ADJACENT_STAGE_PAIRS = new Set([
  'Dormant|Emerging',
  'Emerging|Growth',
  'Growth|Peak',
  'Peak|Decline',
  'Decline|Dormant',
  'Emerging|Dormant',
  'Growth|Emerging',
  'Peak|Growth',
  'Decline|Peak',
  'Dormant|Decline',
])

export function computeStageAlignmentScore(
  currentStage: string | null | undefined,
  pastStage: string | null | undefined,
) {
  if (!currentStage || !pastStage) return 0
  if (
    !STAGE_ORDER.includes(currentStage as typeof STAGE_ORDER[number])
    || !STAGE_ORDER.includes(pastStage as typeof STAGE_ORDER[number])
  ) return 0

  if (currentStage === pastStage) return 1
  if (ADJACENT_STAGE_PAIRS.has(`${currentStage}|${pastStage}`)) return 0.5
  return 0
}

export function computeBinaryRelevance(input: BinaryRelevanceInput): boolean {
  const stageScore = input.positionStageMatchH14 ? 1 : (input.stageAlignmentScore ?? 0)
  if (input.trajectoryCorrH14 >= 0.3 && stageScore >= 1) return true
  return input.trajectoryCorrH14 >= 0.45 && stageScore >= 0.5
}

export function computeGradedGain(input: BinaryRelevanceInput): 0 | 1 | 2 | 3 {
  const stageScore = input.positionStageMatchH14 ? 1 : (input.stageAlignmentScore ?? 0)
  if (input.trajectoryCorrH14 >= 0.6 && stageScore >= 1) return 3
  if (input.trajectoryCorrH14 >= 0.45 && stageScore >= 0.5) return 2
  if (input.trajectoryCorrH14 >= 0.45) return 2
  if (input.trajectoryCorrH14 >= 0.3) return 1
  return 0
}

export type RunLevelCensoringReason =
  | 'run_horizon_immature'
  | 'run_missing_point_in_time_snapshot'

export function classifyRunLevelCensoring(input: {
  hasSufficientFutureWindow: boolean
  hasPointInTimeSnapshot: boolean
}): RunLevelCensoringReason | null {
  if (!input.hasSufficientFutureWindow) return 'run_horizon_immature'
  if (!input.hasPointInTimeSnapshot) return 'run_missing_point_in_time_snapshot'
  return null
}
