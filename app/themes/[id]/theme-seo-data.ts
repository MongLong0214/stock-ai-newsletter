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

export const getThemeSeoData = cache(async (id: string): Promise<ThemeSeoData | null> => {
  try {
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

    if (themeRes.error || !themeRes.data) return null

    return {
      ...themeRes.data,
      keywords: (keywordsRes.data || []).map((keyword) => keyword.keyword),
      score: scoreRes.data?.score ?? null,
      stage: scoreRes.data?.stage ?? null,
      updatedAt: scoreRes.data?.calculated_at ?? null,
      topStocks: (stocksRes.data || []).map((stock) => stock.stock_name),
    }
  } catch {
    return null
  }
})
