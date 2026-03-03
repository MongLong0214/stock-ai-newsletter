/**
 * 데스크톱 사이드바
 *
 * 캘린더와 선택된 엔트리 정보를 표시합니다.
 * sticky 포지셔닝으로 스크롤 시 화면 상단에 고정됩니다.
 */

import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import MiniCalendar from './mini-calendar';
import type { ArchiveEntry, DateString } from '../../_types/archive.types';
import type { ArchiveDataType } from './mini-calendar/types';
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
  /** 날짜별 데이터 타입 맵 */
  dateTypeMap?: Map<DateString, ArchiveDataType>;
  /** 선택된 날짜의 엔트리 */
  entry: ArchiveEntry | null;
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
  dateTypeMap,
  entry,
  onDateSelect,
  onPrevMonth,
  onNextMonth,
}: DesktopSidebarProps) {
  const isCrashAlert = entry?.type === 'crash_alert';

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
          dateTypeMap={dateTypeMap}
          onDateSelect={onDateSelect}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
        />

        {entry && (
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={`rounded-xl border backdrop-blur-xl p-6 shadow-lg ${
              isCrashAlert
                ? 'border-red-500/20 bg-slate-900/60'
                : 'border-emerald-500/20 bg-slate-900/60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="mb-2 text-2xl font-bold text-white">
                  {formatDisplayDate(entry.date)}
                </h2>
                {entry.sentAt && (
                  <p className="text-sm text-slate-300 font-mono">
                    발송: {new Date(entry.sentAt).toLocaleString('ko-KR')}
                  </p>
                )}
                {isCrashAlert && (
                  <p className={`mt-1 text-xs font-bold uppercase tracking-wider ${
                    entry.crashAlert.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {entry.crashAlert.severity === 'critical' ? 'CRITICAL ALERT' : 'WARNING ALERT'}
                  </p>
                )}
              </div>
              {isCrashAlert ? (
                <AlertTriangle
                  className={`h-8 w-8 ${
                    entry.crashAlert.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                  }`}
                  aria-hidden="true"
                />
              ) : (
                <TrendingUp
                  className="h-8 w-8 text-emerald-400"
                  aria-hidden="true"
                />
              )}
            </div>
          </motion.header>
        )}
      </div>
    </motion.aside>
  );
}

export default DesktopSidebar;
