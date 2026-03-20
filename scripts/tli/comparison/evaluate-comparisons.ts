import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery, batchUpsert, groupByThemeId } from '@/scripts/tli/shared/supabase-batch'
import { daysAgo, getKSTDate } from '@/scripts/tli/shared/utils'
import { COMPARISON_PRIMARY_HORIZON_DAYS } from '@/lib/tli/comparison/spec'
import {
  alignPastWindowByCurrentDay,
  classifyCurrentRunHorizonCensoring,
  evaluateFixedHorizonComparison,
  findClosestStageByDate,
  findClosestStageByLifecycleDay,
  sliceFixedHorizonWindow,
} from '@/scripts/tli/comparison/v4/evaluator'
import { buildEvalRowV2, buildCensoredEvalRowV2, aggregateRunEvalSummary } from '@/scripts/tli/comparison/v4/eval-writer'
import { resolveFirstSpikeDate, type RawTheme } from '@/scripts/tli/themes/enrich-themes'
import type { ThemeComparisonEvalV2 } from '@/lib/tli/types/db'

const MIN_VERIFICATION_DAYS = COMPARISON_PRIMARY_HORIZON_DAYS
const STAGE_TOLERANCE_DAYS = 3
export const THEME_COMPARISON_EVAL_V2_NATIVE_ON_CONFLICT = 'run_id,candidate_theme_id,evaluation_horizon_days'

// ── Shared Data Loading ──

interface EvalData {
  pastThemesData: RawTheme[]
  kstNow: Date
  interestByTheme: Map<string, Array<{ theme_id: string; time: string; normalized: number }>>
  firstSpikeDateByTheme: Map<string, string>
  scoresByTheme: Map<string, Array<{ theme_id: string; stage: string; calculated_at: string }>>
}

async function loadEvalData(pastIds: string[], allIds: string[]): Promise<EvalData> {
  const pastThemesData = await batchQuery<RawTheme>(
    'themes', 'id, name, first_spike_date, created_at, is_active', pastIds, undefined, 'id'
  )
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const oneEightyDaysAgo = daysAgo(180)

  const [interestAll, allScores] = await Promise.all([
    batchQuery<{ theme_id: string; time: string; normalized: number }>(
      'interest_metrics', 'theme_id, time, normalized', allIds,
      q => q.gte('time', oneEightyDaysAgo).order('time', { ascending: true })
    ),
    batchQuery<{ theme_id: string; stage: string; calculated_at: string }>(
      'lifecycle_scores', 'theme_id, stage, calculated_at', allIds,
      q => q.gte('calculated_at', oneEightyDaysAgo).order('calculated_at', { ascending: true })
    ),
  ])

  const interestByTheme = groupByThemeId(interestAll)
  const scoresByTheme = groupByThemeId(allScores)

  const firstSpikeDateByTheme = new Map<string, string>()
  for (const t of pastThemesData) {
    const interest = interestByTheme.get(t.id)
    const resolved = resolveFirstSpikeDate(t, interest, kstNow)
    if (resolved) firstSpikeDateByTheme.set(t.id, resolved)
  }

  return { pastThemesData, kstNow, interestByTheme, firstSpikeDateByTheme, scoresByTheme }
}

// ── Shared Per-Candidate Evaluation ──

interface CandidateEvalResult {
  trajectoryCorrH14: number
  positionStageMatchH14: boolean
  binaryRelevant: boolean
  gradedGain: number
  censoredReason: string | null
  isRunLevelCensored: boolean
}

function evaluateSingleCandidate(
  runDate: string,
  currentThemeId: string,
  pastThemeId: string,
  currentDay: number,
  data: EvalData,
): CandidateEvalResult {
  const currentInterest = data.interestByTheme.get(currentThemeId) || []
  const pastInterest = data.interestByTheme.get(pastThemeId) || []

  const afterDate = currentInterest.filter(m => m.time > runDate).map(m => m.normalized)
  const currentFutureValues = sliceFixedHorizonWindow(afterDate, COMPARISON_PRIMARY_HORIZON_DAYS)
  const runHorizonCensored = classifyCurrentRunHorizonCensoring(currentFutureValues)

  const rawPastTheme = data.pastThemesData.find(t => t.id === pastThemeId)
  const pastFirstSpike = rawPastTheme
    ? resolveFirstSpikeDate(rawPastTheme, pastInterest, data.kstNow)
    : data.firstSpikeDateByTheme.get(pastThemeId)
  const alignedPastInterest = pastFirstSpike
    ? pastInterest.filter(m => m.time >= pastFirstSpike)
    : pastInterest

  const alignedPast = alignPastWindowByCurrentDay({
    alignedPastValues: alignedPastInterest.map(m => m.normalized),
    currentDay,
    horizonDays: COMPARISON_PRIMARY_HORIZON_DAYS,
  })

  const currentScores = data.scoresByTheme.get(currentThemeId) || []
  const pastScores = data.scoresByTheme.get(pastThemeId) || []
  const targetDate = new Date(new Date(runDate).getTime() + COMPARISON_PRIMARY_HORIZON_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]
  const currentStageAtH14 = findClosestStageByDate(currentScores, targetDate, STAGE_TOLERANCE_DAYS)
  const pastStageAtAlignedH14 = pastFirstSpike
    ? findClosestStageByLifecycleDay(pastScores, pastFirstSpike, currentDay + COMPARISON_PRIMARY_HORIZON_DAYS, STAGE_TOLERANCE_DAYS)
    : null

  const evaluated = runHorizonCensored
    ? { trajectoryCorrH14: 0, positionStageMatchH14: false, binaryRelevant: false, gradedGain: 0, censoredReason: runHorizonCensored }
    : alignedPast.censoredReason
    ? { trajectoryCorrH14: 0, positionStageMatchH14: false, binaryRelevant: false, gradedGain: 0, censoredReason: alignedPast.censoredReason }
    : evaluateFixedHorizonComparison({
        currentFutureValues,
        pastFutureValues: alignedPast.values,
        currentStageAtH14,
        pastStageAtAlignedH14,
      })

  return {
    ...evaluated,
    isRunLevelCensored: runHorizonCensored != null || evaluated.censoredReason === 'run_missing_point_in_time_snapshot',
  }
}

// ── Main ──

export async function evaluateComparisonOutcomes(tunedThreshold?: number) {
  console.log('\n🔬 비교 결과 검증 중...')
  const today = getKSTDate()
  const cutoffDate = new Date(new Date(today).getTime() - MIN_VERIFICATION_DAYS * 86400000).toISOString().split('T')[0]

  // V4-native 먼저 (V4 eval 우선)
  await evaluateV4CandidatesNative(today, cutoffDate)
  void tunedThreshold
}

// ── V4-native Evaluation ──

async function evaluateV4CandidatesNative(today: string, cutoffDate: string): Promise<void> {
  const { data: runs, error: runsErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .select('id, current_theme_id, run_date')
    .lte('run_date', cutoffDate)
    .in('status', ['published', 'complete', 'materializing'])
    .in('run_type', ['prod', 'shadow'])
    .order('run_date', { ascending: false })
    .limit(200)

  if (runsErr || !runs?.length) {
    console.log('   ⊘ V4-native 평가 대상 run 없음')
    return
  }

  const runIds = runs.map(r => r.id as string)

  const [allCandidates, existingEvals] = await Promise.all([
    batchQuery<{
      run_id: string
      candidate_theme_id: string
      similarity_score: number
      current_day: number
      past_peak_day: number
      past_total_days: number
      feature_sim: number | null
      curve_sim: number | null
      keyword_sim: number | null
    }>(
      'theme_comparison_candidates_v2',
      'run_id, candidate_theme_id, similarity_score, current_day, past_peak_day, past_total_days, feature_sim, curve_sim, keyword_sim',
      runIds, undefined, 'run_id',
    ),
    batchQuery<{ run_id: string; candidate_theme_id: string }>(
      'theme_comparison_eval_v2',
      'run_id, candidate_theme_id',
      runIds, undefined, 'run_id',
    ),
  ])

  if (allCandidates.length === 0) return

  const evalSet = new Set(existingEvals.map(e => `${e.run_id}|${e.candidate_theme_id}`))
  const unevaluated = allCandidates.filter(c => !evalSet.has(`${c.run_id}|${c.candidate_theme_id}`))

  if (unevaluated.length === 0) {
    console.log('   ⊘ V4-native 미평가 candidate 없음')
    return
  }

  console.log(`   🔬 V4-native 평가: ${unevaluated.length}건 candidate`)

  const runMap = new Map(runs.map(r => [r.id as string, { currentThemeId: r.current_theme_id as string, runDate: r.run_date as string }]))
  const currentIds = [...new Set(unevaluated.map(c => runMap.get(c.run_id)!.currentThemeId))]
  const pastIds = [...new Set(unevaluated.map(c => c.candidate_theme_id))]
  const allIds = [...new Set([...currentIds, ...pastIds])]

  const data = await loadEvalData(pastIds, allIds)

  const evalRows: ThemeComparisonEvalV2[] = []

  for (const candidate of unevaluated) {
    const run = runMap.get(candidate.run_id)
    if (!run) continue

    const evaluated = evaluateSingleCandidate(run.runDate, run.currentThemeId, candidate.candidate_theme_id, candidate.current_day, data)

    if (evaluated.censoredReason) {
      evalRows.push(buildCensoredEvalRowV2({
        runId: candidate.run_id,
        candidateThemeId: candidate.candidate_theme_id,
        evaluationHorizonDays: COMPARISON_PRIMARY_HORIZON_DAYS,
        censoredReason: evaluated.censoredReason,
        evaluatedAt: today,
      }))
    } else {
      evalRows.push(buildEvalRowV2({
        runId: candidate.run_id,
        candidateThemeId: candidate.candidate_theme_id,
        evaluationHorizonDays: COMPARISON_PRIMARY_HORIZON_DAYS,
        trajectoryCorrH14: evaluated.trajectoryCorrH14,
        positionStageMatchH14: evaluated.positionStageMatchH14,
        binaryRelevant: evaluated.binaryRelevant,
        gradedGain: evaluated.gradedGain,
        censoredReason: null,
        evaluatedAt: today,
      }))
    }
  }

  if (evalRows.length > 0) {
    await batchUpsert(
      'theme_comparison_eval_v2',
      evalRows.map(r => ({ ...r })),
      THEME_COMPARISON_EVAL_V2_NATIVE_ON_CONFLICT,
      'v4-native eval',
    )

    const summary = aggregateRunEvalSummary(evalRows)
    console.log(`   ✅ V4-native eval: ${summary.evaluatedCount}건 평가, ${summary.censoredCount}건 센서링, precision@K=${(summary.precisionAtK * 100).toFixed(1)}%`)
  }
}
