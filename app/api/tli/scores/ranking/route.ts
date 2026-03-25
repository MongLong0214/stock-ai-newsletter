import { supabase } from '@/lib/supabase'
import { getStageKo, toStage, isScoreComponents } from '@/lib/tli/types'
import { apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'
import { EMPTY_RANKING, SCORE_QUERY_BATCH_SIZE, buildScoreMetaMap, buildCountMaps, buildThemeRanking, batchLoadStockData, batchLoadNewsCounts, applyFreshnessDecayToThemeData } from './ranking-helpers'
import { getKSTDateString } from '@/lib/tli/date-utils'

// 생명주기 단계별 랭킹 (배치 쿼리 최적화)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit')) || 10))
    const sort = searchParams.get('sort') || 'score'

    // placeholder 환경 처리
    const placeholder = placeholderResponse<ThemeRanking>(EMPTY_RANKING)
    if (placeholder) return placeholder

    // 1) 활성 테마 전체 조회
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .eq('is_active', true)

    if (themesError) {
      if (isTableNotFound(themesError)) {
        console.warn('[TLI API] TLI tables not found - returning empty ranking')
        return apiSuccess<ThemeRanking>(EMPTY_RANKING, undefined, 'short')
      }
      throw themesError
    }

    if (!themes?.length) {
      return apiSuccess<ThemeRanking>(EMPTY_RANKING)
    }

    const themeIds = themes.map((t) => t.id)
    const sevenDaysAgo = getKSTDateString(-7)
    const ninetyDaysAgo = getKSTDateString(-90)

    // 2) 모든 배치 쿼리 병렬 실행 (stocks + news + scores 동시)
    const scoreChunks: string[][] = []
    for (let i = 0; i < themeIds.length; i += SCORE_QUERY_BATCH_SIZE) {
      scoreChunks.push(themeIds.slice(i, i + SCORE_QUERY_BATCH_SIZE))
    }

    const [stocksList, newsList, ...scoreBatches] = await Promise.all([
      // 활성 종목 (배치 분할 — Supabase 1000행 제한 우회, 종목명 포함)
      batchLoadStockData(themeIds),
      // 뉴스 기사 (배치 분할 — theme_news_articles 기준, 상세 페이지와 동일 소스)
      batchLoadNewsCounts(themeIds, sevenDaysAgo),
      // lifecycle_scores 배치 조회 (병렬, 테마당 최대 90일)
      ...scoreChunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from('lifecycle_scores')
          .select('theme_id, score, stage, is_reigniting, calculated_at, components')
          .in('theme_id', chunk)
          .gte('calculated_at', ninetyDaysAgo)
          .order('calculated_at', { ascending: false })
          .limit(1000)
        if (error) throw error
        return data ?? []
      }),
    ])

    const scores: Array<{ theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string; components: unknown }> = scoreBatches.flat()

    // --- 맵 구성 (O(n) 단일 패스) ---

    const scoreMetaByTheme = buildScoreMetaMap(scores, sevenDaysAgo)
    const { stockCountMap, stockNamesMap, avgStockChangeMap, newsCountMap } = buildCountMaps(stocksList, newsList)

    // --- ThemeListItem 조합 ---

    const themeData: ThemeListItem[] = themes.map((theme) => {
      const meta = scoreMetaByTheme.get(theme.id)
      const latest = meta?.latest ?? null
      const weekAgoScore = meta?.weekAgoScore ?? null

      // 최신 점수 컴포넌트에서 신뢰도 추출
      const latestComponents = isScoreComponents(latest?.components) ? latest!.components : null
      const confidenceLevel = latestComponents?.confidence?.level
      const stage = toStage(latest?.stage)

      return {
        id: theme.id,
        name: theme.name,
        nameEn: theme.name_en,
        score: latest?.score ?? 0,
        stage,
        stageKo: getStageKo(stage),
        change7d: latest?.score != null && weekAgoScore?.score != null
          ? latest.score - weekAgoScore.score
          : 0,
        stockCount: stockCountMap.get(theme.id) ?? 0,
        topStocks: stockNamesMap.get(theme.id) ?? [],
        isReigniting: latest?.is_reigniting ?? false,
        updatedAt: latest?.calculated_at ?? new Date().toISOString(),
        sparkline: meta?.sparkline ?? [],
        newsCount7d: newsCountMap.get(theme.id) ?? 0,
        confidenceLevel,
        avgStockChange: avgStockChangeMap.get(theme.id) ?? null,
      }
    })

    const todayStr = getKSTDateString()
    const normalizedThemeData = applyFreshnessDecayToThemeData(themeData, scoreMetaByTheme, todayStr)

    // surging 노이즈 방지: components에서 raw_interest_avg 추출
    const rawInterestAvgMap = new Map<string, number>()
    for (const s of scores) {
      if (rawInterestAvgMap.has(s.theme_id)) continue
      const comp = isScoreComponents(s.components) ? s.components : null
      if (comp?.raw?.raw_interest_avg != null) {
        rawInterestAvgMap.set(s.theme_id, comp.raw.raw_interest_avg)
      }
    }

    const ranking = buildThemeRanking(normalizedThemeData, rawInterestAvgMap)

    // limit/sort 후처리
    const sortKey = (sort === 'change7d' || sort === 'newsCount7d') ? sort : 'score' as const
    const sortFn = (a: ThemeListItem, b: ThemeListItem) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      return bv - av
    }
    const stages: Array<'emerging' | 'growth' | 'peak' | 'decline' | 'reigniting'> = ['emerging', 'growth', 'peak', 'decline', 'reigniting']
    for (const stage of stages) {
      ranking[stage] = ranking[stage].sort(sortFn).slice(0, limit)
    }

    return apiSuccess(ranking, undefined, 'medium')
  } catch (error) {
    return handleApiError(error, '랭킹 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
