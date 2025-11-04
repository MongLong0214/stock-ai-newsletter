import { useState, useEffect, useMemo } from 'react';
import { LRUCache } from 'lru-cache';
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

/** 메모리 캐시 엔트리 */
interface CacheEntry {
  data: StockPrice;
  expires: number;
}

// 캐시 설정 상수
const CACHE_CONFIG = {
  MAX_ITEMS: 1000,
  MAX_SIZE_BYTES: 5_000_000, // 5MB
  DEFAULT_TTL_MS: 300_000, // 5분
} as const;

/**
 * LRU 메모리 캐시 (3-tier 캐싱의 첫 번째 계층)
 * - 최대 1000개 티커
 * - 5MB 크기 제한
 * - 자동 만료 및 LRU 기반 제거
 */
const memoryCache = new LRUCache<string, CacheEntry>({
  max: CACHE_CONFIG.MAX_ITEMS,
  maxSize: CACHE_CONFIG.MAX_SIZE_BYTES,
  sizeCalculation: (value) => JSON.stringify(value).length,
  ttl: CACHE_CONFIG.DEFAULT_TTL_MS,
  updateAgeOnGet: true, // 조회 시 TTL 갱신 (자주 사용되는 캐시 유지)
  updateAgeOnHas: false, // has() 호출 시 TTL 갱신 안함
});

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
 * Supabase 캐시를 StockPrice로 변환
 */
function mapCacheToStockPrice(cache: StockPriceCache): StockPrice {
  return {
    ticker: cache.ticker,
    currentPrice: cache.currentPrice,
    previousClose: cache.previousClose,
    changeRate: cache.changeRate,
    volume: cache.volume,
    timestamp: cache.timestamp,
  };
}

/**
 * 실시간 주식 시세 조회 훅 (3-tier 캐싱 적용)
 *
 * 캐싱 전략:
 * 1. 메모리 캐시 (가장 빠름, LRU 기반)
 * 2. Supabase 캐시 (세션 간 공유)
 * 3. API 호출 (최후의 수단)
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

    async function fetchPricesWithCache() {
      const apiTickers: string[] = [];

      try {
        setLoading(true);
        setError(null);

        const now = Date.now();
        const results = new Map<string, StockPrice>();
        const missingTickers: string[] = [];

        // 1단계: 메모리 캐시에서 조회
        tickers.forEach((ticker) => {
          const cached = memoryCache.get(ticker);
          if (cached && cached.expires > now) {
            results.set(ticker, cached.data);
          } else {
            missingTickers.push(ticker);
          }
        });

        // 모든 티커가 메모리 캐시에 있으면 즉시 반환
        if (missingTickers.length === 0) {
          if (isMounted) {
            setPrices(results);
            setLoading(false);
          }
          return;
        }

        // 2단계: Supabase 캐시에서 조회
        const supabaseCached = await getBatchPricesFromCache(missingTickers);

        missingTickers.forEach((ticker) => {
          const cached = supabaseCached.get(ticker);
          if (cached) {
            const price = mapCacheToStockPrice(cached);
            results.set(ticker, price);

            // 메모리 캐시에도 저장
            memoryCache.set(ticker, {
              data: price,
              expires: cached.expires_at,
            });
          } else {
            apiTickers.push(ticker);
          }
        });

        // 모든 티커를 캐시에서 찾았으면 반환
        if (apiTickers.length === 0) {
          if (isMounted) {
            setPrices(results);
            setLoading(false);
          }
          return;
        }

        // 3단계: API 호출
        const tickersParam = encodeURIComponent(apiTickers.join(','));
        const response = await fetch(`/api/stock/price?tickers=${tickersParam}`, {
          signal: controller.signal,
          cache: 'no-store', // 3-tier 캐싱 사용하므로 HTTP 캐시 비활성화
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          type ErrorResponse = { message?: string; error?: string };
          const errorResponse = errorData as ErrorResponse;
          const errorMessage =
            errorResponse.message || errorResponse.error || 'Failed to fetch stock prices';
          throw new Error(errorMessage);
        }

        const rawData: unknown = await response.json();

        if (!isValidAPIResponse(rawData)) {
          throw new Error('Invalid API response format');
        }

        // API 응답 처리 및 캐싱
        const expiresAt = getStockPriceCacheExpiry();
        const cachePrices: StockPriceCache[] = [];

        Object.entries(rawData.prices).forEach(([ticker, apiPrice]) => {
          if (!isValidStockPrice(apiPrice)) {
            console.warn(`[useStockPrices] Invalid price data for ${ticker}`, apiPrice);
            return;
          }

          results.set(ticker, apiPrice);

          // 메모리 캐시에 저장
          memoryCache.set(ticker, {
            data: apiPrice,
            expires: expiresAt,
          });

          // Supabase 캐시용 데이터 준비
          cachePrices.push({
            ticker: apiPrice.ticker,
            currentPrice: apiPrice.currentPrice,
            previousClose: apiPrice.previousClose,
            changeRate: apiPrice.changeRate,
            volume: apiPrice.volume,
            timestamp: apiPrice.timestamp,
            expires_at: expiresAt,
          });
        });

        // Supabase에 비동기 저장 (실패해도 무시)
        saveBatchPricesToCache(cachePrices).catch((err) => {
          console.warn('[useStockPrices] Failed to save to Supabase cache:', err);
        });

        if (isMounted) {
          setPrices(results);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('[useStockPrices] Failed to fetch prices:', err);
          setError(errorMessage);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchPricesWithCache();

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