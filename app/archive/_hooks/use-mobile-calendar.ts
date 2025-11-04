/**
 * 모바일 캘린더 상태 관리 훅
 *
 * 모바일 캘린더 열림/닫힘 상태와 핸들러를 제공합니다.
 */

import { useState, useCallback, useRef } from 'react';

interface UseMobileCalendarResult {
  /** 캘린더 열림 상태 */
  isCalendarOpen: boolean;
  /** 캘린더 버튼 ref */
  calendarButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** 캘린더 열기/닫기 토글 */
  toggleCalendar: () => void;
  /** 캘린더 닫기 */
  closeCalendar: () => void;
}

/**
 * 모바일 캘린더 상태 관리
 */
function useMobileCalendar(): UseMobileCalendarResult {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);

  const toggleCalendar = useCallback(() => {
    setIsCalendarOpen((prev) => !prev);
  }, []);

  const closeCalendar = useCallback(() => {
    setIsCalendarOpen(false);
  }, []);

  return {
    isCalendarOpen,
    calendarButtonRef,
    toggleCalendar,
    closeCalendar,
  };
}

export default useMobileCalendar;