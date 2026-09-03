/**
 * 한국투자증권 OpenAPI 클라이언트 (국내 주식 전용)
 *
 * 기능:
 * - OAuth2 토큰 발급 및 자동 갱신
 * - 국내 주식 현재가 조회 (KOSPI/KOSDAQ)
 * - Supabase를 통한 영구 토큰 캐싱 (SMS 알림 최소화)
 */

import { validateKisEnv } from '@/lib/_utils/env-validator';
import { getTokenFromStorage, saveTokenToStorage } from './token-storage';
import type { KisToken, KisStockPrice, KisErrorResponse, KisConfig, BatchPriceResult } from './types';

// 메모리 캐시
const tokenCache: { token: KisToken | null } = { token: null };
const staleAccessTokens = new Set<string>();
let tokenResolutionInFlight: Promise<KisTokenResolution> | null = null;
let lastIssueAttemptAt = 0;

// 환경 변수 캐시 (런타임에 로드)
let configCache: KisConfig | null = null;

/** KIS API 요청 타임아웃 (ms) */
const FETCH_TIMEOUT_MS = 8_000;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60_000;
const TOKEN_DEFAULT_TTL_MS = 23 * 60 * 60_000;
const TOKEN_EXPIRY_RESPONSE_MARGIN_MS = 10 * 60_000;
const TOKEN_ISSUE_COOLDOWN_MS = 61_000;

/** 종목 간 요청 간격 (ms) — KIS API rate limit 방지 */
const INTER_REQUEST_DELAY_MS = 100;

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

export type KisApiErrorKind = 'http' | 'api' | 'timeout' | 'parse' | 'rate_limit' | 'token';
export type KisApiError = Error & {
  readonly kind: KisApiErrorKind;
  readonly status?: number;
  readonly code?: string;
};

export function createKisApiError(
  kind: KisApiErrorKind,
  message: string,
  meta: { readonly status?: number; readonly code?: string } = {}
): KisApiError {
  return Object.assign(new Error(message), { kind, ...meta });
}

export function getKisApiErrorKind(error: unknown): KisApiErrorKind | null {
  if (!(error instanceof Error) || !('kind' in error)) return null;
  const kind = error.kind;
  return kind === 'http' || kind === 'api' || kind === 'timeout' || kind === 'parse'
    || kind === 'rate_limit' || kind === 'token'
    ? kind
    : null;
}

interface KisTokenResolution {
  readonly token: KisToken;
  readonly source: 'memory' | 'storage' | 'issued';
}

interface KisTokenResponse extends KisErrorResponse {
  readonly access_token?: unknown;
  readonly access_token_token_expired?: unknown;
  readonly error_code?: unknown;
}

function getKisErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const candidate = data as { readonly msg_cd?: unknown; readonly error_code?: unknown };
  if (typeof candidate.error_code === 'string') return candidate.error_code;
  return typeof candidate.msg_cd === 'string' ? candidate.msg_cd : undefined;
}

function parseKstTokenExpiry(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const parsed = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 9,
    Number(minute),
    Number(second),
  );
  return Number.isFinite(parsed) ? parsed - TOKEN_EXPIRY_RESPONSE_MARGIN_MS : null;
}

function logTokenResolution(resolution: KisTokenResolution): void {
  console.log(JSON.stringify({
    event: 'kis_token',
    source: resolution.source,
    expiresInMin: Math.max(0, Math.floor((resolution.token.expires_at - Date.now()) / 60_000)),
  }));
}

/**
 * KIS API를 통해 새 토큰 발급
 */
async function issueNewToken(): Promise<KisToken> {
  const config = getKisConfig();

  if (!config.KIS_APP_KEY || !config.KIS_APP_SECRET) {
    throw new Error('KIS API credentials not configured');
  }

  lastIssueAttemptAt = Date.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(`${config.KIS_BASE_URL}/oauth2/tokenP`, {
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createKisApiError('timeout', 'KIS token request timed out');
    }
    throw createKisApiError(
      'token',
      `KIS token request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let data: KisTokenResponse = {};
  try {
    const parsed: unknown = await response.json();
    data = typeof parsed === 'object' && parsed !== null ? parsed as KisTokenResponse : {};
  } catch (error) {
    if (response.ok) {
      throw createKisApiError(
        'parse',
        `KIS token response JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
        { status: response.status },
      );
    }
  }

  const responseCode = getKisErrorCode(data);
  if (!response.ok || responseCode === 'EGW00133') {
    throw createKisApiError(
      'token',
      `Failed to get access token: ${parseKisError(data)}`,
      { status: response.status, code: responseCode },
    );
  }

  if (typeof data.access_token !== 'string' || data.access_token.trim().length === 0) {
    throw createKisApiError('token', 'Invalid token response: missing access_token');
  }

  const now = Date.now();
  const responseExpiry = parseKstTokenExpiry(data.access_token_token_expired);

  return {
    access_token: data.access_token,
    expires_at: responseExpiry ?? now + TOKEN_DEFAULT_TTL_MS,
  };
}

function isCooldownError(error: unknown): boolean {
  return error instanceof Error
    && ((error as Partial<KisApiError>).status === 403
      || (error as Partial<KisApiError>).code === 'EGW00133');
}

async function issueTokenWithCooldownRetry(): Promise<KisToken> {
  try {
    return await issueNewToken();
  } catch (error) {
    if (!isCooldownError(error)) throw error;
    const jitterMs = Math.floor(Math.random() * 1_001);
    const waitMs = Math.max(0, lastIssueAttemptAt + TOKEN_ISSUE_COOLDOWN_MS + jitterMs - Date.now());
    if (waitMs > 0) await delay(waitMs);
    return issueNewToken();
  }
}

async function resolveAccessToken(minRemainingMs: number): Promise<KisTokenResolution> {
  const now = Date.now();
  if (
    tokenCache.token
    && !staleAccessTokens.has(tokenCache.token.access_token)
    && tokenCache.token.expires_at > now + minRemainingMs
  ) {
    return { token: tokenCache.token, source: 'memory' };
  }

  const storedToken = await getTokenFromStorage();
  const bestCachedToken = [tokenCache.token, storedToken]
    .filter((token): token is KisToken => (
      token !== null && !staleAccessTokens.has(token.access_token)
    ))
    .sort((left, right) => right.expires_at - left.expires_at)[0];
  if (bestCachedToken && bestCachedToken.expires_at > now + minRemainingMs) {
    tokenCache.token = bestCachedToken;
    return { token: bestCachedToken, source: 'storage' };
  }

  const token = await issueTokenWithCooldownRetry();
  tokenCache.token = token;
  await saveTokenToStorage(token);
  return { token, source: 'issued' };
}

async function getTokenResolution(minRemainingMs: number): Promise<KisTokenResolution> {
  if (!tokenResolutionInFlight) {
    tokenResolutionInFlight = resolveAccessToken(minRemainingMs)
      .then((resolution) => {
        if (resolution.source !== 'memory') logTokenResolution(resolution);
        return resolution;
      })
      .finally(() => {
        tokenResolutionInFlight = null;
      });
  }
  const resolution = await tokenResolutionInFlight;
  if (resolution.source !== 'issued' && resolution.token.expires_at <= Date.now() + minRemainingMs) {
    return getTokenResolution(minRemainingMs);
  }
  return resolution;
}

export async function getKisAccessToken(): Promise<string> {
  return (await getTokenResolution(TOKEN_SAFETY_MARGIN_MS)).token.access_token;
}

export function invalidateKisAccessToken(rejectedAccessToken?: string): void {
  const staleToken = rejectedAccessToken ?? tokenCache.token?.access_token
  if (staleToken) staleAccessTokens.add(staleToken)
  if (!rejectedAccessToken || tokenCache.token?.access_token === rejectedAccessToken) {
    tokenCache.token = null
  }
}

const getAccessToken = getKisAccessToken;

export async function ensureKisAccessToken(input: {
  readonly minRemainingMs: number;
}): Promise<{ readonly source: KisTokenResolution['source']; readonly expiresAt: number }> {
  if (!Number.isFinite(input.minRemainingMs) || input.minRemainingMs < 0) {
    throw new Error(`minRemainingMs must be a non-negative number: ${input.minRemainingMs}`);
  }
  const resolution = await getTokenResolution(Math.max(TOKEN_SAFETY_MARGIN_MS, input.minRemainingMs));
  return { source: resolution.source, expiresAt: resolution.token.expires_at };
}

export function resetKisClientCacheForTest(): void {
  tokenCache.token = null;
  staleAccessTokens.clear();
  tokenResolutionInFlight = null;
  lastIssueAttemptAt = 0;
  configCache = null;
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

/**
 * 국내 주식 현재가 조회
 */
export async function getStockPrice(ticker: string): Promise<KisStockPrice> {
  const token = await getAccessToken();
  const cleanedTicker = cleanTicker(ticker);
  const config = getKisConfig();

  const response = await fetchWithTimeout(
    `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?` +
      new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD: cleanedTicker,
      }),
    {
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        appkey: config.KIS_APP_KEY,
        appsecret: config.KIS_APP_SECRET,
        tr_id: 'FHKST01010100',
      },
    }
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
    const token = await getAccessToken();

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: cleanTicker(ticker),
      FID_INPUT_DATE_1: date,
      FID_INPUT_DATE_2: date,
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: '0',
    });

    const res = await fetchWithTimeout(
      `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          appkey: config.KIS_APP_KEY,
          appsecret: config.KIS_APP_SECRET,
          tr_id: 'FHKST03010100',
        },
      }
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
    const token = await getAccessToken();

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: indexCode,
      FID_INPUT_DATE_1: date,
      FID_INPUT_DATE_2: date,
      FID_PERIOD_DIV_CODE: 'D',
    });

    const res = await fetchWithTimeout(
      `${config.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params}`,
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          appkey: config.KIS_APP_KEY,
          appsecret: config.KIS_APP_SECRET,
          tr_id: 'FHKUP03500100',
        },
      }
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
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number;
  readonly volume: number | null;
}

interface KisRangePriceFields {
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly volume: string;
}

const STOCK_RANGE_PRICE_FIELDS: KisRangePriceFields = {
  open: 'stck_oprc',
  high: 'stck_hgpr',
  low: 'stck_lwpr',
  volume: 'acml_vol',
};

function toIsoDate(kisDate: string): string | null {
  if (!/^\d{8}$/.test(kisDate)) return null;
  return `${kisDate.slice(0, 4)}-${kisDate.slice(4, 6)}-${kisDate.slice(6, 8)}`;
}

export function parseRangePriceRow(
  row: Record<string, string>,
  closeField: string,
  parsePrice: (value: string) => number,
  fields: KisRangePriceFields = STOCK_RANGE_PRICE_FIELDS,
): KisDailyRangePricePoint | null {
  const date = toIsoDate(row.stck_bsop_date);
  const close = parsePrice(row[closeField]);
  if (!date || !Number.isFinite(close) || close <= 0) return null;

  const parseOptionalPrice = (field: string): number | null => {
    const parsed = parsePrice(row[field]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const open = parseOptionalPrice(fields.open);
  let high = parseOptionalPrice(fields.high);
  let low = parseOptionalPrice(fields.low);
  if (high !== null && low !== null && high < low) {
    high = null;
    low = null;
  }

  const volume = parseInt(row[fields.volume], 10);
  return {
    date,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : null,
  };
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
  try {
    return await fetchDailyRangePriceRows(ticker, startDate, endDate);
  } catch {
    return [];
  }
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
  try {
    return await fetchIndexDailyRangePriceRows(indexCode, startDate, endDate);
  } catch {
    return [];
  }
}

interface KisRangeResponse extends KisErrorResponse {
  readonly error_code?: string;
  readonly output2?: unknown;
}

interface FetchRangePriceRowsInput {
  readonly code: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly marketCode: 'J' | 'U';
  readonly path: string;
  readonly trId: string;
  readonly closeField: string;
  readonly fields: KisRangePriceFields;
  readonly parsePrice: (value: string) => number;
  readonly adjusted: boolean;
}

async function fetchRangePriceRowsWithToken(
  input: FetchRangePriceRowsInput,
  token: string,
): Promise<KisDailyRangePricePoint[]> {
  const config = getKisConfig();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: input.marketCode,
    FID_INPUT_ISCD: input.code,
    FID_INPUT_DATE_1: input.startDate,
    FID_INPUT_DATE_2: input.endDate,
    FID_PERIOD_DIV_CODE: 'D',
    ...(input.adjusted ? { FID_ORG_ADJ_PRC: '0' } : {}),
  });

  let response: Response;
  try {
    response = await fetchWithTimeout(`${config.KIS_BASE_URL}${input.path}?${params}`, {
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        appkey: config.KIS_APP_KEY,
        appsecret: config.KIS_APP_SECRET,
        tr_id: input.trId,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createKisApiError('timeout', `KIS daily range request timed out: ${input.code}`);
    }
    if (getKisApiErrorKind(error)) throw error;
    throw createKisApiError(
      'http',
      `KIS daily range request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let data: KisRangeResponse;
  try {
    data = await response.json() as KisRangeResponse;
  } catch (error) {
    if (response.status === 429) {
      throw createKisApiError('rate_limit', `KIS daily range rate limited: ${input.code}`, {
        status: response.status,
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw createKisApiError('token', `KIS daily range token rejected: ${input.code}`, {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw createKisApiError('http', `KIS daily range HTTP ${response.status}: ${input.code}`, {
        status: response.status,
      });
    }
    throw createKisApiError(
      'parse',
      `KIS daily range JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: response.status },
    );
  }
  if (!data || typeof data !== 'object') {
    throw createKisApiError('parse', `KIS daily range response is not an object: ${input.code}`, {
      status: response.status,
    });
  }
  const code = getKisErrorCode(data);
  if (response.status === 429 || code === 'EGW00201') {
    throw createKisApiError('rate_limit', `KIS daily range rate limited: ${input.code}`, {
      status: response.status,
      code,
    });
  }
  if (response.status === 401 || response.status === 403 || code === 'EGW00133') {
    throw createKisApiError('token', `KIS daily range token rejected: ${input.code}`, {
      status: response.status,
      code,
    });
  }
  if (!response.ok) {
    throw createKisApiError('http', `KIS daily range HTTP ${response.status}: ${input.code}`, {
      status: response.status,
      code,
    });
  }
  if (data.rt_cd !== '0') {
    throw createKisApiError('api', `KIS daily range API error: ${parseKisError(data)}`, { code });
  }
  if (!Array.isArray(data.output2)) {
    throw createKisApiError('parse', `KIS daily range output2 is not an array: ${input.code}`);
  }

  return data.output2
    .filter((row): row is Record<string, string> => typeof row === 'object' && row !== null)
    .map((row) => parseRangePriceRow(row, input.closeField, input.parsePrice, input.fields))
    .filter((point): point is KisDailyRangePricePoint => point !== null);
}

async function fetchRangePriceRows(
  input: FetchRangePriceRowsInput,
): Promise<KisDailyRangePricePoint[]> {
  let token = await getAccessToken()
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchRangePriceRowsWithToken(input, token)
    } catch (error) {
      if (getKisApiErrorKind(error) !== 'token') throw error
      invalidateKisAccessToken(token)
      if (attempt > 0) throw error
      token = await getKisAccessToken()
    }
  }
  throw createKisApiError('token', `KIS daily range token rejected twice: ${input.code}`)
}

export async function fetchDailyRangePriceRows(
  ticker: string,
  startKisDate: string,
  endKisDate: string,
): Promise<KisDailyRangePricePoint[]> {
  return fetchRangePriceRows({
    code: cleanTicker(ticker),
    startDate: startKisDate,
    endDate: endKisDate,
    marketCode: 'J',
    path: '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    trId: 'FHKST03010100',
    closeField: 'stck_clpr',
    fields: STOCK_RANGE_PRICE_FIELDS,
    parsePrice: (value) => Number.parseInt(value, 10),
    adjusted: true,
  });
}

export async function fetchIndexDailyRangePriceRows(
  indexCode: string,
  startKisDate: string,
  endKisDate: string,
): Promise<KisDailyRangePricePoint[]> {
  return fetchRangePriceRows({
    code: indexCode,
    startDate: startKisDate,
    endDate: endKisDate,
    marketCode: 'U',
    path: '/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice',
    trId: 'FHKUP03500100',
    closeField: 'bstp_nmix_prpr',
    fields: {
      open: 'bstp_nmix_oprc',
      high: 'bstp_nmix_hgpr',
      low: 'bstp_nmix_lwpr',
      volume: 'acml_vol',
    },
    parsePrice: (value) => Number.parseFloat(value),
    adjusted: false,
  });
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
