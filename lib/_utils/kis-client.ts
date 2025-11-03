/**
 * 한국투자증권 OpenAPI 클라이언트 (국내 주식 전용)
 *
 * 기능:
 * - OAuth2 토큰 발급 및 자동 갱신
 * - 국내 주식 현재가 조회 (KOSPI/KOSDAQ)
 * - Vercel KV를 통한 영구 토큰 캐싱 (SMS 알림 최소화)
 * - 메모리 캐싱 fallback (로컬 개발 환경 대응)
 */

import { kv } from '@vercel/kv';
import { validateKisEnv } from './env-validator';

interface KisToken {
  access_token: string;
  expires_at: number; // Unix timestamp
}

interface KisStockPrice {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  changeRate: number;
  volume: number;
  timestamp: number;
}

interface KisErrorResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
}

// 메모리 캐시
const tokenCache: { token: KisToken | null } = { token: null };
const priceCache = new Map<string, { data: KisStockPrice; expires: number }>();

// 토큰 발급 Promise 캐시 (동시 요청 방지)
let tokenRequestPromise: Promise<string> | null = null;

// Rate limiting 추적
const rateLimitTracker = {
  lastTokenRequest: 0,
  tokenRequestCount: 0,
  lastPriceRequest: 0,
  priceRequestCount: 0,
};

// 환경 변수 캐시 (런타임에 로드)
let configCache: ReturnType<typeof validateKisEnv> | null = null;

/**
 * KIS 설정 가져오기 (런타임에 환경 변수 로드)
 */
function getKisConfig(): ReturnType<typeof validateKisEnv> {
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
 * Rate limit 체크
 */
function checkRateLimit(type: 'token' | 'price'): void {
  const now = Date.now();
  const MINUTE_MS = 60 * 1000;

  if (type === 'token') {
    const timeSinceLastRequest = now - rateLimitTracker.lastTokenRequest;
    if (timeSinceLastRequest < MINUTE_MS) {
      const waitTime = Math.ceil((MINUTE_MS - timeSinceLastRequest) / 1000);
      console.warn(
        `[KIS] Rate limit warning: Token request within 1 minute. ` +
          `Please wait ${waitTime}s before next request.`
      );
    }
    rateLimitTracker.lastTokenRequest = now;
    rateLimitTracker.tokenRequestCount++;
  } else {
    rateLimitTracker.lastPriceRequest = now;
    rateLimitTracker.priceRequestCount++;
  }
}

/**
 * 접근 토큰 발급 (Vercel KV + 메모리 캐싱)
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  const KV_KEY = 'kis_access_token';

  // 1. Vercel KV에서 먼저 조회 (프로덕션 환경)
  try {
    const kvToken = await kv.get<KisToken>(KV_KEY);
    if (kvToken && kvToken.expires_at > now) {
      // 메모리 캐시도 업데이트
      tokenCache.token = kvToken;
      return kvToken.access_token;
    }
  } catch (error) {
    // KV 사용 불가 (로컬 개발 환경 등) - 메모리 캐시로 fallback
  }

  // 2. 메모리 캐시 확인 (로컬 개발 환경 fallback)
  if (tokenCache.token && tokenCache.token.expires_at > now) {
    return tokenCache.token.access_token;
  }

  // 3. 이미 토큰 발급 요청 중이면 대기
  if (tokenRequestPromise) {
    return tokenRequestPromise;
  }

  // 4. Rate limit 체크
  checkRateLimit('token');

  // 5. 토큰 발급 Promise 생성 및 캐싱
  tokenRequestPromise = (async () => {
    try {
      // 런타임 설정 로드
      const config = getKisConfig();

      // 환경 변수 재검증
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

      // 응답 검증
      if (!data.access_token) {
        console.error('[KIS] Invalid token response:', data);
        throw new Error('Invalid token response: missing access_token');
      }

      const now = Date.now();

      // 토큰 객체 생성 (유효기간 24시간, 안전을 위해 23시간으로 설정)
      const newToken: KisToken = {
        access_token: data.access_token,
        expires_at: now + 23 * 60 * 60 * 1000,
      };

      // 6. Vercel KV에 저장 (23시간 TTL)
      try {
        await kv.set(KV_KEY, newToken, { ex: 23 * 60 * 60 });
      } catch (error) {
        // KV 저장 실패해도 계속 진행 (메모리 캐시 사용)
      }

      // 7. 메모리 캐시에도 저장
      tokenCache.token = newToken;

      return data.access_token;
    } catch (error) {
      console.error('[KIS] Token request error:', error);
      throw error;
    } finally {
      // Promise 캐시 초기화
      tokenRequestPromise = null;
    }
  })();

  return tokenRequestPromise;
}

/**
 * 티커에서 거래소 접두사 제거 (KOSPI/KOSDAQ만)
 */
function cleanTicker(ticker: string): string {
  return ticker.replace(/^(KOSPI|KOSDAQ):/i, '');
}

/**
 * 국내 주식 현재가 조회 (KOSPI/KOSDAQ)
 */
export async function getStockPrice(ticker: string): Promise<KisStockPrice> {
  const cacheKey = ticker;
  const now = Date.now();
  const CACHE_TTL = 60 * 1000; // 1분 캐시

  // 캐시 확인
  const cached = priceCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.data;
  }

  // API 호출
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
    const errorText = await response.text();
    console.error(`[KIS] Stock price request failed for ${ticker}:`, response.status, errorText);
    throw new Error(`Failed to get stock price: ${response.statusText}`);
  }

  const data = await response.json();
  const output = data.output;

  const price: KisStockPrice = {
    ticker,
    currentPrice: parseInt(output.stck_prpr),
    previousClose: parseInt(output.stck_sdpr),
    changeRate: parseFloat(output.prdy_ctrt),
    volume: parseInt(output.acml_vol),
    timestamp: now,
  };

  // 캐싱
  priceCache.set(cacheKey, {
    data: price,
    expires: now + CACHE_TTL,
  });

  return price;
}

/**
 * 여러 주식 현재가 일괄 조회
 */
export async function getBatchStockPrices(
  tickers: string[]
): Promise<Map<string, KisStockPrice>> {
  const results = new Map<string, KisStockPrice>();

  // 병렬로 조회하되, 에러는 무시
  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        const price = await getStockPrice(ticker);
        results.set(ticker, price);
      } catch (error) {
        console.error(`Failed to get price for ${ticker}:`, error);
      }
    })
  );

  return results;
}