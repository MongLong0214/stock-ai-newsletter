import { useState, useEffect } from 'react';
import { MAX_BUSINESS_DAYS } from '../_utils/formatting/date';
import {
  getStockPriceCacheExpiry,
  getPreviousBusinessDate,
  calculateBusinessDays,
  isTodayMarketClosed,
} from '../_utils/market/hours';
import { getBatchPricesFromCache, saveBatchPricesToCache } from '../_utils/cache/stock-price';
import type { StockPriceCache } from '../_utils/cache/types';
import type { DateString } from '../_types/archive.types';

/** 주식 가격 정보 */
interface StockPrice {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  changeRate: number;
  volume: number;
  timestamp: number;
}

/** 가격 조회 불가 사유 */
export type PriceUnavailableReason =
  | 'tracking_expired' // 7영업일 경과
  | 'api_error'; // API 호출 실패

/** 훅 반환 타입 */
interface UseStockPricesResult {
  prices: Map<string, StockPrice>;
  historicalClosePrices: Map<string, number>;
  loading: boolean;
  unavailableReason: PriceUnavailableReason | null;
  /** 오늘이 휴장일인지 여부 (직전 개장일 종가 표시용) */
  isMarketClosed: boolean;
}

/** API 응답 타입 */
interface StockPriceAPIResponse {
  success: boolean;
  prices: Record<string, StockPrice>;
}

/** 과거 종가 API 응답 타입 */
interface HistoricalPriceAPIResponse {
  success: boolean;
  prices: Record<string, number>;
}

function isStockPrice(data: unknown): data is StockPrice {
  if (!data || typeof data !== 'object') return false;
  const p = data as Record<string, unknown>;
  return (
    typeof p.ticker === 'string' &&
    typeof p.currentPrice === 'number' &&
    p.currentPrice > 0 &&
    typeof p.previousClose === 'number' &&
    p.previousClose > 0 &&
    typeof p.changeRate === 'number' &&
    typeof p.volume === 'number' &&
    typeof p.timestamp === 'number'
  );
}

function isStockPriceAPIResponse(data: unknown): data is StockPriceAPIResponse {
  if (!data || typeof data !== 'object') return false;
  const r = data as Record<string, unknown>;
  return r.success === true && typeof r.prices === 'object' && r.prices !== null;
}

function isHistoricalPriceAPIResponse(data: unknown): data is HistoricalPriceAPIResponse {
  if (!data || typeof data !== 'object') return false;
  const r = data as Record<string, unknown>;
  return r.success === true && typeof r.prices === 'object' && r.prices !== null;
}

/**
 * 현재가 조회 가능 여부 확인
 * @returns null (조회 가능) | 사유 (조회 불가)
 */
function checkPriceAvailability(newsletterDate: DateString): PriceUnavailableReason | null {
  const recommendDate = new Date(newsletterDate);
  recommendDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const businessDays = calculateBusinessDays(recommendDate, today);

  if (businessDays > MAX_BUSINESS_DAYS) {
    return 'tracking_expired';
  }

  return null;
}

/**
 * 실시간 주식 시세 조회 훅 (2-tier 캐싱)
 *
 * 캐싱 전략:
 * - Supabase 캐시 우선 조회 (~50ms)
 * - 캐시 미스 시 KIS API 호출
 *
 * TTL 전략:
 * - 장 중: 1분
 * - 장 마감 후: 다음 영업일 09:00까지
 */
export default function useStockPrices(
  tickers: string[],
  newsletterDate: DateString | null
): UseStockPricesResult {
  const [prices, setPrices] = useState<Map<string, StockPrice>>(new Map());
  const [historicalClosePrices, setHistoricalClosePrices] = useState<Map<string, number>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<PriceUnavailableReason | null>(null);
  const [isMarketClosed, setIsMarketClosed] = useState(false);

  // React 19: 단순 연산은 useMemo 불필요
  const tickersKey = tickers.join(',');

  useEffect(() => {
    if (tickers.length === 0 || !newsletterDate) {
      setLoading(false);
      return;
    }

    const currentDate = newsletterDate;
    let isMounted = true;
    const controller = new AbortController();

    // 재시도 로직을 포함한 fetch 함수
    async function fetchWithRetry(
      url: string,
      options: RequestInit,
      maxRetries = 3,
      baseDelay = 300
    ): Promise<Response> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(url, options);
          if (response.ok) return response;

          // 4xx 에러는 재시도하지 않음 (클라이언트 오류)
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`Client error: ${response.status}`);
          }

          // 5xx 에러는 재시도
          lastError = new Error(`Server error: ${response.status}`);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') throw err;
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
          lastError = err instanceof Error ? err : new Error('Unknown error');
        }

        // 마지막 시도가 아니면 대기 후 재시도
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // 지수 백오프: 300ms, 600ms, 1200ms
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      throw lastError ?? new Error('Failed after retries');
    }

    async function fetchPrices() {
      try {
        setLoading(true);
        setUnavailableReason(null);
        setIsMarketClosed(isTodayMarketClosed());

        // 추천일 전일 종가 조회 (항상 수행)
        const prevDate = getPreviousBusinessDate(currentDate);
        const historicalRes = await fetch(
          `/api/stock/daily-close?tickers=${tickersKey}&date=${prevDate}`,
          { signal: controller.signal }
        );

        if (historicalRes.ok) {
          const histData: unknown = await historicalRes.json();
          if (isHistoricalPriceAPIResponse(histData) && isMounted) {
            const priceMap = new Map<string, number>();
            for (const [ticker, price] of Object.entries(histData.prices)) {
              if (typeof price === 'number' && price > 0) {
                priceMap.set(ticker, price);
              }
            }
            setHistoricalClosePrices(priceMap);
          }
        }

        // 현재가 조회 가능 여부 확인
        const reason = checkPriceAvailability(currentDate);
        if (reason) {
          if (isMounted) {
            setUnavailableReason(reason);
            setLoading(false);
          }
          return;
        }

        // 캐시 조회
        const results = new Map<string, StockPrice>();
        const cached = await getBatchPricesFromCache(tickers);
        const uncachedTickers: string[] = [];

        for (const ticker of tickers) {
          const cachedPrice = cached.get(ticker);
          if (cachedPrice) {
            results.set(ticker, cachedPrice);
          } else {
            uncachedTickers.push(ticker);
          }
        }

        // 모든 티커가 캐시에 있으면 종료
        if (uncachedTickers.length === 0) {
          if (isMounted) {
            setPrices(results);
            setLoading(false);
          }
          return;
        }

        // API 호출 (재시도 로직 적용)
        const response = await fetchWithRetry(
          `/api/stock/price?tickers=${uncachedTickers.join(',')}`,
          { signal: controller.signal },
          3,  // 최대 3회 재시도
          300 // 기본 대기 시간 300ms
        );

        const data: unknown = await response.json();
        if (!isStockPriceAPIResponse(data)) throw new Error('Invalid API response');

        const expiresAt = getStockPriceCacheExpiry();
        const cachePrices: StockPriceCache[] = [];

        for (const price of Object.values(data.prices)) {
          if (isStockPrice(price)) {
            results.set(price.ticker, price);
            cachePrices.push({ ...price, expires_at: expiresAt });
          }
        }

        saveBatchPricesToCache(cachePrices).catch(() => {});
        if (isMounted) setPrices(results);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (isMounted) setUnavailableReason('api_error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchPrices();

    return () => {
      isMounted = false;
      controller.abort();
    };
    // tickersKey가 tickers 내용을 대표하므로 tickers 배열 참조 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsletterDate, tickersKey]);

  return { prices, historicalClosePrices, loading, unavailableReason, isMarketClosed };
}