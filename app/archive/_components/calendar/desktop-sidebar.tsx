/**
 * 데스크톱 사이드바
 *
 * 캘린더와 선택된 뉴스레터 정보를 표시합니다.
 * sticky 포지셔닝으로 스크롤 시 화면 상단에 고정됩니다.
 */

import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import MiniCalendar from './mini-calendar';
import type { Newsletter, DateString } from '../../_types/archive.types';
import { formatDisplayDate } from '../../_utils/formatting/date';
import { createFadeInUpVariant, STAGGER_DELAYS } from '../../_constants/animations';

interface DesktopSidebarProps {
  /** 캘린더 연도 */
  year: number;
  /** 캘린더 월 (0-11) */
  month: number;
  /** 선택된 날짜 */
  selectedDate: DateString | null;
  /** 뉴스레터가 있는 날짜 목록 */
  availableDates: Set<DateString>;
  /** 선택된 날짜의 뉴스레터 */
  newsletter: Newsletter | null;
  /** 날짜 선택 핸들러 */
  onDateSelect: (date: DateString) => void;
  /** 이전 달 핸들러 */
  onPrevMonth: () => void;
  /** 다음 달 핸들러 */
  onNextMonth: () => void;
}

function DesktopSidebar({
  year,
  month,
  selectedDate,
  availableDates,
  newsletter,
  onDateSelect,
  onPrevMonth,
  onNextMonth,
}: DesktopSidebarProps) {
  return (
    <motion.aside
      {...createFadeInUpVariant(STAGGER_DELAYS.sidebar)}
      className="hidden lg:block lg:w-[340px] lg:flex-shrink-0"
    >
      <div className="sticky top-8 space-y-6">
        <MiniCalendar
          year={year}
          month={month}
          selectedDate={selectedDate}
          availableDates={availableDates}
          onDateSelect={onDateSelect}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
        />

        {newsletter && (
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="mb-2 text-2xl font-bold text-white">
                  {formatDisplayDate(newsletter.date)}
                </h2>
                {newsletter.sentAt && (
                  <p className="text-sm text-slate-300 font-mono">
                    발송: {new Date(newsletter.sentAt).toLocaleString('ko-KR')}
                  </p>
                )}
              </div>
              <TrendingUp
                className="h-8 w-8 text-emerald-400"
                aria-hidden="true"
              />
            </div>
          </motion.header>
        )}
      </div>
    </motion.aside>
  );
}

export default DesktopSidebar;