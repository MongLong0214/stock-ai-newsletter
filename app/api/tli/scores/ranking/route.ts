import { supabase } from '@/lib/supabase'
import { getStageKo, toStage, isScoreComponents } from '@/lib/tli/types'
import { apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'
import { EMPTY_RANKING, buildScoreMetaMap, buildCountMaps, calculateRankingSummary, batchLoadStockData, batchLoadNewsCounts } from './ranking-helpers'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { applyQualityGate } from '@/lib/tli/quality-gate'

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

    // --- 품질 게이트 + 단계별 그룹화 ---

    const { emerging, growth, peak, decline, reigniting } = applyQualityGate(themeData)

    // --- 요약 통계 (필터 통과한 테마 기준) ---

    const activeThemes = [...emerging, ...growth, ...peak, ...decline, ...reigniting]
    const summary = calculateRankingSummary(activeThemes)

    const ranking: ThemeRanking = {
      emerging,
      growth,
      peak,
      decline,
      reigniting,
      summary,
    }

    return apiSuccess(ranking, undefined, 'medium')
  } catch (error) {
    return handleApiError(error, '랭킹 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
