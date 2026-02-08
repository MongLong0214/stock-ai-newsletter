import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { apiError, apiSuccess, handleApiError, isTableNotFound, placeholderResponse, UUID_RE } from '@/lib/tli/api-utils'
import { toStage } from '@/lib/tli/types'
import { getKSTDateString } from '@/lib/tli/date-utils'

// 특정 테마의 30일 생명주기 점수 이력 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // UUID 검증
    if (!UUID_RE.test(id)) {
      return apiError('잘못된 테마 ID 형식입니다.', 400)
    }

    // placeholder 환경 처리
    const placeholder = placeholderResponse([])
    if (placeholder) return placeholder

    // 테마 존재 확인
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('id')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

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
    const thirtyDaysAgo = getKSTDateString(-30)
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
      stage: toStage(item.stage),
    }))

    return apiSuccess(results)
  } catch (error) {
    return handleApiError(error, '테마 점수 이력을 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
