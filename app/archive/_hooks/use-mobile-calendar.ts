/**
 * 모바일 캘린더 상태 관리 훅
 *
 * 모바일 캘린더 열림/닫힘 상태와 핸들러를 제공합니다.
 * React 19 자동 최적화로 useCallback 불필요
 */

import { useState, useRef } from 'react';

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
export default function useMobileCalendar(): UseMobileCalendarResult {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);

  function toggleCalendar() {
    setIsCalendarOpen((prev) => !prev);
  }

  function closeCalendar() {
    setIsCalendarOpen(false);
  }

  return {
    isCalendarOpen,
    calendarButtonRef,
    toggleCalendar,
    closeCalendar,
  };
}