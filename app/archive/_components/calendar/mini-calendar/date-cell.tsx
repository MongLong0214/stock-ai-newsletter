/**
 * 날짜 셀 (개별 날짜 버튼)
 */

'use client';

import { motion } from 'framer-motion';
import { getDateCellClassName } from './utils';
import type { DateCellProps } from './types';

function DateCell({ day, year, month, dateString, hasData, isSelected, isHoliday, onSelect }: DateCellProps) {
  const isDisabled = isHoliday || !hasData;

  const handleClick = () => {
    if (!isDisabled) {
      onSelect(dateString);
    }
  };

  return (
    <motion.button
      type="button"
      role="gridcell"
      onClick={handleClick}
      disabled={isDisabled}
      tabIndex={isDisabled ? -1 : 0}
      whileHover={!isDisabled ? { scale: 1.05 } : undefined}
      whileTap={!isDisabled ? { scale: 0.95 } : undefined}
      className={getDateCellClassName(isSelected, hasData, isHoliday)}
      aria-label={`${year}년 ${month + 1}월 ${day}일${isHoliday ? ' (휴장일)' : hasData ? ' (데이터 있음)' : ' (데이터 없음)'}`}
      aria-current={isSelected ? 'date' : undefined}
      aria-disabled={isDisabled}
    >
      <span className="absolute inset-0 flex items-center justify-center">{day}</span>
    </motion.button>
  );
}

export default DateCell;