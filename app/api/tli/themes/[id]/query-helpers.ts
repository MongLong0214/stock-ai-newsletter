import { supabase } from '@/lib/supabase'

import type { ThemeDetail } from '@/lib/tli/types'
import { toStage, getStageKo, isScoreComponents } from '@/lib/tli/types'

interface FetchThemeDataParams {
  id: string
  thirtyDaysAgo: string
}

interface SupabaseRes<T> {
  data: T[] | null
  error: { code?: string; message?: string } | null
}

interface ScoreRow {
  score: number
  stage: string
  is_reigniting: boolean
  calculated_at: string
  components: unknown
}

interface StockRow {
  symbol: string
  name: string
  market: string
  current_price: number | null
  price_change_pct: number | null
  volume: number | null
}

interface FetchThemeDataResult {
  latestScoreRes: SupabaseRes<ScoreRow>
  scoresRes: SupabaseRes<ScoreRow>
  stocksRes: SupabaseRes<StockRow>
  comparisonsRes: SupabaseRes<{ id: string; past_theme_id: string; similarity_score: number; current_day: number; past_peak_day: number; past_total_days: number; message: string | null; feature_sim: number | null; curve_sim: number | null; keyword_sim: number | null; past_peak_score: number | null; past_final_stage: string | null; past_decline_days: number | null }>
  newsRes: SupabaseRes<{ time: string; article_count: number }>
  interestRes: SupabaseRes<{ time: string; normalized: number }>
  newsArticlesRes: SupabaseRes<{ title: string; link: string; source: string | null; pub_date: string; sentiment_score: number | null }>
  keywordsRes: SupabaseRes<{ keyword: string }>
  /** 종목/뉴스 기사 총 수 (카드와 동일 기준) */
  stockCount: number
  newsArticleCount: number
}

/**
 * 병렬 배치 쿼리 8개 실행
 */
export async function fetchThemeData(
  params: FetchThemeDataParams
): Promise<FetchThemeDataResult> {
  const { id, thirtyDaysAgo } = params
  const threeDaysAgo = new Date(Date.now() + 9 * 60 * 60 * 1000 - 3 * 86400000).toISOString().split('T')[0]

  const [latestScoreRes, scoresRes, stocksRes, comparisonsRes, newsRes, interestRes, newsArticlesRes, keywordsRes, stockCountRes, newsArticleCountRes] =
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
      // 유사 테마 비교 (최근 3일 이내)
      supabase
        .from('theme_comparisons')
        .select('id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
        .eq('current_theme_id', id)
        .gte('calculated_at', threeDaysAgo)
        .order('calculated_at', { ascending: false })
        .order('similarity_score', { ascending: false })
        .limit(3),
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
      // 최근 뉴스 기사 (전체) — 테이블 미존재 시 graceful fallback
      supabase
        .from('theme_news_articles')
        .select('title, link, source, pub_date, sentiment_score')
        .eq('theme_id', id)
        .order('pub_date', { ascending: false }),
      // 키워드 목록
      supabase
        .from('theme_keywords')
        .select('keyword')
        .eq('theme_id', id)
        .order('keyword', { ascending: true }),
      // 종목 총 수 (head: true로 카운트만 가져옴)
      supabase
        .from('theme_stocks')
        .select('*', { count: 'exact', head: true })
        .eq('theme_id', id)
        .eq('is_active', true),
      // 뉴스 기사 총 수
      supabase
        .from('theme_news_articles')
        .select('*', { count: 'exact', head: true })
        .eq('theme_id', id),
    ])

  return {
    latestScoreRes,
    scoresRes,
    stocksRes,
    comparisonsRes,
    newsRes,
    interestRes,
    newsArticlesRes,
    keywordsRes,
    stockCount: stockCountRes.count ?? 0,
    newsArticleCount: newsArticleCountRes.count ?? 0,
  }
}

interface Comparison {
  id: string
  past_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  message: string | null
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  past_peak_score: number | null
  past_final_stage: string | null
  past_decline_days: number | null
}

export interface ComparisonResult {
  pastTheme: string
  pastThemeId: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  postPeakDecline: number | null
  message: string
  lifecycleCurve: Array<{ date: string; score: number }>
  /** 3-Pillar 분해 */
  featureSim: number | null
  curveSim: number | null
  keywordSim: number | null
  /** 과거 테마 결과 */
  pastPeakScore: number | null
  pastFinalStage: string | null
  pastDeclineDays: number | null
}

/**
 * 유사 테마 비교 데이터 배치 조회 및 구축
 */
export async function buildComparisonResults(
  comparisons: Comparison[]
): Promise<ComparisonResult[]> {
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
        .order('calculated_at', { ascending: true })
        .limit(1825),
    ])

    for (const t of namesRes.data || []) {
      pastThemeNames[t.id] = t.name
    }
    for (const s of curvesRes.data || []) {
      if (!pastThemeCurves[s.theme_id]) pastThemeCurves[s.theme_id] = []
      pastThemeCurves[s.theme_id].push({ date: s.calculated_at, score: s.score })
    }
  }

  return comparisons.map((comp) => {
    const pastTotalDays = Math.min(comp.past_total_days, 365)
    const estimatedDaysToPeak = Math.max(0, comp.past_peak_day - comp.current_day)
    const postPeakDecline = comp.current_day > comp.past_peak_day
      ? Math.max(0, ((pastTotalDays - comp.current_day) / pastTotalDays) * 100)
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
      message: comp.message ?? '',
      lifecycleCurve: pastThemeCurves[comp.past_theme_id] || [],
      featureSim: comp.feature_sim ?? null,
      curveSim: comp.curve_sim ?? null,
      keywordSim: comp.keyword_sim ?? null,
      pastPeakScore: comp.past_peak_score ?? null,
      pastFinalStage: comp.past_final_stage ?? null,
      pastDeclineDays: comp.past_decline_days ?? null,
    }
  })
}

interface ThemeBasic {
  id: string
  name: string
  name_en: string | null
  description: string | null
  first_spike_date: string | null
}

interface ScoreData {
  score: number
  stage: string
  is_reigniting: boolean
  calculated_at: string
  components: unknown
}

interface BuildThemeDetailParams {
  theme: ThemeBasic
  latestScore: ScoreData | null
  dayAgoScore: ScoreData | null
  weekAgoScore: ScoreData | null
  stockCount: number
  stocks: Array<{
    symbol: string
    name: string
    market: string
    current_price: number | null
    price_change_pct: number | null
    volume: number | null
  }>
  newsCount: number
  newsArticles: Array<{
    title: string
    link: string
    source: string | null
    pub_date: string
    sentiment_score: number | null
  }>
  keywords: string[]
  comparisonResults: ComparisonResult[]
  allScores: ScoreData[]
  newsList: Array<{ time: string; article_count: number }>
  interestList: Array<{ time: string; normalized: number }>
}

/**
 * ThemeDetail 응답 객체 조합
 */
export function buildThemeDetailResponse(params: BuildThemeDetailParams): ThemeDetail {
  const {
    theme,
    latestScore,
    dayAgoScore,
    weekAgoScore,
    stockCount,
    stocks,
    newsCount,
    newsArticles,
    keywords,
    comparisonResults,
    allScores,
    newsList,
    interestList,
  } = params

  const rawComponents = latestScore?.components ?? null
  const components = isScoreComponents(rawComponents) ? rawComponents : null

  return {
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
        sentiment: components?.sentiment_score ?? 0,
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
    stockCount,
    stocks: stocks.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      market: s.market,
      currentPrice: s.current_price ?? null,
      priceChangePct: s.price_change_pct ?? null,
      volume: s.volume ?? null,
    })),
    newsCount,
    recentNews: newsArticles.map((a) => ({
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
}
