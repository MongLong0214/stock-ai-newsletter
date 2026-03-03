/**
 * 분석 기록 엔트리 데이터 관리 훅
 *
 * 선택된 날짜의 엔트리와 티커 목록을 제공합니다.
 * React 19: useMemo 불필요 (자동 최적화)
 */

import type { ArchiveEntry, DateString } from '../_types/archive.types';

interface UseNewsletterDataResult {
  entry: ArchiveEntry | null;
  tickers: string[];
}

/**
 * 선택된 날짜의 분석 기록 엔트리 조회
 */
export default function useNewsletterData(
  selectedDate: DateString | null,
  allEntries: ArchiveEntry[]
): UseNewsletterDataResult {
  const entry = selectedDate
    ? allEntries.find((e) => e.date === selectedDate) ?? null
    : null;

  const tickers = entry?.type === 'stock'
    ? entry.stocks.map((stock) => stock.ticker)
    : [];

  return { entry, tickers };
}
