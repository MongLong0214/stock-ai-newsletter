import { config } from 'dotenv'
config({ path: '.env.local' })
import { loadActiveThemes, upsertInterestMetrics, upsertNewsMetrics, upsertThemeStocks, upsertNewsArticles } from './data-ops';
import { calculateAndSaveScores } from './calculate-scores';
import { calculateThemeComparisons } from './calculate-comparisons';
import { collectNaverDatalab } from './collectors/naver-datalab';
import { collectNaverNews } from './collectors/naver-news';
import { collectNaverFinanceStocks } from './collectors/naver-finance-themes';
import { discoverAndManageThemes } from './discover-themes';
import { getKSTDate, daysAgo } from './utils';

async function main() {
  console.log('🚀 TLI 데이터 수집 및 점수 계산\n');
  console.log('━'.repeat(80));

  const startTime = Date.now();

  try {
    // 0단계: 테마 발견 파이프라인 (주간 - 일요일)
    // KST(UTC+9) 기준 요일 판정 (cron이 KST 오전에 실행되므로)
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const dayOfWeek = kstNow.getUTCDay();
    if (dayOfWeek === 0) {
      try {
        await discoverAndManageThemes();
      } catch (error: unknown) {
        console.error('\n❌ 테마 발견 실패 (수집은 계속 진행):', error instanceof Error ? error.message : String(error));
      }
    } else {
      console.log('⊘ 테마 발견 생략 (일요일에만 실행)\n');
    }

    // 1단계: 활성 테마 로딩
    const themes = await loadActiveThemes();

    // 2단계: 네이버 DataLab 데이터 수집
    const endDate = getKSTDate();
    const startDate = daysAgo(30);

    console.log('\n━'.repeat(80));
    console.log('📊 1단계: 네이버 DataLab 수집');
    console.log('━'.repeat(80));

    try {
      const interestMetrics = await collectNaverDatalab(
        themes.map(t => ({ id: t.id, name: t.name, naverKeywords: t.naverKeywords })),
        startDate,
        endDate
      );
      await upsertInterestMetrics(interestMetrics);
    } catch (error: unknown) {
      console.error('\n❌ 네이버 DataLab 수집 실패:', error instanceof Error ? error.message : String(error));
    }

    // 3단계: 네이버 뉴스 데이터 수집
    console.log('\n━'.repeat(80));
    console.log('📰 2단계: 네이버 뉴스 수집');
    console.log('━'.repeat(80));

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
      console.error('\n❌ 네이버 뉴스 수집 실패:', error instanceof Error ? error.message : String(error));
    }

    // 4단계: 네이버 금융 종목 수집 (주 2회 - 월/목)
    if (dayOfWeek === 1 || dayOfWeek === 4) {
      console.log('\n━'.repeat(80));
      console.log('📈 3단계: 네이버 금융 종목 수집 (주 2회)');
      console.log('━'.repeat(80));

      try {
        const stocks = await collectNaverFinanceStocks(
          themes.map(t => ({ id: t.id, naverThemeId: t.naver_theme_id }))
        );
        await upsertThemeStocks(stocks);
      } catch (error: unknown) {
        console.error('\n❌ 종목 수집 실패:', error instanceof Error ? error.message : String(error));
      }
    } else {
      console.log('\n⊘ 종목 수집 생략 (월/목에만 실행)');
    }

    // 5단계: 라이프사이클 점수 계산
    console.log('\n━'.repeat(80));
    console.log('🧮 4단계: 라이프사이클 점수 계산');
    console.log('━'.repeat(80));

    try {
      await calculateAndSaveScores(themes);
    } catch (error: unknown) {
      console.error('\n❌ 점수 계산 실패:', error instanceof Error ? error.message : String(error));
    }

    // 6단계: 테마 비교 분석
    console.log('\n━'.repeat(80));
    console.log('🔍 5단계: 테마 비교 분석');
    console.log('━'.repeat(80));

    try {
      await calculateThemeComparisons(themes);
    } catch (error: unknown) {
      console.error('\n❌ 비교 분석 실패:', error instanceof Error ? error.message : String(error));
    }

    // 요약
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n━'.repeat(80));
    console.log('✨ TLI 수집 및 점수 계산 완료!');
    console.log('━'.repeat(80));
    console.log(`\n⏱️  소요 시간: ${duration}초`);
    console.log(`📊 처리된 테마: ${themes.length}개\n`);

    process.exit(0);
  } catch (error: unknown) {
    console.error('\n━'.repeat(80));
    console.error('❌ 치명적 오류');
    console.error('━'.repeat(80));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
