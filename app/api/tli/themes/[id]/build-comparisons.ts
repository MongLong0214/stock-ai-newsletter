/**
 * 유사 테마 비교 데이터 배치 조회 및 구축
 */

import { supabase } from '@/lib/supabase'
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

  return {
    pastTheme: context.pastThemeName,
    pastThemeId: candidate.candidate_theme_id,
    similarity: candidate.similarity_score,
    currentDay,
    pastPeakDay,
    pastTotalDays,
    estimatedDaysToPeak: Math.min(candidate.estimated_days_to_peak, 365),
    message: candidate.message ?? '',
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

interface Comparison {
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
  comparisons: Comparison[],
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

    return {
      pastTheme: pastThemeNames[comp.past_theme_id] ?? 'Unknown',
      pastThemeId: comp.past_theme_id,
      similarity: comp.similarity_score,
      currentDay,
      pastPeakDay,
      pastTotalDays,
      estimatedDaysToPeak,
      message: comp.message ?? '',
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
