import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { getKSTDate } from './utils'
import { DEFAULT_THRESHOLD } from './auto-tune'
import { COMPARISON_PRIMARY_HORIZON_DAYS } from '../../lib/tli/comparison'
import {
  alignPastWindowByCurrentDay,
  classifyCurrentRunHorizonCensoring,
  evaluateFixedHorizonComparison,
  findClosestStageByDate,
  findClosestStageByLifecycleDay,
  sliceFixedHorizonWindow,
} from './comparison-v4-evaluator'
import { resolveFirstSpikeDate, type RawTheme } from './enrich-themes'

/** 궤적 상관 >= 0.3이면 "정확한 비교"로 판정 */
const MIN_VERIFICATION_DAYS = COMPARISON_PRIMARY_HORIZON_DAYS
const DEFAULT_SECTOR_PENALTY = 0.85
const STAGE_TOLERANCE_DAYS = 3

export async function evaluateComparisonOutcomes(tunedThreshold?: number) {
  console.log('\n🔬 비교 결과 검증 중...')
  const today = getKSTDate()
  const cutoffDate = new Date(new Date(today).getTime() - MIN_VERIFICATION_DAYS * 86400000).toISOString().split('T')[0]

  // 14일 이상 경과한 미검증 비교 로딩
  const { data: unverified, error } = await supabaseAdmin
    .from('theme_comparisons')
    .select('id, current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, calculated_at, feature_sim, curve_sim, keyword_sim')
    .or('outcome_verified.is.null,outcome_verified.eq.false')
    .lte('calculated_at', cutoffDate)
    .limit(200)

  if (error || !unverified?.length) {
    console.log(`   ⊘ 검증 대상 없음`)
    return
  }

  // 고유 테마 ID 수집
  const currentIds = [...new Set(unverified.map(c => c.current_theme_id))]
  const pastIds = [...new Set(unverified.map(c => c.past_theme_id))]
  const allIds = [...new Set([...currentIds, ...pastIds])]

  // 과거 테마의 first_spike_date 로딩 (궤적 라이프사이클 정렬용)
  const pastThemesData = await batchQuery<RawTheme>(
    'themes', 'id, name, first_spike_date, created_at, is_active', pastIds, undefined, 'id'
  )
  const firstSpikeDateByTheme = new Map<string, string>()
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  for (const t of pastThemesData) {
    const resolved = resolveFirstSpikeDate(t, undefined, kstNow)
    if (resolved) firstSpikeDateByTheme.set(t.id, resolved)
  }

  // 궤적 비교용 관심도 데이터 로딩 (최근 180일)
  const oneEightyDaysAgo = new Date(new Date(today).getTime() - 180 * 86400000).toISOString().split('T')[0]
  const interestAll = await batchQuery<{ theme_id: string; time: string; normalized: number }>(
    'interest_metrics', 'theme_id, time, normalized', allIds,
    q => q.gte('time', oneEightyDaysAgo).order('time', { ascending: true })
  )
  const interestByTheme = groupByThemeId(interestAll)

  // 최신 스테이지 로딩 (limit 없이 전체 로딩 → dedup으로 테마별 최신 선택)
  const allScores = await batchQuery<{ theme_id: string; stage: string; calculated_at: string }>(
    'lifecycle_scores', 'theme_id, stage, calculated_at', allIds,
    q => q.order('calculated_at', { ascending: true })
  )
  const scoresByTheme = groupByThemeId(allScores)

  // 각 비교 검증
  type VerifiedResult = {
    id: string
    trajectoryCorr: number
    stageMatch: boolean
    binaryRelevant: boolean
    censoredReason: string | null
    runLevelCensored: boolean
    featureSim: number | null
    curveSim: number | null
    keywordSim: number | null
  }
  const results: VerifiedResult[] = []

  for (const comp of unverified) {
    const currentInterest = interestByTheme.get(comp.current_theme_id) || []
    const pastInterest = interestByTheme.get(comp.past_theme_id) || []

    // 비교 시점 이후의 실제 궤적
    const afterDate = currentInterest
      .filter(m => m.time > comp.calculated_at)
      .map(m => m.normalized)
    const currentFutureValues = sliceFixedHorizonWindow(afterDate, COMPARISON_PRIMARY_HORIZON_DAYS)
    const runHorizonCensored = classifyCurrentRunHorizonCensoring(currentFutureValues)

    // 과거 테마의 동일 라이프사이클 위치 궤적 (first_spike_date 기준 정렬)
    const rawPastTheme = pastThemesData.find((theme) => theme.id === comp.past_theme_id)
    const pastFirstSpike = rawPastTheme
      ? resolveFirstSpikeDate(rawPastTheme, pastInterest, kstNow)
      : firstSpikeDateByTheme.get(comp.past_theme_id)
    const alignedPastInterest = pastFirstSpike
      ? pastInterest.filter(m => m.time >= pastFirstSpike)
      : pastInterest

    const alignedPast = alignPastWindowByCurrentDay({
      alignedPastValues: alignedPastInterest.map(m => m.normalized),
      currentDay: comp.current_day,
      horizonDays: COMPARISON_PRIMARY_HORIZON_DAYS,
    })

    const currentScores = scoresByTheme.get(comp.current_theme_id) || []
    const pastScores = scoresByTheme.get(comp.past_theme_id) || []
    const targetDate = new Date(new Date(comp.calculated_at).getTime() + COMPARISON_PRIMARY_HORIZON_DAYS * 86_400_000)
      .toISOString()
      .split('T')[0]
    const currentStageAtH14 = findClosestStageByDate(currentScores, targetDate, STAGE_TOLERANCE_DAYS)
    const pastStageAtAlignedH14 = pastFirstSpike
      ? findClosestStageByLifecycleDay(pastScores, pastFirstSpike, comp.current_day + COMPARISON_PRIMARY_HORIZON_DAYS, STAGE_TOLERANCE_DAYS)
      : null

    const evaluated = runHorizonCensored
      ? {
          trajectoryCorrH14: 0,
          positionStageMatchH14: false,
          binaryRelevant: false,
          gradedGain: 0,
          censoredReason: runHorizonCensored,
        }
      : alignedPast.censoredReason
      ? {
          trajectoryCorrH14: 0,
          positionStageMatchH14: false,
          binaryRelevant: false,
          gradedGain: 0,
          censoredReason: alignedPast.censoredReason,
        }
      : evaluateFixedHorizonComparison({
          currentFutureValues,
          pastFutureValues: alignedPast.values,
          currentStageAtH14,
          pastStageAtAlignedH14,
        })

    // DB 업데이트 — 실패 시 캘리브레이션 집계에서 제외
    const { error: updateErr } = await supabaseAdmin
      .from('theme_comparisons')
      .update({
        outcome_verified: true,
        trajectory_correlation: evaluated.trajectoryCorrH14,
        stage_match: evaluated.positionStageMatchH14,
        verified_at: today,
      })
      .eq('id', comp.id)

    if (updateErr) {
      console.error(`   ⚠️ 비교 업데이트 실패 (${comp.id}):`, updateErr.message)
      continue
    }

    results.push({
      id: comp.id,
      trajectoryCorr: evaluated.trajectoryCorrH14,
      stageMatch: evaluated.positionStageMatchH14,
      binaryRelevant: evaluated.binaryRelevant,
      censoredReason: evaluated.censoredReason,
      runLevelCensored: runHorizonCensored != null || evaluated.censoredReason === 'run_missing_point_in_time_snapshot',
      featureSim: comp.feature_sim,
      curveSim: comp.curve_sim,
      keywordSim: comp.keyword_sim,
    })
  }

  // 캘리브레이션 집계
  if (results.length > 0) {
    const accurate = results.filter(r => r.binaryRelevant && !r.runLevelCensored)
    const inaccurate = results.filter(r => !r.binaryRelevant && !r.runLevelCensored)

    const avgCorr = results.reduce((s, r) => s + r.trajectoryCorr, 0) / results.length
    const stageMatchRate = results.filter(r => r.stageMatch).length / results.length

    // 최적 임계값 결정 (파이프라인에서 전달받으면 재사용, 아니면 DEFAULT)
    const computedThreshold = tunedThreshold ?? DEFAULT_THRESHOLD

    const avgPillar = (items: VerifiedResult[], key: 'featureSim' | 'curveSim' | 'keywordSim') => {
      const valid = items.filter(r => r[key] != null)
      return valid.length > 0 ? valid.reduce((s, r) => s + (r[key] ?? 0), 0) / valid.length : null
    }

    const { error: calErr } = await supabaseAdmin.from('comparison_calibration').upsert({
      calculated_at: today,
      total_verified: results.length,
      avg_trajectory_corr: avgCorr,
      stage_match_rate: stageMatchRate,
      feature_corr_when_accurate: avgPillar(accurate, 'featureSim'),
      curve_corr_when_accurate: avgPillar(accurate, 'curveSim'),
      keyword_corr_when_accurate: avgPillar(accurate, 'keywordSim'),
      feature_corr_when_inaccurate: avgPillar(inaccurate, 'featureSim'),
      curve_corr_when_inaccurate: avgPillar(inaccurate, 'curveSim'),
      keyword_corr_when_inaccurate: avgPillar(inaccurate, 'keywordSim'),
      suggested_threshold: computedThreshold,
      suggested_sector_penalty: DEFAULT_SECTOR_PENALTY,
      details: {
        accurate_count: accurate.length,
        inaccurate_count: inaccurate.length,
        run_censored_count: results.filter(r => r.runLevelCensored).length,
        censored_count: results.filter(r => r.censoredReason != null).length,
        avg_trajectory_corr_accurate: accurate.length > 0 ? accurate.reduce((s, r) => s + r.trajectoryCorr, 0) / accurate.length : null,
        avg_trajectory_corr_inaccurate: inaccurate.length > 0 ? inaccurate.reduce((s, r) => s + r.trajectoryCorr, 0) / inaccurate.length : null,
      },
    }, { onConflict: 'calculated_at' })

    if (calErr) {
      console.error(`   ⚠️ 캘리브레이션 저장 실패:`, calErr.message)
    }

    console.log(`   ✅ ${results.length}건 검증 완료 (정확: ${accurate.length}, 부정확: ${inaccurate.length})`)
    console.log(`   📊 평균 궤적 상관: ${avgCorr.toFixed(3)}, 스테이지 일치율: ${(stageMatchRate * 100).toFixed(1)}%`)
  }
}
