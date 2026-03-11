import { supabaseAdmin } from './supabase-admin'
import { batchQuery, batchUpsert, groupByThemeId } from './supabase-batch'
import { daysAgo, getKSTDate } from './utils'
import { DEFAULT_THRESHOLD } from './auto-tune'
import { COMPARISON_PRIMARY_HORIZON_DAYS } from '../../lib/tli/comparison/spec'
import {
  alignPastWindowByCurrentDay,
  classifyCurrentRunHorizonCensoring,
  evaluateFixedHorizonComparison,
  findClosestStageByDate,
  findClosestStageByLifecycleDay,
  sliceFixedHorizonWindow,
} from './comparison-v4-evaluator'
import { buildEvalRowV2, buildCensoredEvalRowV2, aggregateRunEvalSummary } from './comparison-v4-eval-writer'
import { resolveFirstSpikeDate, type RawTheme } from './enrich-themes'
import type { ThemeComparisonEvalV2 } from '../../lib/tli/types/db'

const MIN_VERIFICATION_DAYS = COMPARISON_PRIMARY_HORIZON_DAYS
const DEFAULT_SECTOR_PENALTY = 0.85 // static placeholder — not calibrated from data
const STAGE_TOLERANCE_DAYS = 3

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

  // Legacy 백로그 (V4-native eval이 이미 존재하면 bridge write 건너뜀)
  await evaluateLegacyComparisons(today, cutoffDate, tunedThreshold)
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
      'run_id,candidate_theme_id',
      'v4-native eval',
    )

    const summary = aggregateRunEvalSummary(evalRows)
    console.log(`   ✅ V4-native eval: ${summary.evaluatedCount}건 평가, ${summary.censoredCount}건 센서링, precision@K=${(summary.precisionAtK * 100).toFixed(1)}%`)
  }
}

// ── Legacy Evaluation ──

type VerifiedResult = {
  id: string
  currentThemeId: string
  pastThemeId: string
  trajectoryCorr: number
  stageMatch: boolean
  binaryRelevant: boolean
  gradedGain: number
  censoredReason: string | null
  runLevelCensored: boolean
  featureSim: number | null
  curveSim: number | null
  keywordSim: number | null
}

async function evaluateLegacyComparisons(today: string, cutoffDate: string, tunedThreshold?: number): Promise<void> {
  const { data: unverified, error } = await supabaseAdmin
    .from('theme_comparisons')
    .select('id, current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, calculated_at, feature_sim, curve_sim, keyword_sim')
    .or('outcome_verified.is.null,outcome_verified.eq.false')
    .lte('calculated_at', cutoffDate)
    .limit(200)

  if (error || !unverified?.length) {
    console.log(`   ⊘ Legacy 검증 대상 없음`)
    return
  }

  const currentIds = [...new Set(unverified.map(c => c.current_theme_id))]
  const pastIds = [...new Set(unverified.map(c => c.past_theme_id))]
  const allIds = [...new Set([...currentIds, ...pastIds])]

  const data = await loadEvalData(pastIds, allIds)
  const results: VerifiedResult[] = []

  for (const comp of unverified) {
    const evaluated = evaluateSingleCandidate(comp.calculated_at, comp.current_theme_id, comp.past_theme_id, comp.current_day, data)

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
      currentThemeId: comp.current_theme_id,
      pastThemeId: comp.past_theme_id,
      trajectoryCorr: evaluated.trajectoryCorrH14,
      stageMatch: evaluated.positionStageMatchH14,
      binaryRelevant: evaluated.binaryRelevant,
      gradedGain: evaluated.gradedGain,
      censoredReason: evaluated.censoredReason,
      runLevelCensored: evaluated.isRunLevelCensored,
      featureSim: comp.feature_sim,
      curveSim: comp.curve_sim,
      keywordSim: comp.keyword_sim,
    })
  }

  if (results.length > 0) {
    const accurate = results.filter(r => r.binaryRelevant && !r.runLevelCensored)
    const inaccurate = results.filter(r => !r.binaryRelevant && !r.runLevelCensored)

    const avgCorr = results.reduce((s, r) => s + r.trajectoryCorr, 0) / results.length
    const stageMatchRate = results.filter(r => r.stageMatch).length / results.length

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

    console.log(`   ✅ Legacy ${results.length}건 검증 완료 (정확: ${accurate.length}, 부정확: ${inaccurate.length})`)
    console.log(`   📊 평균 궤적 상관: ${avgCorr.toFixed(3)}, 스테이지 일치율: ${(stageMatchRate * 100).toFixed(1)}%`)
  }

  // Legacy → V4 eval bridge (V4-native eval이 이미 존재하면 건너뜀)
  if (results.length > 0) {
    try {
      const currentThemeIds = [...new Set(results.map((r) => r.currentThemeId))]
      const { data: v2Runs } = await supabaseAdmin
        .from('theme_comparison_runs_v2')
        .select('id, current_theme_id')
        .in('current_theme_id', currentThemeIds)
        .order('created_at', { ascending: false })

      if (v2Runs && v2Runs.length > 0) {
        const runByTheme = new Map<string, string>()
        for (const run of v2Runs) {
          if (!runByTheme.has(run.current_theme_id)) {
            runByTheme.set(run.current_theme_id, run.id)
          }
        }

        const bridgeRunIds = [...new Set(runByTheme.values())]
        const existingNativeEvals = bridgeRunIds.length > 0
          ? await batchQuery<{ run_id: string; candidate_theme_id: string }>(
              'theme_comparison_eval_v2', 'run_id, candidate_theme_id',
              bridgeRunIds, undefined, 'run_id',
            )
          : []
        const nativeEvalSet = new Set(existingNativeEvals.map(e => `${e.run_id}|${e.candidate_theme_id}`))

        const evalRows: ThemeComparisonEvalV2[] = []
        for (const result of results) {
          const runId = runByTheme.get(result.currentThemeId)
          if (!runId) continue
          if (nativeEvalSet.has(`${runId}|${result.pastThemeId}`)) continue

          if (result.censoredReason) {
            evalRows.push(buildCensoredEvalRowV2({
              runId,
              candidateThemeId: result.pastThemeId,
              evaluationHorizonDays: COMPARISON_PRIMARY_HORIZON_DAYS,
              censoredReason: result.censoredReason,
              evaluatedAt: today,
            }))
          } else {
            evalRows.push(buildEvalRowV2({
              runId,
              candidateThemeId: result.pastThemeId,
              evaluationHorizonDays: COMPARISON_PRIMARY_HORIZON_DAYS,
              trajectoryCorrH14: result.trajectoryCorr,
              positionStageMatchH14: result.stageMatch,
              binaryRelevant: result.binaryRelevant,
              gradedGain: result.gradedGain,
              censoredReason: null,
              evaluatedAt: today,
            }))
          }
        }

        if (evalRows.length > 0) {
          await batchUpsert(
            'theme_comparison_eval_v2',
            evalRows.map((r) => ({ ...r })),
            'run_id,candidate_theme_id',
            'v2 eval (legacy bridge)',
          )

          const summary = aggregateRunEvalSummary(evalRows)
          console.log(`   📊 Legacy→V4 eval: ${summary.evaluatedCount}건 평가, ${summary.censoredCount}건 센서링, precision@K=${(summary.precisionAtK * 100).toFixed(1)}%`)
        }
      }
    } catch (v4Err: unknown) {
      console.error('   ⚠️ Legacy→V4 eval write 실패 (파이프라인 계속):', v4Err instanceof Error ? v4Err.message : String(v4Err))
    }
  }
}
