import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import { sleep } from '../shared/utils'
import { ANCHOR_KEYWORD } from './datalab-anchor'
import {
  buildInterestCollectionRun,
  datalabBatchKeywordGroupHash,
  preprocessDatalabKeywords,
  resolveThemeKeywordGroup,
  type InterestObservationInput,
  type KeywordGroupSpec,
} from './collection-run-contract'
import { appendCollectionRun } from './collection-run-store'
import {
  callNaverDatalab,
  datalabFailureReason,
  toDatalabRequestPayload,
  toDatalabResponsePayload,
  type NaverDatalabRequest,
  type NaverDatalabResponse,
} from './naver-datalab-api'
import {
  ANCHOR_GROUP_NAME,
  resolveDatalabAnchor,
  toInterestMetrics,
  toInterestObservations,
} from './naver-datalab-observations'
import { appendFailedInterestRun, INTEREST_CONTRACT_VERSION } from './naver-datalab-run'
import {
  isDatalabAnchorEnabled,
  splitDatalabThemeBatches,
} from './naver-datalab-settings'
import type {
  DatalabCollectionOptions,
  DatalabCollectionResult,
  DatalabTheme,
  InterestMetric,
} from './naver-datalab-types'

export {
  ANCHOR_CANDIDATES,
  ANCHOR_CV_WARNING_THRESHOLD,
  ANCHOR_EPSILON,
  ANCHOR_KEYWORD,
  computeAnchorScaleFactor,
  computeCoefficientOfVariation,
} from './datalab-anchor'

export { collectForecastInterestRuns } from './naver-datalab-forecast'
export { isDatalabAnchorEnabled, splitDatalabThemeBatches } from './naver-datalab-settings'
export type {
  DatalabCollectionOptions,
  DatalabCollectionResult,
  InterestMetric,
} from './naver-datalab-types'

/**
 * 배치 API call 1건 = immutable run 1건.
 * snapshot transaction이 성공한 배치의 metric만 반환하므로, snapshot 실패 배치는 current cache에 도달하지 않는다.
 */
export async function collectNaverDatalab(
  themes: DatalabTheme[],
  startDate: string,
  endDate: string,
  options: DatalabCollectionOptions = {},
): Promise<DatalabCollectionResult> {
  console.log('📊 네이버 DataLab 데이터 수집 중...');
  console.log(`   기간: ${startDate} ~ ${endDate}`);
  console.log(`   테마 수: ${themes.length}`);

  const metrics: InterestMetric[] = [];
  let requested = 0
  let succeeded = 0
  let failed = 0
  let persistenceFailed = 0
  const anchorEnabled = isDatalabAnchorEnabled()
  const batches = splitDatalabThemeBatches(themes, anchorEnabled)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n   배치 처리 ${i + 1}/${batches.length}${anchorEnabled ? ` (앵커: ${ANCHOR_KEYWORD})` : ''}`);

    const themesWithKeywords = batch.filter((theme) => theme.naverKeywords.length > 0)
    const themeKeywordGroups = themesWithKeywords.map(theme => ({
      groupName: theme.name,
      keywords: preprocessDatalabKeywords(theme.naverKeywords),
    }));
    const keywordGroups = anchorEnabled
      ? [{ groupName: ANCHOR_GROUP_NAME, keywords: [ANCHOR_KEYWORD] }, ...themeKeywordGroups]
      : themeKeywordGroups

    if (keywordGroups.length === 0) {
      console.log('   ⚠️ 네이버 키워드가 있는 테마가 없음');
      continue;
    }

    requested++

    const request: NaverDatalabRequest = { startDate, endDate, timeUnit: 'date', keywordGroups };
    const requestPayload = toDatalabRequestPayload(request)
    const batchSpecs: KeywordGroupSpec[] = themesWithKeywords.map(resolveThemeKeywordGroup)
    const keywordGroupHash = datalabBatchKeywordGroupHash(batchSpecs)
    const requestedThemes = themesWithKeywords.map((theme) => ({ themeId: theme.id, groupName: theme.name }))
    const requestedAt = new Date().toISOString()

    let response: NaverDatalabResponse
    try {
      response = await callNaverDatalab(request);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`   ❌ 배치 처리 실패:`, message);
      failed++
      const persisted = await appendFailedInterestRun({
        startDate,
        endDate,
        requestPayload,
        keywordGroupHash,
        requestedThemes,
        requestedAt,
        failureSummary: { reason: datalabFailureReason(error), message },
        transport: options.transport,
      })
      if (!persisted) persistenceFailed++
      continue;
    }

    const collectedAt = new Date().toISOString()
    const anchorScaleFactor = resolveDatalabAnchor(response, anchorEnabled)

    const observations: InterestObservationInput[] = []
    const respondedThemeIds: string[] = []

    for (const result of response.results) {
      if (result.title === ANCHOR_GROUP_NAME) continue
      const theme = themesWithKeywords.find(t => t.name === result.title);
      if (!theme) {
        console.warn(`   ⚠️ 그룹에 해당하는 테마 없음: ${result.title}`);
        continue;
      }

      const themeMax = Math.max(...result.data.map(d => d.ratio), 0);
      console.log(`   ✓ ${theme.name}: ${result.data.length}개 데이터 포인트 (max: ${themeMax})`);

      respondedThemeIds.push(theme.id)
      observations.push(...toInterestObservations({
        themeId: theme.id,
        points: result.data,
        themeMax,
        anchorScaleFactor,
      }))
    }

    const missingThemes = requestedThemes.filter(t => !respondedThemeIds.includes(t.themeId));
    if (missingThemes.length > 0) {
      console.warn(`   ⚠️ DataLab 응답 누락 (${missingThemes.length}개): ${missingThemes.map(t => t.groupName).join(', ')}`);
    }

    const append = buildInterestCollectionRun({
      contractVersion: INTEREST_CONTRACT_VERSION,
      requestWindowStart: startDate,
      requestWindowEnd: endDate,
      requestPayload,
      responsePayload: toDatalabResponsePayload(response),
      keywordGroupHash,
      requestedThemes,
      observations,
      respondedThemeIds,
      timestamps: { requestedAt, collectedAt, completedAt: new Date().toISOString() },
    })

    try {
      // snapshot을 먼저 확정한다. 실패하면 이 배치의 metric은 current cache로 전파되지 않는다.
      await appendCollectionRun(append, options.transport)
    } catch (error: unknown) {
      failed++
      persistenceFailed++
      console.error('   ❌ interest snapshot append 실패 (이 배치는 cache에 반영하지 않음):',
        error instanceof Error ? error.message : String(error))
      continue
    }

    if (append.run.status === 'complete') succeeded++
    else failed++

    metrics.push(...toInterestMetrics(append.observations))

    if (i + 1 < batches.length) {
      await sleep(1000);
    }
  }

  const themesWithData = new Set(metrics.map(m => m.themeId));
  const themesWithoutData = themes.filter(t => !themesWithData.has(t.id));
  if (themesWithoutData.length > 0) {
    console.warn(`\n   ⚠️ DataLab 데이터 없는 테마 ${themesWithoutData.length}개:`);
    for (const t of themesWithoutData.slice(0, 10)) {
      console.warn(`      - ${t.name} (키워드: ${t.naverKeywords.join(', ')})`);
    }
    if (themesWithoutData.length > 10) {
      console.warn(`      ... 외 ${themesWithoutData.length - 10}개`);
    }
  }

  console.log(`\n   ✅ ${metrics.length}개 관심도 메트릭 수집 완료`);
  return { metrics, report: { requested, succeeded, failed, persistenceFailed } };
}
