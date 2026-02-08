import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStageKo, toStage } from '@/lib/tli/types'
import { apiError, apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'


// 특정 종목이 속한 모든 테마와 현재 점수 및 단계 조회
export async function GET(
  _request: NextRequest,
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

    const themeIds = themeStocks.map((ts) => ts.theme_id)

    // 배치 쿼리 1: 테마 정보
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .in('id', themeIds)
      .eq('is_active', true)

    if (themesError) throw themesError

    // 배치 쿼리 2: 최신 점수 (각 테마별 최신 1개)
    const { data: allScores, error: scoresError } = await supabase
      .from('lifecycle_scores')
      .select('theme_id, score, stage, is_reigniting, calculated_at')
      .in('theme_id', themeIds)
      .order('calculated_at', { ascending: false })

    if (scoresError) throw scoresError

    // Map 생성: theme_id → theme
    const themeMap = new Map(themes?.map((t) => [t.id, t]) ?? [])

    // Map 생성: theme_id → latest score (첫 번째 항목만 선택)
    const scoreMap = new Map<string, typeof allScores[number]>()
    if (allScores) {
      for (const score of allScores) {
        const key = String(score.theme_id)
        if (!scoreMap.has(key)) {
          scoreMap.set(key, score)
        }
      }
    }

    // 인메모리 조인
    const results = themeStocks
      .map((ts) => {
        const theme = themeMap.get(ts.theme_id)
        if (!theme) return null

        const key = String(ts.theme_id)
        const score = scoreMap.get(key)

        const stage = toStage(score?.stage)

        return {
          themeId: theme.id,
          themeName: theme.name,
          themeNameEn: theme.name_en,
          score: score?.score ?? 0,
          stage,
          stageKo: getStageKo(stage),
          isReigniting: score?.is_reigniting ?? false,
          relevance: ts.relevance,
          source: ts.source,
          updatedAt: score?.calculated_at ?? null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)

    return apiSuccess(results)
  } catch (error) {
    return handleApiError(error, '종목 테마 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
