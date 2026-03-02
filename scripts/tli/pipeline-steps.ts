/** 파이프라인 단계별 함수 — collect-and-score.ts에서 추출 */

import { upsertInterestMetrics, upsertNewsMetrics, upsertThemeStocks, upsertNewsArticles } from './data-ops'
import { calculateAndSaveScores } from './calculate-scores'
import { calculateThemeComparisons } from './calculate-comparisons'
import { computeOptimalThreshold } from './auto-tune'
import { snapshotPredictions } from './snapshot-predictions'
import { evaluatePredictions } from './evaluate-predictions'
import { collectNaverDatalab } from './collectors/naver-datalab'
import { collectNaverNews } from './collectors/naver-news'
import { collectNaverFinanceStocks } from './collectors/naver-finance-themes'
import { evaluateComparisonOutcomes } from './evaluate-comparisons'
import { daysAgo } from './utils'
import { submitToIndexNow, buildThemeUrls } from '../../lib/indexnow'
import { calibrateNoiseThreshold } from './calibrate-noise'
import { calibrateConfidence } from './calibrate-confidence'
import { calibrateWeights } from './calibrate-weights'
import { loadCalibrationsFromDB } from './load-calibrations'
import type { ThemeWithKeywords } from './data-ops'

interface CollectionResult {
  criticalFailures: number
  datalabFailed: boolean
}

/** Steps 1-3: 데이터 수집 (DataLab + News + Stocks) */
export async function collectDataSources(
  themes: ThemeWithKeywords[],
  mode: 'full' | 'news-only',
  dayOfWeek: number,
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

  // Step 3: Stocks (평일 full 모드)
  if (mode === 'full' && dayOfWeek >= 1 && dayOfWeek <= 5) {
    console.log('\n📈 3단계: 네이버 금융 종목 수집')

    try {
      const stocks = await collectNaverFinanceStocks(
        themes.map(t => ({ id: t.id, naverThemeId: t.naver_theme_id })),
      )
      await upsertThemeStocks(stocks)
    } catch (error: unknown) {
      criticalFailures++
      console.error('❌ 종목 수집 실패:', error instanceof Error ? error.message : String(error))
    }
  } else if (mode === 'full') {
    console.log('\n⊘ 종목 수집 생략 (주말)')
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

  const kstDay = kstNow.getUTCDate()
  if (kstDay === 1) {
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
  }
}

interface AnalysisResult {
  criticalFailures: number
  warningFailures: number
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
