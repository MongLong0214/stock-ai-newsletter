/** 예측 계산 헬퍼 — types, constants, utilities, message builders */

import type { Stage, ConfidenceLevel, PredictionInterval } from './types'

// ── Types ──

export type { ConfidenceLevel }
export type Phase = 'rising' | 'hot' | 'cooling'
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type Momentum = 'accelerating' | 'stable' | 'decelerating'

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
  stageConfidence: number
  predictionIntervals?: {
    peakDay: PredictionInterval | null;
    totalDays: PredictionInterval | null;
  }
}

export interface ComparisonInput {
  pastTheme: string
  similarity: number
  estimatedDaysToPeak: number
  pastPeakDay: number
  pastTotalDays: number
}

// ── Constants ──

export const STAGE_TO_PHASE: Record<Stage, Phase> = {
  Dormant:  'cooling',
  Emerging: 'rising',
  Growth:   'rising',
  Peak:     'hot',
  Decline:  'cooling',
}

const STAGE_TO_RISK: Record<Stage, RiskLevel> = {
  Dormant:  'low',
  Emerging: 'low',
  Growth:   'moderate',
  Peak:     'high',
  Decline:  'critical',
}

// ── Utility Functions ──

export function weightedAvg(items: ComparisonInput[], getter: (c: ComparisonInput) => number): number {
  const totalWeight = items.reduce((s, c) => s + c.similarity, 0)
  if (totalWeight <= 0) return 0
  return items.reduce((s, c) => s + getter(c) * c.similarity, 0) / totalWeight
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function deriveConfidence(count: number, avgSimilarity: number): ConfidenceLevel {
  if (count >= 5 && avgSimilarity >= 0.55) return 'high'
  if (count >= 3 && avgSimilarity >= 0.40) return 'medium'
  return 'low'
}

export function deriveMomentum(comparisons: ComparisonInput[], daysSinceSpike: number): Momentum {
  if (comparisons.length === 0) return 'stable'

  let accel = 0
  let decel = 0

  for (const c of comparisons) {
    if (c.pastPeakDay <= 0) continue
    const pastProgress = daysSinceSpike / c.pastPeakDay
    if (pastProgress < 0.7) accel++
    else if (pastProgress > 1.1) decel++
  }

  if (accel > decel && accel > comparisons.length * 0.4) return 'accelerating'
  if (decel > accel && decel > comparisons.length * 0.4) return 'decelerating'
  return 'stable'
}

export function deriveRisk(stage: Stage | undefined, phase: Phase, confidence: ConfidenceLevel): RiskLevel {
  if (stage) return STAGE_TO_RISK[stage]

  if (phase === 'cooling') return 'critical'
  if (phase === 'hot') return 'high'
  if (phase === 'rising' && confidence !== 'low') return 'low'
  return 'moderate'
}

export function computeStageConfidence(
  phase: Phase,
  momentum: Momentum,
  score: number | undefined,
  avgPeakDay: number,
  daysSinceSpike: number,
): number {
  const phaseIsRising = phase === 'rising'
  const phaseIsFalling = phase === 'cooling'
  const momentumIsRising = momentum === 'accelerating'
  const momentumIsFalling = momentum === 'decelerating'

  let scoreDirection: 'rising' | 'falling' | 'neutral' = 'neutral'
  if (score !== undefined) {
    if (score >= 50) scoreDirection = 'rising'
    else if (score < 30) scoreDirection = 'falling'
  }

  let compDirection: 'rising' | 'falling' | 'neutral' = 'neutral'
  if (avgPeakDay > 0) {
    if (daysSinceSpike < avgPeakDay * 0.8) compDirection = 'rising'
    else if (daysSinceSpike > avgPeakDay * 1.2) compDirection = 'falling'
  }

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

export function buildScenarios(comparisons: ComparisonInput[]): { best: Scenario; median: Scenario; worst: Scenario } {
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

export function derivePhaseFallback(
  daysSinceSpike: number,
  avgPeakDay: number,
  avgTotalDays: number,
  score?: number,
): Phase {
  if (score !== undefined && score > 0) {
    if (score >= 70) return 'hot'
    if (score < 25) {
      if (avgPeakDay > 0 && daysSinceSpike > avgPeakDay) return 'cooling'
      return 'rising'
    }
    if (avgPeakDay >= 3 && avgTotalDays > 0) {
      if (daysSinceSpike > avgPeakDay * 1.1) return 'cooling'
    }
    return 'rising'
  }

  if (avgPeakDay <= 0 || avgTotalDays <= 0) return 'rising'
  if (daysSinceSpike < avgPeakDay * 0.9) return 'rising'
  if (daysSinceSpike <= avgPeakDay * 1.1) return 'hot'
  return 'cooling'
}

// ── Message Builders ──

export function buildPhaseMessage(phase: Phase, avgDaysToPeak: number, score?: number): string {
  if (score !== undefined && score >= 75) return `점수 ${score}점 · 정점 구간 통과 중`
  if (score !== undefined && score >= 55) return `점수 ${score}점 · 성장 구간 진입`

  switch (phase) {
    case 'rising':
      return avgDaysToPeak > 0
        ? `정점까지 약 ${avgDaysToPeak}일 남음`
        : '상승 구간이에요'
    case 'hot':
      return '정점 구간을 지나고 있어요'
    case 'cooling':
      return '방향 전환 가능성이 있어요'
  }
}

export function buildKeyInsight(phase: Phase, avgDaysToPeak: number, score?: number): string {
  if (score !== undefined && score >= 75) {
    return `현재 점수 ${score}점으로 관심이 매우 높아요. 이후 하락 전환에 유의하세요`
  }
  if (score !== undefined && score >= 55) {
    return avgDaysToPeak > 0
      ? `현재 점수 ${score}점으로 성장 중이에요. 비슷한 테마 기준 정점까지 약 ${avgDaysToPeak}일 정도 남았어요`
      : `현재 점수 ${score}점으로 성장 중이에요`
  }
  switch (phase) {
    case 'rising':
      return avgDaysToPeak > 0
        ? `비슷한 테마 기준, 상승 단계로 정점까지 약 ${avgDaysToPeak}일 여유가 있어요`
        : '비슷한 테마 기준, 상승 단계로 정점까지 여유가 있어요'
    case 'hot':
      return '현재 정점 구간으로 보여요. 이후 하락 전환에 유의하세요'
    case 'cooling':
      return '관심도가 감소 추세예요. 참고 수준의 시그널입니다'
  }
}
