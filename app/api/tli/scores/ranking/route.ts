import { supabase } from '@/lib/supabase'
import { getStageKo, toStage, isScoreComponents } from '@/lib/tli/types'
import { apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'
import { EMPTY_RANKING, buildScoreMetaMap, buildCountMaps, calculateRankingSummary, batchLoadStockData, batchLoadNewsCounts } from './ranking-helpers'
import { getKSTDateString } from '@/lib/tli/date-utils'

// 생명주기 단계별 랭킹 (배치 쿼리 최적화)
export async function GET() {
  try {
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
    const SCORE_BATCH_SIZE = 50
    const scoreChunks: string[][] = []
    for (let i = 0; i < themeIds.length; i += SCORE_BATCH_SIZE) {
      scoreChunks.push(themeIds.slice(i, i + SCORE_BATCH_SIZE))
    }

    const [stocksList, newsList, ...scoreBatches] = await Promise.all([
      // 활성 종목 (배치 분할 — Supabase 1000행 제한 우회, 종목명 포함)
      batchLoadStockData(themeIds),
      // 뉴스 기사 (배치 분할 — theme_news_articles 기준, 상세 페이지와 동일 소스)
      batchLoadNewsCounts(themeIds, sevenDaysAgo),
      // lifecycle_scores 배치 조회 (병렬, 테마당 최대 90일)
      ...scoreChunks.map(async (chunk) => {
        const { data } = await supabase
          .from('lifecycle_scores')
          .select('theme_id, score, stage, is_reigniting, calculated_at, components')
          .in('theme_id', chunk)
          .gte('calculated_at', ninetyDaysAgo)
          .order('calculated_at', { ascending: false })
          .limit(1000)
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

      // Extract sentiment from latest score's components
      const latestComponents = isScoreComponents(latest?.components) ? latest!.components : null
      const sentimentScore = latestComponents?.sentiment_score ?? 0

      return {
        id: theme.id,
        name: theme.name,
        nameEn: theme.name_en,
        score: latest?.score ?? 0,
        stage: toStage(latest?.stage),
        stageKo: getStageKo(toStage(latest?.stage)),
        change7d: latest?.score != null && weekAgoScore?.score != null
          ? latest.score - weekAgoScore.score
          : 0,
        stockCount: stockCountMap.get(theme.id) ?? 0,
        topStocks: stockNamesMap.get(theme.id) ?? [],
        isReigniting: latest?.is_reigniting ?? false,
        updatedAt: latest?.calculated_at ?? new Date().toISOString(),
        sparkline: meta?.sparkline ?? [],
        newsCount7d: newsCountMap.get(theme.id) ?? 0,
        sentimentScore,
        avgStockChange: avgStockChangeMap.get(theme.id) ?? null,
      }
    })

    // --- 단계별 그룹화 ---

    const early: ThemeListItem[] = []
    const growth: ThemeListItem[] = []
    const peak: ThemeListItem[] = []
    const decay: ThemeListItem[] = []
    const reigniting: ThemeListItem[] = []

    for (const theme of themeData) {
      // 품질 게이트: Dormant + 점수 0 이하 제거
      if (theme.stage === 'Dormant') continue
      if (theme.score <= 0) continue

      if (theme.isReigniting) {
        reigniting.push(theme)
      } else {
        switch (theme.stage) {
          case 'Early': early.push(theme); break
          case 'Growth': growth.push(theme); break
          case 'Peak': peak.push(theme); break
          case 'Decay': decay.push(theme); break
        }
      }
    }

    // 정렬: Early는 오름차순(낮은 점수 = 새로운 기회), 나머지는 내림차순
    early.sort((a, b) => a.score - b.score)
    growth.sort((a, b) => b.score - a.score)
    peak.sort((a, b) => b.score - a.score)
    decay.sort((a, b) => b.score - a.score)
    reigniting.sort((a, b) => b.score - a.score)

    // --- 요약 통계 (필터 통과한 테마 기준) ---

    const activeThemes = [...early, ...growth, ...peak, ...decay, ...reigniting]
    const summary = calculateRankingSummary(activeThemes)

    const ranking: ThemeRanking = {
      early,
      growth,
      peak,
      decay,
      reigniting,
      summary,
    }

    return apiSuccess(ranking, undefined, 'medium')
  } catch (error) {
    return handleApiError(error, '랭킹 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
