/** 생명주기 참고 지표 계산 모듈 v2 — Stage-derived Phase */

import { KST_OFFSET_MS } from './date-utils'
import { buildPhaseMessage, buildKeyInsight } from './prediction-helpers'
import type { Stage, ConfidenceLevel } from './types'

export type { ConfidenceLevel }
export type Phase = 'pre-peak' | 'near-peak' | 'at-peak' | 'post-peak' | 'declining'
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type Momentum = 'accelerating' | 'stable' | 'decelerating'

/** Stage → Phase 직접 매핑 (독립적 Phase 판정 제거) */
const STAGE_TO_PHASE: Record<Stage, Phase> = {
  Dormant:  'declining',
  Emerging: 'pre-peak',
  Growth:   'near-peak',
  Peak:     'at-peak',
  Decline:  'post-peak',
}

/** Stage 기반 리스크 매핑 */
const STAGE_TO_RISK: Record<Stage, RiskLevel> = {
  Dormant:  'low',
  Emerging: 'low',
  Growth:   'moderate',
  Peak:     'high',
  Decline:  'critical',
}

export interface Scenario {
  themeName: string
  peakDay: number
  totalDays: number
  similarity: number
}

export interface PredictionResult {
  daysSinceSpike: number
  confidence: ConfidenceLevel
  comparisonCount: number
  avgSimilarity: number

  avgPeakDay: number
  avgTotalDays: number
  avgDaysToPeak: number
  currentProgress: number
  peakProgress: number

  scenarios: {
    best: Scenario
    median: Scenario
    worst: Scenario
  }

  phase: Phase
  momentum: Momentum
  phaseMessage: string

  riskLevel: RiskLevel
  keyInsight: string
  /** Stage-derived Phase 신뢰도 */
  stageConfidence: number
}

export interface ComparisonInput {
  pastTheme: string
  similarity: number
  estimatedDaysToPeak: number
  pastPeakDay: number
  pastTotalDays: number
}

function weightedAvg(items: ComparisonInput[], getter: (c: ComparisonInput) => number): number {
  const totalWeight = items.reduce((s, c) => s + c.similarity, 0)
  if (totalWeight <= 0) return 0
  return items.reduce((s, c) => s + getter(c) * c.similarity, 0) / totalWeight
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function deriveConfidence(count: number, avgSimilarity: number): ConfidenceLevel {
  if (count >= 3 && avgSimilarity >= 0.55) return 'high'
  if (count >= 2 && avgSimilarity >= 0.40) return 'medium'
  return 'low'
}

/** 비교 데이터 기반 다수결 모멘텀 판정 */
function deriveMomentum(comparisons: ComparisonInput[], daysSinceSpike: number): Momentum {
  if (comparisons.length === 0) return 'stable'

  let accel = 0
  let decel = 0

  for (const c of comparisons) {
    if (c.pastPeakDay <= 0) continue
    // 비교 테마 정점까지의 진행률 vs 현재 진행률
    const pastProgress = daysSinceSpike / c.pastPeakDay
    if (pastProgress < 0.7) accel++
    else if (pastProgress > 1.1) decel++
  }

  if (accel > decel && accel > comparisons.length * 0.4) return 'accelerating'
  if (decel > accel && decel > comparisons.length * 0.4) return 'decelerating'
  return 'stable'
}

/** Stage 기반 리스크 (confidence로 보정) */
function deriveRisk(stage: Stage | undefined, phase: Phase, confidence: ConfidenceLevel): RiskLevel {
  if (stage) return STAGE_TO_RISK[stage]

  // stage 미제공 시 phase 폴백
  if (phase === 'declining' || phase === 'post-peak') return 'critical'
  if (phase === 'at-peak') return 'high'
  if (phase === 'near-peak') return 'moderate'
  if (phase === 'pre-peak' && confidence !== 'low') return 'low'
  return 'moderate'
}

/**
 * Stage-derived Phase 신뢰도
 * - Stage + 비교 다수결 + 점수 방향이 모두 일치 → 0.9
 * - 2/3 일치 → 0.6
 * - 그 외 → 0.3
 */
function computeStageConfidence(
  phase: Phase,
  momentum: Momentum,
  score: number | undefined,
  avgPeakDay: number,
  daysSinceSpike: number,
): number {
  // 시그널 1: phase가 상승 계열인지
  const phaseIsRising = phase === 'pre-peak' || phase === 'near-peak'
  const phaseIsFalling = phase === 'post-peak' || phase === 'declining'

  // 시그널 2: momentum 방향
  const momentumIsRising = momentum === 'accelerating'
  const momentumIsFalling = momentum === 'decelerating'

  // 시그널 3: 점수 기반 방향 (있을 때만)
  let scoreDirection: 'rising' | 'falling' | 'neutral' = 'neutral'
  if (score !== undefined) {
    if (score >= 50) scoreDirection = 'rising'
    else if (score < 30) scoreDirection = 'falling'
  }

  // 시그널 4: 비교 데이터 기반 위치
  let compDirection: 'rising' | 'falling' | 'neutral' = 'neutral'
  if (avgPeakDay > 0) {
    if (daysSinceSpike < avgPeakDay * 0.8) compDirection = 'rising'
    else if (daysSinceSpike > avgPeakDay * 1.2) compDirection = 'falling'
  }

  // 일치도 계산
  let risingVotes = 0
  let fallingVotes = 0

  if (phaseIsRising) risingVotes++
  if (phaseIsFalling) fallingVotes++
  if (momentumIsRising) risingVotes++
  if (momentumIsFalling) fallingVotes++
  if (scoreDirection === 'rising') risingVotes++
  if (scoreDirection === 'falling') fallingVotes++
  if (compDirection === 'rising') risingVotes++
  if (compDirection === 'falling') fallingVotes++

  const maxVotes = Math.max(risingVotes, fallingVotes)
  const totalSignals = (phaseIsRising || phaseIsFalling ? 1 : 0) +
    (momentumIsRising || momentumIsFalling ? 1 : 0) +
    (scoreDirection !== 'neutral' ? 1 : 0) +
    (compDirection !== 'neutral' ? 1 : 0)

  if (totalSignals === 0) return 0.3

  const agreement = maxVotes / totalSignals
  if (agreement >= 0.9) return 0.9
  if (agreement >= 0.6) return 0.6
  return 0.3
}

function buildScenarios(comparisons: ComparisonInput[]): { best: Scenario; median: Scenario; worst: Scenario } {
  const sorted = [...comparisons].sort((a, b) => a.pastTotalDays - b.pastTotalDays)
  const toScenario = (c: ComparisonInput): Scenario => ({
    themeName: c.pastTheme,
    peakDay: c.pastPeakDay,
    totalDays: c.pastTotalDays,
    similarity: c.similarity,
  })
  const midIdx = Math.floor(sorted.length / 2)
  return {
    best: toScenario(sorted[0]),
    median: toScenario(sorted[midIdx]),
    worst: toScenario(sorted[sorted.length - 1]),
  }
}

/**
 * 생명주기 참고 지표 계산
 * @param stage Stage (제공 시 Phase가 Stage에서 직접 파생)
 */
export function calculatePrediction(
  firstSpikeDate: string | null,
  comparisons: ComparisonInput[],
  today?: string,
  score?: number,
  stage?: Stage,
): PredictionResult | null {
  const validComparisons = comparisons.filter(c => c.pastTotalDays >= 14 && c.pastPeakDay >= 3)
  if (validComparisons.length < 2) return null

  const now = today ? new Date(today).getTime() : Date.now() + KST_OFFSET_MS
  const spike = firstSpikeDate ? new Date(firstSpikeDate).getTime() : 0
  const daysSinceSpike = firstSpikeDate
    ? Math.min(365, Math.max(0, Math.floor((now - spike) / 86_400_000)))
    : 0

  const avgSimilarity = validComparisons.reduce((s, c) => s + c.similarity, 0) / validComparisons.length
  if (avgSimilarity < 0.40) return null

  const avgPeakDay = Math.round(weightedAvg(validComparisons, c => c.pastPeakDay))
  const avgTotalDays = Math.min(Math.round(weightedAvg(validComparisons, c => c.pastTotalDays)), 365)

  if (avgTotalDays < 3) return null

  const positivePeakComps = validComparisons.filter(c => c.estimatedDaysToPeak > 0)
  const avgDaysToPeak = positivePeakComps.length > 0
    ? Math.round(weightedAvg(positivePeakComps, c => c.estimatedDaysToPeak))
    : 0

  const currentProgress = avgTotalDays > 0 ? clamp((daysSinceSpike / avgTotalDays) * 100, 0, 100) : 0
  const peakProgress = avgTotalDays > 0 ? clamp((avgPeakDay / avgTotalDays) * 100, 0, 100) : 0

  const comparisonCount = validComparisons.length
  const confidence = deriveConfidence(comparisonCount, avgSimilarity)

  // Phase: Stage에서 직접 파생 (Stage 미제공 시 비교 데이터 폴백)
  const phase = stage
    ? STAGE_TO_PHASE[stage]
    : derivePhaseFallback(daysSinceSpike, avgPeakDay, avgTotalDays, score)

  const momentum = deriveMomentum(validComparisons, daysSinceSpike)
  const riskLevel = deriveRisk(stage, phase, confidence)
  const scenarios = buildScenarios(validComparisons)
  const stageConfidence = computeStageConfidence(phase, momentum, score, avgPeakDay, daysSinceSpike)

  return {
    daysSinceSpike,
    confidence,
    comparisonCount,
    avgSimilarity,
    avgPeakDay,
    avgTotalDays,
    avgDaysToPeak,
    currentProgress,
    peakProgress,
    scenarios,
    phase,
    momentum,
    phaseMessage: buildPhaseMessage(phase, avgDaysToPeak, score),
    riskLevel,
    keyInsight: buildKeyInsight(phase, avgDaysToPeak, score),
    stageConfidence,
  }
}

/** Stage 미제공 시 비교 데이터 기반 Phase 폴백 (하위 호환) */
function derivePhaseFallback(
  daysSinceSpike: number,
  avgPeakDay: number,
  avgTotalDays: number,
  score?: number,
): Phase {
  if (score !== undefined && score > 0) {
    if (score >= 75) return 'at-peak'
    if (score >= 55) return 'near-peak'
    if (score < 25) {
      if (avgPeakDay > 0 && daysSinceSpike > avgPeakDay) return 'declining'
      return 'pre-peak'
    }
    if (avgPeakDay >= 3 && avgTotalDays > 0) {
      if (daysSinceSpike > avgTotalDays * 0.8) return 'declining'
      if (daysSinceSpike > avgPeakDay) return 'post-peak'
      if (daysSinceSpike > avgPeakDay * 0.7) return 'near-peak'
    }
    return 'pre-peak'
  }

  if (avgPeakDay <= 0 || avgTotalDays <= 0) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.7) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.95) return 'near-peak'
  if (daysSinceSpike <= avgPeakDay * 1.1) return 'at-peak'
  if (daysSinceSpike < avgTotalDays * 0.8) return 'post-peak'
  return 'declining'
}
