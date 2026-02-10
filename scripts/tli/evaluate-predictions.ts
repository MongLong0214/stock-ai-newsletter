import { supabaseAdmin } from './supabase-admin'
import { getKSTDateString } from '../../lib/tli/date-utils'

const EVALUATION_WINDOW = 14 // days

export async function evaluatePredictions(): Promise<void> {
  const today = getKSTDateString()
  const cutoffDate = getKSTDateString(-EVALUATION_WINDOW)

  console.log(`\n📊 예측 평가 [cutoff: ${cutoffDate}]`)

  // Load pending snapshots older than EVALUATION_WINDOW
  const { data: snapshots, error: snapErr } = await supabaseAdmin
    .from('prediction_snapshots')
    .select('id, theme_id, snapshot_date, phase, avg_peak_day, avg_total_days, days_since_spike')
    .eq('status', 'pending')
    .lte('snapshot_date', cutoffDate)
    .limit(500)

  if (snapErr) {
    console.error('   ⚠️ 스냅샷 로딩 실패:', snapErr.message)
    return
  }

  if (!snapshots?.length) {
    console.log('   ⊘ 평가 대상 스냅샷 없음')
    return
  }

  // Load current lifecycle scores for these themes
  const themeIds = [...new Set(snapshots.map(s => s.theme_id))]
  const { data: scores, error: scoresErr } = await supabaseAdmin
    .from('lifecycle_scores')
    .select('theme_id, score, stage, calculated_at')
    .in('theme_id', themeIds)
    .order('calculated_at', { ascending: false })

  if (scoresErr) {
    console.error('   ⚠️ 현재 점수 로딩 실패:', scoresErr.message)
    return
  }

  // Get latest score per theme
  const latestScores = new Map<string, { score: number; stage: string }>()
  for (const s of scores || []) {
    if (!latestScores.has(s.theme_id)) {
      latestScores.set(s.theme_id, { score: s.score, stage: s.stage })
    }
  }

  let evaluatedCount = 0

  for (const snapshot of snapshots) {
    const current = latestScores.get(snapshot.theme_id)
    if (!current) continue

    // Determine if phase prediction was correct
    const phaseToStageMap: Record<string, string[]> = {
      'pre-peak': ['Early', 'Growth'],
      'near-peak': ['Growth'],
      'at-peak': ['Peak', 'Growth'],
      'post-peak': ['Decay', 'Peak'],
      'declining': ['Decay', 'Dormant'],
    }
    const expectedStages = phaseToStageMap[snapshot.phase] || []
    const phaseCorrect = expectedStages.includes(current.stage)

    // Calculate peak timing error
    const daysSinceSnapshot = Math.floor(
      (new Date(today).getTime() - new Date(snapshot.snapshot_date).getTime()) / 86_400_000,
    )
    const predictedDaysFromSnapshot = Math.max(0, snapshot.avg_peak_day - snapshot.days_since_spike)
    const peakTimingErrorDays = Math.abs(daysSinceSnapshot - predictedDaysFromSnapshot)

    const { error: updateErr } = await supabaseAdmin
      .from('prediction_snapshots')
      .update({
        status: 'evaluated',
        evaluated_at: new Date().toISOString(),
        actual_score: current.score,
        actual_stage: current.stage,
        phase_correct: phaseCorrect,
        peak_timing_error_days: peakTimingErrorDays,
      })
      .eq('id', snapshot.id)

    if (updateErr) {
      console.error(`   ⚠️ 평가 업데이트 실패 (${snapshot.id}):`, updateErr.message)
    } else {
      evaluatedCount++
    }
  }

  console.log(`   ✅ ${evaluatedCount}/${snapshots.length}개 예측 평가 완료`)
}
