/**
 * 캘린더 상태 관리 훅
 *
 * 캘린더 연도/월 상태와 월 이동 기능을 제공합니다.
 * React 19 자동 최적화로 useCallback 불필요
 */

import { useState, useCallback } from 'react';
import type { DateString } from '../_types/archive.types';

interface CalendarState {
  year: number;
  month: number;
}

interface UseCalendarStateResult {
  /** 캘린더 상태 (연도, 월) */
  calendarState: CalendarState;
  /** 이전 달로 이동 */
  handlePrevMonth: () => void;
  /** 다음 달로 이동 */
  handleNextMonth: () => void;
  /** 특정 날짜로 캘린더 이동 */
  navigateToDate: (date: DateString) => void;
}

/**
 * 초기 날짜로 캘린더 상태 초기화
 */
function getInitialCalendarState(initialDate: DateString | null): CalendarState {
  const date = initialDate ? new Date(initialDate) : new Date();
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  };
}

/**
 * 캘린더 상태 관리 훅
 */
export default function useCalendarState(initialDate: DateString | null): UseCalendarStateResult {
  const [calendarState, setCalendarState] = useState<CalendarState>(() =>
    getInitialCalendarState(initialDate)
  );

  /** 이전 달로 이동 */
  function handlePrevMonth() {
    setCalendarState((prev) => ({
      year: prev.month === 0 ? prev.year - 1 : prev.year,
      month: prev.month === 0 ? 11 : prev.month - 1,
    }));
  }

  /** 다음 달로 이동 */
  function handleNextMonth() {
    setCalendarState((prev) => ({
      year: prev.month === 11 ? prev.year + 1 : prev.year,
      month: prev.month === 11 ? 0 : prev.month + 1,
    }));
  }

  /** 특정 날짜로 캘린더 이동 (useEffect 의존성 안정성을 위해 useCallback 사용) */
  const navigateToDate = useCallback((date: DateString) => {
    const parsed = new Date(date);
    setCalendarState({
      year: parsed.getFullYear(),
      month: parsed.getMonth(),
    });
  }, []);

  return {
    calendarState,
    handlePrevMonth,
    handleNextMonth,
    navigateToDate,
  };
}