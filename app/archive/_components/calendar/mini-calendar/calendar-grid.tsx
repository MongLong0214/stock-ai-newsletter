/**
 * 캘린더 그리드 (날짜 셀 배열)
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { formatDateString } from '../../../_utils/formatting/date';
import type { DateString } from '../../../_types/archive.types';
import { DURATION } from '../../../_constants/animations';
import DateCell from './date-cell';
import type { CalendarGridProps } from './types';

function CalendarGrid({
  year,
  month,
  monthName,
  calendarDays,
  selectedDate,
  availableDates,
  onDateSelect,
}: CalendarGridProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${year}-${month}`}
        role="grid"
        aria-label={`${year}년 ${monthName} 캘린더`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: DURATION.fast }}
        className="grid grid-cols-7 gap-3"
      >
        {calendarDays.map((day, index) => {
          // 빈 셀 렌더링
          if (day === null) {
            return <div key={`empty-${index}`} role="gridcell" aria-hidden="true" />;
          }

          // 날짜 셀 데이터 계산
          const dateString = formatDateString(year, month, day) as DateString;
          const hasData = availableDates.has(dateString);
          const isSelected = selectedDate === dateString;

          return (
            <DateCell
              key={dateString}
              day={day}
              year={year}
              month={month}
              dateString={dateString}
              hasData={hasData}
              isSelected={isSelected}
              onSelect={onDateSelect}
            />
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}

export default CalendarGrid;