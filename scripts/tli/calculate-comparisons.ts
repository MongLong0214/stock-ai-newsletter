/** 테마 비교 분석 — 활성 테마와 전체 테마의 다중 시그널 비교 및 DB 저장 */

import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { getKSTDate } from './utils'
import { compositeCompare, featuresToArray } from '../../lib/tli/comparison'
import { buildMutualRankIndex, buildCurveMutualRankIndex, type MutualRankIndex } from '../../lib/tli/comparison/mutual-rank'
import type { ThemeWithKeywords } from './data-ops'
import { enrichThemes, computePopulationStats, type ThemeDataMaps, type EnrichedTheme } from './enrich-themes'

const SIMILARITY_THRESHOLD = 0.25
const MAX_MATCHES_PER_THEME = 3

interface MatchResult {
  pastThemeId: string; pastThemeName: string; similarity: number
  currentDay: number; pastPeakDay: number; pastTotalDays: number
  message: string; featureSim: number; curveSim: number; keywordSim: number
}

export async function calculateThemeComparisons(themes: ThemeWithKeywords[]) {
  console.log('\n🔍 테마 비교 분석 중 (다중 시그널)...')

  // 1단계: 전체 테마 + 데이터 배치 로딩
  const allThemes = await loadAllThemes()
  if (allThemes.length === 0) { console.log('   ⚠️ 테마 로딩 실패'); return }

  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dataByTheme = await loadThemeData(allThemes.map(t => t.id), kstNow)
  console.log(`   데이터 로딩: 테마 ${allThemes.length}개`)

  // 2단계: 테마 보강 + 모집단 통계
  const { themes: enrichedThemes, inferredCount } = enrichThemes(allThemes, dataByTheme, kstNow)
  console.log(`   테마 보강 완료: ${enrichedThemes.length}개 (first_spike_date 추론: ${inferredCount}개)`)

  if (enrichedThemes.length === 0) { console.log('   ⚠️ 보강된 테마 없음 — 비교 분석 생략'); return }

  const populationStats = computePopulationStats(enrichedThemes)
  console.log(`   피처 모집단 통계: ${populationStats.means.length}차원, ${enrichedThemes.length}개 테마`)

  // 2.5단계: Mutual Rank 인덱스 구축 (중심편향 방지)
  const mutualRankIndex = buildMutualRankIndex(
    enrichedThemes.map(t => ({ id: t.id, featureVector: featuresToArray(t.features) })),
    populationStats,
  )

  // Curve Mutual Rank 인덱스 (지수 커널 — hub dominance 방지)
  const curveMRThemes = enrichedThemes.filter(t => t.resampledCurve.length > 0)
  const curveMutualRankIndex = buildCurveMutualRankIndex(
    curveMRThemes.map(t => ({ id: t.id, resampledCurve: t.resampledCurve })),
  )
  console.log(`   Mutual Rank 인덱스 구축 완료: Feature ${enrichedThemes.length}개, Curve ${curveMRThemes.length}개 테마`)

  const enrichedMap = new Map(enrichedThemes.map(t => [t.id, t]))

  // 3단계: 활성 테마별 비교
  let totalMatches = 0, themesWithMatches = 0

  for (const currentTheme of themes) {
    try {
      const current = enrichedMap.get(currentTheme.id)
      if (!current) { console.log(`   ⊘ ${currentTheme.name}: 보강 데이터 없음`); continue }

      const matches = findTopMatches(current, enrichedThemes, populationStats, mutualRankIndex, curveMutualRankIndex)
      if (matches.length === 0) {
        console.log(`   ⊘ ${currentTheme.name}: 유사 매칭 없음 (임계값 ${Math.round(SIMILARITY_THRESHOLD * 100)}%)`)
        continue
      }

      themesWithMatches++
      totalMatches += matches.length
      const today = getKSTDate()
      await saveMatches(currentTheme.id, matches, enrichedMap, dataByTheme.scores, today)

      console.log(`   ✅ ${currentTheme.name}: ${matches.length}개 매칭 (최고: ${matches[0].pastThemeName} ${Math.round(matches[0].similarity * 100)}%)`)
    } catch (error: unknown) {
      console.error(`   ❌ ${currentTheme.name} 비교 실패:`, error instanceof Error ? error.message : String(error))
    }
  }

  // 만료된 비교 결과 정리 (7일 이전)
  const sevenDaysAgo = new Date(kstNow.getTime() - 7 * 86400000).toISOString().split('T')[0]
  const { data: deleted } = await supabaseAdmin.from('theme_comparisons').delete().lt('calculated_at', sevenDaysAgo).select('id')

  console.log(`\n✅ 비교 분석 완료: ${themesWithMatches}/${themes.length} 테마에 총 ${totalMatches}건 매칭 (stale ${deleted?.length ?? 0}건 정리)`)
}

async function loadAllThemes() {
  type ThemeRow = { id: string; name: string; first_spike_date: string | null; created_at: string | null; is_active: boolean }
  const all: ThemeRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('themes').select('id, name, first_spike_date, created_at, is_active').order('id').range(from, from + 999)
    if (error || !data?.length) break
    all.push(...data)
    if (data.length < 1000) break
  }
  return all
}

async function loadThemeData(themeIds: string[], kstNow: Date): Promise<ThemeDataMaps> {
  const daysAgo = (d: number) => new Date(kstNow.getTime() - d * 86400000).toISOString().split('T')[0]

  const [interestAll, scoresAll, newsAll, keywordsAll, stocksAll] = await Promise.all([
    batchQuery<{ theme_id: string; time: string; normalized: number }>(
      'interest_metrics', 'theme_id, time, normalized', themeIds, q => q.gte('time', daysAgo(180)),
    ),
    batchQuery<{ theme_id: string; score: number; calculated_at: string }>(
      'lifecycle_scores', 'theme_id, score, calculated_at', themeIds,
      q => q.gte('calculated_at', daysAgo(90)).order('calculated_at', { ascending: false }),
    ),
    batchQuery<{ theme_id: string; article_count: number }>(
      'news_metrics', 'theme_id, article_count', themeIds, q => q.gte('time', daysAgo(30)),
    ),
    batchQuery<{ theme_id: string; keyword: string }>('theme_keywords', 'theme_id, keyword', themeIds),
    batchQuery<{ theme_id: string; price_change_pct: number | null; volume: number | null }>(
      'theme_stocks', 'theme_id, price_change_pct, volume', themeIds,
    ),
  ])

  return {
    interest: groupByThemeId(interestAll), scores: groupByThemeId(scoresAll),
    news: groupByThemeId(newsAll), keywords: groupByThemeId(keywordsAll), stocks: groupByThemeId(stocksAll),
  }
}

/** 현재 테마와 모든 보강 테마를 비교, 유사도 상위 N개 반환 */
function findTopMatches(
  current: EnrichedTheme,
  allThemes: EnrichedTheme[],
  populationStats: ReturnType<typeof computePopulationStats>,
  mutualRank: MutualRankIndex,
  curveMutualRank: MutualRankIndex,
): MatchResult[] {
  const matches: MatchResult[] = []

  for (const past of allThemes) {
    if (past.id === current.id) continue
    if (past.totalDays < 14 || past.curve.length < 7) continue

    const precomputedFeatureSim = mutualRank.getSimilarity(current.id, past.id)
    const curveMRSim = curveMutualRank.getSimilarity(current.id, past.id)
    // Curve MR 인덱스에 없는 쌍(sim=0)은 rawCurveSim 폴백 (undefined)
    const precomputedCurveSim = curveMRSim > 0 ? curveMRSim : undefined
    const result = compositeCompare({ current, past, populationStats, precomputedFeatureSim, precomputedCurveSim })
    if (result.similarity >= SIMILARITY_THRESHOLD) {
      matches.push({ pastThemeId: past.id, pastThemeName: past.name, ...result })
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity)
  return matches.slice(0, MAX_MATCHES_PER_THEME)
}

/** 매칭 결과 DB 저장 + 이전 매칭 정리 */
async function saveMatches(
  currentThemeId: string,
  matches: MatchResult[],
  enrichedMap: Map<string, EnrichedTheme>,
  scoresByTheme: Map<string, Array<{ score: number; calculated_at: string }>>,
  today: string,
): Promise<void> {
  const savedIds: string[] = []

  for (const match of matches) {
    if (![match.similarity, match.featureSim, match.curveSim, match.keywordSim].every(isFinite)) {
      console.error(`   ⚠️ 비정상 수치 (${match.pastThemeName}) — 건너뜀`)
      continue
    }

    const pastScores = scoresByTheme.get(match.pastThemeId) || []
    const pastPeakScore = pastScores.length > 0 ? Math.max(...pastScores.map(s => s.score)) : null
    const pastData = enrichedMap.get(match.pastThemeId)
    const pastFinalStage = pastData && !pastData.isActive ? 'Dormant' : null
    const pastDeclineDays = pastPeakScore !== null && match.pastPeakDay > 0 ? Math.max(0, match.pastTotalDays - match.pastPeakDay) : null

    const { error } = await supabaseAdmin
      .from('theme_comparisons')
      .upsert({
        current_theme_id: currentThemeId,
        past_theme_id: match.pastThemeId,
        similarity_score: match.similarity,
        current_day: match.currentDay,
        past_peak_day: Math.max(0, match.pastPeakDay),
        past_total_days: match.pastTotalDays,
        message: match.message,
        calculated_at: today,
        feature_sim: match.featureSim,
        curve_sim: match.curveSim,
        keyword_sim: match.keywordSim,
        past_peak_score: pastPeakScore,
        past_final_stage: pastFinalStage,
        past_decline_days: pastDeclineDays,
      }, { onConflict: 'current_theme_id,past_theme_id,calculated_at' })

    if (error) console.error(`   ⚠️ 저장 실패:`, error.message)
    else savedIds.push(match.pastThemeId)
  }

  // 오늘 날짜의 실제 저장된 매칭에 없는 이전 항목 삭제
  if (savedIds.length === 0) return
  await supabaseAdmin
    .from('theme_comparisons')
    .delete()
    .eq('current_theme_id', currentThemeId)
    .eq('calculated_at', today)
    .not('past_theme_id', 'in', `(${savedIds.join(',')})`)
}