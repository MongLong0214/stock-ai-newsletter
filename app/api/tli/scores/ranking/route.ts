import { supabase } from '@/lib/supabase'
import { getStageKo, toStage } from '@/lib/tli/types'
import { apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'

/** 빈 랭킹 응답 (placeholder / 에러 시 재사용) */
const EMPTY_RANKING: ThemeRanking = {
  early: [],
  growth: [],
  peak: [],
  decay: [],
  reigniting: [],
  summary: {
    totalThemes: 0,
    byStage: {},
    hottestTheme: null,
    mostImproved: null,
    avgScore: 0,
  },
}

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
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

    // 2) 배치 쿼리 4개 병렬 실행
    const [scoresRes, stocksRes, keywordsRes, newsRes] = await Promise.all([
      // 최근 90일 점수 (배치 지연 시에도 최신 점수 유실 방지)
      supabase
        .from('lifecycle_scores')
        .select('theme_id, score, stage, is_reigniting, calculated_at')
        .in('theme_id', themeIds)
        .gte('calculated_at', ninetyDaysAgo)
        .order('calculated_at', { ascending: false }),
      // 활성 종목 (카운트용)
      supabase
        .from('theme_stocks')
        .select('theme_id')
        .in('theme_id', themeIds)
        .eq('is_active', true),
      // 키워드 (source='general', is_primary 우선)
      supabase
        .from('theme_keywords')
        .select('theme_id, keyword, source, is_primary')
        .in('theme_id', themeIds),
      // 뉴스 메트릭 (최근 7일 합계)
      supabase
        .from('news_metrics')
        .select('theme_id, article_count')
        .in('theme_id', themeIds)
        .gte('time', sevenDaysAgo),
    ])

    const scores = scoresRes.data || []
    const stocksList = stocksRes.data || []
    const keywordsList = keywordsRes.data || []
    const newsList = newsRes.data || []

    // --- 맵 구성 (O(n) 단일 패스) ---

    // 점수를 theme_id별로 그룹화 + 사전 계산된 메타 정보
    interface ThemeScoreMeta {
      latest: typeof scores[0] | null
      weekAgoScore: typeof scores[0] | null
      sparkline: number[]
    }
    const scoreMetaByTheme = new Map<string, ThemeScoreMeta>()

    // scores는 calculated_at desc 정렬 → 첫 번째가 최신
    for (const s of scores) {
      if (!scoreMetaByTheme.has(s.theme_id)) {
        scoreMetaByTheme.set(s.theme_id, { latest: null, weekAgoScore: null, sparkline: [] })
      }
      const meta = scoreMetaByTheme.get(s.theme_id)!
      const dateStr = s.calculated_at.split('T')[0]

      // 최신 점수 (desc이므로 첫 번째 = latest)
      if (!meta.latest) meta.latest = s

      // 7일 전 점수: sevenDaysAgo 이하인 첫 번째 (desc이므로 가장 최근)
      if (!meta.weekAgoScore && dateStr <= sevenDaysAgo) meta.weekAgoScore = s

      // 스파크라인: 7일 이내 점수 수집 (나중에 reverse)
      if (dateStr >= sevenDaysAgo) meta.sparkline.push(s.score)
    }

    // 스파크라인 정렬: desc → asc (오래된 순)
    for (const meta of scoreMetaByTheme.values()) {
      meta.sparkline.reverse()
    }

    // 종목 카운트 맵
    const stockCountMap = new Map<string, number>()
    for (const s of stocksList) {
      stockCountMap.set(s.theme_id, (stockCountMap.get(s.theme_id) || 0) + 1)
    }

    // 키워드 맵: O(W) 단일 패스로 그룹화 후 정렬
    const keywordsByThemeRaw = new Map<string, typeof keywordsList>()
    for (const kw of keywordsList) {
      if (!keywordsByThemeRaw.has(kw.theme_id)) keywordsByThemeRaw.set(kw.theme_id, [])
      keywordsByThemeRaw.get(kw.theme_id)!.push(kw)
    }
    const keywordsByTheme = new Map<string, string[]>()
    for (const [themeId, kws] of keywordsByThemeRaw) {
      kws.sort((a, b) => {
        if (a.is_primary !== b.is_primary) return b.is_primary ? 1 : -1
        if (a.source !== b.source) return a.source === 'general' ? -1 : 1
        return 0
      })
      keywordsByTheme.set(themeId, kws.slice(0, 3).map((k) => k.keyword))
    }

    // 뉴스 카운트 맵 (7일 합계)
    const newsCountMap = new Map<string, number>()
    for (const n of newsList) {
      newsCountMap.set(n.theme_id, (newsCountMap.get(n.theme_id) || 0) + n.article_count)
    }

    // --- ThemeListItem 조합 ---

    const themeData: ThemeListItem[] = themes.map((theme) => {
      const meta = scoreMetaByTheme.get(theme.id)
      const latest = meta?.latest ?? null
      const weekAgoScore = meta?.weekAgoScore ?? null

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
        isReigniting: latest?.is_reigniting ?? false,
        updatedAt: latest?.calculated_at ?? new Date().toISOString(),
        sparkline: meta?.sparkline ?? [],
        keywords: keywordsByTheme.get(theme.id) ?? [],
        newsCount7d: newsCountMap.get(theme.id) ?? 0,
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

    const byStage: Record<string, number> = {}
    for (const t of activeThemes) {
      const key = t.isReigniting ? 'Reigniting' : t.stage
      byStage[key] = (byStage[key] || 0) + 1
    }

    // hottestTheme: score >= 40 AND stockCount >= 3
    const hottestCandidates = activeThemes.filter(t => t.score >= 40 && t.stockCount >= 3)
    const hottestTheme = hottestCandidates.length > 0
      ? hottestCandidates.reduce((max, t) => (t.score > max.score ? t : max))
      : null

    // mostImproved: change7d > 5 AND score >= 20 AND stockCount >= 3
    const improvedCandidates = activeThemes.filter(t => t.change7d > 5 && t.score >= 20 && t.stockCount >= 3)
    const mostImproved = improvedCandidates.length > 0
      ? improvedCandidates.reduce((max, t) => (t.change7d > max.change7d ? t : max))
      : null

    const avgScore = activeThemes.length > 0
      ? Math.round((activeThemes.reduce((sum, t) => sum + t.score, 0) / activeThemes.length) * 10) / 10
      : 0

    const ranking: ThemeRanking = {
      early,
      growth,
      peak,
      decay,
      reigniting,
      summary: {
        totalThemes: activeThemes.length,
        byStage,
        hottestTheme: hottestTheme
          ? { name: hottestTheme.name, score: hottestTheme.score, change7d: hottestTheme.change7d }
          : null,
        mostImproved: mostImproved && mostImproved.change7d > 0
          ? { name: mostImproved.name, change7d: mostImproved.change7d }
          : null,
        avgScore,
      },
    }

    return apiSuccess(ranking)
  } catch (error) {
    return handleApiError(error, '랭킹 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
