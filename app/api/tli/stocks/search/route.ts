import { supabase } from '@/lib/supabase'
import { apiError, apiSuccess, escapeIlike, handleApiError, isTableNotFound, placeholderResponse } from '@/lib/tli/api-utils'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { getStageKo, toStage } from '@/lib/tli/types'

interface ThemeStockMatchRow {
  symbol: string
  name: string
  market: string
  theme_id: string
}

interface ThemeMetaRow {
  id: string
  name: string
  name_en: string | null
}

interface ScoreMetaRow {
  theme_id: string
  score: number
  stage: string | null
  is_reigniting: boolean
  calculated_at: string
}

const MAX_RESULTS = 20

const normalize = (value: string) => value.trim().toLowerCase()

const buildMatchRank = (query: string, stock: { symbol: string; name: string }) => {
  const normalizedQuery = normalize(query)
  const normalizedSymbol = normalize(stock.symbol)
  const normalizedName = normalize(stock.name)

  if (normalizedSymbol === normalizedQuery) return 0
  if (normalizedName === normalizedQuery) return 1
  if (normalizedSymbol.startsWith(normalizedQuery)) return 2
  if (normalizedName.startsWith(normalizedQuery)) return 3
  return 4
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() || ''

    if (!query) {
      return apiError('검색어(q)가 필요합니다.', 400)
    }

    const placeholder = placeholderResponse([])
    if (placeholder) return placeholder

    const [nameRes, symbolRes] = await Promise.all([
      supabase
        .from('theme_stocks')
        .select('symbol, name, market, theme_id')
        .eq('is_active', true)
        .ilike('name', `%${escapeIlike(query)}%`)
        .limit(200),
      supabase
        .from('theme_stocks')
        .select('symbol, name, market, theme_id')
        .eq('is_active', true)
        .ilike('symbol', `%${escapeIlike(query)}%`)
        .limit(200),
    ])

    const lookupError = nameRes.error || symbolRes.error
    if (lookupError) {
      if (isTableNotFound(lookupError)) {
        console.warn('[TLI API] TLI tables not found - returning empty stock search results')
        return apiSuccess([])
      }
      throw lookupError
    }

    const matches = [...(nameRes.data || []), ...(symbolRes.data || [])] as ThemeStockMatchRow[]
    if (matches.length === 0) {
      return apiSuccess([])
    }

    const uniqueMatches = new Map<string, ThemeStockMatchRow>()
    for (const match of matches) {
      uniqueMatches.set(`${match.symbol}:${match.theme_id}`, match)
    }

    const dedupedMatches = [...uniqueMatches.values()]
    const themeIds = [...new Set(dedupedMatches.map((row) => row.theme_id))]

    const [themesRes, scoresRes] = await Promise.all([
      supabase
        .from('themes')
        .select('id, name, name_en')
        .in('id', themeIds)
        .eq('is_active', true),
      supabase
        .from('lifecycle_scores')
        .select('theme_id, score, stage, is_reigniting, calculated_at')
        .in('theme_id', themeIds)
        .gte('calculated_at', getKSTDateString(-7))
        .order('calculated_at', { ascending: false })
        .limit(themeIds.length * 2),
    ])

    if (themesRes.error) throw themesRes.error
    if (scoresRes.error) throw scoresRes.error

    const themeMap = new Map((themesRes.data || []).map((theme: ThemeMetaRow) => [theme.id, theme]))
    const scoreMap = new Map<string, ScoreMetaRow>()

    for (const score of (scoresRes.data || []) as ScoreMetaRow[]) {
      if (!scoreMap.has(score.theme_id)) {
        scoreMap.set(score.theme_id, score)
      }
    }

    const stockMap = new Map<string, {
      symbol: string
      name: string
      market: string
      topThemes: Array<{
        themeId: string
        themeName: string
        themeNameEn: string | null
        score: number
        stage: ReturnType<typeof toStage>
        stageKo: string
        isReigniting: boolean
        updatedAt: string | null
      }>
    }>()

    for (const match of dedupedMatches) {
      const theme = themeMap.get(match.theme_id)
      if (!theme) continue

      const score = scoreMap.get(match.theme_id)
      const stage = toStage(score?.stage)
      const bucket = stockMap.get(match.symbol) || {
        symbol: match.symbol,
        name: match.name,
        market: match.market,
        topThemes: [],
      }

      bucket.topThemes.push({
        themeId: theme.id,
        themeName: theme.name,
        themeNameEn: theme.name_en,
        score: score?.score ?? 0,
        stage,
        stageKo: getStageKo(stage),
        isReigniting: score?.is_reigniting ?? false,
        updatedAt: score?.calculated_at ?? null,
      })

      stockMap.set(match.symbol, bucket)
    }

    const results = [...stockMap.values()]
      .map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        themeCount: stock.topThemes.length,
        topThemes: stock.topThemes.sort((a, b) => b.score - a.score),
      }))
      .sort((a, b) => {
        const matchDelta = buildMatchRank(query, a) - buildMatchRank(query, b)
        if (matchDelta !== 0) return matchDelta
        const themeDelta = b.themeCount - a.themeCount
        if (themeDelta !== 0) return themeDelta
        return a.symbol.localeCompare(b.symbol)
      })
      .slice(0, MAX_RESULTS)

    return apiSuccess(results)
  } catch (error) {
    return handleApiError(error, '종목 검색에 실패했습니다.')
  }
}

export const runtime = 'nodejs'
