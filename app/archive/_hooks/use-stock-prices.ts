import { useState, useEffect, useRef } from 'react';
import { MAX_BUSINESS_DAYS } from '../_utils/formatting/date';
import {
  getPreviousBusinessDate,
  getNthBusinessDateAfter,
  calculateBusinessDays,
  isTodayMarketClosed,
} from '../_utils/market/hours';
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
export type PriceUnavailableReason = 'api_error';

/** 훅 반환 타입 */
interface UseStockPricesResult {
  prices: Map<string, StockPrice>;
  historicalClosePrices: Map<string, number>;
  settledClosePrices: Map<string, number>;
  loading: boolean;
  unavailableReason: PriceUnavailableReason | null;
  isMarketClosed: boolean;
  isTrackingExpired: boolean;
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

      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }

      lastError = new Error(`Server error: ${response.status}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error('Unknown error');
    }

    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('Failed after retries');
}

function isTrackingPeriodExpired(newsletterDate: DateString): boolean {
  const recommendDate = new Date(newsletterDate);
  recommendDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const businessDays = calculateBusinessDays(recommendDate, today);
  return businessDays > MAX_BUSINESS_DAYS;
}

/**
 * 실시간 주식 시세 조회 훅
 *
 * All price data is fetched from /api/stock/price (authoritative, server-cached).
 * No direct Supabase/cache access from the client.
 */
export default function useStockPrices(
  tickers: string[],
  newsletterDate: DateString | null
): UseStockPricesResult {
  const [prices, setPrices] = useState<Map<string, StockPrice>>(new Map());
  const [historicalClosePrices, setHistoricalClosePrices] = useState<Map<string, number>>(new Map());
  const [settledClosePrices, setSettledClosePrices] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<PriceUnavailableReason | null>(null);
  const [isMarketClosed, setIsMarketClosed] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const tickersKey = tickers.join(',');

  const prevDepsRef = useRef(`${newsletterDate}:${tickersKey}`);
  const currentDeps = `${newsletterDate}:${tickersKey}`;

  if (currentDeps !== prevDepsRef.current) {
    prevDepsRef.current = currentDeps;
    if (tickers.length > 0 && newsletterDate) {
      setLoading(true);
      setUnavailableReason(null);
    }
  }

  useEffect(() => {
    if (tickers.length === 0 || !newsletterDate) {
      setLoading(false);
      return;
    }

    const currentDate = newsletterDate;
    let isMounted = true;
    const controller = new AbortController();

    async function fetchPrices() {
      try {
        setLoading(true);
        setUnavailableReason(null);
        setIsMarketClosed(isTodayMarketClosed());
        setIsExpired(false);
        setSettledClosePrices(new Map());
        setPrices(new Map());

        // Historical close price (non-critical)
        const prevDate = getPreviousBusinessDate(currentDate);
        try {
          const historicalRes = await fetchWithRetry(
            `/api/stock/daily-close?tickers=${tickersKey}&date=${prevDate}`,
            { signal: controller.signal },
            2,
            300
          );
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
        } catch (histErr) {
          if (histErr instanceof Error && histErr.name === 'AbortError') throw histErr;
          if (histErr instanceof DOMException && histErr.name === 'AbortError') throw histErr;
        }

        // Tracking period expired: fetch settled close
        const expired = isTrackingPeriodExpired(currentDate);
        if (expired) {
          if (isMounted) setIsExpired(true);

          const settledDate = getNthBusinessDateAfter(currentDate, MAX_BUSINESS_DAYS);
          try {
            const settledRes = await fetchWithRetry(
              `/api/stock/daily-close?tickers=${tickersKey}&date=${settledDate}`,
              { signal: controller.signal },
              2,
              300
            );
            const settledData: unknown = await settledRes.json();
            if (isHistoricalPriceAPIResponse(settledData) && isMounted) {
              const priceMap = new Map<string, number>();
              for (const [ticker, price] of Object.entries(settledData.prices)) {
                if (typeof price === 'number' && price > 0) {
                  priceMap.set(ticker, price);
                }
              }
              setSettledClosePrices(priceMap);
            }
          } catch (settledErr) {
            if (settledErr instanceof Error && settledErr.name === 'AbortError') return;
            if (settledErr instanceof DOMException && settledErr.name === 'AbortError') return;
            if (isMounted) setUnavailableReason('api_error');
          }

          if (isMounted) setLoading(false);
          return;
        }

        // Fetch current prices from /api/stock/price (server handles caching)
        const response = await fetchWithRetry(
          `/api/stock/price?tickers=${tickersKey}`,
          { signal: controller.signal },
          3,
          300
        );

        const data: unknown = await response.json();
        if (!isStockPriceAPIResponse(data)) throw new Error('Invalid API response');

        const results = new Map<string, StockPrice>();
        for (const price of Object.values(data.prices)) {
          if (isStockPrice(price)) {
            results.set(price.ticker, price);
          }
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsletterDate, tickersKey]);

  return {
    prices,
    historicalClosePrices,
    settledClosePrices,
    loading,
    unavailableReason,
    isMarketClosed,
    isTrackingExpired: isExpired,
  };
}
