/**
 * 유사 테마 비교 데이터 배치 조회 및 구축
 */

import { supabase } from '@/lib/supabase'
import { formatDays } from '@/lib/tli/date-utils'
import type { ComparisonResult, LifecycleCurvePoint } from '@/lib/tli/types/api'

// ── v2 candidate → ComparisonResult 변환 ──

export interface V2CandidateForBuild {
  candidate_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  estimated_days_to_peak: number
  message: string | null
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  past_peak_score: number | null
  past_final_stage: string | null
  past_decline_days: number | null
}

function buildNormalizedComparisonMessage(input: {
  pastThemeName: string
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  isCompletedCycle: boolean
  completedCycleDays: number | null
}) {
  if (input.pastTotalDays < 14) {
    return `과거 데이터 ${input.pastTotalDays}일로 비교 신뢰도가 낮아요`
  }

  if (
    input.isCompletedCycle
    && input.completedCycleDays != null
    && input.currentDay > input.completedCycleDays
    && input.estimatedDaysToPeak === 0
  ) {
    return `${input.pastThemeName} 완결 주기(${formatDays(input.completedCycleDays)})를 넘어섰어요`
  }

  if (input.currentDay >= input.pastTotalDays && input.estimatedDaysToPeak === 0) {
    return `${input.pastThemeName}의 현재 관측 구간(${formatDays(input.pastTotalDays)})을 넘어섰어요`
  }

  if (input.estimatedDaysToPeak > 0) {
    return `${input.pastThemeName} 기준 진행률 ${Math.round((input.currentDay / input.pastTotalDays) * 100)}%, 정점까지 약 ${input.estimatedDaysToPeak}일 남음`
  }

  if (input.pastPeakDay > 0) {
    return `${input.pastThemeName} 정점(${input.pastPeakDay}일차) 부근 진입 추정`
  }

  return '초기 단계, 추세 확인 중'
}

export const buildComparisonResultFromV2Candidate = (
  candidate: V2CandidateForBuild,
  context: {
    pastThemeName: string
    lifecycleCurve: LifecycleCurvePoint[]
  },
): ComparisonResult => {
  const pastTotalDays = Math.min(candidate.past_total_days, 365)
  const currentDay = Math.min(candidate.current_day, 365)
  const pastPeakDay = Math.min(candidate.past_peak_day, pastTotalDays)
  const completedCycleDays = candidate.past_final_stage ? pastTotalDays : null
  const estimatedDaysToPeak = Math.min(candidate.estimated_days_to_peak, 365)

  return {
    pastTheme: context.pastThemeName,
    pastThemeId: candidate.candidate_theme_id,
    comparisonLane: candidate.past_final_stage ? 'completed_analog' : 'active_peer',
    similarity: candidate.similarity_score,
    currentDay,
    pastPeakDay,
    pastTotalDays,
    observedWindowDays: pastTotalDays,
    completedCycleDays,
    cycleCompletionStatus: candidate.past_final_stage ? 'completed' : 'observed',
    isPastActive: candidate.past_final_stage == null,
    estimatedDaysToPeak,
    message: buildNormalizedComparisonMessage({
      pastThemeName: context.pastThemeName,
      currentDay,
      pastPeakDay,
      pastTotalDays,
      estimatedDaysToPeak,
      isCompletedCycle: candidate.past_final_stage != null,
      completedCycleDays,
    }),
    lifecycleCurve: context.lifecycleCurve,
    featureSim: candidate.feature_sim ?? null,
    curveSim: candidate.curve_sim ?? null,
    keywordSim: candidate.keyword_sim ?? null,
    pastPeakScore: candidate.past_peak_score ?? null,
    pastFinalStage: candidate.past_final_stage ?? null,
    pastDeclineDays: candidate.past_decline_days ?? null,
  }
}

// ── Legacy comparison interface ──

export interface ComparisonRow {
  id: string
  past_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  message: string | null
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  past_peak_score: number | null
  past_final_stage: string | null
  past_decline_days: number | null
  relevanceProbability?: number | null
  probabilityCiLower?: number | null
  probabilityCiUpper?: number | null
  supportCount?: number | null
  confidenceTier?: 'high' | 'medium' | 'low' | null
  calibrationVersion?: string | null
  weightVersion?: string | null
  sourceSurface?: 'legacy_diagnostic' | 'v2_certification' | 'replay_equivalent' | null
  relevance_probability?: number | null
  probability_ci_lower?: number | null
  probability_ci_upper?: number | null
  support_count?: number | null
  confidence_tier?: 'high' | 'medium' | 'low' | null
  calibration_version?: string | null
  weight_version?: string | null
  source_surface?: 'legacy_diagnostic' | 'v2_certification' | 'replay_equivalent' | null
}

const CURVE_PAGE_SIZE = 1000

async function loadPastThemeCurves(pastThemeIds: string[]) {
  const pastThemeCurves: Record<string, Array<{ date: string; score: number }>> = {}
  if (pastThemeIds.length === 0) return pastThemeCurves

  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('lifecycle_scores')
      .select('theme_id, calculated_at, score')
      .in('theme_id', pastThemeIds)
      .order('calculated_at', { ascending: true })
      .range(from, from + CURVE_PAGE_SIZE - 1)

    if (error) {
      throw new Error(`failed to load comparison lifecycle curves: ${error.message}`)
    }

    if (!data?.length) break

    for (const score of data) {
      if (!pastThemeCurves[score.theme_id]) pastThemeCurves[score.theme_id] = []
      pastThemeCurves[score.theme_id].push({ date: score.calculated_at, score: score.score })
    }

    if (data.length < CURVE_PAGE_SIZE) break
    from += CURVE_PAGE_SIZE
  }

  return pastThemeCurves
}

/**
 * 유사 테마 비교 데이터 배치 조회 및 구축
 */
export async function buildComparisonResults(
  comparisons: ComparisonRow[],
): Promise<ComparisonResult[]> {
  const pastThemeIds = [...new Set(comparisons.map((c) => c.past_theme_id))]
  const pastThemeNames: Record<string, string> = {}
  let pastThemeCurves: Record<string, Array<{ date: string; score: number }>> = {}

  if (pastThemeIds.length > 0) {
    const [namesRes, curves] = await Promise.all([
      supabase
        .from('themes')
        .select('id, name')
        .in('id', pastThemeIds),
      loadPastThemeCurves(pastThemeIds),
    ])

    if (namesRes.error) {
      throw new Error(`failed to load comparison theme names: ${namesRes.error.message}`)
    }

    pastThemeCurves = curves

    for (const t of namesRes.data || []) {
      pastThemeNames[t.id] = t.name
    }
  }

  return comparisons.map((comp) => {
    const pastTotalDays = Math.min(comp.past_total_days, 365)
    // DB에서 읽은 값도 캡 적용 (스크립트 재실행 전 기존 데이터 대응)
    const currentDay = Math.min(comp.current_day, 365)
    const pastPeakDay = Math.min(comp.past_peak_day, pastTotalDays)
    const estimatedDaysToPeak = pastPeakDay > 0 ? Math.max(0, pastPeakDay - currentDay) : 0
    const completedCycleDays = comp.past_final_stage ? pastTotalDays : null
    const pastThemeName = pastThemeNames[comp.past_theme_id] ?? 'Unknown'

    return {
      pastTheme: pastThemeName,
      pastThemeId: comp.past_theme_id,
      comparisonLane: comp.past_final_stage ? 'completed_analog' : 'active_peer',
      similarity: comp.similarity_score,
      currentDay,
      pastPeakDay,
      pastTotalDays,
      observedWindowDays: pastTotalDays,
      completedCycleDays,
      cycleCompletionStatus: comp.past_final_stage ? 'completed' : 'observed',
      isPastActive: comp.past_final_stage == null,
      estimatedDaysToPeak,
      message: buildNormalizedComparisonMessage({
        pastThemeName,
        currentDay,
        pastPeakDay,
        pastTotalDays,
        estimatedDaysToPeak,
        isCompletedCycle: comp.past_final_stage != null,
        completedCycleDays,
      }),
      lifecycleCurve: pastThemeCurves[comp.past_theme_id] || [],
      featureSim: comp.feature_sim ?? null,
      curveSim: comp.curve_sim ?? null,
      keywordSim: comp.keyword_sim ?? null,
      pastPeakScore: comp.past_peak_score ?? null,
      pastFinalStage: comp.past_final_stage ?? null,
      pastDeclineDays: comp.past_decline_days ?? null,
      relevanceProbability: comp.relevanceProbability ?? comp.relevance_probability ?? null,
      probabilityCiLower: comp.probabilityCiLower ?? comp.probability_ci_lower ?? null,
      probabilityCiUpper: comp.probabilityCiUpper ?? comp.probability_ci_upper ?? null,
      supportCount: comp.supportCount ?? comp.support_count ?? null,
      confidenceTier: comp.confidenceTier ?? comp.confidence_tier ?? null,
      calibrationVersion: comp.calibrationVersion ?? comp.calibration_version ?? null,
      weightVersion: comp.weightVersion ?? comp.weight_version ?? null,
      sourceSurface: comp.sourceSurface ?? comp.source_surface ?? null,
    }
  })
}
