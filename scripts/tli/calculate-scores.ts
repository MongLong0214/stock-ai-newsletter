import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { calculateLifecycleScore } from '../../lib/tli/calculator'
import { applyEMASmoothing, resolveStageWithHysteresis } from '../../lib/tli/score-smoothing'
import { getKSTDate } from './utils'
import { avg } from '../../lib/tli/normalize'
import type { InterestMetric, NewsMetric, Stage, ScoreComponents } from '../../lib/tli/types'
import type { ThemeWithKeywords } from './data-ops'
import { buildFirstSpikeDateBackfillRows } from './first-spike-date'

/** 이전 점수 레코드 타입 */
export interface PrevScoreRecord {
  theme_id: string
  stage: string
  score: number
  smoothed_score: number | null
  raw_score: number | null
  components: ScoreComponents | null
  calculated_at: string
}

const MAX_PREV_SCORE_RECORDS = 5

export function buildPrevScoreMap(allPrevScores: PrevScoreRecord[]): Map<string, PrevScoreRecord[]> {
  const prevScoreMap = new Map<string, PrevScoreRecord[]>()

  for (const score of allPrevScores) {
    const records = prevScoreMap.get(score.theme_id) || []
    if (records.length < MAX_PREV_SCORE_RECORDS) {
      records.push(score)
      prevScoreMap.set(score.theme_id, records)
    }
  }

  return prevScoreMap
}

export function buildRecentSmoothedMap(prevScoreMap: Map<string, PrevScoreRecord[]>): Map<string, number[]> {
  const recentSmoothedMap = new Map<string, number[]>()

  for (const [themeId, records] of prevScoreMap) {
    const smootheds = records
      .filter(record => record.smoothed_score !== null)
      .map(record => record.smoothed_score!)
      .slice(0, MAX_PREV_SCORE_RECORDS)
    if (smootheds.length > 0) recentSmoothedMap.set(themeId, smootheds)
  }

  return recentSmoothedMap
}

/** 라이프사이클 점수 계산 및 저장 (v2 — EMA + Bollinger + Hysteresis) */
export async function calculateAndSaveScores(themes: ThemeWithKeywords[]) {
  console.log('\n🧮 라이프사이클 점수 계산 중...')
  const today = getKSTDate()
  const themeIds = themes.map(t => t.id)

  // ─── 데이터 배치 로딩 ───
  const [allInterest, allNews, allPrevScores, allStocks] = await Promise.all([
    batchQuery<InterestMetric & { theme_id: string }>(
      'interest_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
      'theme_id',
      { failOnError: true },
    ),
    batchQuery<NewsMetric & { theme_id: string }>(
      'news_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
      'theme_id',
      { failOnError: true },
    ),
    batchQuery<PrevScoreRecord>(
      'lifecycle_scores', 'theme_id, stage, score, smoothed_score, raw_score, components, calculated_at', themeIds,
      q => q.lt('calculated_at', today).order('calculated_at', { ascending: false }),
      'theme_id',
      { failOnError: true },
    ),
    batchQuery<{ theme_id: string; price_change_pct: number | null; volume: number | null }>(
      'theme_stocks', 'theme_id, price_change_pct, volume', themeIds,
      undefined,
      'theme_id',
      { failOnError: true },
    ),
  ])

  // ─── 캐시 구축 ───
  const interestByTheme = groupByThemeId(allInterest)
  const newsByTheme = groupByThemeId(allNews)
  const stocksByTheme = groupByThemeId(allStocks)

  const prevScoreMap = buildPrevScoreMap(allPrevScores)

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

  const allThemesRawAvg = Array.from(rawAvgMap.values()).filter(v => v > 0).sort((a, b) => a - b)
  const medianRaw = allThemesRawAvg.length > 0 ? allThemesRawAvg[Math.floor(allThemesRawAvg.length / 2)] : 0
  console.log(`   📊 Cross-theme percentile: ${allThemesRawAvg.length}개 테마, median rawAvg=${medianRaw.toFixed(1)}`)

  const newsCache = new Map<string, NewsMetric[]>()
  for (const theme of themes) {
    const newsMetrics = newsByTheme.get(theme.id) || []
    if (newsMetrics.length > 0) {
      newsCache.set(theme.id, [...newsMetrics]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 14))
    }
  }

  const recentSmoothedMap = buildRecentSmoothedMap(prevScoreMap)

  // ─── 점수 계산 ───
  const scoreRows: {
    theme_id: string; calculated_at: string; score: number; stage: string
    raw_score: number; smoothed_score: number
    is_reigniting: boolean; stage_changed: boolean; prev_stage: string | null
    components: ScoreComponents
  }[] = []
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  let themeFailures = 0

  for (const theme of themes) {
    try {
      console.log(`\n   처리 중: ${theme.name}`)

      const interestMetrics = interestCache.get(theme.id)
      if (!interestMetrics?.length) {
        console.log(`   ⚠️ 관심도 메트릭 없음`)
        continue
      }

      const stocks = stocksByTheme.get(theme.id) || []
      const validPrices = stocks.filter(s => s.price_change_pct !== null).map(s => s.price_change_pct!)
      const validVolumes = stocks.filter(s => s.volume !== null).map(s => s.volume!)
      const avgPriceChangePct = validPrices.length > 0 ? avg(validPrices) : undefined
      const avgVolume = validVolumes.length > 0 ? avg(validVolumes) : undefined

      const prevRecords = prevScoreMap.get(theme.id) || []
      const prevRecord = prevRecords[0] ?? null
      const prevSmoothedScore = prevRecord?.smoothed_score ?? prevRecord?.score ?? undefined
      const prevAvgVolume = prevRecord?.components?.raw?.avg_volume as number | undefined

      const result = calculateLifecycleScore({
        interestMetrics,
        newsMetrics: newsCache.get(theme.id) || [],
        firstSpikeDate: theme.first_spike_date,
        today,
        allThemesRawAvg,
        avgPriceChangePct,
        avgVolume,
        prevSmoothedScore,
        prevAvgVolume,
      })

      if (!result) {
        console.log(`   ⚠️ 최소 데이터 요건 미달 (관심도 ${interestMetrics.length}일)`)
        continue
      }

      const rawScore = result.score
      const { components } = result

      // EMA + Bollinger smoothing (extracted)
      const smoothedScore = applyEMASmoothing(
        rawScore,
        prevSmoothedScore,
        recentSmoothedMap.get(theme.id) || [],
      )

      // Stage resolution with Hysteresis (extracted)
      const prevStage = (prevRecord?.stage as Stage) ?? null
      const prevCandidate = prevRecord?.components?.raw?.stage_candidate as Stage | undefined

      const stageResult = resolveStageWithHysteresis({
        rawScore,
        smoothedScore,
        components,
        prevStage,
        prevCandidate,
        prevCalculatedAt: prevRecord?.calculated_at,
        today,
        interestMetrics14d: interestMetrics.slice(0, 14),
      })

      scoreRows.push({
        theme_id: theme.id,
        calculated_at: today,
        score: smoothedScore,
        raw_score: rawScore,
        smoothed_score: smoothedScore,
        stage: stageResult.finalStage,
        is_reigniting: stageResult.isReigniting,
        stage_changed: stageResult.stageChanged,
        prev_stage: prevStage,
        components,
      })

      console.log(`   ✅ raw=${rawScore} → smoothed=${smoothedScore}, stage=${stageResult.finalStage}${stageResult.stageChanged ? ` (← ${prevStage})` : ''}${stageResult.isReigniting ? ' (재점화!)' : ''}`)
    } catch (error: unknown) {
      themeFailures++
      console.error(`   ❌ 테마 처리 실패:`, error instanceof Error ? error.message : String(error))
    }
  }

  // ─── 배치 저장 ───
  if (scoreRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('lifecycle_scores')
      .upsert(scoreRows, { onConflict: 'theme_id,calculated_at' })
    if (error) {
      throw new Error(`점수 배치 저장 실패 (${scoreRows.length}건): ${error.message}`)
    } else {
      console.log(`\n   💾 점수 배치 저장 완료: ${scoreRows.length}건`)
    }
  }

  const spikeBackfillRows = buildFirstSpikeDateBackfillRows(themes, interestByTheme, kstNow)
  if (spikeBackfillRows.length > 0) {
    let backfilledCount = 0
    for (const row of spikeBackfillRows) {
      const { error } = await supabaseAdmin
        .from('themes')
        .update({ first_spike_date: row.first_spike_date })
        .eq('id', row.id)
        .is('first_spike_date', null)
      if (error) {
        console.error(`   ❌ first_spike_date 백필 실패 (${row.id}):`, error.message)
      } else {
        backfilledCount++
      }
    }
    console.log(`   📅 first_spike_date 백필 완료: ${backfilledCount}건`)
  }

  console.log('\n   ✅ 라이프사이클 점수 계산 완료')
  if (themeFailures > 0) {
    throw new Error(`라이프사이클 점수 계산 중 ${themeFailures}개 테마 실패`)
  }
}
