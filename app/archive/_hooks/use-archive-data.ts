import archiveData from '../_archive-data/archives.json';
import type { ArchiveEntry, StockArchiveEntry, DateString } from '../_types/archive.types';

type EntryType = 'stock' | 'crash_alert';

/** JSON에서 읽은 raw 엔트리 (기존 데이터는 type 필드 없음) */
type RawEntry = ArchiveEntry | Omit<StockArchiveEntry, 'type'>;

interface UseArchiveDataReturn {
  availableDates: DateString[];
  allEntries: ArchiveEntry[];
  dateTypeMap: Map<DateString, EntryType>;
}

/** raw JSON 엔트리를 정규화 (type 없는 기존 stock 데이터 → type: 'stock' 부여) */
function normalizeEntry(raw: RawEntry): ArchiveEntry {
  if ('type' in raw) return raw as ArchiveEntry;
  return { ...raw, type: 'stock' as const };
}

/**
 * 정적 JSON 파일에서 분석 기록 데이터 조회
 *
 * - 정적 JSON import로 초고속 로딩
 * - 빌드 타임에 데이터 번들링
 * - React 19: useMemo 불필요 (자동 최적화)
 */
export default function useArchiveData(): UseArchiveDataReturn {
  const rawEntries = archiveData.newsletters as RawEntry[];
  const entries = rawEntries.map(normalizeEntry);

  const dateTypeMap = new Map<DateString, EntryType>();
  for (const entry of entries) {
    dateTypeMap.set(entry.date, entry.type);
  }

  return {
    availableDates: entries.map((e) => e.date),
    allEntries: entries,
    dateTypeMap,
  };
}
