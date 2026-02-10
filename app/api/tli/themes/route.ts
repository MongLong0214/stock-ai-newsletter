import { supabase } from '@/lib/supabase'
import { getStageKo, toStage } from '@/lib/tli/types'
import { apiSuccess, handleApiError, placeholderResponse, isTableNotFound } from '@/lib/tli/api-utils'
import { getKSTDateString } from '@/lib/tli/date-utils'

// 활성 테마 목록과 현재 생명주기 점수 조회 (배치 쿼리 최적화)
export async function GET() {
  try {
    // placeholder 환경 처리
    const placeholder = placeholderResponse([])
    if (placeholder) return placeholder

    // 1) 활성 테마 전체 조회
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

    if (!themes?.length) {
      return apiSuccess([])
    }

    const themeIds = themes.map((t) => t.id)
    const sevenDaysAgo = getKSTDateString(-7)

    // 2) 활성 종목 수 배치 쿼리 (.in() 300개 분할 + 1000행 페이지네이션)
    const CHUNK_SIZE = 300
    const stocksList: Array<{ theme_id: string }> = []
    for (let ci = 0; ci < themeIds.length; ci += CHUNK_SIZE) {
      const idChunk = themeIds.slice(ci, ci + CHUNK_SIZE)
      let stocksFrom = 0
      while (true) {
        const { data } = await supabase
          .from('theme_stocks')
          .select('theme_id')
          .in('theme_id', idChunk)
          .eq('is_active', true)
          .range(stocksFrom, stocksFrom + 999)
        if (!data?.length) break
        stocksList.push(...data)
        if (data.length < 1000) break
        stocksFrom += 1000
      }
    }

    // 3) lifecycle_scores 배치 조회 (테마당 최대 14일, 1000행 제한 우회)
    const SCORE_BATCH_SIZE = 70 // 테마당 14일 = 980행, 안전하게 70개씩
    const scores: Array<{ theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string }> = []
    const weekAgoScores: Array<{ theme_id: string; score: number }> = []

    for (let i = 0; i < themeIds.length; i += SCORE_BATCH_SIZE) {
      const chunk = themeIds.slice(i, i + SCORE_BATCH_SIZE)
      const [latestRes, weekRes] = await Promise.all([
        // 최신 점수
        supabase
          .from('lifecycle_scores')
          .select('theme_id, score, stage, is_reigniting, calculated_at')
          .in('theme_id', chunk)
          .order('calculated_at', { ascending: false })
          .limit(1000),
        // 7일 전 점수
        supabase
          .from('lifecycle_scores')
          .select('theme_id, score')
          .in('theme_id', chunk)
          .lte('calculated_at', sevenDaysAgo)
          .order('calculated_at', { ascending: false })
          .limit(1000),
      ])
      if (latestRes.data) scores.push(...latestRes.data)
      if (weekRes.data) weekAgoScores.push(...weekRes.data)
    }

    // 4) 인메모리 맵 구축 (O(n) 단일 패스)
    const latestScoreMap = new Map<string, { theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string }>()
    for (const score of scores) {
      const key = String(score.theme_id)
      if (!latestScoreMap.has(key)) {
        latestScoreMap.set(key, score)
      }
    }

    const weekAgoMap = new Map<string, number>()
    for (const score of weekAgoScores) {
      const key = String(score.theme_id)
      if (!weekAgoMap.has(key)) {
        weekAgoMap.set(key, score.score)
      }
    }

    const stockCountMap = new Map<string, number>()
    for (const stock of (stocksList || [])) {
      const key = String(stock.theme_id)
      stockCountMap.set(key, (stockCountMap.get(key) ?? 0) + 1)
    }

    // 5) 결과 조합
    const results = themes.map((theme) => {
      const key = String(theme.id)
      const score = latestScoreMap.get(key)
      const weekAgoScore = weekAgoMap.get(key)
      const stage = toStage(score?.stage)

      return {
        id: theme.id,
        name: theme.name,
        nameEn: theme.name_en,
        score: score?.score ?? 0,
        stage,
        stageKo: getStageKo(stage),
        change7d: score?.score != null && weekAgoScore != null ? score.score - weekAgoScore : 0,
        stockCount: stockCountMap.get(key) ?? 0,
        isReigniting: score?.is_reigniting ?? false,
        updatedAt: score?.calculated_at ?? new Date().toISOString(),
      }
    })

    return apiSuccess(results)
  } catch (error) {
    return handleApiError(error, '테마 목록을 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
