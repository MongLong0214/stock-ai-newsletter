/**
 * 캘린더 키보드 단축키 관리 훅
 *
 * Cmd/Ctrl + ← : 이전 달
 * Cmd/Ctrl + → : 다음 달
 * Esc : 캘린더 닫기
 */

import { useEffect } from 'react';

interface UseKeyboardShortcutsProps {
  /** 캘린더 열림 상태 */
  isCalendarOpen: boolean;
  /** 캘린더 닫기 핸들러 */
  onCloseCalendar: () => void;
  /** 이전 달로 이동 */
  onPrevMonth: () => void;
  /** 다음 달로 이동 */
  onNextMonth: () => void;
  /** 캘린더 버튼 ref (포커스 복원용) */
  calendarButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

function useKeyboardShortcuts({
  isCalendarOpen,
  onCloseCalendar,
  onPrevMonth,
  onNextMonth,
  calendarButtonRef,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + 좌우 화살표: 월 이동
      if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onPrevMonth();
      }
      if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onNextMonth();
      }

      // Esc: 캘린더 닫기
      if (e.key === 'Escape' && isCalendarOpen) {
        e.preventDefault();
        onCloseCalendar();
        calendarButtonRef?.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCalendarOpen, onCloseCalendar, onPrevMonth, onNextMonth, calendarButtonRef]);
}

export default useKeyboardShortcuts;