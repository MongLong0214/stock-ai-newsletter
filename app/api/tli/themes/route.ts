import { supabase } from '@/lib/supabase'
import { getStageKo } from '@/lib/tli/types'
import { apiSuccess, handleApiError, placeholderResponse, isTableNotFound } from '@/lib/tli/api-utils'
import type { Stage } from '@/lib/tli/types'

// 활성 테마 목록과 현재 생명주기 점수 조회
export async function GET() {
  try {
    // placeholder 환경 처리
    const placeholder = placeholderResponse([])
    if (placeholder) return placeholder

    // 활성 테마 전체 조회
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .eq('is_active', true)
      .order('name')

    if (themesError) {
      if (isTableNotFound(themesError)) {
        console.warn('[TLI API] TLI tables not found - returning empty themes list')
        return apiSuccess([], undefined, 'short')
      }
      throw themesError
    }

    // 각 테마별 최신 점수 및 통계 조회
    const results = await Promise.all(
      (themes || []).map(async (theme) => {
        const { data: score } = await supabase
          .from('lifecycle_scores')
          .select('score, stage, is_reigniting, calculated_at')
          .eq('theme_id', theme.id)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single()

        // 7일 전 점수 조회
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
        const { data: weekAgo } = await supabase
          .from('lifecycle_scores')
          .select('score')
          .eq('theme_id', theme.id)
          .lte('calculated_at', sevenDaysAgo)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single()

        // 활성 종목 수 조회
        const { count } = await supabase
          .from('theme_stocks')
          .select('*', { count: 'exact', head: true })
          .eq('theme_id', theme.id)
          .eq('is_active', true)

        return {
          id: theme.id,
          name: theme.name,
          nameEn: theme.name_en,
          score: score?.score ?? 0,
          stage: (score?.stage ?? 'Dormant') as Stage,
          stageKo: getStageKo((score?.stage ?? 'Dormant') as Stage),
          change7d: score?.score && weekAgo?.score ? score.score - weekAgo.score : 0,
          stockCount: count ?? 0,
          isReigniting: score?.is_reigniting ?? false,
          updatedAt: score?.calculated_at ?? new Date().toISOString(),
        }
      })
    )

    return apiSuccess(results)
  } catch (error) {
    return handleApiError(error, '테마 목록을 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
