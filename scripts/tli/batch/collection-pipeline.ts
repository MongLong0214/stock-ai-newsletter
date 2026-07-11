import { shouldCollectTliStocks } from '@/lib/tli/trading-calendar'
import {
  countActiveThemeStocks,
  upsertInterestMetrics,
  upsertNewsArticles,
  upsertNewsMetrics,
  upsertThemeStocks,
  type ThemeWithKeywords,
} from '@/scripts/tli/shared/data-ops'
import { daysAgo } from '@/scripts/tli/shared/utils'
import {
  collectionReportFailureCount,
  collectionReportHasFailures,
} from '@/scripts/tli/collectors/collection-report'
import { collectForecastInterestRuns, collectNaverDatalab } from '@/scripts/tli/collectors/naver-datalab'
import { collectNaverFinanceStocks } from '@/scripts/tli/collectors/naver-finance-themes'
import { shouldRejectStockCollection } from '@/scripts/tli/collectors/naver-finance-theme-gates'
import { collectNaverNews } from '@/scripts/tli/collectors/naver-news'
import { runMondayOrigins } from '@/scripts/tli/origins/run-monday-origins'

interface CollectionResult {
  readonly criticalFailures: number
  readonly datalabFailed: boolean
}

export const runMondayOriginsStep = async (today: string): Promise<number> => {
  console.log('\n🗓️ 6.6단계: Monday forecast/study origin manifest')
  try {
    const report = await runMondayOrigins(today)
    if (report.skippedReason) {
      console.log(`   ⊘ origin 생략: ${report.skippedReason}`)
    } else {
      const forecastChildren = report.origins.reduce(
        (sum, origin) => sum + origin.forecastChildCount,
        0,
      )
      const usableChildren = report.origins.reduce(
        (sum, origin) => sum + origin.usableChildCount,
        0,
      )
      const studyOrigins = report.origins.reduce(
        (sum, origin) => sum + origin.studyOriginManifestIds.length,
        0,
      )
      console.log(`   ✅ backfill=${report.origins.length}, forecast child=${forecastChildren}, usable=${usableChildren}, study-origin=${studyOrigins}`)
    }
    return 0
  } catch (error: unknown) {
    console.error('❌ Monday origin manifest 실패:', error instanceof Error ? error.message : String(error))
    return 1
  }
}

export async function collectDataSources(
  themes: ThemeWithKeywords[],
  mode: 'full' | 'news-only',
  endDate: string,
): Promise<CollectionResult> {
  let criticalFailures = 0
  let datalabFailed = false

  if (mode === 'full') {
    const startDate = daysAgo(30)
    console.log('\n📊 1단계: 네이버 DataLab 수집')

    try {
      const { metrics: interestMetrics, report } = await collectNaverDatalab(themes.map(t => ({
        id: t.id, name: t.name, naverKeywords: t.naverKeywords,
      })), startDate, endDate)

      const collectionFailed = collectionReportHasFailures(report)
      if (collectionFailed) {
        criticalFailures += collectionReportFailureCount(report)
        datalabFailed = true
        console.error(`❌ DataLab immutable collection 실패: ${report.failed}/${report.requested}건 (persistence=${report.persistenceFailed})`)
      }

      const totalThemes = themes.length
      const uniqueThemesCollected = new Set(interestMetrics.map(m => m.themeId)).size
      const coverageRate = totalThemes > 0 ? uniqueThemesCollected / totalThemes : 0
      const zeroValueCount = interestMetrics.filter(m => m.rawValue === 0).length
      const zeroValueRate = interestMetrics.length > 0 ? zeroValueCount / interestMetrics.length : 0

      console.log(`📊 수집 품질 검증: 테마 커버리지 ${(coverageRate * 100).toFixed(1)}% (${uniqueThemesCollected}/${totalThemes}), 제로값 비율 ${(zeroValueRate * 100).toFixed(1)}% (${zeroValueCount}/${interestMetrics.length})`)

      if (collectionFailed) {
        if (interestMetrics.length > 0) await upsertInterestMetrics(interestMetrics)
      } else if (coverageRate < 0.7) {
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

    if (!datalabFailed) {
      try {
        const report = await collectForecastInterestRuns(themes.map(t => ({
          id: t.id, name: t.name, naverKeywords: t.naverKeywords,
        })), endDate)
        if (collectionReportHasFailures(report)) {
          criticalFailures += collectionReportFailureCount(report)
          datalabFailed = true
          console.error(`❌ forecast interest immutable collection 실패: ${report.failed}/${report.requested}건 (persistence=${report.persistenceFailed})`)
        }
      } catch (error: unknown) {
        criticalFailures++
        datalabFailed = true
        console.error('❌ forecast interest run 수집 실패:', error instanceof Error ? error.message : String(error))
      }
    }
  }

  console.log(`\n📰 ${mode === 'news-only' ? '1' : '2'}단계: 네이버 뉴스 수집`)

  try {
    const newsStartDate = daysAgo(14)
    const { metrics: newsMetrics, articles: newsArticles, report } = await collectNaverNews(themes.map(t => ({
      id: t.id, name: t.name, naverKeywords: t.naverKeywords,
    })), newsStartDate, endDate)
    if (collectionReportHasFailures(report)) {
      criticalFailures += collectionReportFailureCount(report)
      console.error(`❌ 뉴스 immutable collection 실패: ${report.failed}/${report.requested}건 (persistence=${report.persistenceFailed})`)
    }
    await upsertNewsMetrics(newsMetrics)
    await upsertNewsArticles(newsArticles)
  } catch (error: unknown) {
    criticalFailures++
    console.error('❌ 네이버 뉴스 수집 실패:', error instanceof Error ? error.message : String(error))
  }

  if (shouldCollectTliStocks({ mode, kstDate: endDate })) {
    console.log('\n📈 3단계: 네이버 금융 종목 수집')

    try {
      const stocks = await collectNaverFinanceStocks(themes.map(t => ({
        id: t.id, naverThemeId: t.naver_theme_id,
      })))
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

  if (mode === 'news-only') criticalFailures += await runMondayOriginsStep(endDate)

  return { criticalFailures, datalabFailed }
}
