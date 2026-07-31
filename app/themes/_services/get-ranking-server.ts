import { isSupabasePlaceholder } from '@/lib/supabase'
import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import { getStageKo, toStage, isScoreComponents } from '@/lib/tli/types'
import { isTableNotFound } from '@/lib/tli/api-utils'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'
import { EMPTY_RANKING, SCORE_QUERY_BATCH_SIZE, SCORE_QUERY_WINDOW_DAYS, buildScoreMetaMap, buildCountMaps, buildThemeRanking, batchLoadStockData, batchLoadNewsCounts, applyFreshnessDecayToThemeData } from '@/app/api/tli/scores/ranking/ranking-helpers'
import { getKSTDateString } from '@/lib/tli/date-utils'

/** 서버 사이드 랭킹 데이터 조회 (API 라우트 경유 없이 직접 Supabase 호출) */
export async function getRankingServer(todayStr = getKSTDateString()): Promise<ThemeRanking> {
  try {
    if (isSupabasePlaceholder) return EMPTY_RANKING

    // service-role 클라이언트: anon RLS 오버헤드/statement_timeout로 SSR 랭킹이 비던 문제 근본 수정
    const supabase = getServerSupabaseClient()

    // 1) 활성 테마 전체 조회
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .eq('is_active', true)

    if (themesError) {
      if (isTableNotFound(themesError)) return EMPTY_RANKING
      throw themesError
    }

    if (!themes?.length) return EMPTY_RANKING

    const themeIds = themes.map((t) => t.id)
    const sevenDaysAgo = getKSTDateString(-7)
    // latest + weekAgo(≤7일) + sparkline(최근 7일)만 쓰므로 14일이면 충분 (이전 90일 = ~6배 과다 fetch)
    const scoreWindowStart = getKSTDateString(-SCORE_QUERY_WINDOW_DAYS)

    const scoreChunks: string[][] = []
    for (let i = 0; i < themeIds.length; i += SCORE_QUERY_BATCH_SIZE) {
      scoreChunks.push(themeIds.slice(i, i + SCORE_QUERY_BATCH_SIZE))
    }

    const stocksPromise = batchLoadStockData(themeIds).catch((error: unknown) => {
      console.error('[TLI] ranking stock data load failed:', {
        themeCount: themeIds.length,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    })

    const newsPromise = batchLoadNewsCounts(themeIds, sevenDaysAgo).catch((error: unknown) => {
      console.error('[TLI] ranking news count load failed:', {
        themeCount: themeIds.length,
        since: sevenDaysAgo,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    })

    const scoreBatchesPromise = Promise.all(
      scoreChunks.map(async (chunk) => {
        try {
          const { data, error } = await supabase
            .from('lifecycle_scores')
            .select('theme_id, score, stage, is_reigniting, calculated_at, components')
            .in('theme_id', chunk)
            .gte('calculated_at', scoreWindowStart)
            .order('calculated_at', { ascending: false })
            .limit(1000)
          if (error) throw error
          return data ?? []
        } catch (error: unknown) {
          console.error('[TLI] ranking score batch load failed:', {
            themeCount: chunk.length,
            since: scoreWindowStart,
            error: error instanceof Error ? error.message : String(error),
          })
          return []
        }
      })
    )

    const [stocksList, newsList, scoreBatches] = await Promise.all([
      stocksPromise,
      newsPromise,
      scoreBatchesPromise,
    ])

    const scores: Array<{ theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string; components: unknown }> = scoreBatches.flat()

    // --- 맵 구성 ---
    const scoreMetaByTheme = buildScoreMetaMap(scores, sevenDaysAgo)
    const { stockCountMap, stockNamesMap, avgStockChangeMap, newsCountMap } = buildCountMaps(stocksList, newsList)

    // --- ThemeListItem 조합 ---
    const themeData: ThemeListItem[] = themes.map((theme) => {
      const meta = scoreMetaByTheme.get(theme.id)
      const latest = meta?.latest ?? null
      const weekAgoScore = meta?.weekAgoScore ?? null
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

    const normalizedThemeData = applyFreshnessDecayToThemeData(themeData, scoreMetaByTheme, todayStr)

    const rawInterestAvgMap = new Map<string, number>()
    for (const s of scores) {
      if (rawInterestAvgMap.has(s.theme_id)) continue
      const comp = isScoreComponents(s.components) ? s.components : null
      if (comp?.raw?.raw_interest_avg != null) {
        rawInterestAvgMap.set(s.theme_id, comp.raw.raw_interest_avg)
      }
    }

    return buildThemeRanking(normalizedThemeData, rawInterestAvgMap)
  } catch (error) {
    console.error('[TLI] 랭킹 서버 조회 실패:', error instanceof Error ? error.message : String(error))
    return EMPTY_RANKING
  }
}
