import { supabase } from '@/lib/supabase'
import { apiSuccess, escapeIlike, handleApiError, placeholderResponse, isTableNotFound } from '@/lib/tli/api-utils'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { buildScoreMetaMap } from '../scores/ranking/ranking-helpers'
import { THEME_LIST_SCORE_BATCH_SIZE, buildThemeListResults } from './theme-list-helpers'

// 활성 테마 목록과 현재 생명주기 점수 조회 (배치 쿼리 최적화)
// ?q= 파라미터로 테마명/영문명 필터링 지원
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim().toLowerCase() || ''

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

    let matchedThemeIds = new Set<string>()
    if (query) {
      const [stockNameRes, stockSymbolRes] = await Promise.all([
        supabase
          .from('theme_stocks')
          .select('theme_id')
          .eq('is_active', true)
          .ilike('name', `%${escapeIlike(query)}%`)
          .limit(200),
        supabase
          .from('theme_stocks')
          .select('theme_id')
          .eq('is_active', true)
          .ilike('symbol', `%${escapeIlike(query)}%`)
          .limit(200),
      ])

      const stockSearchError = stockNameRes.error || stockSymbolRes.error
      if (stockSearchError) {
        if (!isTableNotFound(stockSearchError)) {
          throw stockSearchError
        }
      } else {
        matchedThemeIds = new Set(
          [...(stockNameRes.data || []), ...(stockSymbolRes.data || [])]
            .map((row) => String(row.theme_id))
        )
      }
    }

    const themeIds = themes.map((t) => t.id)
    const sevenDaysAgo = getKSTDateString(-7)
    const ninetyDaysAgo = getKSTDateString(-90)

    // 2) 활성 종목 수 배치 쿼리 (.in() 300개 분할 + 1000행 페이지네이션)
    const CHUNK_SIZE = 300
    const stocksList: Array<{ theme_id: string }> = []
    for (let ci = 0; ci < themeIds.length; ci += CHUNK_SIZE) {
      const idChunk = themeIds.slice(ci, ci + CHUNK_SIZE)
      let stocksFrom = 0
      while (true) {
        const { data, error } = await supabase
          .from('theme_stocks')
          .select('theme_id')
          .in('theme_id', idChunk)
          .eq('is_active', true)
          .range(stocksFrom, stocksFrom + 999)
        if (error) throw error
        if (!data?.length) break
        stocksList.push(...data)
        if (data.length < 1000) break
        stocksFrom += 1000
      }
    }

    // 3) lifecycle_scores 배치 조회 (전체 병렬 실행)
    const scoreChunks: string[][] = []
    for (let i = 0; i < themeIds.length; i += THEME_LIST_SCORE_BATCH_SIZE) {
      scoreChunks.push(themeIds.slice(i, i + THEME_LIST_SCORE_BATCH_SIZE))
    }

    const scoreResults = await Promise.all(
      scoreChunks.map(chunk =>
        supabase
          .from('lifecycle_scores')
          .select('theme_id, score, stage, is_reigniting, calculated_at, components')
          .in('theme_id', chunk)
          .gte('calculated_at', ninetyDaysAgo)
          .order('calculated_at', { ascending: false })
          .limit(chunk.length * 7)
      )
    )

    const scores: Array<{ theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string; components: unknown }> = []
    for (const result of scoreResults) {
      if (result.error) throw result.error
      if (result.data) scores.push(...(result.data as typeof scores))
    }

    // 4) 인메모리 맵 구축 (O(n) 단일 패스)
    const scoreMetaByTheme = buildScoreMetaMap(scores, sevenDaysAgo)
    const stockCountMap = new Map<string, number>()
    for (const stock of (stocksList || [])) {
      const key = String(stock.theme_id)
      stockCountMap.set(key, (stockCountMap.get(key) ?? 0) + 1)
    }

    // 5) 결과 조합
    const results = buildThemeListResults({
      themes,
      scoreMetaByTheme,
      stockCountMap,
      todayStr: getKSTDateString(),
    })

    const filtered = query
      ? results.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            (t.nameEn && t.nameEn.toLowerCase().includes(query)) ||
            matchedThemeIds.has(String(t.id))
        )
      : results

    return apiSuccess(filtered)
  } catch (error) {
    return handleApiError(error, '테마 목록을 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
