/**
 * 모바일 캘린더 토글
 *
 * 모바일 화면에서 캘린더를 열고 닫는 버튼과 드롭다운 캘린더를 표시합니다.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown } from 'lucide-react';
import MiniCalendar from './mini-calendar';
import type { DateString } from '../../_types/archive.types';
import { formatDisplayDate } from '../../_utils/formatting/date';
import { createFadeInUpVariant, STAGGER_DELAYS, EASE_OUT_EXPO, DURATION } from '../../_constants/animations';

interface MobileCalendarToggleProps {
  /** 캘린더 연도 */
  year: number;
  /** 캘린더 월 (0-11) */
  month: number;
  /** 선택된 날짜 */
  selectedDate: DateString | null;
  /** 뉴스레터가 있는 날짜 목록 */
  availableDates: Set<DateString>;
  /** 캘린더 열림 상태 */
  isCalendarOpen: boolean;
  /** 캘린더 버튼 ref */
  calendarButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** 캘린더 열기/닫기 토글 */
  onToggleCalendar: () => void;
  /** 날짜 선택 핸들러 */
  onDateSelect: (date: DateString) => void;
  /** 이전 달 핸들러 */
  onPrevMonth: () => void;
  /** 다음 달 핸들러 */
  onNextMonth: () => void;
}

function MobileCalendarToggle({
  year,
  month,
  selectedDate,
  availableDates,
  isCalendarOpen,
  calendarButtonRef,
  onToggleCalendar,
  onDateSelect,
  onPrevMonth,
  onNextMonth,
}: MobileCalendarToggleProps) {
  return (
    <motion.div
      {...createFadeInUpVariant(STAGGER_DELAYS.sidebar)}
      className="lg:hidden"
    >
      {/* 캘린더 토글 버튼 */}
      <button
        ref={calendarButtonRef}
        onClick={onToggleCalendar}
        aria-expanded={isCalendarOpen}
        aria-controls="mobile-calendar"
        aria-label={`캘린더 ${isCalendarOpen ? '닫기' : '열기'}`}
        className="flex w-full items-center justify-between rounded-xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-4 shadow-lg transition-all duration-300 hover:border-emerald-500/40 hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          <span className="font-semibold text-white">
            {formatDisplayDate(selectedDate)}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isCalendarOpen ? 180 : 0 }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT_EXPO }}
        >
          <ChevronDown className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </motion.div>
      </button>

      {/* 드롭다운 캘린더 */}
      <AnimatePresence>
        {isCalendarOpen && (
          <motion.div
            id="mobile-calendar"
            role="dialog"
            aria-modal="true"
            aria-label="캘린더"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT_EXPO }}
            className="mt-4 overflow-hidden"
          >
            <MiniCalendar
              year={year}
              month={month}
              selectedDate={selectedDate}
              availableDates={availableDates}
              onDateSelect={onDateSelect}
              onPrevMonth={onPrevMonth}
              onNextMonth={onNextMonth}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default MobileCalendarToggle;