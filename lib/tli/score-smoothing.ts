/** EMA Smoothing + Bollinger 이상치 + Markov Stage Hysteresis */

import { standardDeviation, daysBetween } from './normalize'
import { determineStage, isReignitingTransition } from './stage'
import { checkReigniting } from './reigniting'
import { getTLIParams } from './constants/tli-params'
import type { Stage, ScoreComponents, InterestMetric } from './types'

/** 테마 나이 기반 EMA alpha 스케줄링.
 *  신생(0일): 0.6 (반응적) → 성숙(30일+): 0.3 (안정적). 선형 보간. */
export function computeAlpha(firstSpikeDate: string | null | undefined, today: string): number {
  const cfg = getTLIParams()
  if (!firstSpikeDate) return cfg.ema_alpha
  const daysSinceSpike = Math.max(0, daysBetween(firstSpikeDate, today))
  const frac = Math.min(daysSinceSpike / cfg.ema_schedule_days, 1)
  return (1 - frac) * cfg.ema_alpha_fresh + frac * cfg.ema_alpha_mature
}

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
  const maxDailyChange = Math.max(getTLIParams().min_daily_change, 2 * sigma)

  if (Math.abs(effectiveRaw - prevSmoothedScore) > maxDailyChange) {
    const sign = effectiveRaw > prevSmoothedScore ? 1 : -1
    effectiveRaw = prevSmoothedScore + sign * maxDailyChange
  }

  // --- Step C: EMA (age-dependent alpha) ---
  const alpha = (options?.firstSpikeDate != null && options?.today)
    ? computeAlpha(options.firstSpikeDate, options.today)
    : getTLIParams().ema_alpha
  const smoothed = Math.round(alpha * effectiveRaw + (1 - alpha) * prevSmoothedScore)
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

  const cfg = getTLIParams()
  const dataGapDays = prevCalculatedAt ? daysBetween(prevCalculatedAt, today) : undefined
  const markovStage = determineStage(smoothedScore, components, prevStage, dataGapDays)

  let finalStage: Stage

  // Peak fast-track: rawScore >= stage_peak AND smoothedScore >= stage_emerging → 즉시 Peak
  if (rawScore >= cfg.stage_peak && smoothedScore >= cfg.stage_emerging && markovStage === 'Peak') {
    finalStage = 'Peak'
  }
  // Decline rebound fast-track: 강한 급반등은 하루 대기 없이 Growth로 복귀시킨다
  else if (prevStage === 'Decline' && rawScore >= cfg.stage_peak && smoothedScore >= cfg.stage_emerging && markovStage === 'Growth') {
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
