import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { apiError, apiSuccess, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import { fetchThemeData, buildComparisonResults, buildThemeDetailResponse } from './query-helpers'
import { getKSTDateString } from '@/lib/tli/date-utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 특정 테마의 상세 정보 조회 (배치 쿼리 최적화)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // placeholder 환경 처리
    const placeholder = placeholderResponse<null>(null)
    if (placeholder) return placeholder

    const { id } = await params

    // UUID 검증
    if (!UUID_RE.test(id)) {
      return apiError('잘못된 테마 ID 형식입니다.', 400)
    }

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

    const oneDayAgo = getKSTDateString(-1)
    const sevenDaysAgo = getKSTDateString(-7)
    const thirtyDaysAgo = getKSTDateString(-30)

    // 2) 병렬 배치 쿼리 (keywords 포함)
    const {
      latestScoreRes,
      scoresRes,
      stocksRes,
      comparisonsRes,
      newsRes,
      interestRes,
      newsArticlesRes,
      keywordsRes,
      stockCount,
      newsArticleCount,
    } = await fetchThemeData({ id, thirtyDaysAgo })

    const allScores = scoresRes.data || []
    const stocks = stocksRes.data || []
    const comparisons = comparisonsRes.data || []
    const newsList = newsRes.data || []
    const interestList = interestRes.data || []
    // theme_news_articles 테이블 미존재 시 빈 배열 (42P01 graceful fallback)
    const newsArticles = (newsArticlesRes.error && isTableNotFound(newsArticlesRes.error))
      ? []
      : (newsArticlesRes.data || [])
    const keywords = (keywordsRes.data || []).map(k => k.keyword)

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

    // --- 유사 테마: 이름 + lifecycleCurve 배치 조회 ---

    const comparisonResults = await buildComparisonResults(comparisons)

    // --- 최종 응답 조합 ---

    const result = buildThemeDetailResponse({
      theme,
      latestScore,
      dayAgoScore,
      weekAgoScore,
      stockCount,
      stocks,
      newsCount: newsArticleCount,
      newsArticles,
      keywords,
      comparisonResults,
      allScores,
      newsList,
      interestList,
    })

    return apiSuccess(result)
  } catch (error) {
    return handleApiError(error, '테마 상세 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
