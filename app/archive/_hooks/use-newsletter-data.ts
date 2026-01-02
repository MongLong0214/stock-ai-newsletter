/**
 * 뉴스레터 데이터 관리 훅
 *
 * 선택된 날짜의 뉴스레터와 티커 목록을 제공합니다.
 * React 19: useMemo 불필요 (자동 최적화)
 */

import type { Newsletter, DateString } from '../_types/archive.types';

interface UseNewsletterDataResult {
  newsletter: Newsletter | null;
  tickers: string[];
}

/**
 * 선택된 날짜의 뉴스레터 데이터 조회
 */
export default function useNewsletterData(
  selectedDate: DateString | null,
  allNewsletters: Newsletter[]
): UseNewsletterDataResult {
  const newsletter = selectedDate
    ? allNewsletters.find((n) => n.date === selectedDate) ?? null
    : null;

  const tickers = newsletter?.stocks.map((stock) => stock.ticker) ?? [];

  return { newsletter, tickers };
}
