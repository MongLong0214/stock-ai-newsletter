import { cache } from 'react'
import { getServerSupabaseClient } from '@/lib/supabase/server-client'

interface ThemeSeoRow {
  name: string
  name_en: string | null
  description: string | null
}

interface ThemeScoreRow {
  score: number | null
  stage: string | null
  calculated_at: string | null
}

interface ThemeStockRow {
  stock_name: string
}

interface ThemeKeywordRow {
  keyword: string
}

interface ThemeSeoData {
  name: string
  name_en: string | null
  description: string | null
  keywords: string[]
  score: number | null
  stage: string | null
  updatedAt: string | null
  topStocks: string[]
}

/**
 * 테마 SEO 데이터. **없으면 null, 조회 실패면 throw.**
 *
 * 예전에는 모든 예외를 삼켜 null을 돌려줬다. 그러면 호출부가 "테마가 없다"와
 * "조회에 실패했다"를 구분할 수 없다. 그 상태로 404를 내면 DB가 잠깐 흔들린 순간
 * **멀쩡한 테마 페이지가 하드 404로 나가고 색인에서 빠진다** — soft-404보다 나쁘다.
 * (SSR anon RLS 타임아웃 전례가 있다.)
 *
 * 그래서 부재(row 없음)만 null로 돌리고, 실패는 그대로 올린다. 실패는 500이 되어
 * 크롤러가 재시도하게 두는 편이 맞다 — 불확실할 때 404를 내지 않는다.
 */
export const getThemeSeoData = cache(async (id: string): Promise<ThemeSeoData | null> => {
  const supabase = getServerSupabaseClient()

  const [themeRes, scoreRes, stocksRes, keywordsRes] = await Promise.all([
    supabase
      .from('themes')
      .select('name, name_en, description')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle<ThemeSeoRow>(),
    supabase
      .from('lifecycle_scores')
      .select('score, stage, calculated_at')
      .eq('theme_id', id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle<ThemeScoreRow>(),
    supabase
      .from('theme_stocks')
      .select('stock_name')
      .eq('theme_id', id)
      .order('market_cap', { ascending: false })
      .limit(5)
      .returns<ThemeStockRow[]>(),
    supabase
      .from('theme_keywords')
      .select('keyword')
      .eq('theme_id', id)
      .order('keyword', { ascending: true })
      .returns<ThemeKeywordRow[]>(),
  ])

  // 조회 자체가 실패한 것을 부재로 둔갑시키지 않는다.
  if (themeRes.error) {
    throw new Error(`테마 조회 실패 (${id}): ${themeRes.error.message}`)
  }
  // 여기까지 왔는데 row가 없으면 진짜 없는 것이다 — 호출부가 404를 내도 된다.
  if (!themeRes.data) return null

  return {
    ...themeRes.data,
    keywords: (keywordsRes.data || []).map((keyword) => keyword.keyword),
    score: scoreRes.data?.score ?? null,
    stage: scoreRes.data?.stage ?? null,
    updatedAt: scoreRes.data?.calculated_at ?? null,
    topStocks: (stocksRes.data || []).map((stock) => stock.stock_name),
  }
})
