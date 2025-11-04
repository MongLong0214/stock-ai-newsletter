/**
 * 미니 캘린더 타입 정의
 */

import type { DateString } from '../../../_types/archive.types';

export interface MiniCalendarProps {
  /** 표시할 연도 (예: 2025) */
  year: number;
  /** 표시할 월 (0-11, 0=1월) */
  month: number;
  /** 현재 선택된 날짜 */
  selectedDate: DateString | null;
  /** 뉴스레터가 존재하는 날짜 목록 */
  availableDates: Set<DateString>;
  /** 날짜 선택 핸들러 */
  onDateSelect: (dateString: DateString) => void;
  /** 이전 달 이동 핸들러 */
  onPrevMonth: () => void;
  /** 다음 달 이동 핸들러 */
  onNextMonth: () => void;
}

export interface CalendarHeaderProps {
  year: number;
  monthName: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export interface DayNamesRowProps {
  dayNames: readonly string[];
}

export interface DateCellProps {
  day: number;
  year: number;
  month: number;
  dateString: DateString;
  hasData: boolean;
  isSelected: boolean;
  onSelect: (dateString: DateString) => void;
}

export interface CalendarGridProps {
  year: number;
  month: number;
  monthName: string;
  calendarDays: (number | null)[];
  selectedDate: DateString | null;
  availableDates: Set<DateString>;
  onDateSelect: (dateString: DateString) => void;
}