import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { apiError, apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import type { Stage } from '@/lib/tli/types'

// 특정 테마의 30일 생명주기 점수 이력 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // placeholder 환경 처리
    const placeholder = placeholderResponse([])
    if (placeholder) return placeholder

    // 테마 존재 확인
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('id')
      .eq('id', id)
      .eq('is_active', true)
      .single()

    if (themeError) {
      if (isTableNotFound(themeError)) {
        console.warn('[TLI API] TLI tables not found')
        return apiError('테마를 찾을 수 없습니다.', 404)
      }
      throw themeError
    }

    if (!theme) {
      return apiError('테마를 찾을 수 없습니다.', 404)
    }

    // 30일 이력 조회
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
    const { data: history, error: historyError } = await supabase
      .from('lifecycle_scores')
      .select('calculated_at, score, stage')
      .eq('theme_id', id)
      .gte('calculated_at', thirtyDaysAgo)
      .order('calculated_at', { ascending: true })

    if (historyError) {
      console.error('[TLI API] History fetch error:', historyError)
      throw historyError
    }

    const results = (history || []).map((item) => ({
      date: item.calculated_at,
      score: item.score,
      stage: item.stage as Stage,
    }))

    return apiSuccess(results)
  } catch (error) {
    return handleApiError(error, '테마 점수 이력을 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
