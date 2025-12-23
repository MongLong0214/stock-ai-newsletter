import { useState, useEffect, useMemo } from 'react';
import { calculateBusinessDays, MAX_BUSINESS_DAYS } from '../_utils/formatting/date';
import { getStockPriceCacheExpiry } from '../_utils/market/hours';
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

/** 훅 반환 타입 */
interface UseStockPricesResult {
  prices: Map<string, StockPrice>;
  historicalClosePrices: Map<string, number>;
  loading: boolean;
  error: string | null;
}


/**
 * 주식 가격 데이터 타입 가드
 */
function isValidStockPrice(data: unknown): data is StockPrice {
  if (!data || typeof data !== 'object') return false;

  const price = data as Record<string, unknown>;

  return (
    typeof price.ticker === 'string' &&
    typeof price.currentPrice === 'number' &&
    typeof price.previousClose === 'number' &&
    typeof price.changeRate === 'number' &&
    typeof price.volume === 'number' &&
    typeof price.timestamp === 'number' &&
    price.currentPrice > 0 &&
    price.previousClose > 0
  );
}

/**
 * API 응답 타입 가드
 */
function isValidAPIResponse(data: unknown): data is { success: true; prices: Record<string, unknown> } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    data.success === true &&
    'prices' in data &&
    typeof data.prices === 'object' &&
    data.prices !== null
  );
}

/** 추천일 전 영업일 (YYYYMMDD) */
function getPreviousBusinessDate(s: string): string {
  const d = new Date(s);
  d.setDate(d.getDate() - (d.getDay() === 1 ? 3 : 1));
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 실시간 주식 시세 조회 훅 (2-tier 캐싱)
 *
 * 캐싱 전략:
 * 1. Supabase 캐시 (세션 간 공유, ~50ms)
 * 2. KIS API 호출 (캐시 미스 시)
 *
 * 시장 개장 시간 기반 TTL:
 * - 장 중: 1분 캐시
 * - 장 마감 후: 다음 영업일 09:00까지
 *
 * @param tickers - 조회할 주식 티커 배열 (부모 컴포넌트에서 useMemo로 memoize 권장)
 * @param newsletterDate - 뉴스레터 발행 날짜
 */
export default function useStockPrices(
  tickers: string[],
  newsletterDate: DateString | null
): UseStockPricesResult {
  const [prices, setPrices] = useState<Map<string, StockPrice>>(new Map());
  const [historicalClosePrices, setHistoricalClosePrices] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 티커 배열 안정화 (불필요한 재실행 방지)
  const tickersKey = useMemo(() => tickers.join(','), [tickers]);

  useEffect(() => {
    if (tickers.length === 0 || !newsletterDate) {
      setLoading(false);
      return;
    }

    // 영업일 체크: 추천일로부터 MAX_BUSINESS_DAYS 이내인지 확인
    const recommendDate = new Date(newsletterDate);
    recommendDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shouldFetchCurrentPrices = calculateBusinessDays(recommendDate, today) <= MAX_BUSINESS_DAYS;

    let isMounted = true;
    const controller = new AbortController();

    async function fetchPrices() {
      try {
        setLoading(true);
        setError(null);

        // 추천일 전일 종가 조회 (항상 실행)
        const prevDate = getPreviousBusinessDate(newsletterDate);
        const historicalResponse = await fetch(
          `/api/stock/daily-close?tickers=${tickers.join(',')}&date=${prevDate}`,
          { signal: controller.signal }
        );
        if (historicalResponse.ok) {
          const histData = await historicalResponse.json();
          if (histData.success && histData.prices && isMounted) {
            setHistoricalClosePrices(new Map(Object.entries(histData.prices) as [string, number][]));
          }
        }

        // 현재가는 MAX_BUSINESS_DAYS 이내일 때만 조회
        if (!shouldFetchCurrentPrices) {
          if (isMounted) setLoading(false);
          return;
        }

        const results = new Map<string, StockPrice>();
        const cached = await getBatchPricesFromCache(tickers);
        const apiTickers: string[] = [];

        tickers.forEach((ticker) => {
          const cachedPrice = cached.get(ticker);
          if (cachedPrice) {
            results.set(ticker, cachedPrice);
          } else {
            apiTickers.push(ticker);
          }
        });

        if (apiTickers.length === 0) {
          if (isMounted) {
            setPrices(results);
            setLoading(false);
          }
          return;
        }

        const response = await fetch(`/api/stock/price?tickers=${apiTickers.join(',')}`, {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('Failed to fetch stock prices');

        const data: unknown = await response.json();
        if (!isValidAPIResponse(data)) throw new Error('Invalid API response');

        const expiresAt = getStockPriceCacheExpiry();
        const cachePrices: StockPriceCache[] = [];

        Object.values(data.prices).forEach((price) => {
          if (!isValidStockPrice(price)) return;
          results.set(price.ticker, price);
          cachePrices.push({ ...price, expires_at: expiresAt });
        });

        saveBatchPricesToCache(cachePrices).catch(() => {});
        if (isMounted) setPrices(results);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (isMounted) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchPrices();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [newsletterDate, tickersKey]); // tickers는 tickersKey에서 파생되므로 제외

  return { prices, historicalClosePrices, loading, error };
}