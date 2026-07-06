/** 파이프라인 단계별 함수 — collect-and-score.ts에서 추출 */

import { countActiveThemeStocks, upsertInterestMetrics, upsertNewsMetrics, upsertThemeStocks, upsertNewsArticles } from '@/scripts/tli/shared/data-ops'
import { calculateAndSaveScores } from '@/scripts/tli/scoring/calculate-scores'
import { calculateThemeComparisons } from '@/scripts/tli/comparison/calculate-comparisons'
import { computeOptimalThreshold } from '@/scripts/tli/comparison/auto-tune'
import { snapshotPredictions } from '@/scripts/tli/comparison/snapshot-predictions'
import { evaluatePredictions } from '@/scripts/tli/comparison/evaluate-predictions'
import { collectNaverDatalab } from '@/scripts/tli/collectors/naver-datalab'
import { collectNaverNews } from '@/scripts/tli/collectors/naver-news'
import { collectNaverFinanceStocks } from '@/scripts/tli/collectors/naver-finance-themes'
import { shouldRejectStockCollection } from '@/scripts/tli/collectors/naver-finance-theme-gates'
import { evaluateComparisonOutcomes } from '@/scripts/tli/comparison/evaluate-comparisons'
import { daysAgo } from '@/scripts/tli/shared/utils'
import { submitToIndexNow, buildThemeUrls } from '@/lib/indexnow'
import { isKoreanTradingDate, shouldCollectTliStocks } from '@/lib/tli/trading-calendar'
import { calibrateNoiseThreshold } from '@/scripts/tli/scoring/calibrate-noise'
import { calibrateConfidence } from '@/scripts/tli/scoring/calibrate-confidence'
import { calibrateWeights } from '@/scripts/tli/scoring/calibrate-weights'
import { loadCalibrationsFromDB } from '@/scripts/tli/scoring/load-calibrations'
import {
  planMonthlyCalibration,
  type MonthlyCalibrationDecision,
} from '@/scripts/tli/scoring/monthly-calibration-schedule'
import {
  loadMonthlyCalibrationRunDates,
  recordMonthlyCalibrationRun,
} from '@/scripts/tli/scoring/monthly-calibration-state'
import { materializePhase0Artifacts } from '@/scripts/tli/comparison/materialize-phase0-artifacts'
import type { ThemeWithKeywords } from '@/scripts/tli/shared/data-ops'

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
  }

  // Step 2: News (모든 모드)
  console.log(`\n📰 ${mode === 'news-only' ? '1' : '2'}단계: 네이버 뉴스 수집`)

  try {
    const newsStartDate = daysAgo(14)
    const { metrics: newsMetrics, articles: newsArticles } = await collectNaverNews(
      themes.map(t => ({ id: t.id, keywords: t.keywords })),
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
      await upsertThemeStocks(stocks)
    } catch (error: unknown) {
      criticalFailures++
      console.error('❌ 종목 수집 실패:', error instanceof Error ? error.message : String(error))
    }
  } else if (mode === 'full') {
    console.log('\n⊘ 종목 수집 생략 (휴장일)')
  }

  return { criticalFailures, datalabFailed }
}

/** Step 3.5: 교정값 로드 + 월 1회 재교정 */
export async function runCalibrationPhase(kstNow: Date): Promise<void> {
  console.log('\n📥 3.5단계: 교정값 로드')
  try {
    await loadCalibrationsFromDB()
  } catch (error: unknown) {
    console.warn('   ⚠️ 교정값 로드 실패 (기본값 사용):', error instanceof Error ? error.message : String(error))
  }

  const kstDate = kstNow.toISOString().split('T')[0]
  const eligibleRun = isKoreanTradingDate(kstDate)
  // 조회 성공 시 planMonthlyCalibration이 항상 덮어쓰므로 초기값은 "이번 실행에서는 미실행, 다음 실행에서 재시도"인 deferred로 단순화.
  // 조회 실패 시에도 이 값이 그대로 유지되어 정책 모듈("월 1회 첫 eligible 거래일")과 어긋나는 별도 기준을 두지 않는다.
  let monthlyDecision: MonthlyCalibrationDecision = 'deferred'
  try {
    monthlyDecision = planMonthlyCalibration({
      kstDate,
      eligibleRun,
      runDates: await loadMonthlyCalibrationRunDates(kstDate),
    })
  } catch (error: unknown) {
    console.warn('   ⚠️ 월간 재교정 실행 기록 조회 실패 (다음 실행에서 재시도):', error instanceof Error ? error.message : String(error))
  }

  if (monthlyDecision === 'executed') {
    console.log('\n🔬 3.5b단계: 월간 과학적 재교정')
    const calibStart = Date.now()

    try { await calibrateNoiseThreshold() }
    catch (error: unknown) { console.warn('   ⚠️ 노이즈 교정 실패:', error instanceof Error ? error.message : String(error)) }

    try { await calibrateConfidence() }
    catch (error: unknown) { console.warn('   ⚠️ Confidence 교정 실패:', error instanceof Error ? error.message : String(error)) }

    try { await calibrateWeights() }
    catch (error: unknown) { console.warn('   ⚠️ 가중치 교정 실패:', error instanceof Error ? error.message : String(error)) }

    const calibDuration = ((Date.now() - calibStart) / 1000).toFixed(1)
    console.log(`   ⏱️ 재교정 완료: ${calibDuration}초`)
    try {
      await recordMonthlyCalibrationRun(kstDate)
    } catch (error: unknown) {
      console.warn('   ⚠️ 월간 재교정 실행 기록 저장 실패:', error instanceof Error ? error.message : String(error))
    }
  } else if (monthlyDecision === 'deferred') {
    console.log('   ⊘ 월간 재교정 연기 (eligible full run 아님)')
  } else {
    console.log('   ⊘ 월간 재교정 생략 (이번 달 이미 실행)')
  }
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
export async function runAnalysisPipeline(themes: ThemeWithKeywords[]): Promise<AnalysisResult> {
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
  } catch (error: unknown) {
    warningFailures++
    console.error('❌ 예측 스냅샷 실패:', error instanceof Error ? error.message : String(error))
  }

  // Step 7: 예측 평가
  console.log('\n📊 7단계: 예측 평가')
  try {
    await evaluatePredictions()
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
