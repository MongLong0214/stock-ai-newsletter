import archiveData from '../_archive-data/archives.json';
import type { NewsletterArchive, DateString } from '../_types/archive.types';

interface UseArchiveDataReturn {
  availableDates: DateString[];
  allNewsletters: NewsletterArchive[];
}

/**
 * 정적 JSON 파일에서 아카이브 데이터 조회
 *
 * - 정적 JSON import로 초고속 로딩
 * - 빌드 타임에 데이터 번들링
 * - React 19: useMemo 불필요 (자동 최적화)
 */
export default function useArchiveData(): UseArchiveDataReturn {
  const newsletters = archiveData.newsletters as NewsletterArchive[];

  return {
    availableDates: newsletters.map((n) => n.date),
    allNewsletters: newsletters,
  };
}
