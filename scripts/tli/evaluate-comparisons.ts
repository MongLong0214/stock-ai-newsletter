import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { pearsonCorrelation } from '../../lib/tli/comparison/similarity'
import { getKSTDate } from './utils'

/** 궤적 상관 >= 0.3이면 "정확한 비교"로 판정 */
const ACCURACY_THRESHOLD = 0.3
const MIN_VERIFICATION_DAYS = 14
/** 현재 기본 임계값 (캘리브레이션 데이터 축적 후 동적 조정 예정) */
const DEFAULT_THRESHOLD = 0.40
const DEFAULT_SECTOR_PENALTY = 0.7

export async function evaluateComparisonOutcomes() {
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
  const pastThemesData = await batchQuery<{ id: string; first_spike_date: string | null }>(
    'themes', 'id, first_spike_date', pastIds, undefined, 'id'
  )
  const firstSpikeDateByTheme = new Map<string, string>()
  for (const t of pastThemesData) {
    if (t.first_spike_date) firstSpikeDateByTheme.set(t.id, t.first_spike_date)
  }

  // 궤적 비교용 관심도 데이터 로딩 (최근 180일)
  const oneEightyDaysAgo = new Date(new Date(today).getTime() - 180 * 86400000).toISOString().split('T')[0]
  const interestAll = await batchQuery<{ theme_id: string; time: string; normalized: number }>(
    'interest_metrics', 'theme_id, time, normalized', allIds,
    q => q.gte('time', oneEightyDaysAgo).order('time', { ascending: true })
  )
  const interestByTheme = groupByThemeId(interestAll)

  // 최신 스테이지 로딩 (limit 없이 전체 로딩 → dedup으로 테마별 최신 선택)
  const latestScores = await batchQuery<{ theme_id: string; stage: string; calculated_at: string }>(
    'lifecycle_scores', 'theme_id, stage, calculated_at', allIds,
    q => q.order('calculated_at', { ascending: false })
  )
  const stageByTheme = new Map<string, string>()
  for (const s of latestScores) {
    if (!stageByTheme.has(s.theme_id)) stageByTheme.set(s.theme_id, s.stage)
  }

  // 각 비교 검증
  type VerifiedResult = { id: string; trajectoryCorr: number; stageMatch: boolean; featureSim: number | null; curveSim: number | null; keywordSim: number | null }
  const results: VerifiedResult[] = []

  for (const comp of unverified) {
    const currentInterest = interestByTheme.get(comp.current_theme_id) || []
    const pastInterest = interestByTheme.get(comp.past_theme_id) || []

    // 비교 시점 이후의 실제 궤적
    const afterDate = currentInterest
      .filter(m => m.time > comp.calculated_at)
      .map(m => m.normalized)

    // 과거 테마의 동일 라이프사이클 위치 궤적 (first_spike_date 기준 정렬)
    const pastFirstSpike = firstSpikeDateByTheme.get(comp.past_theme_id)
    const alignedPastInterest = pastFirstSpike
      ? pastInterest.filter(m => m.time >= pastFirstSpike)
      : pastInterest
    const pastValues = alignedPastInterest
      .slice(comp.current_day, comp.current_day + afterDate.length)
      .map(m => m.normalized)

    const minLen = Math.min(afterDate.length, pastValues.length)
    const trajectoryCorr = minLen >= 7
      ? pearsonCorrelation(afterDate.slice(0, minLen), pastValues.slice(0, minLen))
      : 0

    // 스테이지 일치 비교
    const currentStage = stageByTheme.get(comp.current_theme_id)
    const pastStage = stageByTheme.get(comp.past_theme_id)
    const stageMatch = currentStage != null && pastStage != null && currentStage === pastStage

    // DB 업데이트 — 실패 시 캘리브레이션 집계에서 제외
    const { error: updateErr } = await supabaseAdmin
      .from('theme_comparisons')
      .update({
        outcome_verified: true,
        trajectory_correlation: trajectoryCorr,
        stage_match: stageMatch,
        verified_at: today,
      })
      .eq('id', comp.id)

    if (updateErr) {
      console.error(`   ⚠️ 비교 업데이트 실패 (${comp.id}):`, updateErr.message)
      continue
    }

    results.push({ id: comp.id, trajectoryCorr, stageMatch, featureSim: comp.feature_sim, curveSim: comp.curve_sim, keywordSim: comp.keyword_sim })
  }

  // 캘리브레이션 집계
  if (results.length > 0) {
    const accurate = results.filter(r => r.trajectoryCorr >= ACCURACY_THRESHOLD)
    const inaccurate = results.filter(r => r.trajectoryCorr < ACCURACY_THRESHOLD)

    const avgCorr = results.reduce((s, r) => s + r.trajectoryCorr, 0) / results.length
    const stageMatchRate = results.filter(r => r.stageMatch).length / results.length

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
      suggested_threshold: DEFAULT_THRESHOLD,
      suggested_sector_penalty: DEFAULT_SECTOR_PENALTY,
      details: {
        accurate_count: accurate.length,
        inaccurate_count: inaccurate.length,
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
