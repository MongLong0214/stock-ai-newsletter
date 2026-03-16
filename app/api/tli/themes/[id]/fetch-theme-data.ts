/**
 * 테마 상세 데이터 병렬 배치 쿼리 — Supabase 8개 쿼리 동시 실행
 */

import { supabase } from '@/lib/supabase'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { fetchPublishedComparisonRowsV4, isComparisonV4ServingEnabled } from './comparison-v4-reader'
import { buildComparisonsQueryDescriptor, shouldFallbackToLegacyComparisons } from './fetch-theme-data-v4'
import { isTableNotFound } from '@/lib/tli/api-utils'

interface FetchThemeDataParams {
  id: string
  thirtyDaysAgo: string
  skipComparisons?: boolean
}

export const COMPARISON_FETCH_LIMIT = 12

interface SupabaseRes<T> {
  data: T[] | null
  error: { code?: string; message?: string } | null
}

interface ThemeDetailCriticalFetchInput {
  latestScoreRes: SupabaseRes<unknown>
  scoresRes: SupabaseRes<unknown>
  stocksRes: SupabaseRes<unknown>
  comparisonsRes: SupabaseRes<unknown>
  newsRes: SupabaseRes<unknown>
  interestRes: SupabaseRes<unknown>
  newsArticlesRes: SupabaseRes<unknown>
  keywordsRes: SupabaseRes<unknown>
  stockCount?: number
  newsArticleCount?: number
  stockCountError?: { code?: string; message?: string } | null
  newsArticleCountError?: { code?: string; message?: string } | null
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
  newsArticlesRes: SupabaseRes<{ title: string; link: string; source: string | null; pub_date: string }>
  keywordsRes: SupabaseRes<{ keyword: string }>
  stockCount: number
  newsArticleCount: number
}

export function shouldFallbackThemeStocksMetricsQuery(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = (error.message || '').toLowerCase()
  if (error.code === '42703') return true
  return (
    message.includes('column')
    && message.includes('does not exist')
    && (
      message.includes('current_price')
      || message.includes('price_change_pct')
      || message.includes('volume')
    )
  )
}

export function findCriticalThemeDetailError(input: ThemeDetailCriticalFetchInput) {
  const candidates = [
    input.latestScoreRes.error,
    input.scoresRes.error,
    input.stocksRes.error,
    input.comparisonsRes.error,
    input.newsRes.error,
    input.interestRes.error,
    input.keywordsRes.error,
    input.stockCountError,
    input.newsArticleCountError && !isTableNotFound(input.newsArticleCountError)
      ? input.newsArticleCountError
      : null,
    input.newsArticlesRes.error && !isTableNotFound(input.newsArticlesRes.error)
      ? input.newsArticlesRes.error
      : null,
  ]

  return candidates.find((error): error is { code?: string; message?: string } => error != null) ?? null
}

/**
 * 병렬 배치 쿼리 8개 실행
 */
export async function fetchThemeData(
  params: FetchThemeDataParams,
): Promise<FetchThemeDataResult> {
  const { id, thirtyDaysAgo, skipComparisons = false } = params
  const threeDaysAgo = getKSTDateString(-3)
  const useV4Serving = isComparisonV4ServingEnabled()
  const comparisonDescriptor = buildComparisonsQueryDescriptor({
    themeId: id,
    threeDaysAgo,
    useV4Serving,
  })

  const comparisonsPromise = skipComparisons
    ? Promise.resolve({ data: [], error: null })
    : comparisonDescriptor.mode === 'v4'
    ? fetchPublishedComparisonRowsV4(comparisonDescriptor.themeId)
    : supabase
        .from('theme_comparisons')
        .select('id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
        .eq('current_theme_id', comparisonDescriptor.themeId)
        .gte('calculated_at', comparisonDescriptor.threeDaysAgo)
        .order('calculated_at', { ascending: false })
        .order('similarity_score', { ascending: false })
        .limit(COMPARISON_FETCH_LIMIT)

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
          if (res.error && shouldFallbackThemeStocksMetricsQuery(res.error)) {
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
      // 유사 테마 비교 (v4 reader 또는 legacy fallback)
      comparisonsPromise,
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
        .select('title, link, source, pub_date')
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

  const criticalError = findCriticalThemeDetailError({
    latestScoreRes,
    scoresRes,
    stocksRes,
    comparisonsRes,
    newsRes,
    interestRes,
    newsArticlesRes,
    keywordsRes,
    stockCountError: stockCountRes.error,
    newsArticleCountError: newsArticleCountRes.error,
  })

  if (criticalError) {
    throw new Error(criticalError.message || 'theme detail batch fetch failed')
  }

  let safeComparisonsRes = comparisonsRes
  if (!skipComparisons && comparisonDescriptor.mode === 'v4' && shouldFallbackToLegacyComparisons(comparisonsRes)) {
    const legacyComparisonsRes = await supabase
      .from('theme_comparisons')
      .select('id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
      .eq('current_theme_id', id)
      .gte('calculated_at', threeDaysAgo)
      .order('calculated_at', { ascending: false })
      .order('similarity_score', { ascending: false })
      .limit(COMPARISON_FETCH_LIMIT)
    safeComparisonsRes = legacyComparisonsRes
  }

  return {
    latestScoreRes,
    scoresRes,
    stocksRes,
    comparisonsRes: safeComparisonsRes,
    newsRes,
    interestRes,
    newsArticlesRes,
    keywordsRes,
    stockCount: stockCountRes.count ?? 0,
    newsArticleCount: newsArticleCountRes.count ?? 0,
  }
}
