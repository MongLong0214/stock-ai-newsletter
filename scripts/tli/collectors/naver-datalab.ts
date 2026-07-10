import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import type { JsonObject } from '@/lib/tli/canonical-json'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import { sleep, withRetry } from '../shared/utils';
import {
  ANCHOR_CV_WARNING_THRESHOLD,
  ANCHOR_KEYWORD,
  computeAnchorScaleFactor,
  computeCoefficientOfVariation,
} from './datalab-anchor'
import {
  buildInterestCollectionRun,
  datalabBatchKeywordGroupHash,
  forecastInterestRunWindow,
  keywordGroupSha256,
  preprocessDatalabKeywords,
  resolveThemeKeywordGroup,
  type InterestObservationInput,
  type KeywordGroupSpec,
} from './collection-run-contract'
import { appendCollectionRun, type CollectionRunTransport } from './collection-run-store'

export {
  ANCHOR_CANDIDATES,
  ANCHOR_CV_WARNING_THRESHOLD,
  ANCHOR_EPSILON,
  ANCHOR_KEYWORD,
  computeAnchorScaleFactor,
  computeCoefficientOfVariation,
} from './datalab-anchor'

interface NaverDatalabRequest {
  startDate: string;
  endDate: string;
  timeUnit: string;
  keywordGroups: Array<{
    groupName: string;
    keywords: string[];
  }>;
}

interface NaverDatalabResponse {
  results: Array<{
    title: string;
    keywords: string[];
    data: Array<{
      period: string;
      ratio: number;
    }>;
  }>;
}

interface Theme {
  id: string;
  name: string;
  naverKeywords: string[];
}

interface InterestMetric {
  themeId: string;
  date: string;
  rawValue: number;
  normalized: number;
  anchorScaledValue?: number | null;
}

export interface DatalabCollectionOptions {
  /** 테스트 주입용. 미지정 시 supabase RPC로 immutable run을 append한다. */
  readonly transport?: CollectionRunTransport
}

const ANCHOR_GROUP_NAME = '__tli_anchor__'
const ANCHOR_BATCH_THEME_SIZE = 4
const LEGACY_BATCH_THEME_SIZE = 5
const INTEREST_CONTRACT_VERSION = 'tli-interest-v1'

/**
 * keyword epoch. 별도 epoch 레지스트리가 없으므로 1로 고정하고, 실질 epoch 식별자는
 * run의 `keyword_group_hash`가 담당한다 — 키워드 그룹이 바뀌면 hash가 바뀌어 과거 run과 섞이지 않는다.
 */
const KEYWORD_EPOCH = 1

function getNaverCredentials() {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 누락되었습니다')
  }
  return { clientId, clientSecret }
}

export function isDatalabAnchorEnabled(envValue = process.env.TLI_ANCHOR_ENABLED): boolean {
  return envValue !== 'false' && envValue !== '0'
}

export function splitDatalabThemeBatches<T>(themes: readonly T[], anchorEnabled: boolean): T[][] {
  const batchSize = anchorEnabled ? ANCHOR_BATCH_THEME_SIZE : LEGACY_BATCH_THEME_SIZE
  const batches: T[][] = []
  for (let index = 0; index < themes.length; index += batchSize) {
    batches.push(themes.slice(index, index + batchSize))
  }
  return batches
}

async function callNaverDatalab(request: NaverDatalabRequest): Promise<NaverDatalabResponse> {
  const { clientId, clientSecret } = getNaverCredentials()
  return withRetry(
    async () => {
      const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`네이버 API 오류 (${response.status}): ${errorText}`);
      }

      return await response.json();
    },
    3,
    '네이버 DataLab API 호출'
  );
}

const toRequestPayload = (request: NaverDatalabRequest): JsonObject => ({
  startDate: request.startDate,
  endDate: request.endDate,
  timeUnit: request.timeUnit,
  keywordGroups: request.keywordGroups.map((group) => ({
    groupName: group.groupName,
    keywords: [...group.keywords],
  })),
})

const toResponsePayload = (response: NaverDatalabResponse): JsonObject => ({
  results: response.results.map((result) => ({
    title: result.title,
    keywords: [...result.keywords],
    data: result.data.map((point) => ({ period: point.period, ratio: point.ratio })),
  })),
})

/** DataLab은 비거래일 데이터도 반환한다. 관측 slot은 한국 거래일만 가진다. */
const toInterestObservations = (input: {
  readonly themeId: string
  readonly points: ReadonlyArray<{ period: string; ratio: number }>
  readonly themeMax: number
  readonly anchorScaleFactor: number | null
}): InterestObservationInput[] =>
  input.points
    .filter((point) => isKoreanTradingDate(point.period))
    .map((point) => ({
      theme_id: input.themeId,
      trading_date: point.period,
      source: 'naver_datalab' as const,
      raw_value: Number.isFinite(point.ratio) ? Math.round(point.ratio) : 0,
      normalized: input.themeMax > 0 ? (point.ratio / input.themeMax) * 100 : 0,
      anchor_scaled_value: input.anchorScaleFactor === null ? null : point.ratio * input.anchorScaleFactor,
      keyword_epoch: KEYWORD_EPOCH,
    }))

const toInterestMetrics = (observations: readonly InterestObservationInput[]): InterestMetric[] =>
  observations.map((observation) => ({
    themeId: observation.theme_id,
    date: observation.trading_date,
    rawValue: observation.raw_value,
    normalized: observation.normalized,
    anchorScaledValue: observation.anchor_scaled_value,
  }))

const resolveAnchor = (response: NaverDatalabResponse, anchorEnabled: boolean) => {
  const anchorResult = anchorEnabled
    ? response.results.find((result) => result.title === ANCHOR_GROUP_NAME)
    : undefined
  const anchorRatios = anchorResult?.data.map((point) => point.ratio) ?? []
  const anchorScaleFactor = anchorEnabled ? computeAnchorScaleFactor(anchorRatios) : null
  const anchorCv = anchorEnabled ? computeCoefficientOfVariation(anchorRatios.slice(-14)) : null

  if (anchorCv !== null && anchorCv > ANCHOR_CV_WARNING_THRESHOLD) {
    console.warn(`   ⚠️ DataLab 앵커 변동성 경고: CV=${anchorCv.toFixed(3)} > ${ANCHOR_CV_WARNING_THRESHOLD}`)
  }
  if (anchorEnabled && anchorScaleFactor === null) {
    console.warn('   ⚠️ DataLab 앵커 응답 누락 — anchor_scaled_value를 null로 적재')
  }

  return anchorScaleFactor
}

/**
 * 배치 API call 1건 = immutable run 1건.
 * snapshot transaction이 성공한 배치의 metric만 반환하므로, snapshot 실패 배치는 current cache에 도달하지 않는다.
 */
export async function collectNaverDatalab(
  themes: Theme[],
  startDate: string,
  endDate: string,
  options: DatalabCollectionOptions = {},
): Promise<InterestMetric[]> {
  console.log('📊 네이버 DataLab 데이터 수집 중...');
  console.log(`   기간: ${startDate} ~ ${endDate}`);
  console.log(`   테마 수: ${themes.length}`);

  const metrics: InterestMetric[] = [];
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

    const request: NaverDatalabRequest = { startDate, endDate, timeUnit: 'date', keywordGroups };
    const requestPayload = toRequestPayload(request)
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
      await appendFailedInterestRun({
        startDate,
        endDate,
        requestPayload,
        keywordGroupHash,
        requestedThemes,
        requestedAt,
        failureSummary: { reason: 'naver_datalab_request_failed', message },
        transport: options.transport,
      })
      continue;
    }

    const collectedAt = new Date().toISOString()
    const anchorScaleFactor = resolveAnchor(response, anchorEnabled)

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
      responsePayload: toResponsePayload(response),
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
      console.error('   ❌ interest snapshot append 실패 (이 배치는 cache에 반영하지 않음):',
        error instanceof Error ? error.message : String(error))
      continue
    }

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
  return metrics;
}

async function appendFailedInterestRun(input: {
  readonly startDate: string
  readonly endDate: string
  readonly requestPayload: JsonObject
  readonly keywordGroupHash: string
  readonly requestedThemes: ReadonlyArray<{ themeId: string; groupName: string }>
  readonly requestedAt: string
  readonly failureSummary: JsonObject
  readonly transport?: CollectionRunTransport
}): Promise<void> {
  const now = new Date().toISOString()
  const append = buildInterestCollectionRun({
    contractVersion: INTEREST_CONTRACT_VERSION,
    requestWindowStart: input.startDate,
    requestWindowEnd: input.endDate,
    requestPayload: input.requestPayload,
    responsePayload: null,
    keywordGroupHash: input.keywordGroupHash,
    requestedThemes: input.requestedThemes,
    observations: [],
    respondedThemeIds: [],
    timestamps: { requestedAt: input.requestedAt, collectedAt: now, completedAt: now },
    failureSummary: input.failureSummary,
  })

  try {
    await appendCollectionRun(append, input.transport)
  } catch (error: unknown) {
    console.error('   ⚠️ failed interest run 기록 실패:', error instanceof Error ? error.message : String(error))
  }
}

export interface ForecastInterestRunReport {
  readonly appended: number
  readonly failed: number
}

/**
 * forecast manifest가 선택할 수 있는 유일한 형태의 run — 테마 dedicated request.
 *
 * 046은 usable child의 `interest_run.keyword_group_hash`가 그 테마의 `keyword_group_sha256`와
 * 같기를 요구하므로(046:893), 여러 테마를 묶은 batch run은 절대 child를 back할 수 없다.
 * current cache는 건드리지 않는다 — 이 run은 학습·예측 source 전용이다.
 */
export async function collectForecastInterestRuns(
  themes: Theme[],
  baseDate: string,
  options: DatalabCollectionOptions = {},
): Promise<ForecastInterestRunReport> {
  const anchorEnabled = isDatalabAnchorEnabled()
  const { startDate, endDate } = forecastInterestRunWindow(baseDate)
  console.log(`\n🔒 forecast interest run 수집 (${startDate} ~ ${endDate}, ${themes.length}개 테마)`)

  let appended = 0
  let failed = 0

  for (const theme of themes) {
    if (theme.naverKeywords.length === 0) continue

    const spec = resolveThemeKeywordGroup(theme)
    const keywordGroups = anchorEnabled
      ? [{ groupName: ANCHOR_GROUP_NAME, keywords: [ANCHOR_KEYWORD] }, { groupName: spec.group_name, keywords: [...spec.keywords] }]
      : [{ groupName: spec.group_name, keywords: [...spec.keywords] }]

    const request: NaverDatalabRequest = { startDate, endDate, timeUnit: 'date', keywordGroups }
    const requestPayload = toRequestPayload(request)
    const keywordGroupHash = keywordGroupSha256(spec)
    const requestedThemes = [{ themeId: theme.id, groupName: spec.group_name }]
    const requestedAt = new Date().toISOString()

    let response: NaverDatalabResponse
    try {
      response = await callNaverDatalab(request)
    } catch (error: unknown) {
      failed++
      await appendFailedInterestRun({
        startDate,
        endDate,
        requestPayload,
        keywordGroupHash,
        requestedThemes,
        requestedAt,
        failureSummary: {
          reason: 'naver_datalab_request_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        transport: options.transport,
      })
      continue
    }

    const collectedAt = new Date().toISOString()
    const anchorScaleFactor = resolveAnchor(response, anchorEnabled)
    const themeResult = response.results.find((result) => result.title === spec.group_name)
    const themeMax = Math.max(...(themeResult?.data.map((point) => point.ratio) ?? []), 0)

    const append = buildInterestCollectionRun({
      contractVersion: INTEREST_CONTRACT_VERSION,
      requestWindowStart: startDate,
      requestWindowEnd: endDate,
      requestPayload,
      responsePayload: toResponsePayload(response),
      keywordGroupHash,
      requestedThemes,
      observations: themeResult
        ? toInterestObservations({ themeId: theme.id, points: themeResult.data, themeMax, anchorScaleFactor })
        : [],
      respondedThemeIds: themeResult ? [theme.id] : [],
      timestamps: { requestedAt, collectedAt, completedAt: new Date().toISOString() },
    })

    try {
      await appendCollectionRun(append, options.transport)
      appended++
    } catch (error: unknown) {
      failed++
      console.error(`   ❌ ${theme.name} forecast interest run append 실패:`,
        error instanceof Error ? error.message : String(error))
    }

    await sleep(1000)
  }

  console.log(`   ✅ forecast interest run ${appended}건 append, ${failed}건 실패`)
  return { appended, failed }
}
