/**
 * 한국투자증권 OpenAPI 클라이언트 (국내 주식 전용)
 *
 * 기능:
 * - OAuth2 토큰 발급 및 자동 갱신
 * - 국내 주식 현재가 조회 (KOSPI/KOSDAQ)
 * - Supabase를 통한 영구 토큰 캐싱 (SMS 알림 최소화)
 */

import { validateKisEnv } from '@/lib/_utils/env-validator';
import { getTokenFromStorage, saveTokenToStorage, invalidateTokenInStorage } from './token-storage';
import { checkRateLimit } from './rate-limiter';
import type { KisToken, KisStockPrice, KisErrorResponse, KisConfig, BatchPriceResult } from './types';

// 메모리 캐시
const tokenCache: { token: KisToken | null } = { token: null };

// 환경 변수 캐시 (런타임에 로드)
let configCache: KisConfig | null = null;

/**
 * Single-flight token issuance/refresh: concurrent callers share a single
 * in-progress token request rather than issuing duplicate requests.
 */
let tokenIssuanceInFlight: Promise<KisToken> | null = null;

/** KIS API 요청 타임아웃 (ms) */
const FETCH_TIMEOUT_MS = 8_000;

/** 종목 간 요청 간격 (ms) — KIS API rate limit 방지 */
const INTER_REQUEST_DELAY_MS = 100;

export class KisAuthenticationError extends Error {
  readonly name = 'KisAuthenticationError';

  constructor(status: number) {
    super(`KIS authentication failed after one token refresh: HTTP ${status}`);
  }
}

/**
 * 타임아웃이 있는 fetch
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 지수 백오프 재시도
 */
async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 300
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError instanceof KisAuthenticationError) throw lastError;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError ?? new Error('Failed after retries');
}

/** 종목 간 delay */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * KIS 설정 가져오기 (런타임에 환경 변수 로드)
 */
function getKisConfig(): KisConfig {
  if (configCache) {
    return configCache;
  }

  try {
    configCache = validateKisEnv();
    return configCache;
  } catch (error) {
    console.error('[KIS] Environment validation failed:', error);
    // Fallback (Vercel 서버리스 환경 대응)
    configCache = {
      KIS_BASE_URL: process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443',
      KIS_APP_KEY: process.env.KIS_APP_KEY || '',
      KIS_APP_SECRET: process.env.KIS_APP_SECRET || '',
    };
    return configCache;
  }
}

/**
 * KIS API 에러 파싱
 */
function parseKisError(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const errorData = data as KisErrorResponse;
    if (errorData.msg1) return errorData.msg1;
    if (errorData.msg_cd) return `Error code: ${errorData.msg_cd}`;
  }
  return 'Unknown API error';
}

/**
 * KIS API를 통해 새 토큰 발급
 */
async function issueNewToken(): Promise<KisToken> {
  const config = getKisConfig();

  if (!config.KIS_APP_KEY || !config.KIS_APP_SECRET) {
    throw new Error('KIS API credentials not configured');
  }

  const response = await fetch(`${config.KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: config.KIS_APP_KEY,
      appsecret: config.KIS_APP_SECRET,
    }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = parseKisError(errorData);
      console.error('[KIS] Token request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
    } catch {
      const errorText = await response.text();
      console.error('[KIS] Token request failed:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
    }
    throw new Error(`Failed to get access token: ${errorMessage}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    console.error('[KIS] Invalid token response:', data);
    throw new Error('Invalid token response: missing access_token');
  }

  const now = Date.now();

  // 토큰 객체 생성 (유효기간 24시간, 안전을 위해 23시간으로 설정)
  return {
    access_token: data.access_token,
    expires_at: now + 23 * 60 * 60 * 1000,
  };
}

/**
 * 접근 토큰 발급 (2-tier 캐싱: 메모리 → Supabase)
 * Uses single-flight pattern: concurrent callers share a single token issuance.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // 1. 메모리 캐시 확인
  if (tokenCache.token && tokenCache.token.expires_at > now) {
    return tokenCache.token.access_token;
  }

  // 2. Supabase에서 조회
  const storedToken = await getTokenFromStorage();
  if (storedToken) {
    tokenCache.token = storedToken;
    return storedToken.access_token;
  }

  // 3. 새 토큰 발급 (single-flight)
  return (await singleFlightIssueToken()).access_token;
}

/**
 * Single-flight token issuance: if a request is already in progress, join it.
 */
async function singleFlightIssueToken(): Promise<KisToken> {
  if (tokenIssuanceInFlight) {
    return tokenIssuanceInFlight;
  }

  tokenIssuanceInFlight = (async () => {
    try {
      checkRateLimit('token');
      const newToken = await issueNewToken();
      await saveTokenToStorage(newToken);
      tokenCache.token = newToken;
      return newToken;
    } finally {
      tokenIssuanceInFlight = null;
    }
  })();

  return tokenIssuanceInFlight;
}

/** 401/403으로 거절된 정확한 token만 memory/storage에서 무효화한다. */
async function invalidateToken(rejectedAccessToken: string): Promise<void> {
  if (tokenCache.token?.access_token === rejectedAccessToken) {
    tokenCache.token = null;
  }
  await invalidateTokenInStorage(rejectedAccessToken);
}

/** concurrent caller가 이미 만든 새 token을 재사용하고, 아니면 single-flight issuance에 합류한다. */
async function refreshAccessToken(rejectedAccessToken: string): Promise<string> {
  await invalidateToken(rejectedAccessToken);
  const current = tokenCache.token;
  if (current && current.access_token !== rejectedAccessToken && current.expires_at > Date.now()) {
    return current.access_token;
  }
  return (await singleFlightIssueToken()).access_token;
}

/** 401/403에 한해 정확히 한 번 refresh/retry하고 두 번째 rejection은 terminal이다. */
async function authenticatedKisFetch(
  buildRequest: (accessToken: string) => Promise<Response>,
): Promise<Response> {
  const token = await getAccessToken();
  const response = await buildRequest(token);

  if (response.status !== 401 && response.status !== 403) return response;

  const freshToken = await refreshAccessToken(token);
  const retriedResponse = await buildRequest(freshToken);
  if (retriedResponse.status === 401 || retriedResponse.status === 403) {
    throw new KisAuthenticationError(retriedResponse.status);
  }
  return retriedResponse;
}

/**
 * 티커에서 거래소 접두사 제거 (KOSPI/KOSDAQ만)
 */
function cleanTicker(ticker: string): string {
  return ticker.replace(/^(KOSPI|KOSDAQ):/i, '');
}

function parseOptionalInt(value: unknown): number | null {
  const parsed = typeof value === 'string' || typeof value === 'number'
    ? Number.parseInt(String(value), 10)
    : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalFloat(value: unknown): number | null {
  const parsed = typeof value === 'string' || typeof value === 'number'
    ? Number.parseFloat(String(value))
    : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

/** KIS가 명시적으로 확인한 국내 거래소. 추정값이나 UNKNOWN은 허용하지 않는다. */
export type AuthoritativeKoreanStockMarket = 'KOSPI' | 'KOSDAQ';

export function classifyKisRepresentativeMarketName(value: unknown): AuthoritativeKoreanStockMarket | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized.startsWith('KOSDAQ') || normalized.startsWith('코스닥')) return 'KOSDAQ';
  if (normalized.startsWith('KOSPI') || normalized.startsWith('코스피') || normalized.startsWith('유가증권')) {
    return 'KOSPI';
  }
  return null;
}

/**
 * KIS 국내주식 현재가 응답의 대표시장명으로 거래소를 확인한다.
 * 누락·알 수 없는 시장은 임의 기본값으로 바꾸지 않고 실패시킨다.
 */
export async function getAuthoritativeStockMarket(ticker: string): Promise<AuthoritativeKoreanStockMarket> {
  const cleanedTicker = cleanTicker(ticker);
  const config = getKisConfig();
  checkRateLimit('price');

  const response = await authenticatedKisFetch((accessToken) =>
    fetchWithTimeout(
      `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?` +
        new URLSearchParams({
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: cleanedTicker,
        }),
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          appkey: config.KIS_APP_KEY,
          appsecret: config.KIS_APP_SECRET,
          tr_id: 'FHKST01010100',
        },
      },
    ),
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    throw new Error(
      `KIS market response JSON parse failed for ${cleanedTicker}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const candidate = typeof payload === 'object' && payload !== null
    ? payload as { readonly rt_cd?: unknown; readonly output?: { readonly rprs_mrkt_kor_name?: unknown } }
    : null;
  if (!response.ok || (candidate?.rt_cd !== undefined && candidate.rt_cd !== '0')) {
    throw new Error(`KIS market lookup failed for ${cleanedTicker}: HTTP ${response.status}`);
  }

  const market = classifyKisRepresentativeMarketName(candidate?.output?.rprs_mrkt_kor_name);
  if (market === null) {
    throw new Error(`KIS market lookup returned no recognized exchange for ${cleanedTicker}`);
  }
  return market;
}

/**
 * 국내 주식 현재가 조회
 */
export async function getStockPrice(ticker: string): Promise<KisStockPrice> {
  const cleanedTicker = cleanTicker(ticker);
  const config = getKisConfig();

  const response = await authenticatedKisFetch((accessToken) =>
    fetchWithTimeout(
      `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?` +
        new URLSearchParams({
          FID_COND_MRKT_DIV_CODE: 'J',
          FID_INPUT_ISCD: cleanedTicker,
        }),
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          appkey: config.KIS_APP_KEY,
          appsecret: config.KIS_APP_SECRET,
          tr_id: 'FHKST01010100',
        },
      },
    ),
  );

  if (!response.ok) {
    throw new Error(`Failed to get stock price for ${ticker}: ${response.status}`);
  }

  const data = await response.json();
  const output = data.output;

  if (!output || !output.stck_prpr) {
    throw new Error(`No price data for ${ticker}`);
  }

  return {
    ticker,
    currentPrice: parseInt(output.stck_prpr),
    previousClose: parseInt(output.stck_sdpr),
    changeRate: parseFloat(output.prdy_ctrt),
    volume: parseInt(output.acml_vol),
    openPrice: parseOptionalInt(output.stck_oprc),
    highPrice: parseOptionalInt(output.stck_hgpr),
    lowPrice: parseOptionalInt(output.stck_lwpr),
    week52High: parseOptionalInt(output.w52_hgpr),
    week52Low: parseOptionalInt(output.w52_lwpr),
    tradingValue: parseOptionalInt(output.acml_tr_pbmn),
    marketCap: parseOptionalInt(output.hts_avls),
    per: parseOptionalFloat(output.per),
    pbr: parseOptionalFloat(output.pbr),
    eps: parseOptionalFloat(output.eps),
    bps: parseOptionalFloat(output.bps),
    sharesOutstanding: parseOptionalInt(output.lstn_stcn),
    timestamp: Date.now(),
  };
}

/**
 * 여러 주식 현재가 일괄 조회 (순차 + 개별 재시도)
 *
 * 개선:
 * - 동시 호출 대신 순차 호출로 KIS API rate limit 방지
 * - 종목별 2회 재시도 (지수 백오프 300ms → 600ms)
 * - 종목 간 100ms 간격으로 API 부하 분산
 */
export async function getBatchStockPrices(tickers: string[]): Promise<BatchPriceResult> {
  const prices = new Map<string, KisStockPrice>();
  const failures = new Map<string, string>();

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    try {
      const price = await retryAsync(() => getStockPrice(ticker), 2, 300);
      prices.set(price.ticker, price);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      failures.set(ticker, errorMsg);
    }

    if (i < tickers.length - 1) {
      await delay(INTER_REQUEST_DELAY_MS);
    }
  }

  return { prices, failures };
}

/**
 * 특정 날짜 종가 조회
 * @param ticker - 종목코드 (예: KOSPI:005930)
 * @param date - 조회일 (YYYYMMDD)
 */
export async function getDailyClosePrice(ticker: string, date: string): Promise<number | null> {
  try {
    const config = getKisConfig();

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: cleanTicker(ticker),
      FID_INPUT_DATE_1: date,
      FID_INPUT_DATE_2: date,
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: '0',
    });

    const res = await authenticatedKisFetch((accessToken) =>
      fetchWithTimeout(
        `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
        {
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${accessToken}`,
            appkey: config.KIS_APP_KEY,
            appsecret: config.KIS_APP_SECRET,
            tr_id: 'FHKST03010100',
          },
        },
      ),
    );

    const data = await res.json();
    if (!res.ok || data.rt_cd !== '0' || !data.output2?.[0]) return null;

    return parseInt(data.output2[0].stck_clpr);
  } catch {
    return null;
  }
}

/**
 * 지수 특정 날짜 일봉 종가 조회 (예: KOSPI 업종 지수)
 * @param indexCode - 업종 코드 (예: KOSPI='0001')
 * @param date - 조회일 (YYYYMMDD)
 */
export async function getIndexDailyClosePrice(indexCode: string, date: string): Promise<number | null> {
  try {
    const config = getKisConfig();

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: indexCode,
      FID_INPUT_DATE_1: date,
      FID_INPUT_DATE_2: date,
      FID_PERIOD_DIV_CODE: 'D',
    });

    const res = await authenticatedKisFetch((accessToken) =>
      fetchWithTimeout(
        `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params}`,
        {
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${accessToken}`,
            appkey: config.KIS_APP_KEY,
            appsecret: config.KIS_APP_SECRET,
            tr_id: 'FHKUP03500100',
          },
        },
      ),
    );

    const data = await res.json();
    if (!res.ok || data.rt_cd !== '0' || !data.output2?.[0]) return null;

    const price = parseFloat(data.output2[0].bstp_nmix_prpr);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** 기간 일봉 데이터 포인트 (기간조회 1콜 응답의 각 영업일자 행) */
export interface KisDailyRangePricePoint {
  readonly date: string;
  readonly close: number;
  readonly volume: number | null;
}

export class KisDailyRangeRequestError extends Error {
  readonly name = 'KisDailyRangeRequestError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function toIsoDate(kisDate: string): string | null {
  if (!/^\d{8}$/.test(kisDate)) return null;
  const year = Number(kisDate.slice(0, 4));
  const month = Number(kisDate.slice(4, 6));
  const day = Number(kisDate.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${kisDate.slice(0, 4)}-${kisDate.slice(4, 6)}-${kisDate.slice(6, 8)}`;
}

function parseRangePriceRow(
  row: unknown,
  closeField: string,
  parseClose: (value: string) => number,
  label: string,
  index: number,
): KisDailyRangePricePoint {
  if (typeof row !== 'object' || row === null) {
    throw new KisDailyRangeRequestError(`${label} row ${index} is not an object`);
  }
  const record = row as Record<string, unknown>;
  const rawDate = record.stck_bsop_date;
  const rawClose = record[closeField];
  if (typeof rawDate !== 'string' || typeof rawClose !== 'string') {
    throw new KisDailyRangeRequestError(`${label} row ${index} is missing date/close fields`);
  }

  const date = toIsoDate(rawDate);
  const close = parseClose(rawClose);
  if (!date || !Number.isFinite(close) || close <= 0) {
    throw new KisDailyRangeRequestError(`${label} row ${index} has an invalid date/close`);
  }

  const rawVolume = record.acml_vol;
  let volume: number | null = null;
  if (rawVolume !== undefined && rawVolume !== null && rawVolume !== '') {
    if (typeof rawVolume !== 'string') {
      throw new KisDailyRangeRequestError(`${label} row ${index} has a non-string volume`);
    }
    volume = Number.parseInt(rawVolume, 10);
    if (!Number.isFinite(volume) || volume < 0) {
      throw new KisDailyRangeRequestError(`${label} row ${index} has an invalid volume`);
    }
  }

  return { date, close, volume };
}

async function parseDailyRangeResponse(
  response: Response,
  label: string,
): Promise<readonly unknown[]> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    throw new KisDailyRangeRequestError(`${label} returned invalid JSON`, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new KisDailyRangeRequestError(`${label} failed with HTTP ${response.status}`);
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new KisDailyRangeRequestError(`${label} returned a non-object payload`);
  }

  const data = payload as { readonly rt_cd?: unknown; readonly output2?: unknown };
  if (data.rt_cd !== '0') {
    throw new KisDailyRangeRequestError(`${label} returned a non-success KIS result`);
  }
  if (!Array.isArray(data.output2)) {
    throw new KisDailyRangeRequestError(`${label} returned no output2 array`);
  }
  return data.output2;
}

/**
 * 종목 기간 일봉 종가/거래량 조회 (1콜 = 최대 100영업일)
 * @param ticker - 종목코드 (예: KOSPI:005930)
 * @param startDate - 조회 시작일 (YYYYMMDD)
 * @param endDate - 조회 종료일 (YYYYMMDD)
 */
export async function getDailyRangeClosePrices(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<KisDailyRangePricePoint[]> {
  const config = getKisConfig();
  const cleanedTicker = cleanTicker(ticker);
  const label = `KIS stock daily range ${cleanedTicker}`;

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: cleanedTicker,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: 'D',
    FID_ORG_ADJ_PRC: '0',
  });

  const response = await authenticatedKisFetch((accessToken) =>
    fetchWithTimeout(
      `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          appkey: config.KIS_APP_KEY,
          appsecret: config.KIS_APP_SECRET,
          tr_id: 'FHKST03010100',
        },
      },
    ),
  );

  const rows = await parseDailyRangeResponse(response, label);
  return rows.map((row, index) =>
    parseRangePriceRow(row, 'stck_clpr', (value) => Number.parseInt(value, 10), label, index));
}

/**
 * 지수 기간 일봉 종가/거래량 조회 (1콜 = 최대 100영업일)
 * @param indexCode - 업종 코드 (예: KOSPI='0001')
 * @param startDate - 조회 시작일 (YYYYMMDD)
 * @param endDate - 조회 종료일 (YYYYMMDD)
 */
export async function getIndexDailyRangeClosePrices(
  indexCode: string,
  startDate: string,
  endDate: string
): Promise<KisDailyRangePricePoint[]> {
  const config = getKisConfig();
  const label = `KIS index daily range ${indexCode}`;

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'U',
    FID_INPUT_ISCD: indexCode,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: 'D',
  });

  const response = await authenticatedKisFetch((accessToken) =>
    fetchWithTimeout(
      `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params}`,
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          appkey: config.KIS_APP_KEY,
          appsecret: config.KIS_APP_SECRET,
          tr_id: 'FHKUP03500100',
        },
      },
    ),
  );

  const rows = await parseDailyRangeResponse(response, label);
  return rows.map((row, index) =>
    parseRangePriceRow(row, 'bstp_nmix_prpr', (value) => Number.parseFloat(value), label, index));
}

/**
 * 여러 종목 특정 날짜 종가 일괄 조회 (순차 + delay)
 */
export async function getBatchDailyClosePrices(
  tickers: string[],
  date: string
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  for (let i = 0; i < tickers.length; i++) {
    const price = await getDailyClosePrice(tickers[i], date);
    if (price !== null) {
      results.set(tickers[i], price);
    }

    if (i < tickers.length - 1) {
      await delay(INTER_REQUEST_DELAY_MS);
    }
  }

  return results;
}
