import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { calculateLifecycleScore } from '../../lib/tli/calculator'
import { determineStage, isReignitingTransition } from '../../lib/tli/stage'
import { checkReigniting } from '../../lib/tli/reigniting'
import { getKSTDate } from './utils'
import { avg, standardDeviation, daysBetween } from '../../lib/tli/normalize'
import type { InterestMetric, NewsMetric, Stage, ScoreComponents } from '../../lib/tli/types'
import type { ThemeWithKeywords } from './data-ops'

/** EMA smoothing factor (span≈4일, 60% 노이즈 억제) */
const EMA_ALPHA = 0.4
/** Bollinger band 최소 일일 변동 허용 (score 0-100 대비 10%) */
const MIN_DAILY_CHANGE = 10

/** 이전 점수 레코드 타입 */
interface PrevScoreRecord {
  theme_id: string
  stage: string
  score: number
  smoothed_score: number | null
  raw_score: number | null
  components: ScoreComponents | null
  calculated_at: string
}

/** 라이프사이클 점수 계산 및 저장 (v2 — EMA + Bollinger + Hysteresis) */
export async function calculateAndSaveScores(themes: ThemeWithKeywords[]) {
  console.log('\n🧮 라이프사이클 점수 계산 중...')
  const today = getKSTDate()
  const themeIds = themes.map(t => t.id)

  // ─── 데이터 배치 로딩 (병렬, 자동 페이지네이션) ───
  const [allInterest, allNews, allPrevScores, allStocks] = await Promise.all([
    batchQuery<InterestMetric & { theme_id: string }>(
      'interest_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
    ),
    batchQuery<NewsMetric & { theme_id: string }>(
      'news_metrics', '*', themeIds,
      q => q.order('time', { ascending: false }),
    ),
    batchQuery<PrevScoreRecord>(
      'lifecycle_scores', 'theme_id, stage, score, smoothed_score, raw_score, components, calculated_at', themeIds,
      q => q.lt('calculated_at', today).order('calculated_at', { ascending: false }),
    ),
    batchQuery<{ theme_id: string; price_change_pct: number | null; volume: number | null }>(
      'theme_stocks', 'theme_id, price_change_pct, volume', themeIds,
    ),
  ])

  // 테마별 그룹화
  const interestByTheme = groupByThemeId(allInterest)
  const newsByTheme = groupByThemeId(allNews)
  const stocksByTheme = groupByThemeId(allStocks)

  // 이전 점수 맵 (테마당 최신 2건 — hysteresis용)
  const prevScoreMap = new Map<string, PrevScoreRecord[]>()
  for (const s of allPrevScores) {
    const arr = prevScoreMap.get(s.theme_id) || []
    if (arr.length < 2) {
      arr.push(s)
      prevScoreMap.set(s.theme_id, arr)
    }
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

  // allThemesRawAvg: raw > 0인 테마만 포함, 오름차순 정렬
  const allThemesRawAvg = Array.from(rawAvgMap.values()).filter(v => v > 0).sort((a, b) => a - b)
  const medianRaw = allThemesRawAvg.length > 0 ? allThemesRawAvg[Math.floor(allThemesRawAvg.length / 2)] : 0
  console.log(`   📊 Cross-theme percentile: ${allThemesRawAvg.length}개 테마, median rawAvg=${medianRaw.toFixed(1)}`)

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

  // ─── Bollinger용: 이전 5일 smoothedScore 캐시 ───
  const recentSmoothedMap = new Map<string, number[]>()
  for (const [themeId, records] of prevScoreMap) {
    // allPrevScores는 calculated_at DESC 정렬, 여기서는 최근 5일분 smoothed_score 수집
    const smootheds = records
      .filter(r => r.smoothed_score !== null)
      .map(r => r.smoothed_score!)
      .slice(0, 5)
    if (smootheds.length > 0) recentSmoothedMap.set(themeId, smootheds)
  }

  // ─── 점수 계산 (결과 수집) ───
  const scoreRows: {
    theme_id: string; calculated_at: string; score: number; stage: string
    raw_score: number; smoothed_score: number
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

      // 주가/거래량 집계
      const stocks = stocksByTheme.get(theme.id) || []
      const validPrices = stocks.filter(s => s.price_change_pct !== null).map(s => s.price_change_pct!)
      const validVolumes = stocks.filter(s => s.volume !== null).map(s => s.volume!)
      const avgPriceChangePct = validPrices.length > 0 ? avg(validPrices) : undefined
      const avgVolume = validVolumes.length > 0 ? avg(validVolumes) : undefined

      // 이전 점수 정보
      const prevRecords = prevScoreMap.get(theme.id) || []
      const prevRecord = prevRecords[0] ?? null
      const prevSmoothedScore = prevRecord?.smoothed_score ?? prevRecord?.score ?? undefined

      const result = calculateLifecycleScore({
        interestMetrics,
        newsMetrics: newsCache.get(theme.id) || [],
        firstSpikeDate: theme.first_spike_date,
        today,
        allThemesRawAvg,
        avgPriceChangePct,
        avgVolume,
        prevSmoothedScore,
      })

      if (!result) {
        console.log(`   ⚠️ 최소 데이터 요건 미달 (관심도 ${interestMetrics.length}일)`)
        continue
      }

      const rawScore = result.score
      const { components } = result

      // ── EMA Smoothing + Bollinger 이상치 감지 ──
      let smoothedScore: number
      if (prevSmoothedScore !== undefined) {
        // Bollinger band: 이전 5일 smoothed score의 2σ 밴드
        const recentSmoothed = recentSmoothedMap.get(theme.id) || []
        const sigma = recentSmoothed.length >= 2 ? standardDeviation(recentSmoothed) : 0
        const maxDailyChange = Math.max(MIN_DAILY_CHANGE, 2 * sigma)

        let effectiveRaw = rawScore
        if (Math.abs(rawScore - prevSmoothedScore) > maxDailyChange) {
          const sign = rawScore > prevSmoothedScore ? 1 : -1
          effectiveRaw = prevSmoothedScore + sign * maxDailyChange
        }

        smoothedScore = Math.round(EMA_ALPHA * effectiveRaw + (1 - EMA_ALPHA) * prevSmoothedScore)
      } else {
        // 첫 날: rawScore 그대로
        smoothedScore = rawScore
      }
      smoothedScore = Math.max(0, Math.min(100, smoothedScore))

      // ── Stage 결정 (Markov + Hysteresis) ──
      const prevStage = (prevRecord?.stage as Stage) ?? null
      const dataGapDays = prevRecord ? daysBetween(prevRecord.calculated_at, today) : undefined

      // 1. Markov-constrained candidate (smoothed score 기준)
      const markovStage = determineStage(smoothedScore, components, prevStage, dataGapDays)

      // 2. Peak fast-track: rawScore >= 63 AND smoothedScore >= 50 → 즉시 Peak
      let finalStage: Stage
      if (rawScore >= 63 && smoothedScore >= 50 && markovStage === 'Peak') {
        finalStage = 'Peak'
      }
      // 3. 변경 없으면 그대로
      else if (markovStage === prevStage || prevStage === null) {
        finalStage = markovStage
      }
      // 4. Hysteresis: 2일 연속 동일 candidate 필요
      else {
        // 어제의 candidate 복원: 이전 components에서 저장된 stage_candidate 확인
        const prevCandidate = prevRecord?.components?.raw?.stage_candidate as Stage | undefined
        if (prevCandidate === markovStage) {
          finalStage = markovStage // 2일 연속 → 전환 확정
        } else {
          finalStage = prevStage // 1일차 → 현재 stage 유지
        }
      }

      // stage_candidate 저장 (내일 hysteresis 판단용)
      components.raw.stage_candidate = markovStage

      const isReigniting = checkReigniting(finalStage, interestMetrics.slice(0, 14), prevStage)
        || isReignitingTransition(finalStage, prevStage)
      const stageChanged = prevStage !== null && prevStage !== finalStage

      scoreRows.push({
        theme_id: theme.id,
        calculated_at: today,
        score: smoothedScore,
        raw_score: rawScore,
        smoothed_score: smoothedScore,
        stage: finalStage,
        is_reigniting: isReigniting,
        stage_changed: stageChanged,
        prev_stage: prevStage,
        components,
      })

      console.log(`   ✅ raw=${rawScore} → smoothed=${smoothedScore}, stage=${finalStage}${stageChanged ? ` (← ${prevStage})` : ''}${isReigniting ? ' (재점화!)' : ''}`)

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
