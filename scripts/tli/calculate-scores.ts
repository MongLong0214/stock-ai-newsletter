import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { calculateLifecycleScore } from '../../lib/tli/calculator'
import { determineStage } from '../../lib/tli/stage'
import { checkReigniting } from '../../lib/tli/reigniting'
import { getKSTDate } from './utils'
import type { InterestMetric, NewsMetric, Stage, ScoreComponents } from '../../lib/tli/types'
import type { ThemeWithKeywords } from './data-ops'

/** 라이프사이클 점수 계산 및 저장 */
export async function calculateAndSaveScores(themes: ThemeWithKeywords[]) {
  console.log('\n🧮 라이프사이클 점수 계산 중...')
  const today = getKSTDate()
  const themeIds = themes.map(t => t.id)

  // ─── 데이터 배치 로딩 (병렬, 자동 페이지네이션) ───
  const [allInterest, allNews, allPrevScores] = await Promise.all([
    batchQuery<InterestMetric & { theme_id: string }>(
      'interest_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
    ),
    batchQuery<NewsMetric & { theme_id: string }>(
      'news_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
    ),
    batchQuery<{ theme_id: string; stage: string }>(
      'lifecycle_scores', 'theme_id, stage', themeIds,
      q => q.lt('calculated_at', today).order('calculated_at', { ascending: false }),
    ),
  ])

  // 테마별 그룹화
  const interestByTheme = groupByThemeId(allInterest)
  const newsByTheme = groupByThemeId(allNews)

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
    // Binary search: upper bound of value in sorted array
    let lo = 0, hi = sortedRawAvgs.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (sortedRawAvgs[mid] <= value) lo = mid + 1
      else hi = mid
    }
    return lo / sortedRawAvgs.length
  }

  const medianRaw = sortedRawAvgs.length > 0 ? sortedRawAvgs[Math.floor(sortedRawAvgs.length / 2)] : 0
  console.log(`   📊 Cross-theme percentile: ${sortedRawAvgs.length}개 테마, median rawAvg=${medianRaw.toFixed(1)}`)

  // ─── 뉴스 캐시 ───
  const newsCache = new Map<string, NewsMetric[]>()

  for (const theme of themes) {
    const newsMetrics = newsByTheme.get(theme.id) || []
    if (newsMetrics.length > 0) {
      newsCache.set(theme.id, [...newsMetrics]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 14))
    }
  }

  // ─── 점수 계산 (결과 수집) ───
  const scoreRows: {
    theme_id: string; calculated_at: string; score: number; stage: string
    is_reigniting: boolean; stage_changed: boolean; prev_stage: string | null
    components: ScoreComponents
  }[] = []
  const spikeBackfillIds: string[] = []

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
        firstSpikeDate: theme.first_spike_date,
        today,
        rawPercentile: computePercentile(rawAvgMap.get(theme.id) ?? 0),
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

      scoreRows.push({
        theme_id: theme.id,
        calculated_at: today,
        score, stage, is_reigniting: isReigniting,
        stage_changed: stageChanged, prev_stage: prevStage,
        components,
      })

      console.log(`   ✅ 점수: ${score}, 스테이지: ${stage}${isReigniting ? ' (재점화!)' : ''}`)

      if (!theme.first_spike_date) {
        spikeBackfillIds.push(theme.id)
      }
    } catch (error: unknown) {
      console.error(`   ❌ 테마 처리 실패:`, error instanceof Error ? error.message : String(error))
    }
  }

  // ─── 배치 저장 ───
  if (scoreRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('lifecycle_scores')
      .upsert(scoreRows, { onConflict: 'theme_id,calculated_at' })
    if (error) {
      console.error(`   ❌ 점수 배치 저장 실패 (${scoreRows.length}건):`, error)
    } else {
      console.log(`\n   💾 점수 배치 저장 완료: ${scoreRows.length}건`)
    }
  }

  if (spikeBackfillIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('themes')
      .update({ first_spike_date: today })
      .in('id', spikeBackfillIds)
      .is('first_spike_date', null)
    if (error) {
      console.error(`   ❌ first_spike_date 백필 실패:`, error)
    } else {
      console.log(`   📅 first_spike_date 백필 완료: ${spikeBackfillIds.length}건`)
    }
  }

  console.log('\n   ✅ 라이프사이클 점수 계산 완료')
}
