import { config } from 'dotenv'
config({ path: '.env.local' })
import { loadActiveThemes } from './data-ops';
import { discoverAndManageThemes } from './discover-themes';
import { autoActivate, autoDeactivate } from './theme-lifecycle';
import { getKSTDate } from './utils';
import { collectDataSources, runCalibrationPhase, runAnalysisPipeline, submitIndexNowStep } from './pipeline-steps';

type RunMode = 'full' | 'news-only'

async function main() {
  const mode: RunMode = (process.env.TLI_MODE === 'news-only') ? 'news-only' : 'full';
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();

  console.log(`🚀 TLI 데이터 수집 [${mode.toUpperCase()}]`);

  const startTime = Date.now();
  let criticalFailures = 0;
  let warningFailures = 0;

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

    // Steps 1-3: 데이터 수집
    const collection = await collectDataSources(themes, mode, dayOfWeek, endDate);
    criticalFailures += collection.criticalFailures;

    // Steps 3.5-8: 교정 + 분석 (full 모드, DataLab 성공 시)
    if (mode === 'full') {
      if (collection.datalabFailed) {
        console.log('\n⊘ DataLab 수집 실패로 후속 단계 생략 (4~8단계)');
      } else {
        await runCalibrationPhase(kstNow);

        const analysis = await runAnalysisPipeline(themes);
        criticalFailures += analysis.criticalFailures;
        warningFailures += analysis.warningFailures;
      }
    }

    // Step 9: IndexNow URL 제출
    if (mode === 'full' && !collection.datalabFailed) {
      await submitIndexNowStep(themes);
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
