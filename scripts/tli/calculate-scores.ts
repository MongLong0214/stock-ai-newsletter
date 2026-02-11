import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { calculateLifecycleScore } from '../../lib/tli/calculator'
import { determineStage } from '../../lib/tli/stage'
import { checkReigniting } from '../../lib/tli/reigniting'
import { getKSTDate, daysAgo } from './utils'
import type { InterestMetric, NewsMetric, Stage } from '../../lib/tli/types'
import type { ThemeWithKeywords } from './data-ops'

/** 라이프사이클 점수 계산 및 저장 */
export async function calculateAndSaveScores(themes: ThemeWithKeywords[]) {
  console.log('\n🧮 라이프사이클 점수 계산 중...')
  const today = getKSTDate()
  const themeIds = themes.map(t => t.id)
  const sevenDaysAgo = daysAgo(7)

  // ─── 데이터 배치 로딩 (5개 테이블 병렬, 자동 페이지네이션) ───
  const [allInterest, allNews, allSentiments, allPrevScores, allStockPrices] = await Promise.all([
    batchQuery<InterestMetric & { theme_id: string }>(
      'interest_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
    ),
    batchQuery<NewsMetric & { theme_id: string }>(
      'news_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
    ),
    batchQuery<{ theme_id: string; sentiment_score: number }>(
      'theme_news_articles', 'theme_id, sentiment_score', themeIds,
      q => q.gte('pub_date', sevenDaysAgo).not('sentiment_score', 'is', null),
    ),
    batchQuery<{ theme_id: string; stage: string }>(
      'lifecycle_scores', 'theme_id, stage', themeIds,
      q => q.lt('calculated_at', today).order('calculated_at', { ascending: false }),
    ),
    batchQuery<{ theme_id: string; price_change_pct: number | null }>(
      'theme_stocks', 'theme_id, price_change_pct', themeIds,
      q => q.eq('is_active', true).not('price_change_pct', 'is', null),
    ),
  ])

  // 테마별 그룹화
  const interestByTheme = groupByThemeId(allInterest)
  const newsByTheme = groupByThemeId(allNews)
  const sentimentByTheme = groupByThemeId(allSentiments)

  // 이전 스테이지 맵 (테마당 최신 1건)
  const prevStageMap = new Map<string, string>()
  for (const s of allPrevScores) {
    if (!prevStageMap.has(s.theme_id)) prevStageMap.set(s.theme_id, s.stage)
  }

  // ─── 관심도 캐시 + Cross-theme percentile ───
  const interestCache = new Map<string, InterestMetric[]>()
  const rawAvgMap = new Map<string, number>()

  for (const theme of themes) {
    const metrics = interestByTheme.get(theme.id) || []
    if (metrics.length === 0) continue

    const sorted = [...metrics]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 30)
    interestCache.set(theme.id, sorted)

    const raw7d = sorted.slice(0, 7).map(m => m.raw_value)
    if (raw7d.length > 0) {
      rawAvgMap.set(theme.id, raw7d.reduce((s, v) => s + v, 0) / raw7d.length)
    }
  }

  const sortedRawAvgs = Array.from(rawAvgMap.values()).filter(v => v > 0).sort((a, b) => a - b)
  function computePercentile(value: number): number {
    if (sortedRawAvgs.length === 0 || value <= 0) return 0
    return sortedRawAvgs.filter(v => v <= value).length / sortedRawAvgs.length
  }

  const medianRaw = sortedRawAvgs.length > 0 ? sortedRawAvgs[Math.floor(sortedRawAvgs.length / 2)] : 0
  console.log(`   📊 Cross-theme percentile: ${sortedRawAvgs.length}개 테마, median rawAvg=${medianRaw.toFixed(1)}`)

  // ─── 뉴스 + 감성 캐시 ───
  const newsCache = new Map<string, NewsMetric[]>()
  const sentimentCache = new Map<string, number[]>()

  for (const theme of themes) {
    const newsMetrics = newsByTheme.get(theme.id) || []
    if (newsMetrics.length > 0) {
      newsCache.set(theme.id, [...newsMetrics]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 14))
    }

    const scores = (sentimentByTheme.get(theme.id) || [])
      .map(s => s.sentiment_score)
      .filter(s => s !== null && s !== undefined)
    sentimentCache.set(theme.id, scores)
  }

  // ─── 종목 주가 변동률 캐시 ──
  const stockPriceByTheme = groupByThemeId(allStockPrices)
  const avgPriceChangeMap = new Map<string, number>()
  for (const theme of themes) {
    const stocks = stockPriceByTheme.get(theme.id) || []
    const prices = stocks.map(s => s.price_change_pct).filter((p): p is number => p !== null)
    if (prices.length > 0) {
      avgPriceChangeMap.set(theme.id, prices.reduce((s, v) => s + v, 0) / prices.length)
    }
  }

  // ─── 점수 계산 ───
  for (const theme of themes) {
    try {
      console.log(`\n   처리 중: ${theme.name}`)

      const interestMetrics = interestCache.get(theme.id)
      if (!interestMetrics?.length) {
        console.log(`   ⚠️ 관심도 메트릭 없음`)
        continue
      }

      const result = calculateLifecycleScore({
        interestMetrics,
        newsMetrics: newsCache.get(theme.id) || [],
        sentimentScores: sentimentCache.get(theme.id) || [],
        firstSpikeDate: theme.first_spike_date,
        today,
        rawPercentile: computePercentile(rawAvgMap.get(theme.id) ?? 0),
        avgPriceChangePct: avgPriceChangeMap.get(theme.id),
      })

      if (!result) {
        console.log(`   ⚠️ 최소 데이터 요건 미달 (관심도 ${interestMetrics.length}일)`)
        continue
      }

      const { score, components } = result
      const stage = determineStage(score, components)
      const isReigniting = checkReigniting(stage, interestMetrics.slice(0, 14))
      const prevStage = (prevStageMap.get(theme.id) as Stage) ?? null
      const stageChanged = prevStage !== null && prevStage !== stage

      const { error: scoreError } = await supabaseAdmin
        .from('lifecycle_scores')
        .upsert({
          theme_id: theme.id,
          calculated_at: today,
          score,
          stage,
          is_reigniting: isReigniting,
          stage_changed: stageChanged,
          prev_stage: prevStage,
          components,
        }, { onConflict: 'theme_id,calculated_at' })

      if (scoreError) {
        console.error(`   ❌ 점수 저장 실패:`, scoreError)
      } else {
        console.log(`   ✅ 점수: ${score}, 스테이지: ${stage}${isReigniting ? ' (재점화!)' : ''}`)
      }

      // first_spike_date 백필
      if (!theme.first_spike_date) {
        await supabaseAdmin
          .from('themes')
          .update({ first_spike_date: today })
          .eq('id', theme.id)
          .is('first_spike_date', null)
        console.log(`   📅 first_spike_date 설정: ${today}`)
      }
    } catch (error: unknown) {
      console.error(`   ❌ 테마 처리 실패:`, error instanceof Error ? error.message : String(error))
    }
  }

  console.log('\n   ✅ 라이프사이클 점수 계산 완료')
}
