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
import { checkRateLimit } from './rate-limiter';
import type { KisToken, KisStockPrice, KisErrorResponse, KisConfig, BatchPriceResult } from './types';

// 메모리 캐시
const tokenCache: { token: KisToken | null } = { token: null };

// 환경 변수 캐시 (런타임에 로드)
let configCache: KisConfig | null = null;

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

  // 3. 새 토큰 발급
  checkRateLimit('token');
  const newToken = await issueNewToken();

  // 메모리 및 Supabase에 저장
  tokenCache.token = newToken;
  saveTokenToStorage(newToken).catch(() => {}); // 실패해도 무시

  return newToken.access_token;
}

/**
 * 티커에서 거래소 접두사 제거 (KOSPI/KOSDAQ만)
 */
function cleanTicker(ticker: string): string {
  return ticker.replace(/^(KOSPI|KOSDAQ):/i, '');
}

/**
 * 국내 주식 현재가 조회
 */
export async function getStockPrice(ticker: string): Promise<KisStockPrice> {
  const token = await getAccessToken();
  const cleanedTicker = cleanTicker(ticker);
  const config = getKisConfig();

  const response = await fetch(
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
    throw new Error(`Failed to get stock price for ${ticker}`);
  }

  const data = await response.json();
  const output = data.output;

  return {
    ticker,
    currentPrice: parseInt(output.stck_prpr),
    previousClose: parseInt(output.stck_sdpr),
    changeRate: parseFloat(output.prdy_ctrt),
    volume: parseInt(output.acml_vol),
    timestamp: Date.now(),
  };
}

/**
 * 여러 주식 현재가 일괄 조회
 */
export async function getBatchStockPrices(tickers: string[]): Promise<BatchPriceResult> {
  const prices = new Map<string, KisStockPrice>();
  const failures = new Map<string, string>();

  const results = await Promise.allSettled(tickers.map((ticker) => getStockPrice(ticker)));

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      prices.set(result.value.ticker, result.value);
    } else {
      const ticker = tickers[index];
      const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      failures.set(ticker, errorMsg);
    }
  });

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

    const res = await fetch(
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
 * 여러 종목 특정 날짜 종가 일괄 조회
 */
export async function getBatchDailyClosePrices(
  tickers: string[],
  date: string
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const settled = await Promise.allSettled(
    tickers.map((ticker) => getDailyClosePrice(ticker, date))
  );

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value !== null) {
      results.set(tickers[index], result.value);
    }
  });

  return results;
}