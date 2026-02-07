import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStageKo, toStage, isScoreComponents } from '@/lib/tli/types'
import { apiError, apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import type { ThemeDetail } from '@/lib/tli/types'

// 특정 테마의 상세 정보 조회 (배치 쿼리 최적화)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // placeholder 환경 처리
    const placeholder = placeholderResponse<null>(null)
    if (placeholder) return placeholder

    const { id } = await params

    // 1) 테마 기본 정보 (first_spike_date 포함)
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('id, name, name_en, description, first_spike_date')
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

    const oneDayAgo = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

    // 2) 병렬 배치 쿼리 8개
    const [latestScoreRes, scoresRes, stocksRes, comparisonsRes, keywordsRes, newsRes, interestRes, newsArticlesRes] =
      await Promise.all([
        // 최신 점수 1건 (날짜 제한 없음 - 배치 지연 시에도 유실 방지)
        supabase
          .from('lifecycle_scores')
          .select('score, stage, is_reigniting, calculated_at, components')
          .eq('theme_id', id)
          .order('calculated_at', { ascending: false })
          .limit(1),
        // 30일 lifecycle_scores (곡선 + change 계산용)
        supabase
          .from('lifecycle_scores')
          .select('score, stage, is_reigniting, calculated_at, components')
          .eq('theme_id', id)
          .gte('calculated_at', thirtyDaysAgo)
          .order('calculated_at', { ascending: true }),
        // 관련 종목 (가격/거래량 포함 — 컬럼 미존재 시 fallback)
        supabase
          .from('theme_stocks')
          .select('symbol, name, market, current_price, price_change_pct, volume')
          .eq('theme_id', id)
          .eq('is_active', true)
          .order('relevance', { ascending: false })
          .then(async (res) => {
            if (res.error) {
              // 새 컬럼 미존재 시 기존 컬럼만 조회
              const fallback = await supabase
                .from('theme_stocks')
                .select('symbol, name, market')
                .eq('theme_id', id)
                .eq('is_active', true)
                .order('relevance', { ascending: false })
              return {
                ...fallback,
                data: (fallback.data || []).map((s) => ({
                  ...s,
                  current_price: null,
                  price_change_pct: null,
                  volume: null,
                })),
              }
            }
            return res
          }),
        // 유사 테마 비교
        supabase
          .from('theme_comparisons')
          .select('id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message')
          .eq('current_theme_id', id)
          .order('similarity_score', { ascending: false })
          .limit(5),
        // 키워드
        supabase
          .from('theme_keywords')
          .select('keyword, source, is_primary')
          .eq('theme_id', id),
        // 뉴스 시계열 (30일)
        supabase
          .from('news_metrics')
          .select('time, article_count')
          .eq('theme_id', id)
          .gte('time', thirtyDaysAgo)
          .order('time', { ascending: true }),
        // 관심도 시계열 (30일)
        supabase
          .from('interest_metrics')
          .select('time, normalized')
          .eq('theme_id', id)
          .gte('time', thirtyDaysAgo)
          .order('time', { ascending: true }),
        // 최근 뉴스 기사 (10건) — 테이블 미존재 시 graceful fallback
        supabase
          .from('theme_news_articles')
          .select('title, link, source, pub_date, sentiment_score')
          .eq('theme_id', id)
          .order('pub_date', { ascending: false })
          .limit(10),
      ])

    const allScores = scoresRes.data || []
    const stocks = stocksRes.data || []
    const comparisons = comparisonsRes.data || []
    const keywordsList = keywordsRes.data || []
    const newsList = newsRes.data || []
    const interestList = interestRes.data || []
    // theme_news_articles 테이블 미존재 시 빈 배열 (42P01 graceful fallback)
    const newsArticles = (newsArticlesRes.error && isTableNotFound(newsArticlesRes.error))
      ? []
      : (newsArticlesRes.data || [])

    // --- 점수 파싱 ---

    // 최신 점수: 날짜 제한 없는 별도 쿼리 결과 사용 (30일 윈도우 밖이어도 유실 방지)
    const latestScoreData = latestScoreRes.data || []
    const latestScore = latestScoreData.length > 0 ? latestScoreData[0] : null

    // 24시간 전 + 7일 전 점수: O(n) 단일 역순 패스 (배열 복사 제거)
    let dayAgoScore: typeof latestScore = null
    let weekAgoScore: typeof latestScore = null
    for (let i = allScores.length - 1; i >= 0; i--) {
      const dateStr = allScores[i].calculated_at.split('T')[0]
      if (!dayAgoScore && dateStr <= oneDayAgo) dayAgoScore = allScores[i]
      if (!weekAgoScore && dateStr <= sevenDaysAgo) weekAgoScore = allScores[i]
      if (dayAgoScore && weekAgoScore) break
    }

    // --- 키워드 (is_primary + source='general' 우선) ---

    keywordsList.sort((a, b) => {
      if (a.is_primary !== b.is_primary) return b.is_primary ? 1 : -1
      if (a.source !== b.source) return a.source === 'general' ? -1 : 1
      return 0
    })
    const keywords = keywordsList.map((k) => k.keyword)

    // --- 유사 테마: 이름 + lifecycleCurve 배치 조회 ---

    const pastThemeIds = comparisons.map((c) => c.past_theme_id)
    const pastThemeNames: Record<string, string> = {}
    const pastThemeCurves: Record<string, Array<{ date: string; score: number }>> = {}

    if (pastThemeIds.length > 0) {
      const [namesRes, curvesRes] = await Promise.all([
        supabase
          .from('themes')
          .select('id, name')
          .in('id', pastThemeIds),
        supabase
          .from('lifecycle_scores')
          .select('theme_id, calculated_at, score')
          .in('theme_id', pastThemeIds)
          .order('calculated_at', { ascending: true }),
      ])

      for (const t of namesRes.data || []) {
        pastThemeNames[t.id] = t.name
      }
      for (const s of curvesRes.data || []) {
        if (!pastThemeCurves[s.theme_id]) pastThemeCurves[s.theme_id] = []
        pastThemeCurves[s.theme_id].push({ date: s.calculated_at, score: s.score })
      }
    }

    const comparisonResults = comparisons.map((comp) => {
      const pastTotalDays = Math.min(comp.past_total_days, 365)
      const estimatedDaysToPeak = Math.max(0, comp.past_peak_day - comp.current_day)
      const postPeakDecline = comp.current_day > comp.past_peak_day
        ? ((pastTotalDays - comp.current_day) / pastTotalDays) * 100
        : null

      return {
        pastTheme: pastThemeNames[comp.past_theme_id] ?? 'Unknown',
        pastThemeId: comp.past_theme_id,
        similarity: comp.similarity_score,
        currentDay: comp.current_day,
        pastPeakDay: comp.past_peak_day,
        pastTotalDays,
        estimatedDaysToPeak,
        postPeakDecline,
        message: comp.message,
        lifecycleCurve: pastThemeCurves[comp.past_theme_id] || [],
      }
    })

    // --- components 파싱 ---

    const rawComponents = latestScore?.components ?? null
    const components = isScoreComponents(rawComponents) ? rawComponents : null

    // --- 최종 응답 조합 ---

    const result: ThemeDetail = {
      id: theme.id,
      name: theme.name,
      nameEn: theme.name_en,
      description: theme.description,
      firstSpikeDate: theme.first_spike_date,
      keywords,
      score: {
        value: latestScore?.score ?? 0,
        stage: toStage(latestScore?.stage),
        stageKo: getStageKo(toStage(latestScore?.stage)),
        updatedAt: latestScore?.calculated_at ?? new Date().toISOString(),
        change24h: latestScore?.score != null && dayAgoScore?.score != null
          ? latestScore.score - dayAgoScore.score
          : 0,
        change7d: latestScore?.score != null && weekAgoScore?.score != null
          ? latestScore.score - weekAgoScore.score
          : 0,
        isReigniting: latestScore?.is_reigniting ?? false,
        components: {
          interest: components?.interest_score ?? 0,
          newsMomentum: components?.news_momentum ?? 0,
          sentiment: components?.sentiment_score ?? 0.5,
          volatility: components?.volatility_score ?? 0,
        },
        raw: components?.raw
          ? {
              recent7dAvg: components.raw.recent_7d_avg,
              baseline30dAvg: components.raw.baseline_30d_avg,
              newsThisWeek: components.raw.news_this_week,
              newsLastWeek: components.raw.news_last_week,
              interestStddev: components.raw.interest_stddev,
              activeDays: components.raw.active_days,
              sentimentAvg: components.raw.sentiment_avg ?? 0,
              sentimentArticleCount: components.raw.sentiment_article_count ?? 0,
            }
          : null,
      },
      stocks: stocks.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        market: s.market,
        currentPrice: s.current_price ?? null,
        priceChangePct: s.price_change_pct ?? null,
        volume: s.volume ?? null,
      })),
      recentNews: newsArticles.map((a: { title: string; link: string; source: string | null; pub_date: string; sentiment_score: number | null }) => ({
        title: a.title,
        link: a.link,
        source: a.source,
        pubDate: a.pub_date,
        sentimentScore: a.sentiment_score ?? null,
      })),
      comparisons: comparisonResults,
      lifecycleCurve: allScores.map((s) => ({
        date: s.calculated_at,
        score: s.score,
      })),
      newsTimeline: newsList.map((n) => ({
        date: n.time,
        count: n.article_count,
      })),
      interestTimeline: interestList.map((i) => ({
        date: i.time,
        value: i.normalized,
      })),
    }

    return apiSuccess(result)
  } catch (error) {
    return handleApiError(error, '테마 상세 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
