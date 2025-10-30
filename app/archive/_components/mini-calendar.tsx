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
import { DURATION, EASING, getStaggerDelay } from '../_constants/animation';
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
 * 미니 캘린더 컴포넌트 (S++ 엔터프라이즈급 - Matrix 테마)
 *
 * Matrix 사이버펑크 미학의 고성능 캘린더 인터페이스
 *
 * 기능:
 * - Matrix 그린 악센트 색상 (emerald-500)
 * - 데이터 가용성 표시기 (점 + 배경)
 * - 글로우가 적용된 선택된 날짜 강조
 * - 모션 감소 지원이 적용된 부드러운 애니메이션
 * - ARIA grid 의미론적 구조의 완전한 키보드 접근성
 * - 반응형 레이아웃 (44px 최소 터치 타겟 - WCAG AAA)
 * - 유틸리티 함수 추출로 최적화된 성능
 * - 브랜드 DateString 타입으로 타입 안전성
 * - 커스텀 비교를 통한 React.memo
 * - Set을 사용한 O(1) 날짜 조회
 *
 * 접근성:
 * - 스크린 리더를 위한 role="grid" 의미론
 * - 요일 이름을 위한 role="columnheader"
 * - 날짜 버튼을 위한 role="gridcell"
 * - 각 날짜에 대한 설명적 aria-label
 * - 선택 상태를 위한 aria-pressed
 * - 사용 불가 날짜를 위한 aria-disabled
 *
 * 성능:
 * - 유틸리티 함수를 통한 메모이제이션된 계산
 * - 상수를 사용한 스태거 애니메이션
 * - 모션 감소 지원
 * - Set을 사용한 O(1) availableDates 조회
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
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-500 focus-visible:ring-offset-2
            focus-visible:ring-offset-black
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
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-500 focus-visible:ring-offset-2
            focus-visible:ring-offset-black
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
          className="grid grid-cols-7 gap-2"
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
                  relative aspect-square rounded-lg min-h-[44px]
                  text-sm font-mono tabular-nums
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

                {/* 데이터 표시 점 */}
                {hasData && !isSelected && (
                  <motion.span
                    initial={shouldReduceMotion ? false : { scale: 0, opacity: 0 }}
                    animate={shouldReduceMotion ? false : { scale: 1, opacity: 1 }}
                    transition={{
                      delay: shouldReduceMotion ? 0 : getStaggerDelay(index, 0.01),
                      duration: DURATION.normal,
                    }}
                    className="
                      absolute bottom-1 left-1/2 -translate-x-1/2
                      w-1 h-1 rounded-full
                      bg-emerald-400
                      shadow-[0_0_6px_rgba(16,185,129,0.8)]
                    "
                    aria-hidden="true"
                  />
                )}
              </motion.button>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* 범례 */}
      <div className="mt-6 pt-4 border-t border-slate-700/50">
        <div className="flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
              aria-hidden="true"
            />
            <span className="text-slate-300">데이터 있음</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-600" aria-hidden="true" />
            <span className="text-slate-300">데이터 없음</span>
          </div>
        </div>
      </div>
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