/**
 * 뉴스레터 아카이브 페이지
 *
 * 과거 발송된 AI 주식 분석 뉴스레터를 날짜별로 조회합니다.
 * - 캘린더에서 날짜 선택
 * - 선택된 날짜의 뉴스레터와 실시간 주가 표시
 * - 키보드 단축키 지원 (Cmd/Ctrl + ←/→: 월 이동, Esc: 캘린더 닫기)
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import AnimatedBackground from '@/components/animated-background';
import PageHeader from './_components/layout/page-header';
import DesktopSidebar from './_components/calendar/desktop-sidebar';
import MobileCalendarToggle from './_components/calendar/mobile-calendar-toggle';
import NewsletterGrid from './_components/layout/newsletter-grid';
import EmptyState from './_components/layout/empty-state';
import useArchiveData from './_hooks/use-archive-data';
import useCalendarState from './_hooks/use-calendar-state';
import useNewsletterData from './_hooks/use-newsletter-data';
import useMobileCalendar from './_hooks/use-mobile-calendar';
import useStockPrices from './_hooks/use-stock-prices';
import useKeyboardShortcuts from './_hooks/use-keyboard-shortcuts';
import useFocusTrap from './_hooks/use-focus-trap';
import type { DateString } from './_types/archive.types';
import { createFadeInUpVariant, STAGGER_DELAYS } from './_constants/animations';

export default function ArchivePage() {
  // 아카이브 데이터 조회
  const { availableDates, allNewsletters } = useArchiveData(null);

  // 초기 선택 날짜 (가장 최근)
  const initialDate = availableDates[0] || null;
  const [selectedDate, setSelectedDate] = useState<DateString | null>(initialDate);

  // 캘린더 상태 관리
  const { calendarState, handlePrevMonth, handleNextMonth } = useCalendarState(initialDate);

  // 선택된 뉴스레터 및 티커
  const { newsletter, tickers } = useNewsletterData(selectedDate, allNewsletters);

  // 실시간 주식 시세
  const { prices: stockPrices, loading: isPriceLoading } = useStockPrices(tickers, selectedDate);

  // 모바일 캘린더 상태
  const { isCalendarOpen, calendarButtonRef, toggleCalendar, closeCalendar } = useMobileCalendar();

  // 사용 가능한 날짜 Set 변환
  const availableDatesSet = useMemo(() => new Set(availableDates), [availableDates]);

  // 날짜 선택 핸들러
  const handleDateSelect = useCallback((dateString: DateString) => {
    setSelectedDate(dateString);
    closeCalendar();
  }, [closeCalendar]);

  // 키보드 단축키
  useKeyboardShortcuts({
    isCalendarOpen,
    onCloseCalendar: closeCalendar,
    onPrevMonth: handlePrevMonth,
    onNextMonth: handleNextMonth,
    calendarButtonRef,
  });

  // 모바일 포커스 트랩
  useFocusTrap({
    isActive: isCalendarOpen,
    containerSelector: '#mobile-calendar',
  });

  // 캘린더 공통 Props
  const calendarProps = {
    year: calendarState.year,
    month: calendarState.month,
    selectedDate,
    availableDates: availableDatesSet,
    onDateSelect: handleDateSelect,
    onPrevMonth: handlePrevMonth,
    onNextMonth: handleNextMonth,
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* 배경 애니메이션 */}
      <AnimatedBackground />

      {/* 스캔라인 효과 */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]"
          aria-hidden="true"
        />
      </div>

      {/* 메인 콘텐츠 */}
      <main className="relative z-10 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <PageHeader />

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            {/* 데스크톱 사이드바 */}
            <DesktopSidebar {...calendarProps} newsletter={newsletter} />

            {/* 모바일 캘린더 토글 */}
            <MobileCalendarToggle
              {...calendarProps}
              isCalendarOpen={isCalendarOpen}
              calendarButtonRef={calendarButtonRef}
              onToggleCalendar={toggleCalendar}
            />

            {/* 콘텐츠 영역 */}
            <motion.section
              {...createFadeInUpVariant(STAGGER_DELAYS.content)}
              className="flex-1 min-w-0"
              aria-live="polite"
            >
              {!newsletter ? (
                <EmptyState availableDatesCount={availableDates.length} />
              ) : (
                <NewsletterGrid
                  key={newsletter.date}
                  newsletter={newsletter}
                  stockPrices={stockPrices}
                  isLoadingPrice={isPriceLoading}
                />
              )}
            </motion.section>
          </div>
        </div>
      </main>
    </div>
  );
}