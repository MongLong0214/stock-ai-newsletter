/** EMA Smoothing + Bollinger 이상치 + Markov Stage Hysteresis */

import { standardDeviation, daysBetween } from './normalize'
import { determineStage, isReignitingTransition } from './stage'
import { checkReigniting } from './reigniting'
import { getTLIParams } from './constants/tli-params'
import type { Stage, ScoreComponents, InterestMetric } from './types'

/** EMA smoothing factor (span~4일, 60% 노이즈 억제) */
const EMA_ALPHA = 0.4
/** Bollinger band 최소 일일 변동 허용 (score 0-100 대비 10%) */
const MIN_DAILY_CHANGE = 10

/** T7: EMA smoothing options — components for Cautious Decay, T8 fields reserved */
export interface EMAOptions {
  components?: ScoreComponents
  firstSpikeDate?: string | null
  today?: string
}

/** EMA + Cautious Decay + Bollinger band clamping 적용 */
export function applyEMASmoothing(
  rawScore: number,
  prevSmoothedScore: number | undefined,
  recentSmoothed: number[],
  options?: EMAOptions,
): number {
  if (prevSmoothedScore === undefined) return rawScore

  // --- Step A: Cautious Decay Check ---
  let effectiveRaw = rawScore
  const components = options?.components
  if (rawScore < prevSmoothedScore && components) {
    const signals = [
      (components.raw.interest_slope ?? 0) < 0,
      (components.raw.news_this_week ?? 0) < (components.raw.news_last_week ?? 0),
      (components.raw.dvi ?? 0.5) < 0.4,
    ]
    const confirmCount = signals.filter(Boolean).length

    if (confirmCount < 2) {
      const cautiousFloor = prevSmoothedScore * getTLIParams().cautious_floor_ratio
      effectiveRaw = Math.max(rawScore, cautiousFloor)
    }
    // confirmCount >= 2: effectiveRaw stays as rawScore (confirmed decline)
  }

  // --- Step B: Bollinger Band Clamp ---
  const sigma = recentSmoothed.length >= 2 ? standardDeviation(recentSmoothed) : 0
  const maxDailyChange = Math.max(MIN_DAILY_CHANGE, 2 * sigma)

  if (Math.abs(effectiveRaw - prevSmoothedScore) > maxDailyChange) {
    const sign = effectiveRaw > prevSmoothedScore ? 1 : -1
    effectiveRaw = prevSmoothedScore + sign * maxDailyChange
  }

  // --- Step C: EMA ---
  const smoothed = Math.round(EMA_ALPHA * effectiveRaw + (1 - EMA_ALPHA) * prevSmoothedScore)
  return Math.max(0, Math.min(100, smoothed))
}

interface StageResolutionInput {
  rawScore: number
  smoothedScore: number
  components: ScoreComponents
  prevStage: Stage | null
  prevCandidate: Stage | undefined
  prevCalculatedAt: string | undefined
  today: string
  interestMetrics14d: InterestMetric[]
}

interface StageResolutionResult {
  finalStage: Stage
  isReigniting: boolean
  stageChanged: boolean
}

/** Markov + Hysteresis (2일 연속 확인) 기반 Stage 결정 */
export function resolveStageWithHysteresis(input: StageResolutionInput): StageResolutionResult {
  const {
    rawScore, smoothedScore, components,
    prevStage, prevCandidate, prevCalculatedAt,
    today, interestMetrics14d,
  } = input

  const dataGapDays = prevCalculatedAt ? daysBetween(prevCalculatedAt, today) : undefined
  const markovStage = determineStage(smoothedScore, components, prevStage, dataGapDays)

  let finalStage: Stage

  // Peak fast-track: rawScore >= 68 AND smoothedScore >= 50 → 즉시 Peak
  if (rawScore >= 68 && smoothedScore >= 50 && markovStage === 'Peak') {
    finalStage = 'Peak'
  }
  // Decline rebound fast-track: 강한 급반등은 하루 대기 없이 Growth로 복귀시킨다
  else if (prevStage === 'Decline' && rawScore >= 68 && smoothedScore >= 50 && markovStage === 'Growth') {
    finalStage = 'Growth'
  }
  // 변경 없거나 첫 날이면 그대로
  else if (markovStage === prevStage || prevStage === null) {
    finalStage = markovStage
  }
  // Hysteresis: 2일 연속 동일 candidate 필요
  else {
    if (prevCandidate === markovStage) {
      finalStage = markovStage
    } else {
      finalStage = prevStage
    }
  }

  // stage_candidate 저장 (내일 hysteresis 판단용)
  components.raw.stage_candidate = markovStage

  const isReigniting = checkReigniting(finalStage, interestMetrics14d, prevStage)
    || isReignitingTransition(finalStage, prevStage)
  const stageChanged = prevStage !== null && prevStage !== finalStage

  return { finalStage, isReigniting, stageChanged }
}
