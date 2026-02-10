/**
 * 유사 테마 비교 데이터 배치 조회 및 구축
 */

import { supabase } from '@/lib/supabase'
import type { ComparisonResult } from '@/lib/tli/types/api'

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
}

/**
 * 유사 테마 비교 데이터 배치 조회 및 구축
 */
export async function buildComparisonResults(
  comparisons: Comparison[],
): Promise<ComparisonResult[]> {
  const pastThemeIds = comparisons.map((c) => c.past_theme_id)
  const pastThemeNames: Record<string, string> = {}
  const pastThemeCurves: Record<string, Array<{ date: string; score: number }>> = {}

  if (pastThemeIds.length > 0) {
    const [namesRes, curvesRes] = await Promise.all([
      supabase
        .from('themes')
        .select('id, name')
        .in('id', pastThemeIds),
      supabase
        .from('lifecycle_scores')
        .select('theme_id, calculated_at, score')
        .in('theme_id', pastThemeIds)
        .order('calculated_at', { ascending: true })
        .limit(1825),
    ])

    for (const t of namesRes.data || []) {
      pastThemeNames[t.id] = t.name
    }
    for (const s of curvesRes.data || []) {
      if (!pastThemeCurves[s.theme_id]) pastThemeCurves[s.theme_id] = []
      pastThemeCurves[s.theme_id].push({ date: s.calculated_at, score: s.score })
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
    }
  })
}
