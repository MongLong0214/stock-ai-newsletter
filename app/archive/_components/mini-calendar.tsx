'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  formatDateString,
  getKoreanMonthNames,
  getKoreanDayNames,
} from '../_utils/date-formatting';
import type { DateString } from '../_types/archive.types';
import { DURATION, EASING } from '../_constants/animation';
import { useReducedMotion } from '../_hooks/use-reduced-motion';

interface MiniCalendarProps {
  year: number;
  month: number;
  selectedDate: DateString | null;
  availableDates: Set<DateString>;
  onDateSelect: (dateString: DateString) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

/**
 * 미니 캘린더 컴포넌트
 */
const MiniCalendar = memo(function MiniCalendar({
  year,
  month,
  selectedDate,
  availableDates,
  onDateSelect,
  onPrevMonth,
  onNextMonth,
}: MiniCalendarProps) {
  const shouldReduceMotion = useReducedMotion();
  const monthNames = getKoreanMonthNames();
  const dayNames = getKoreanDayNames();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // 캘린더 그리드 생성
  const calendarDays: (number | null)[] = [];

  // 첫날 이전의 빈 셀
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }

  // 월의 날짜들
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={shouldReduceMotion ? false : { opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASING.smooth }}
      className="
        rounded-2xl border border-emerald-500/20
        bg-slate-900/60 backdrop-blur-xl
        p-6 shadow-2xl
      "
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onPrevMonth}
          aria-label="이전 달"
          className="
            p-2 rounded-lg
            text-slate-400 hover:text-emerald-400
            hover:bg-emerald-500/10
            transition-all duration-200
            focus-visible:outline-none
          "
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>

        <h2 className="text-lg font-bold text-white font-mono">
          {year}년 {monthNames[month]}
        </h2>

        <button
          onClick={onNextMonth}
          aria-label="다음 달"
          className="
            p-2 rounded-lg
            text-slate-400 hover:text-emerald-400
            hover:bg-emerald-500/10
            transition-all duration-200
            focus-visible:outline-none
          "
        >
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* 요일 이름 - 그리드의 열 헤더 */}
      <div role="row" className="grid grid-cols-7 gap-2 mb-3">
        {dayNames.map((dayName, index) => (
          <div
            key={dayName}
            role="columnheader"
            className={`
              text-center text-xs font-mono uppercase tracking-wider
              ${index === 0 ? 'text-red-400' : index === 6 ? 'text-cyan-400' : 'text-slate-400'}
            `}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* 캘린더 그리드 - 접근성을 위한 ARIA grid 의미론 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${year}-${month}`}
          role="grid"
          aria-label={`${year}년 ${monthNames[month]} 캘린더`}
          initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95 }}
          transition={{ duration: DURATION.fast }}
          className="grid grid-cols-7 gap-3"
        >
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} role="gridcell" aria-hidden="true" />;
            }

            const dateString = formatDateString(year, month, day) as DateString;
            const hasData = availableDates.has(dateString);
            const isSelected = selectedDate === dateString;

            return (
              <motion.button
                key={dateString}
                role="gridcell"
                onClick={() => hasData && onDateSelect(dateString)}
                disabled={!hasData}
                tabIndex={hasData ? 0 : -1}
                whileHover={!shouldReduceMotion && hasData ? { scale: 1.05 } : undefined}
                whileTap={!shouldReduceMotion && hasData ? { scale: 0.95 } : undefined}
                className={`
                  relative aspect-square rounded-lg min-h-[36px]
                  text-xs font-mono tabular-nums
                  transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-emerald-500 focus-visible:ring-offset-2
                  focus-visible:ring-offset-slate-900

                  ${
                    isSelected
                      ? 'bg-emerald-500/20 text-white border-2 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                      : hasData
                      ? 'bg-emerald-500/5 text-slate-300 border border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40'
                      : 'bg-transparent text-slate-600 border border-transparent cursor-not-allowed'
                  }
                `}
                aria-label={`${year}년 ${month + 1}월 ${day}일${hasData ? ' (데이터 있음)' : ' (데이터 없음)'}`}
                aria-current={isSelected ? 'date' : undefined}
                aria-disabled={!hasData}
              >
                <span className="absolute inset-0 flex items-center justify-center">{day}</span>
              </motion.button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // React.memo 최적화를 위한 커스텀 비교
  return (
    prevProps.year === nextProps.year &&
    prevProps.month === nextProps.month &&
    prevProps.selectedDate === nextProps.selectedDate &&
    prevProps.availableDates.size === nextProps.availableDates.size
  );
});

export default MiniCalendar;