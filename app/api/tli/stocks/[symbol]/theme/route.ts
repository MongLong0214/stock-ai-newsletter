import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStageKo } from '@/lib/tli/types'
import { apiError, apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import type { Stage } from '@/lib/tli/types'

// 특정 종목이 속한 모든 테마와 현재 점수 및 단계 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params

    // 입력 검증
    if (!symbol || symbol.trim().length === 0) {
      return apiError('종목 코드가 필요합니다.', 400)
    }

    // placeholder 환경 처리
    const placeholder = placeholderResponse([])
    if (placeholder) return placeholder

    // 종목이 속한 테마 조회
    const { data: themeStocks, error: themeStocksError } = await supabase
      .from('theme_stocks')
      .select('theme_id, source, relevance')
      .eq('symbol', symbol)
      .eq('is_active', true)

    if (themeStocksError) {
      if (isTableNotFound(themeStocksError)) {
        console.warn('[TLI API] TLI tables not found - returning empty stock themes')
        return apiSuccess([])
      }
      throw themeStocksError
    }

    // 빈 결과 처리
    if (!themeStocks || themeStocks.length === 0) {
      return apiSuccess([])
    }

    // 각 테마별 정보 및 최신 점수 조회
    const results = await Promise.all(
      themeStocks.map(async (ts) => {
        const { data: theme } = await supabase
          .from('themes')
          .select('id, name, name_en')
          .eq('id', ts.theme_id)
          .eq('is_active', true)
          .single()

        if (!theme) return null

        const { data: score } = await supabase
          .from('lifecycle_scores')
          .select('score, stage, is_reigniting, calculated_at')
          .eq('theme_id', ts.theme_id)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single()

        return {
          themeId: theme.id,
          themeName: theme.name,
          themeNameEn: theme.name_en,
          score: score?.score ?? 0,
          stage: (score?.stage ?? 'Dormant') as Stage,
          stageKo: getStageKo((score?.stage ?? 'Dormant') as Stage),
          isReigniting: score?.is_reigniting ?? false,
          relevance: ts.relevance,
          source: ts.source,
          updatedAt: score?.calculated_at ?? null,
        }
      })
    )

    // null 제거 및 점수 내림차순 정렬
    const validResults = results.filter((r) => r !== null).sort((a, b) => b!.score - a!.score)

    return apiSuccess(validResults)
  } catch (error) {
    return handleApiError(error, '종목 테마 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
