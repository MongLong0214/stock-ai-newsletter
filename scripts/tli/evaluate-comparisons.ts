import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { pearsonCorrelation } from '../../lib/tli/comparison/similarity'
import { getKSTDate } from './utils'

const ACCURACY_THRESHOLD = 0.3
const MIN_VERIFICATION_DAYS = 14

export async function evaluateComparisonOutcomes() {
  console.log('\n🔬 비교 결과 검증 중...')
  const today = getKSTDate()
  const cutoffDate = new Date(new Date(today).getTime() - MIN_VERIFICATION_DAYS * 86400000).toISOString().split('T')[0]

  // Load unverified comparisons old enough (14+ days)
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

  // Collect unique theme IDs
  const currentIds = [...new Set(unverified.map(c => c.current_theme_id))]
  const pastIds = [...new Set(unverified.map(c => c.past_theme_id))]
  const allIds = [...new Set([...currentIds, ...pastIds])]

  // Load interest metrics for trajectory comparison (last 180 days)
  const oneEightyDaysAgo = new Date(new Date(today).getTime() - 180 * 86400000).toISOString().split('T')[0]
  const interestAll = await batchQuery<{ theme_id: string; time: string; normalized: number }>(
    'interest_metrics', 'theme_id, time, normalized', allIds,
    q => q.gte('time', oneEightyDaysAgo).order('time', { ascending: true })
  )
  const interestByTheme = groupByThemeId(interestAll)

  // Load latest stages
  const latestScores = await batchQuery<{ theme_id: string; stage: string; calculated_at: string }>(
    'lifecycle_scores', 'theme_id, stage, calculated_at', allIds,
    q => q.order('calculated_at', { ascending: false }).limit(1)
  )
  const stageByTheme = new Map<string, string>()
  for (const s of latestScores) {
    if (!stageByTheme.has(s.theme_id)) stageByTheme.set(s.theme_id, s.stage)
  }

  // Verify each comparison
  const results: Array<{ id: string; trajectoryCorr: number; stageMatch: boolean; featureSim: number | null; curveSim: number | null; keywordSim: number | null }> = []

  for (const comp of unverified) {
    const currentInterest = interestByTheme.get(comp.current_theme_id) || []
    const pastInterest = interestByTheme.get(comp.past_theme_id) || []

    // Get interest data AFTER the comparison date
    const afterDate = currentInterest
      .filter(m => m.time > comp.calculated_at)
      .map(m => m.normalized)

    // Get corresponding period from past theme
    const pastValues = pastInterest
      .slice(0, afterDate.length)
      .map(m => m.normalized)

    const minLen = Math.min(afterDate.length, pastValues.length)
    const trajectoryCorr = minLen >= 7
      ? pearsonCorrelation(afterDate.slice(0, minLen), pastValues.slice(0, minLen))
      : 0

    // Stage comparison
    const currentStage = stageByTheme.get(comp.current_theme_id)
    const pastStage = stageByTheme.get(comp.past_theme_id)
    const stageMatch = currentStage != null && pastStage != null && currentStage === pastStage

    // Update comparison record
    await supabaseAdmin
      .from('theme_comparisons')
      .update({
        outcome_verified: true,
        trajectory_correlation: trajectoryCorr,
        stage_match: stageMatch,
        verified_at: today,
      })
      .eq('id', comp.id)

    results.push({ id: comp.id, trajectoryCorr, stageMatch, featureSim: comp.feature_sim, curveSim: comp.curve_sim, keywordSim: comp.keyword_sim })
  }

  // Aggregate into calibration table
  if (results.length > 0) {
    const accurate = results.filter(r => r.trajectoryCorr >= ACCURACY_THRESHOLD)
    const inaccurate = results.filter(r => r.trajectoryCorr < ACCURACY_THRESHOLD)

    const avgCorr = results.reduce((s, r) => s + r.trajectoryCorr, 0) / results.length
    const stageMatchRate = results.filter(r => r.stageMatch).length / results.length

    const avgPillar = (items: typeof results, key: 'featureSim' | 'curveSim' | 'keywordSim') => {
      const valid = items.filter(r => r[key] != null)
      return valid.length > 0 ? valid.reduce((s, r) => s + (r[key] ?? 0), 0) / valid.length : null
    }

    await supabaseAdmin.from('comparison_calibration').upsert({
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
      suggested_threshold: 0.40, // Keep current default for now
      suggested_sector_penalty: 0.7, // Current default
      details: {
        accurate_count: accurate.length,
        inaccurate_count: inaccurate.length,
        avg_trajectory_corr_accurate: accurate.length > 0 ? accurate.reduce((s, r) => s + r.trajectoryCorr, 0) / accurate.length : null,
        avg_trajectory_corr_inaccurate: inaccurate.length > 0 ? inaccurate.reduce((s, r) => s + r.trajectoryCorr, 0) / inaccurate.length : null,
      },
    }, { onConflict: 'calculated_at' })

    console.log(`   ✅ ${results.length}건 검증 완료 (정확: ${accurate.length}, 부정확: ${inaccurate.length})`)
    console.log(`   📊 평균 궤적 상관: ${avgCorr.toFixed(3)}, 스테이지 일치율: ${(stageMatchRate * 100).toFixed(1)}%`)
  }
}
