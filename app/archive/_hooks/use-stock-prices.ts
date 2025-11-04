import { useState, useEffect, useMemo } from 'react';
import { calculateBusinessDays, MAX_BUSINESS_DAYS } from '../_utils/date-formatting';
import { getStockPriceCacheExpiry } from '../_utils/market-hours';
import { getBatchPricesFromCache, saveBatchPricesToCache } from '../_utils/stock-price-cache';
import type { StockPriceCache } from '../_utils/stock-price-cache-types';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 티커 배열 안정화 (불필요한 재실행 방지)
  const tickersKey = useMemo(() => tickers.join(','), [tickers]);

  useEffect(() => {
    // 티커가 없으면 즉시 종료
    if (tickers.length === 0) {
      setLoading(false);
      return;
    }

    // 뉴스레터 날짜가 없으면 즉시 종료
    if (!newsletterDate) {
      setLoading(false);
      return;
    }

    // 영업일 체크: 추천일로부터 MAX_BUSINESS_DAYS 이내인지 확인
    const recommendDate = new Date(newsletterDate);
    recommendDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const businessDays = calculateBusinessDays(recommendDate, today);

    if (businessDays > MAX_BUSINESS_DAYS) {
      // 영업일이 지났으면 API 호출하지 않음
      setLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    async function fetchPrices() {
      try {
        setLoading(true);
        setError(null);

        const results = new Map<string, StockPrice>();

        // Supabase 캐시 조회
        const cached = await getBatchPricesFromCache(tickers);
        const apiTickers: string[] = [];

        tickers.forEach((ticker) => {
          const cachedPrice = cached.get(ticker);
          if (cachedPrice) {
            results.set(ticker, {
              ticker: cachedPrice.ticker,
              currentPrice: cachedPrice.currentPrice,
              previousClose: cachedPrice.previousClose,
              changeRate: cachedPrice.changeRate,
              volume: cachedPrice.volume,
              timestamp: cachedPrice.timestamp,
            });
          } else {
            apiTickers.push(ticker);
          }
        });

        // 전부 캐시 히트
        if (apiTickers.length === 0) {
          if (isMounted) {
            setPrices(results);
            setLoading(false);
          }
          return;
        }

        // API 호출
        const response = await fetch(`/api/stock/price?tickers=${apiTickers.join(',')}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch stock prices');
        }

        const data: unknown = await response.json();
        if (!isValidAPIResponse(data)) {
          throw new Error('Invalid API response');
        }

        // 결과 처리 및 캐싱
        const expiresAt = getStockPriceCacheExpiry();
        const cachePrices: StockPriceCache[] = [];

        Object.values(data.prices).forEach((price) => {
          if (!isValidStockPrice(price)) return;

          results.set(price.ticker, price);
          cachePrices.push({ ...price, expires_at: expiresAt });
        });

        saveBatchPricesToCache(cachePrices).catch(() => {});

        if (isMounted) {
          setPrices(results);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;

        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchPrices();

    return () => {
      isMounted = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsletterDate, tickersKey]);
  // Note: 'tickers' 배열 대신 'tickersKey' 문자열 사용으로 불필요한 재실행 방지
  // tickers 배열이 변경되면 tickersKey도 변경되므로 의존성 배열에서 제외

  return { prices, loading, error };
}