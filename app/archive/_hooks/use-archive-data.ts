import { useMemo } from 'react';
import archiveData from '@/app/data/archives.json';
import type { NewsletterArchive, DateString } from '../_types/archive.types';

interface UseArchiveDataReturn {
  newsletter: NewsletterArchive | null;
  availableDates: DateString[];
  allNewsletters: NewsletterArchive[];
}

/**
 * 정적 JSON 파일에서 아카이브 데이터 조회 (S++ 엔터프라이즈급)
 *
 * 기능:
 * - 정적 JSON import로 초고속 로딩
 * - 빌드 타임에 데이터 번들링
 * - 타입 안전성 보장
 * - 클라이언트 캐싱 불필요 (정적 파일)
 *
 * @param selectedDate - YYYY-MM-DD 형식의 날짜 문자열 (또는 null)
 * @returns 뉴스레터 데이터, 사용 가능한 날짜, 전체 뉴스레터 목록
 */
function useArchiveData(selectedDate: DateString | null): UseArchiveDataReturn {
  // 타입 캐스팅: JSON import는 타입 추론이 완벽하지 않을 수 있음
  const newsletters = archiveData.newsletters as NewsletterArchive[];

  // 사용 가능한 날짜 목록 추출
  const availableDates = useMemo(
    () => newsletters.map((n) => n.date),
    [newsletters]
  );

  // 선택된 날짜에 해당하는 뉴스레터 찾기
  const newsletter = useMemo(() => {
    if (!selectedDate) return null;
    return newsletters.find((n) => n.date === selectedDate) || null;
  }, [selectedDate, newsletters]);

  return {
    newsletter,
    availableDates,
    allNewsletters: newsletters,
  };
}

export default useArchiveData;