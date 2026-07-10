/** 파이프라인 단계별 함수 — collect-and-score.ts에서 추출 */

import { countActiveThemeStocks, upsertInterestMetrics, upsertNewsMetrics, upsertThemeStocks, upsertNewsArticles } from '@/scripts/tli/shared/data-ops'
import { calculateAndSaveScores } from '@/scripts/tli/scoring/calculate-scores'
import { calculateThemeComparisons } from '@/scripts/tli/comparison/calculate-comparisons'
import { computeOptimalThreshold } from '@/scripts/tli/comparison/auto-tune'
import { snapshotPredictions } from '@/scripts/tli/comparison/snapshot-predictions'
import { snapshotThemePredictionsV3 } from '@/scripts/tli/comparison/theme-predictions-v3'
import { evaluateThemePredictionsV3 } from '@/scripts/tli/comparison/theme-predictions-v3-scoring'
import { evaluatePredictions } from '@/scripts/tli/comparison/evaluate-predictions'
import { collectForecastInterestRuns, collectNaverDatalab } from '@/scripts/tli/collectors/naver-datalab'
import { collectNaverNews } from '@/scripts/tli/collectors/naver-news'
import { collectBablPhaseSnapshot } from '@/scripts/tli/collectors/babl-phase-snapshot'
import { runMondayOrigins } from '@/scripts/tli/origins/run-monday-origins'
import { collectNaverFinanceStocks } from '@/scripts/tli/collectors/naver-finance-themes'
import { shouldRejectStockCollection } from '@/scripts/tli/collectors/naver-finance-theme-gates'
import { evaluateComparisonOutcomes } from '@/scripts/tli/comparison/evaluate-comparisons'
import { daysAgo } from '@/scripts/tli/shared/utils'
import { submitToIndexNow, buildThemeUrls } from '@/lib/indexnow'
import { shouldCollectTliStocks } from '@/lib/tli/trading-calendar'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { materializePhase0Artifacts } from '@/scripts/tli/comparison/materialize-phase0-artifacts'
import { countExpiredPendingLabels, runDailyLabelPhase } from '@/scripts/tli/labels/daily-label-phase'
import { countExpiredPendingPredictions } from '@/scripts/tli/comparison/theme-predictions-v3-scoring'
import type { ThemeWithKeywords } from '@/scripts/tli/shared/data-ops'

/** 만기 경과 pending 적체 임계값 — 며칠 연속 실패가 조용히 누적되는 것을 차단 (C3) */
const EXPIRED_PENDING_CRITICAL_THRESHOLD = 500

export { runCalibrationPhase } from '@/scripts/tli/scoring/calibration-phase'

interface CollectionResult {
  criticalFailures: number
  datalabFailed: boolean
}

/** Steps 1-3: 데이터 수집 (DataLab + News + Stocks) */
export async function collectDataSources(
  themes: ThemeWithKeywords[],
  mode: 'full' | 'news-only',
  endDate: string,
): Promise<CollectionResult> {
  let criticalFailures = 0
  let datalabFailed = false

  // Step 1: DataLab (full 모드에서만)
  if (mode === 'full') {
    const startDate = daysAgo(30)
    console.log('\n📊 1단계: 네이버 DataLab 수집')

    try {
      const interestMetrics = await collectNaverDatalab(
        themes.map(t => ({ id: t.id, name: t.name, naverKeywords: t.naverKeywords })),
        startDate,
        endDate,
      )

      const totalThemes = themes.length
      const uniqueThemesCollected = new Set(interestMetrics.map(m => m.themeId)).size
      const coverageRate = totalThemes > 0 ? uniqueThemesCollected / totalThemes : 0
      const zeroValueCount = interestMetrics.filter(m => m.rawValue === 0).length
      const zeroValueRate = interestMetrics.length > 0 ? zeroValueCount / interestMetrics.length : 0

      console.log(`📊 수집 품질 검증: 테마 커버리지 ${(coverageRate * 100).toFixed(1)}% (${uniqueThemesCollected}/${totalThemes}), 제로값 비율 ${(zeroValueRate * 100).toFixed(1)}% (${zeroValueCount}/${interestMetrics.length})`)

      if (coverageRate < 0.7) {
        criticalFailures++
        datalabFailed = true
        console.error(`❌ DataLab 수집 품질 불량: 테마 커버리지 ${(coverageRate * 100).toFixed(1)}% < 70% (후속 단계 생략)`)
      } else if (zeroValueRate >= 0.9) {
        criticalFailures++
        datalabFailed = true
        console.error(`❌ DataLab API 장애 의심: 제로값 비율 ${(zeroValueRate * 100).toFixed(1)}% >= 90% (후속 단계 생략)`)
      } else {
        await upsertInterestMetrics(interestMetrics)
      }
    } catch (error: unknown) {
      criticalFailures++
      datalabFailed = true
      console.error('❌ 네이버 DataLab 수집 실패:', error instanceof Error ? error.message : String(error))
    }

    // forecast manifest가 선택할 수 있는 유일한 형태 — 테마 dedicated single-group run.
    // current cache를 건드리지 않으므로 실패해도 수집 파이프라인을 중단하지 않는다 (best-effort).
    if (!datalabFailed) {
      try {
        await collectForecastInterestRuns(
          themes.map(t => ({ id: t.id, name: t.name, naverKeywords: t.naverKeywords })),
          endDate,
        )
      } catch (error: unknown) {
        console.warn('   ⚠️ forecast interest run 수집 실패:', error instanceof Error ? error.message : String(error))
      }
    }
  }

  // Step 2: News (모든 모드)
  console.log(`\n📰 ${mode === 'news-only' ? '1' : '2'}단계: 네이버 뉴스 수집`)

  try {
    const newsStartDate = daysAgo(14)
    const { metrics: newsMetrics, articles: newsArticles } = await collectNaverNews(
      themes.map(t => ({ id: t.id, name: t.name, naverKeywords: t.naverKeywords })),
      newsStartDate,
      endDate,
    )
    await upsertNewsMetrics(newsMetrics)
    await upsertNewsArticles(newsArticles)
  } catch (error: unknown) {
    criticalFailures++
    console.error('❌ 네이버 뉴스 수집 실패:', error instanceof Error ? error.message : String(error))
  }

  if (shouldCollectTliStocks({ mode, kstDate: endDate })) {
    console.log('\n📈 3단계: 네이버 금융 종목 수집')

    try {
      const stocks = await collectNaverFinanceStocks(
        themes.map(t => ({ id: t.id, naverThemeId: t.naver_theme_id })),
      )
      const prevCount = await countActiveThemeStocks()
      if (shouldRejectStockCollection({ prevCount, collectedCount: stocks.length })) {
        throw new Error(`네이버 금융 종목 수집 붕괴 감지: 직전 활성 종목 ${prevCount}건 → 이번 수집 ${stocks.length}건 (70% 미만)`)
      }
      await upsertThemeStocks(stocks, endDate)
    } catch (error: unknown) {
      criticalFailures++
      console.error('❌ 종목 수집 실패:', error instanceof Error ? error.message : String(error))
    }
  } else if (mode === 'full') {
    console.log('\n⊘ 종목 수집 생략 (휴장일)')
  }

  return { criticalFailures, datalabFailed }
}

interface AnalysisResult {
  criticalFailures: number
  warningFailures: number
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
    const gtBFinalCount = labels.gtBFinalized.reduce((sum, r) => sum + r.finalCount, 0)
    console.log(
      `   ✅ GT-A pending=${labels.gtAPending?.pendingCount ?? 0}, GT-A final=${gtAFinalCount} (${labels.gtAFinalized.length}일 확정), GT-B final=${gtBFinalCount} (${labels.gtBFinalized.length}일 확정), 비거래일 정리=${labels.nonTradingPendingClosed}`,
    )

    const [gtABacklog, gtBBacklog] = await Promise.all([
      countExpiredPendingLabels({ labelType: 'gt_a', cutoffDate: labels.finalizeCutoffDate }),
      countExpiredPendingLabels({ labelType: 'gt_b', cutoffDate: labels.finalizeCutoffDate }),
    ])
    if (gtABacklog > EXPIRED_PENDING_CRITICAL_THRESHOLD || gtBBacklog > EXPIRED_PENDING_CRITICAL_THRESHOLD) {
      criticalFailures++
      console.error(`❌ 라벨 확정 적체 위험: GT-A 만기pending=${gtABacklog}, GT-B 만기pending=${gtBBacklog} (${EXPIRED_PENDING_CRITICAL_THRESHOLD} 초과)`)
    }
  } catch (error: unknown) {
    warningFailures++
    console.warn('   ⚠️ Ground Truth 라벨 단계 실패:', error instanceof Error ? error.message : String(error))
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
    warningFailures++
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

  // Step 6.6: 거래 가능한 월요일 cutoff 뒤 origin manifest 축적 (cycle 0개여도 계속 쌓는다)
  console.log('\n🗓️ 6.6단계: Monday forecast/study origin manifest')
  try {
    const origins = await runMondayOrigins(today)
    if (origins.skippedReason) {
      console.log(`   ⊘ origin 생략: ${origins.skippedReason}`)
    } else {
      console.log(`   ✅ forecast child=${origins.forecastChildCount}, usable=${origins.usableChildCount}, study-origin=${origins.studyOriginManifestIds.length}`)
    }
  } catch (error: unknown) {
    warningFailures++
    console.error('❌ Monday origin manifest 실패:', error instanceof Error ? error.message : String(error))
  }

  // Step 7: 예측 평가
  console.log('\n📊 7단계: 예측 평가')
  try {
    await evaluatePredictions()
    const v3Result = await evaluateThemePredictionsV3({ today })
    console.log(`   ✅ v3 cutoff=${v3Result.cutoffDate}, updates=${v3Result.updates}, metrics=${v3Result.metrics}, skipped=${v3Result.skippedPending}`)

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
