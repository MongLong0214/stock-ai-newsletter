/**
 * 캘린더 헤더 (월 네비게이션)
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarHeaderProps } from './types';

function CalendarHeader({ year, monthName, onPrevMonth, onNextMonth }: CalendarHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <button
        type="button"
        onClick={onPrevMonth}
        aria-label="이전 달"
        className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
      </button>

      <h2 className="text-lg font-bold text-white font-mono">
        {year}년 {monthName}
      </h2>

      <button
        type="button"
        onClick={onNextMonth}
        aria-label="다음 달"
        className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <ChevronRight className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default CalendarHeader;