import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFile } from 'node:fs/promises';
import { loadActiveThemes } from '@/scripts/tli/shared/data-ops';
import { discoverAndManageThemes } from '@/scripts/tli/themes/discover-themes';
import { autoActivate, autoDeactivate } from '@/scripts/tli/themes/theme-lifecycle';
import { getKSTDate, getKSTDateString } from '@/lib/tli/date-utils';
import { shouldCollectTliStocks } from '@/lib/tli/trading-calendar';
import { collectDataSources, runCalibrationPhase, runAnalysisPipeline, shouldAbortAnalysisPipeline, submitIndexNowStep } from '@/scripts/tli/batch/pipeline-steps';
import { collectDailyStockPricesForDate } from '@/scripts/tli/prices/kis-daily-price-collector';

type RunMode = 'full' | 'news-only'

export interface TliMainPipelineResult {
  mode: RunMode
  themeCount: number
  criticalFailures: number
  warningFailures: number
  durationSeconds: number
  exitCode: 0 | 1
}

export async function writeTliMainPipelineResult(result: TliMainPipelineResult): Promise<void> {
  const resultPath = process.env.TLI_RESULT_PATH
  if (!resultPath) return

  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}

export async function runTliMainPipeline(): Promise<TliMainPipelineResult> {
  const mode: RunMode = (process.env.TLI_MODE === 'news-only') ? 'news-only' : 'full';
  const kstNow = getKSTDate();
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
    const endDate = getKSTDateString();

    // Steps 1-3: 데이터 수집
    const collection = await collectDataSources(themes, mode, endDate);
    criticalFailures += collection.criticalFailures;

    if (collection.criticalFailures === 0 && shouldCollectTliStocks({ mode, kstDate: endDate })) {
      try {
        const priceReport = await collectDailyStockPricesForDate(endDate);
        if (priceReport.failureCount > 0) warningFailures++;
        if (priceReport.skippedForBudget > 0) {
          warningFailures++;
          console.warn(`⚠️ 일봉 주가 콜 예산 초과로 ${priceReport.skippedForBudget}건 생략`);
        }
      } catch (error: unknown) {
        warningFailures++;
        console.warn('⚠️ 일봉 주가 적재 실패:', error instanceof Error ? error.message : String(error));
      }
    }

    // Steps 3.5-8: 교정 + 분석 (full 모드, DataLab 성공 시)
    if (mode === 'full') {
      if (shouldAbortAnalysisPipeline({
        mode,
        datalabFailed: collection.datalabFailed,
        criticalFailures: collection.criticalFailures,
      })) {
        console.log('\n⊘ 수집 단계 치명적 실패로 후속 단계 생략 (4~8단계)');
      } else {
        await runCalibrationPhase(kstNow);

        const analysis = await runAnalysisPipeline(themes, endDate);
        criticalFailures += analysis.criticalFailures;
        warningFailures += analysis.warningFailures;
      }
    }

    // Step 9: IndexNow URL 제출
    if (mode === 'full' && !shouldAbortAnalysisPipeline({
      mode,
      datalabFailed: collection.datalabFailed,
      criticalFailures: collection.criticalFailures,
    })) {
      await submitIndexNowStep(themes);
    }

    // 요약
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✨ TLI ${mode === 'news-only' ? '뉴스 수집' : '전체 수집 및 점수 계산'} 완료!`);
    console.log(`⏱️  소요 시간: ${duration}초 | 📊 처리된 테마: ${themes.length}개`);

    if (criticalFailures > 0) console.log(`⚠️  치명적 실패: ${criticalFailures}건`);
    if (warningFailures > 0) console.log(`⚠️  경고 실패: ${warningFailures}건`);

    return {
      mode,
      themeCount: themes.length,
      criticalFailures,
      warningFailures,
      durationSeconds: Number(duration),
      exitCode: criticalFailures > 0 ? 1 : 0,
    };
  } catch (error: unknown) {
    console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error));
    return {
      mode,
      themeCount: 0,
      criticalFailures: Math.max(criticalFailures, 1),
      warningFailures,
      durationSeconds: Number(((Date.now() - startTime) / 1000).toFixed(2)),
      exitCode: 1,
    };
  }
}

const isDirectRun = process.argv[1]?.includes('collect-and-score')
if (isDirectRun) {
  runTliMainPipeline()
    .then(async (result) => {
      await writeTliMainPipelineResult(result)
      process.exit(result.exitCode)
    })
    .catch(async (error: unknown) => {
      console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error))
      const mode: RunMode = (process.env.TLI_MODE === 'news-only') ? 'news-only' : 'full'
      await writeTliMainPipelineResult({
        mode,
        themeCount: 0,
        criticalFailures: 1,
        warningFailures: 0,
        durationSeconds: 0,
        exitCode: 1,
      }).catch((writeError: unknown) => {
        console.error('❌ 결과 파일 기록 실패:', writeError instanceof Error ? writeError.message : String(writeError))
      })
      process.exit(1)
    })
}
