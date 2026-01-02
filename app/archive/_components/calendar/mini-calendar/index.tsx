/**
 * 미니 캘린더 컴포넌트
 *
 * 월별 캘린더를 표시하고 날짜 선택 기능을 제공합니다.
 * - 뉴스레터가 있는 날짜만 선택 가능
 * - 선택된 날짜 시각적 강조
 * - 월 간 네비게이션 지원
 */

'use client';

import { motion } from 'framer-motion';
import { getKoreanMonthNames, getKoreanDayNames } from '../../../_utils/formatting/date';
import { DURATION, EASE_OUT_EXPO } from '../../../_constants/animations';
import { buildCalendarGrid } from './utils';
import CalendarHeader from './calendar-header';
import DayNamesRow from './day-names-row';
import CalendarGrid from './calendar-grid';
import type { MiniCalendarProps } from './types';

/**
 * 미니 캘린더 - 월별 날짜 선택 UI
 */
export default function MiniCalendar({
  year,
  month,
  selectedDate,
  availableDates,
  onDateSelect,
  onPrevMonth,
  onNextMonth,
}: MiniCalendarProps) {
  // 한국어 월/요일 이름
  const monthNames = getKoreanMonthNames();
  const dayNames = getKoreanDayNames();

  // 캘린더 그리드 데이터 생성
  const calendarDays = buildCalendarGrid(year, month);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT_EXPO }}
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 shadow-2xl"
    >
      <CalendarHeader
        year={year}
        monthName={monthNames[month]}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
      />

      <DayNamesRow dayNames={dayNames} />

      <CalendarGrid
        year={year}
        month={month}
        monthName={monthNames[month]}
        calendarDays={calendarDays}
        selectedDate={selectedDate}
        availableDates={availableDates}
        onDateSelect={onDateSelect}
      />
    </motion.div>
  );
}
