import { supabaseAdmin } from './supabase-admin'
import { getKSTDateString } from '../../lib/tli/date-utils'
import { batchQuery } from './supabase-batch'

const EVALUATION_WINDOW = 7 // 평가 대기 기간 (일) — v2: 14→7 (시상수 ~2일, 예측 가능 지평 3~5일)

export function computePeakTimingErrorDays(input: {
  snapshotDate: string
  observedDate: string
  avgPeakDay: number
  daysSinceSpike: number
}): number {
  const observedDaysFromSnapshot = Math.floor(
    (new Date(input.observedDate).getTime() - new Date(input.snapshotDate).getTime()) / 86_400_000,
  )
  const predictedDaysFromSnapshot = Math.max(0, input.avgPeakDay - input.daysSinceSpike)
  return Math.abs(observedDaysFromSnapshot - predictedDaysFromSnapshot)
}

export function resolvePredictionEvaluationAction(input: {
  hasThemeScores: boolean
  withinTolerance: boolean
}) {
  if (!input.hasThemeScores || !input.withinTolerance) {
    return {
      status: 'failed',
      shouldEvaluate: false,
    } as const
  }

  return {
    status: 'evaluated',
    shouldEvaluate: true,
  } as const
}

export async function evaluatePredictions(): Promise<void> {
  const cutoffDate = getKSTDateString(-EVALUATION_WINDOW)

  console.log(`\n📊 예측 평가 [cutoff: ${cutoffDate}]`)

  // V4 prediction_snapshots_v2에서 pending 스냅샷 로딩
  const { data: v2Snapshots, error: v2Err } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .select('id, theme_id, snapshot_date, phase, avg_peak_day, avg_total_days, days_since_spike')
    .eq('status', 'pending')
    .lte('snapshot_date', cutoffDate)
    .order('snapshot_date', { ascending: true })
    .limit(500)

  if (v2Err) {
    console.error('   ⚠️ V4 스냅샷 로딩 실패:', v2Err.message)
    return
  }

  if (!v2Snapshots?.length) {
    console.log('   ⊘ 평가 대상 V4 스냅샷 없음')
    return
  }

  // 해당 테마들의 점수 히스토리 로딩 (snapshot 타겟 날짜 기준 매칭용)
  const themeIds = [...new Set(v2Snapshots.map(s => s.theme_id))]
  const scores = await batchQuery<{ theme_id: string; score: number; stage: string; calculated_at: string }>(
    'lifecycle_scores', 'theme_id, score, stage, calculated_at', themeIds,
    q => q.order('calculated_at', { ascending: false }),
  )

  // theme_id별 전체 점수 히스토리 (날짜 내림차순)
  const scoresByTheme = new Map<string, { score: number; stage: string; calculated_at: string }[]>()
  for (const s of scores) {
    const list = scoresByTheme.get(s.theme_id) || []
    list.push(s)
    scoresByTheme.set(s.theme_id, list)
  }

  let evaluatedCount = 0

  for (const snapshot of v2Snapshots) {
    const themeScores = scoresByTheme.get(snapshot.theme_id)
    const baseAction = resolvePredictionEvaluationAction({
      hasThemeScores: Boolean(themeScores?.length),
      withinTolerance: false,
    })
    if (!baseAction.shouldEvaluate) {
      await supabaseAdmin
        .from('prediction_snapshots_v2')
        .update({
          status: baseAction.status,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', snapshot.id)
      continue
    }
    const safeThemeScores = themeScores!

    // snapshot_date + EVALUATION_WINDOW에 가장 가까운 score 사용 (3일 이내)
    const targetDate = new Date(snapshot.snapshot_date)
    targetDate.setDate(targetDate.getDate() + EVALUATION_WINDOW)
    const targetTime = targetDate.getTime()

    let closest: { score: number; stage: string; diff: number; calculatedAt: string } | null = null
    for (const s of safeThemeScores) {
      const diff = Math.abs(new Date(s.calculated_at).getTime() - targetTime)
      if (!closest || diff < closest.diff) {
        closest = { score: s.score, stage: s.stage, diff, calculatedAt: s.calculated_at }
      }
    }

    const MAX_TOLERANCE_MS = 3 * 86_400_000 // 3일 이내만 허용
    const action = resolvePredictionEvaluationAction({
      hasThemeScores: true,
      withinTolerance: Boolean(closest && closest.diff <= MAX_TOLERANCE_MS),
    })
    if (!action.shouldEvaluate) {
      await supabaseAdmin
        .from('prediction_snapshots_v2')
        .update({
          status: action.status,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', snapshot.id)
      continue
    }
    const safeClosest = closest!

    const current = { score: safeClosest.score, stage: safeClosest.stage }

    // 페이즈 예측 정확도 판정 (v2 3-Phase + 기존 5-Phase 하위 호환)
    const phaseToStageMap: Record<string, string[]> = {
      // v2 3-Phase
      'rising':  ['Emerging', 'Growth'],
      'hot':     ['Peak'],
      'cooling': ['Decline', 'Dormant'],
      // v1 5-Phase (기존 pending 스냅샷 평가용)
      'pre-peak':  ['Emerging', 'Growth'],
      'near-peak': ['Growth'],
      'at-peak':   ['Peak', 'Growth'],
      'post-peak': ['Decline', 'Peak'],
      'declining': ['Decline', 'Dormant'],
    }
    const expectedStages = phaseToStageMap[snapshot.phase] || []
    const phaseCorrect = expectedStages.includes(current.stage)

    // 피크 타이밍 오차 계산
    const peakTimingErrorDays = computePeakTimingErrorDays({
      snapshotDate: snapshot.snapshot_date,
      observedDate: safeClosest.calculatedAt,
      avgPeakDay: snapshot.avg_peak_day,
      daysSinceSpike: snapshot.days_since_spike,
    })

    const { error: updateErr } = await supabaseAdmin
      .from('prediction_snapshots_v2')
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
      console.error(`   ⚠️ V4 평가 업데이트 실패 (${snapshot.id}):`, updateErr.message)
    } else {
      evaluatedCount++
    }
  }

  console.log(`   ✅ ${evaluatedCount}/${v2Snapshots.length}개 V4 예측 평가 완료`)
}
