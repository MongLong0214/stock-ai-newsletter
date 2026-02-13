import { supabase } from '@/lib/supabase'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'

/** 빈 랭킹 응답 (placeholder / 에러 시 재사용) */
export const EMPTY_RANKING: ThemeRanking = {
  early: [],
  growth: [],
  peak: [],
  decay: [],
  reigniting: [],
  summary: {
    totalThemes: 0,
    byStage: {},
    hottestTheme: null,
    surging: null,
    avgScore: 0,
  },
}

// ─── Supabase 1000행 제한 우회용 배치 헬퍼 ─────────────────────────────────

const BATCH_SIZE = 50
const PAGE_SIZE = 1000

/** theme_stocks 배치 로더 (is_active=true) — 종목명 + 등락률 포함, 병렬 배치 */
export async function batchLoadStockData(
  themeIds: string[]
): Promise<Array<{ theme_id: string; name: string; price_change_pct: number | null }>> {
  const chunks: string[][] = []
  for (let i = 0; i < themeIds.length; i += BATCH_SIZE) {
    chunks.push(themeIds.slice(i, i + BATCH_SIZE))
  }
  const batchResults = await Promise.all(
    chunks.map(async (chunk) => {
      const chunkResults: Array<{ theme_id: string; name: string; price_change_pct: number | null }> = []
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('theme_stocks')
          .select('theme_id, name, price_change_pct')
          .in('theme_id', chunk)
          .eq('is_active', true)
          .range(from, from + PAGE_SIZE - 1)
        if (!data || data.length === 0) break
        chunkResults.push(...data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      return chunkResults
    })
  )
  return batchResults.flat()
}

/** theme_news_articles 배치 카운트 로더 (날짜 필터 포함, 병렬 배치) */
export async function batchLoadNewsCounts(
  themeIds: string[],
  since: string
): Promise<Array<{ theme_id: string }>> {
  const chunks: string[][] = []
  for (let i = 0; i < themeIds.length; i += BATCH_SIZE) {
    chunks.push(themeIds.slice(i, i + BATCH_SIZE))
  }
  const batchResults = await Promise.all(
    chunks.map(async (chunk) => {
      const chunkResults: Array<{ theme_id: string }> = []
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('theme_news_articles')
          .select('theme_id')
          .in('theme_id', chunk)
          .gte('pub_date', since)
          .range(from, from + PAGE_SIZE - 1)
        if (!data || data.length === 0) break
        chunkResults.push(...data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      return chunkResults
    })
  )
  return batchResults.flat()
}

/** 점수 메타 정보 (최신, 7일 전, 스파크라인) */
export interface ThemeScoreMeta {
  latest: { theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string; components: unknown } | null
  weekAgoScore: { theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string; components: unknown } | null
  sparkline: number[]
}

/**
 * 점수 데이터를 theme_id별로 그룹화하고 메타 정보 계산
 * - 최신 점수 (desc 정렬의 첫 번째)
 * - 7일 전 점수 (sevenDaysAgo 이하의 첫 번째)
 * - 스파크라인 (7일 이내 점수 배열, 오래된 순)
 */
export function buildScoreMetaMap(
  scores: Array<{ theme_id: string; score: number; stage: string | null; is_reigniting: boolean; calculated_at: string; components: unknown }>,
  sevenDaysAgo: string
): Map<string, ThemeScoreMeta> {
  const scoreMetaByTheme = new Map<string, ThemeScoreMeta>()

  // scores는 calculated_at desc 정렬 → 첫 번째가 최신
  for (const s of scores) {
    if (!scoreMetaByTheme.has(s.theme_id)) {
      scoreMetaByTheme.set(s.theme_id, { latest: null, weekAgoScore: null, sparkline: [] })
    }
    const meta = scoreMetaByTheme.get(s.theme_id)!
    const dateStr = s.calculated_at.includes('T') ? s.calculated_at.split('T')[0] : s.calculated_at

    // 최신 점수 (desc이므로 첫 번째 = latest)
    if (!meta.latest) meta.latest = s

    // 7일 전 점수: sevenDaysAgo 이하인 첫 번째 (desc이므로 가장 최근)
    if (!meta.weekAgoScore && dateStr <= sevenDaysAgo) {
      meta.weekAgoScore = s
    }

    // 스파크라인: 7일 이내 점수 수집 (나중에 reverse)
    if (dateStr >= sevenDaysAgo) meta.sparkline.push(s.score)
  }

  // 스파크라인 정렬: desc → asc (오래된 순)
  for (const meta of scoreMetaByTheme.values()) {
    meta.sparkline.reverse()
  }

  return scoreMetaByTheme
}

/**
 * 종목 카운트/이름/평균등락률 + 뉴스 카운트 맵 구성
 */
export function buildCountMaps(
  stocksList: Array<{ theme_id: string; name: string; price_change_pct: number | null }>,
  newsList: Array<{ theme_id: string }>
): {
  stockCountMap: Map<string, number>
  stockNamesMap: Map<string, string[]>
  avgStockChangeMap: Map<string, number>
  newsCountMap: Map<string, number>
} {
  const stockCountMap = new Map<string, number>()
  const stockNamesMap = new Map<string, string[]>()
  const changeSumMap = new Map<string, { sum: number; count: number }>()

  for (const s of stocksList) {
    stockCountMap.set(s.theme_id, (stockCountMap.get(s.theme_id) || 0) + 1)
    if (!stockNamesMap.has(s.theme_id)) stockNamesMap.set(s.theme_id, [])
    const names = stockNamesMap.get(s.theme_id)!
    if (names.length < 5) names.push(s.name)

    if (s.price_change_pct != null) {
      const acc = changeSumMap.get(s.theme_id) ?? { sum: 0, count: 0 }
      acc.sum += s.price_change_pct
      acc.count += 1
      changeSumMap.set(s.theme_id, acc)
    }
  }

  const avgStockChangeMap = new Map<string, number>()
  for (const [id, acc] of changeSumMap) {
    avgStockChangeMap.set(id, acc.sum / acc.count)
  }

  const newsCountMap = new Map<string, number>()
  for (const n of newsList) {
    newsCountMap.set(n.theme_id, (newsCountMap.get(n.theme_id) || 0) + 1)
  }

  return { stockCountMap, stockNamesMap, avgStockChangeMap, newsCountMap }
}

/**
 * 랭킹 요약 통계 계산
 * - 단계별 집계
 * - 주도 테마: score >= 20 AND stockCount >= 3 중 최고 점수
 * - 급상승: score >= 15, change7d > 2, newsCount7d >= 1, sparkline >= 2, 비부정 감성 중 최대 change7d
 * - 평균 점수
 */
export function calculateRankingSummary(activeThemes: ThemeListItem[]) {
  const byStage: Record<string, number> = {}
  for (const t of activeThemes) {
    const key = t.isReigniting ? 'Reigniting' : t.stage
    byStage[key] = (byStage[key] || 0) + 1
  }

  // hottestTheme (주도 테마): score >= 20, stockCount >= 3
  const hottestCandidates = activeThemes.filter(
    t => t.score >= 20 && t.stockCount >= 3
  )
  const hottestTheme = hottestCandidates.length > 0
    ? hottestCandidates.reduce((max, t) => (t.score > max.score ? t : max))
    : null

  // surging (급상승): Early/Growth 단계, 의미있는 상승폭, 뉴스 뒷받침
  const surgingCandidates = activeThemes.filter(
    t =>
      t.score >= 15 &&
      (t.stage === 'Early' || t.stage === 'Growth') &&
      t.change7d > 3 &&
      t.newsCount7d >= 2 &&
      t.sparkline.length >= 3
  )
  const surging = surgingCandidates.length > 0
    ? surgingCandidates.reduce((max, t) => (t.change7d > max.change7d ? t : max))
    : null

  const avgScore = activeThemes.length > 0
    ? Math.round((activeThemes.reduce((sum, t) => sum + t.score, 0) / activeThemes.length) * 10) / 10
    : 0

  return {
    totalThemes: activeThemes.length,
    byStage,
    hottestTheme: hottestTheme
      ? { id: hottestTheme.id, name: hottestTheme.name, score: hottestTheme.score, stage: hottestTheme.stage, stockCount: hottestTheme.stockCount }
      : null,
    surging: surging
      ? { id: surging.id, name: surging.name, score: surging.score, change7d: surging.change7d, stage: surging.stage }
      : null,
    avgScore,
  }
}
