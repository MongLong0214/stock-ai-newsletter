/** 파이프라인 단계별 함수 — collect-and-score.ts에서 추출 */

import { calculateAndSaveScores } from '@/scripts/tli/scoring/calculate-scores'
import { calculateThemeComparisons } from '@/scripts/tli/comparison/calculate-comparisons'
import { computeOptimalThreshold } from '@/scripts/tli/comparison/auto-tune'
import { snapshotPredictions } from '@/scripts/tli/comparison/snapshot-predictions'
import { snapshotThemePredictionsV3 } from '@/scripts/tli/comparison/theme-predictions-v3'
import { evaluateThemePredictionsV3 } from '@/scripts/tli/comparison/theme-predictions-v3-scoring'
import { evaluatePredictions } from '@/scripts/tli/comparison/evaluate-predictions'
import { collectBablPhaseSnapshot } from '@/scripts/tli/collectors/babl-phase-snapshot'
import { evaluateComparisonOutcomes } from '@/scripts/tli/comparison/evaluate-comparisons'
import { submitToIndexNow, buildThemeUrls } from '@/lib/indexnow'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import { materializePhase0Artifacts } from '@/scripts/tli/comparison/materialize-phase0-artifacts'
import { countExpiredPendingLabels, runDailyLabelPhase } from '@/scripts/tli/labels/daily-label-phase'
import { runGtAV2FoundationPhase } from '@/scripts/tli/labels/gta-v2-daily'
import { GTA_LABELER_VERSION } from '@/lib/tli/labels/gt-a'
import { GTA_V2_LABELER_VERSION } from '@/lib/tli/labels/gt-a-v2'
import { GTB_LABELER_VERSION } from '@/lib/tli/labels/gt-b'
import { countExpiredPendingPredictions } from '@/scripts/tli/comparison/theme-predictions-v3-scoring'
import type { ThemeWithKeywords } from '@/scripts/tli/shared/data-ops'
import { runMondayOriginsStep } from '@/scripts/tli/batch/collection-pipeline'

/** 만기 경과 pending 적체 임계값 — 며칠 연속 실패가 조용히 누적되는 것을 차단 (C3) */
const EXPIRED_PENDING_CRITICAL_THRESHOLD = 500

export { runCalibrationPhase } from '@/scripts/tli/scoring/calibration-phase'
export { collectDataSources } from '@/scripts/tli/batch/collection-pipeline'

interface AnalysisResult { criticalFailures: number; warningFailures: number }

type InterestObservationCounter = (tradingDate: string) => Promise<number>

const countInterestObservationsForDate: InterestObservationCounter = async (tradingDate) => {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const { count, error } = await supabaseAdmin
    .from('tli_interest_observations')
    .select('id', { count: 'exact', head: true })
    .eq('trading_date', tradingDate)

  if (error) throw new Error(`interest observation count 실패: ${error.message}`)
  return count ?? 0
}

export async function runInterestObservationGapWatchdog(
  tradingDate: string,
  countInterestObservations: InterestObservationCounter = countInterestObservationsForDate,
): Promise<number> {
  if (!isKoreanTradingDate(tradingDate)) return 0

  try {
    const observationCount = await countInterestObservations(tradingDate)
    if (observationCount > 0) return 0

    console.warn('⚠️ 거래일 interest observation 누락 감지', { tradingDate, observationCount })
    return 1
  } catch (error: unknown) {
    console.warn('⚠️ interest observation 누락 점검 실패', {
      tradingDate,
      error: error instanceof Error ? error.message : String(error),
    })
    return 1
  }
}

export function shouldAbortAnalysisPipeline(input: {
  mode: 'full' | 'news-only'
  datalabFailed: boolean
  criticalFailures: number
}) {
  if (input.mode !== 'full') return false
  return input.datalabFailed || input.criticalFailures > 0
}

/** Steps 4-8: 점수 계산 + 비교 + 예측 + 평가 */
export async function runAnalysisPipeline(themes: ThemeWithKeywords[], today = getKSTDateString()): Promise<AnalysisResult> {
  let criticalFailures = 0
  let warningFailures = 0

  // Step 4: 라이프사이클 점수
  console.log('\n🧮 4단계: 라이프사이클 점수 계산')
  try {
    await calculateAndSaveScores(themes)
  } catch (error: unknown) {
    criticalFailures++
    console.error('❌ 점수 계산 실패:', error instanceof Error ? error.message : String(error))
  }

  console.log('\n🏷️ 4.1단계: Ground Truth 라벨 생성/확정')
  try {
    const labels = await runDailyLabelPhase(today)
    warningFailures += labels.warningFailures
    const gtAFinalCount = labels.gtAFinalized.reduce((sum, r) => sum + r.finalCount, 0)
    const gtACensoredCount = labels.gtAFinalized.reduce((sum, r) => sum + r.censoredCount, 0)
    const gtAExcludedCount = labels.gtAFinalized.reduce((sum, r) => sum + r.excludedCount, 0)
    const gtBFinalCount = labels.gtBFinalized.reduce((sum, r) => sum + r.finalCount, 0)
    const gtBPendingCount = labels.gtBFinalized.reduce((sum, r) => sum + r.pendingCount, 0)
    const gtBExcludedCount = labels.gtBFinalized.reduce((sum, r) => sum + r.excludedCount, 0)
    console.log(`   ✅ GT-A pending=${labels.gtAPending?.pendingCount ?? 0}, final=${gtAFinalCount}, censored=${gtACensoredCount}, excluded=${gtAExcludedCount} (${labels.gtAFinalized.length}일 확정), GT-B final=${gtBFinalCount}, pending=${gtBPendingCount}, excluded=${gtBExcludedCount} (${labels.gtBFinalized.length}일 확정), 비거래일 정리=${labels.nonTradingPendingClosed}`)

    const [gtABacklog, gtBBacklog] = await Promise.all([
      countExpiredPendingLabels({ labelType: 'gt_a', cutoffDate: labels.finalizeCutoffDate }), countExpiredPendingLabels({ labelType: 'gt_b', cutoffDate: labels.finalizeCutoffDate }),
    ])
    if (gtABacklog > EXPIRED_PENDING_CRITICAL_THRESHOLD || gtBBacklog > EXPIRED_PENDING_CRITICAL_THRESHOLD) {
      criticalFailures++
      let versionDetail: string
      try {
        const [gtAV1Backlog, gtAV2Backlog, gtBV1Backlog] = await Promise.all([
          countExpiredPendingLabels({ labelType: 'gt_a', cutoffDate: labels.finalizeCutoffDate, labelerVersion: GTA_LABELER_VERSION }),
          countExpiredPendingLabels({ labelType: 'gt_a', cutoffDate: labels.finalizeCutoffDate, labelerVersion: GTA_V2_LABELER_VERSION }),
          countExpiredPendingLabels({ labelType: 'gt_b', cutoffDate: labels.finalizeCutoffDate, labelerVersion: GTB_LABELER_VERSION }),
        ])
        versionDetail = `gta-v1=${gtAV1Backlog}, gta-v2=${gtAV2Backlog}, gtb-v1=${gtBV1Backlog}`
      } catch (error: unknown) {
        versionDetail = `버전별 진단 실패=${error instanceof Error ? error.message : String(error)}`
      }
      console.error(`❌ 라벨 확정 적체 위험(전체 버전): GT-A 만기pending=${gtABacklog}, GT-B 만기pending=${gtBBacklog}, ${versionDetail} (${EXPIRED_PENDING_CRITICAL_THRESHOLD} 초과)`)
    }
  } catch (error: unknown) {
    warningFailures++
    console.warn('   ⚠️ Ground Truth 라벨 단계 실패:', error instanceof Error ? error.message : String(error))
  }

  console.log('\n🏷️ 4.15단계: gta-v2 foundation 라벨 생성/확정')
  try {
    const gtAV2 = await runGtAV2FoundationPhase(today)
    if (gtAV2.failures > 0) warningFailures++
    console.log(`   ✅ gta-v2 pending 생성=${gtAV2.pendingCreated}, 확정=${gtAV2.finalized}, 유지=${gtAV2.keptPending}, 실패=${gtAV2.failures}`)
  } catch (error: unknown) {
    warningFailures++
    console.warn('   ⚠️ gta-v2 foundation 라벨 단계 실패:', error instanceof Error ? error.message : String(error))
  }

  // Step 4.5: 비교 임계값 자동 튜닝
  console.log('\n🧱 4.25단계: phase0 analog artifact materialization')
  try {
    const result = await materializePhase0Artifacts()
    console.log(`   ✅ episodes=${result.episodeCount}, snapshots=${result.querySnapshotCount}, candidates=${result.analogCandidateCount}`)
  } catch (error: unknown) {
    criticalFailures++
    console.error('❌ phase0 analog artifact materialization 실패:', error instanceof Error ? error.message : String(error))
  }

  // Step 4.5: 비교 임계값 자동 튜닝
  console.log('\n🎯 4.5단계: 비교 임계값 자동 튜닝')
  let tunedThreshold: number | undefined
  try {
    const tuning = await computeOptimalThreshold()
    if (tuning) {
      tunedThreshold = tuning.threshold
      console.log(`   ✅ 자동 튜닝 임계값: ${tuning.threshold} (신뢰도: ${tuning.confidence}, 검증 ${tuning.sampleSize}건)`)
    } else {
      console.log('   ⊘ 검증 데이터 부족 — 기본 임계값 사용')
    }
  } catch (error: unknown) {
    console.warn('   ⚠️ 자동 튜닝 실패 (기본 임계값 사용):', error instanceof Error ? error.message : String(error))
  }

  // Step 5: 비교 분석
  console.log('\n🔍 5단계: 테마 비교 분석')
  try {
    await calculateThemeComparisons(themes, tunedThreshold)
  } catch (error: unknown) {
    criticalFailures++
    console.error('❌ 비교 분석 실패:', error instanceof Error ? error.message : String(error))
  }

  // Step 6: 예측 스냅샷
  console.log('\n📸 6단계: 예측 스냅샷')
  try {
    await snapshotPredictions()
    const v3Result = await snapshotThemePredictionsV3({ today })
    console.log(`   ✅ v3 champion=${v3Result.championRows}, challenger=${v3Result.challengerRows}`)
  } catch (error: unknown) {
    criticalFailures++
    console.error('❌ 예측 스냅샷 실패:', error instanceof Error ? error.message : String(error))
  }

  // Step 6.5: B-Abl phase observation (study lock이 있을 때만)
  console.log('\n🧬 6.5단계: B-Abl phase snapshot')
  try {
    await collectBablPhaseSnapshot(today)
  } catch (error: unknown) {
    warningFailures++
    console.error('❌ B-Abl phase snapshot 실패:', error instanceof Error ? error.message : String(error))
  }

  warningFailures += await runMondayOriginsStep(today)

  // Step 7: 예측 평가
  console.log('\n📊 7단계: 예측 평가')
  try {
    await evaluatePredictions()
    const v3Result = await evaluateThemePredictionsV3({ today })
    console.log(`   ✅ v3 cutoff=${v3Result.cutoffDate}, updates=${v3Result.updates}, metrics=${v3Result.metrics}, skipped=${v3Result.skippedPending}, 비거래일 정리=${v3Result.nonTradingClosed}`)

    const predictionsBacklog = await countExpiredPendingPredictions(v3Result.cutoffDate)
    if (predictionsBacklog > EXPIRED_PENDING_CRITICAL_THRESHOLD) {
      criticalFailures++
      console.error(`❌ 예측 채점 적체 위험: 만기 미채점=${predictionsBacklog} (${EXPIRED_PENDING_CRITICAL_THRESHOLD} 초과)`)
    }
  } catch (error: unknown) {
    warningFailures++
    console.error('❌ 예측 평가 실패:', error instanceof Error ? error.message : String(error))
  }

  // Step 8: 비교 결과 검증
  console.log('\n🔬 8단계: 비교 결과 검증')
  try {
    await evaluateComparisonOutcomes(tunedThreshold)
  } catch (error: unknown) {
    warningFailures++
    console.error('❌ 비교 결과 검증 실패:', error instanceof Error ? error.message : String(error))
  }

  return { criticalFailures, warningFailures }
}

/** Step 9: IndexNow URL 제출 */
export async function submitIndexNowStep(themes: ThemeWithKeywords[]): Promise<void> {
  console.log('\n🔔 9단계: IndexNow URL 제출')

  try {
    const themeIds = themes.map(t => t.id)
    const urls = buildThemeUrls(themeIds)
    const result = await submitToIndexNow(urls)
    if (result.submitted > 0) {
      console.log(`   ✅ ${result.submitted}개 URL 제출 완료`)
    } else if (result.errors.length > 0) {
      console.warn(`   ⚠️ IndexNow 제출 실패: ${result.errors[0]}`)
    }
  } catch (error: unknown) {
    console.warn('   ⚠️ IndexNow 제출 실패 (무시):', error instanceof Error ? error.message : String(error))
  }
}
