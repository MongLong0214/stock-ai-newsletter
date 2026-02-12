import { config } from 'dotenv'
config({ path: '.env.local' })
import { loadActiveThemes, upsertInterestMetrics, upsertNewsMetrics, upsertThemeStocks, upsertNewsArticles } from './data-ops';
import { calculateAndSaveScores } from './calculate-scores';
import { calculateThemeComparisons } from './calculate-comparisons';
import { snapshotPredictions } from './snapshot-predictions';
import { evaluatePredictions } from './evaluate-predictions';
import { collectNaverDatalab } from './collectors/naver-datalab';
import { collectNaverNews } from './collectors/naver-news';
import { collectNaverFinanceStocks } from './collectors/naver-finance-themes';
import { discoverAndManageThemes } from './discover-themes';
import { autoActivate, autoDeactivate } from './theme-lifecycle';
import { evaluateComparisonOutcomes } from './evaluate-comparisons';
import { getKSTDate, daysAgo } from './utils';

/** 실행 모드: full(전체 수집) / news-only(뉴스만) */
type RunMode = 'full' | 'news-only'

async function main() {
  const mode: RunMode = (process.env.TLI_MODE === 'news-only') ? 'news-only' : 'full';
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay(); // 0=일, 1=월, ..., 6=토

  console.log(`🚀 TLI 데이터 수집 [${mode.toUpperCase()}]`);

  const startTime = Date.now();
  let criticalFailures = 0;
  let warningFailures = 0;
  let datalabFailed = false;

  try {
    // 사전단계: 테마 발견 (주 2회 - 일/수, full 모드에서만)
    if (mode === 'full' && (dayOfWeek === 0 || dayOfWeek === 3)) {
      try {
        await discoverAndManageThemes();
      } catch (error: unknown) {
        console.error('❌ 테마 발견 실패 (수집은 계속 진행):', error instanceof Error ? error.message : String(error));
      }
    } else if (mode === 'full') {
      console.log('⊘ 테마 발견 생략 (일/수에만 실행)');
      try {
        console.log('🔄 생명주기 관리 실행 중...');
        await autoActivate();
        await autoDeactivate();
      } catch (error: unknown) {
        console.error('생명주기 관리 실패:', error instanceof Error ? error.message : String(error));
      }
    }

    // 사전단계: 활성 테마 로딩
    const themes = await loadActiveThemes();
    const endDate = getKSTDate();

    // 1단계: 네이버 DataLab 수집 (full 모드에서만)
    if (mode === 'full') {
      const startDate = daysAgo(30);
      console.log('\n📊 1단계: 네이버 DataLab 수집');

      try {
        const interestMetrics = await collectNaverDatalab(
          themes.map(t => ({ id: t.id, name: t.name, naverKeywords: t.naverKeywords })),
          startDate,
          endDate
        );

        // PHASE 0.1: Volume Validation Gate
        const totalThemes = themes.length;
        const uniqueThemesCollected = new Set(interestMetrics.map(m => m.themeId)).size;
        const coverageRate = totalThemes > 0 ? uniqueThemesCollected / totalThemes : 0;
        const zeroValueCount = interestMetrics.filter(m => m.rawValue === 0).length;
        const zeroValueRate = interestMetrics.length > 0 ? zeroValueCount / interestMetrics.length : 0;

        console.log(`📊 수집 품질 검증: 테마 커버리지 ${(coverageRate * 100).toFixed(1)}% (${uniqueThemesCollected}/${totalThemes}), 제로값 비율 ${(zeroValueRate * 100).toFixed(1)}% (${zeroValueCount}/${interestMetrics.length})`);

        if (coverageRate < 0.7) {
          criticalFailures++;
          datalabFailed = true;
          console.error(`❌ DataLab 수집 품질 불량: 테마 커버리지 ${(coverageRate * 100).toFixed(1)}% < 70% (후속 단계 생략)`);
        } else if (zeroValueRate >= 0.9) {
          criticalFailures++;
          datalabFailed = true;
          console.error(`❌ DataLab API 장애 의심: 제로값 비율 ${(zeroValueRate * 100).toFixed(1)}% >= 90% (후속 단계 생략)`);
        } else {
          await upsertInterestMetrics(interestMetrics);
        }
      } catch (error: unknown) {
        criticalFailures++;
        datalabFailed = true;
        console.error('❌ 네이버 DataLab 수집 실패:', error instanceof Error ? error.message : String(error));
      }
    }

    // 2단계: 네이버 뉴스 수집 (모든 모드)
    console.log(`\n📰 ${mode === 'news-only' ? '1' : '2'}단계: 네이버 뉴스 수집`);

    try {
      const newsStartDate = daysAgo(14);
      const { metrics: newsMetrics, articles: newsArticles } = await collectNaverNews(
        themes.map(t => ({ id: t.id, keywords: t.keywords })),
        newsStartDate,
        endDate
      );
      await upsertNewsMetrics(newsMetrics);
      await upsertNewsArticles(newsArticles);
    } catch (error: unknown) {
      criticalFailures++;
      console.error('❌ 네이버 뉴스 수집 실패:', error instanceof Error ? error.message : String(error));
    }

    // 3단계: 종목 수집 (평일 full 모드 - 장 마감 후)
    if (mode === 'full' && dayOfWeek >= 1 && dayOfWeek <= 5) {
      console.log('\n📈 3단계: 네이버 금융 종목 수집');

      try {
        const stocks = await collectNaverFinanceStocks(
          themes.map(t => ({ id: t.id, naverThemeId: t.naver_theme_id }))
        );
        await upsertThemeStocks(stocks);
      } catch (error: unknown) {
        criticalFailures++;
        console.error('❌ 종목 수집 실패:', error instanceof Error ? error.message : String(error));
      }
    } else if (mode === 'full') {
      console.log('\n⊘ 종목 수집 생략 (주말)');
    }

    // 4단계: 점수 계산 (full 모드에서만)
    if (mode === 'full') {
      if (datalabFailed) {
        console.log('\n⊘ DataLab 수집 실패로 후속 단계 생략 (4~8단계)');
      } else {
        console.log('\n🧮 4단계: 라이프사이클 점수 계산');

        try {
          await calculateAndSaveScores(themes);
        } catch (error: unknown) {
          criticalFailures++;
          console.error('❌ 점수 계산 실패:', error instanceof Error ? error.message : String(error));
        }

        // 5단계: 비교 분석
        console.log('\n🔍 5단계: 테마 비교 분석');

        try {
          await calculateThemeComparisons(themes);
        } catch (error: unknown) {
          criticalFailures++;
          console.error('❌ 비교 분석 실패:', error instanceof Error ? error.message : String(error));
        }

        // 6단계: 예측 스냅샷
        console.log('\n📸 6단계: 예측 스냅샷');

        try {
          await snapshotPredictions();
        } catch (error: unknown) {
          warningFailures++;
          console.error('❌ 예측 스냅샷 실패:', error instanceof Error ? error.message : String(error));
        }

        // 7단계: 예측 평가
        console.log('\n📊 7단계: 예측 평가');

        try {
          await evaluatePredictions();
        } catch (error: unknown) {
          warningFailures++;
          console.error('❌ 예측 평가 실패:', error instanceof Error ? error.message : String(error));
        }

        // 8단계: 비교 결과 검증
        console.log('\n🔬 8단계: 비교 결과 검증');

        try {
          await evaluateComparisonOutcomes();
        } catch (error: unknown) {
          warningFailures++;
          console.error('❌ 비교 결과 검증 실패:', error instanceof Error ? error.message : String(error));
        }
      }
    }

    // 요약
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✨ TLI ${mode === 'news-only' ? '뉴스 수집' : '전체 수집 및 점수 계산'} 완료!`);
    console.log(`⏱️  소요 시간: ${duration}초 | 📊 처리된 테마: ${themes.length}개`);

    if (criticalFailures > 0) console.log(`⚠️  치명적 실패: ${criticalFailures}건`);
    if (warningFailures > 0) console.log(`⚠️  경고 실패: ${warningFailures}건`);

    process.exit(criticalFailures > 0 ? 1 : 0);
  } catch (error: unknown) {
    console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
