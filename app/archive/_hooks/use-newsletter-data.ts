import { useState, useEffect, useMemo } from 'react';
import type { NewsletterArchive, DateString } from '../_types/archive.types';
import { isValidDateFormat } from '../_utils/date-formatting';

interface UseNewsletterDataReturn {
  newsletter: NewsletterArchive | null;
  isLoading: boolean;
  error: string | null;
  availableDates: DateString[];
}

/**
 * 뉴스레터 아카이브 데이터 훅 (S++ 엔터프라이즈급 ISR 및 타입 안전성)
 *
 * 기능:
 * - ISR 캐시 API 라우트 (24시간 재검증)
 * - 브랜드 타입 안전성 (DateString 타입 가드)
 * - 안전한 날짜 검증 (SQL 인젝션 방지)
 * - 경쟁 상태 방지 (AbortController)
 * - 타입화된 응답을 통한 포괄적인 에러 처리
 * - 일일 캐시 최적화 (Next.js ISR을 통한 오전 8시 KST 새로고침)
 * - 브라우저 캐시를 통한 클라이언트 측 캐싱
 *
 * @param selectedDate - YYYY-MM-DD 형식의 날짜 문자열 (또는 null)
 * @returns 뉴스레터 데이터, 로딩 상태, 에러 상태 및 사용 가능한 날짜
 */
function useNewsletterData(selectedDate: DateString | null): UseNewsletterDataReturn {
  const [newsletter, setNewsletter] = useState<NewsletterArchive | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<DateString[]>([]);

  // 마운트 시 사용 가능한 날짜 가져오기 (ISR 캐시, 24시간 재검증)
  useEffect(() => {
    async function fetchAvailableDates() {
      try {
        const response = await fetch('/api/newsletter/available-dates', {
          // 브라우저 캐시 + Next.js ISR 캐시 활용
          cache: 'force-cache',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch available dates');
        }

        const { dates } = await response.json();
        setAvailableDates(dates ?? []);
      } catch (err) {
        console.error('[Archive] Failed to fetch available dates:', err);
        setAvailableDates([]);
      }
    }

    fetchAvailableDates();
  }, []);

  // 날짜가 선택되었을 때 뉴스레터 콘텐츠 가져오기 (ISR 캐시 API)
  useEffect(() => {
    // 검증: 날짜가 제공되었는지 확인
    if (!selectedDate) {
      setNewsletter(null);
      setError(null);
      return;
    }

    // 보안: SQL 인젝션 방지 - 날짜 형식 검증
    if (!isValidDateFormat(selectedDate)) {
      setError('잘못된 날짜 형식입니다.');
      setNewsletter(null);
      return;
    }

    // 경쟁 상태 방지: AbortController
    const abortController = new AbortController();
    let isMounted = true;

    async function fetchNewsletter() {
      if (!isMounted) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/newsletter/${selectedDate}`, {
          signal: abortController.signal,
          // 브라우저 캐시 + Next.js ISR 캐시 활용
          cache: 'force-cache',
        });

        // 요청이 중단되었는지 확인
        if (abortController.signal.aborted) return;

        if (!response.ok) {
          // 서버에서 반환한 에러 메시지를 읽어서 표시
          let errorMessage = `HTTP ${response.status}: `;
          try {
            const errorData = await response.json();
            errorMessage += errorData.error || response.statusText;
          } catch {
            errorMessage += response.statusText || '알 수 없는 오류';
          }

          setError(errorMessage);
          setNewsletter(null);
          setIsLoading(false);
          return;
        }

        const { newsletter: data } = await response.json();

        if (!data) {
          setError('데이터 형식이 올바르지 않습니다.');
          setNewsletter(null);
          setIsLoading(false);
          return;
        }

        // 데이터 및 로딩 상태를 원자적으로 설정
        setNewsletter(data);
        setIsLoading(false);
      } catch (err) {
        // 중단 에러 무시
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error('[Archive] Failed to fetch newsletter:', err);

        // 실제 에러 메시지 추출 및 표시
        let errorMessage = '뉴스레터를 불러오는데 실패했습니다.';
        if (err instanceof Error) {
          errorMessage += `\n\n[디버그 정보]\n에러: ${err.name}\n메시지: ${err.message}`;
          if (err.stack) {
            // 스택의 첫 몇 줄만 표시
            const stackLines = err.stack.split('\n').slice(0, 3).join('\n');
            errorMessage += `\n스택: ${stackLines}`;
          }
        } else {
          errorMessage += `\n\n[디버그 정보]\n알 수 없는 에러: ${String(err)}`;
        }

        setError(errorMessage);
        setNewsletter(null);
        setIsLoading(false);
      }
    }

    fetchNewsletter();

    // 정리: 대기 중인 요청 중단
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [selectedDate]);

  // 성능을 위해 반환 값 메모이제이션
  return useMemo(
    () => ({
      newsletter,
      isLoading,
      error,
      availableDates,
    }),
    [newsletter, isLoading, error, availableDates]
  );
}

export default useNewsletterData;
