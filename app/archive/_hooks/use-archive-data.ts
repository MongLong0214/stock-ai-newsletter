import archiveData from '../_archive-data/archives.json';
import type { ArchiveEntry, DateString } from '../_types/archive.types';

type EntryType = 'stock' | 'crash_alert';

interface UseArchiveDataReturn {
  availableDates: DateString[];
  allEntries: ArchiveEntry[];
  dateTypeMap: Map<DateString, EntryType>;
}

/**
 * 정적 JSON 파일에서 분석 기록 데이터 조회
 *
 * - 정적 JSON import로 초고속 로딩
 * - 빌드 타임에 데이터 번들링
 * - React 19: useMemo 불필요 (자동 최적화)
 */
export default function useArchiveData(): UseArchiveDataReturn {
  const entries = archiveData.newsletters as ArchiveEntry[];

  const dateTypeMap = new Map<DateString, EntryType>();
  for (const entry of entries) {
    dateTypeMap.set(entry.date, entry.type ?? 'stock');
  }

  return {
    availableDates: entries.map((e) => e.date),
    allEntries: entries,
    dateTypeMap,
  };
}
