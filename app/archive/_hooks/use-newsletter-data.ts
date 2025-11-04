/**
 * 뉴스레터 데이터 관리 훅
 *
 * 선택된 날짜의 뉴스레터와 티커 목록을 제공합니다.
 */

import { useMemo } from 'react';
import type { Newsletter, DateString } from '../_types/archive.types';

interface UseNewsletterDataResult {
  /** 선택된 날짜의 뉴스레터 */
  newsletter: Newsletter | null;
  /** 뉴스레터의 모든 티커 */
  tickers: string[];
}

/**
 * 선택된 날짜의 뉴스레터 데이터 조회
 */
function useNewsletterData(
  selectedDate: DateString | null,
  allNewsletters: Newsletter[]
): UseNewsletterDataResult {
  // 선택된 날짜의 뉴스레터 찾기
  const newsletter = useMemo(() => {
    if (!selectedDate) return null;
    return allNewsletters.find((n) => n.date === selectedDate) || null;
  }, [selectedDate, allNewsletters]);

  // 뉴스레터의 모든 티커 추출
  const tickers = useMemo(() => {
    if (!newsletter) return [];
    return newsletter.stocks.map((stock) => stock.ticker);
  }, [newsletter]);

  return { newsletter, tickers };
}

export default useNewsletterData;