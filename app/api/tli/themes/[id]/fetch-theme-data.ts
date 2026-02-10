/**
 * 테마 상세 데이터 병렬 배치 쿼리 — Supabase 8개 쿼리 동시 실행
 */

import { supabase } from '@/lib/supabase'
import { getKSTDateString } from '@/lib/tli/date-utils'

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

export interface FetchThemeDataResult {
  latestScoreRes: SupabaseRes<ScoreRow>
  scoresRes: SupabaseRes<ScoreRow>
  stocksRes: SupabaseRes<StockRow>
  comparisonsRes: SupabaseRes<{ id: string; past_theme_id: string; similarity_score: number; current_day: number; past_peak_day: number; past_total_days: number; message: string | null; feature_sim: number | null; curve_sim: number | null; keyword_sim: number | null; past_peak_score: number | null; past_final_stage: string | null; past_decline_days: number | null }>
  newsRes: SupabaseRes<{ time: string; article_count: number }>
  interestRes: SupabaseRes<{ time: string; normalized: number }>
  newsArticlesRes: SupabaseRes<{ title: string; link: string; source: string | null; pub_date: string; sentiment_score: number | null }>
  keywordsRes: SupabaseRes<{ keyword: string }>
  stockCount: number
  newsArticleCount: number
}

/**
 * 병렬 배치 쿼리 8개 실행
 */
export async function fetchThemeData(
  params: FetchThemeDataParams,
): Promise<FetchThemeDataResult> {
  const { id, thirtyDaysAgo } = params
  const threeDaysAgo = getKSTDateString(-3)

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
      // 최근 뉴스 기사 (최신 50건) — 테이블 미존재 시 graceful fallback
      supabase
        .from('theme_news_articles')
        .select('title, link, source, pub_date, sentiment_score')
        .eq('theme_id', id)
        .order('pub_date', { ascending: false })
        .limit(50),
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
