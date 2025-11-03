import { useState, useEffect } from 'react';
import { calculateBusinessDays, MAX_BUSINESS_DAYS } from '../_utils/date-formatting';
import type { DateString } from '../_types/archive.types';

interface StockPrice {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  changeRate: number;
  volume: number;
  timestamp: number;
}

interface UseStockPricesResult {
  prices: Map<string, StockPrice>;
  loading: boolean;
  error: string | null;
}

/**
 * 실시간 주식 시세 조회 훅
 *
 * 페이지 로드 시 한 번만 실행 (no polling, no auto-refresh)
 * 레이아웃 쉬프트 방지를 위한 최적화
 * 영업일 체크: 추천일로부터 MAX_BUSINESS_DAYS 이내만 API 호출
 */
export default function useStockPrices(
  tickers: string[],
  newsletterDate: DateString | null
): UseStockPricesResult {
  const [prices, setPrices] = useState<Map<string, StockPrice>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    // 시간 부분 제거하여 날짜만 비교 (타임존 이슈 방지)
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

        const tickersParam = encodeURIComponent(tickers.join(','));
        const response = await fetch(`/api/stock/price?tickers=${tickersParam}`, {
          signal: controller.signal,
          // 캐시 활용으로 중복 요청 방지
          cache: 'default',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.message || errorData.error || 'Failed to fetch stock prices';
          throw new Error(errorMessage);
        }

        const data = await response.json();

        // API 응답 검증
        if (!data.success || !data.prices) {
          throw new Error('Invalid API response format');
        }

        if (isMounted) {
          const pricesMap = new Map<string, StockPrice>();
          Object.entries(data.prices).forEach(([ticker, price]) => {
            pricesMap.set(ticker, price as StockPrice);
          });
          setPrices(pricesMap);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Abort는 무시 (컴포넌트 언마운트 시)
          return;
        }

        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          setError(errorMessage);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchPrices();

    // Cleanup: 컴포넌트 언마운트 시 요청 취소
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [newsletterDate, tickers]); // 티커 배열 또는 뉴스레터 날짜가 변경될 때 재실행

  return { prices, loading, error };
}