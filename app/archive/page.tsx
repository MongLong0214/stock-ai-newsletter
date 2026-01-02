/**
 * 뉴스레터 아카이브 페이지
 *
 * 과거 발송된 AI 주식 분석 뉴스레터를 날짜별로 조회합니다.
 * - 캘린더에서 날짜 선택
 * - 선택된 날짜의 뉴스레터와 실시간 주가 표시
 * - URL로 날짜 공유 가능 (?date=YYYY-MM-DD)
 * - 키보드 단축키 지원 (Cmd/Ctrl + 좌우: 월 이동, Esc: 캘린더 닫기)
 */

'use client';

import { Suspense, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { isDateString, type DateString } from './_types/archive.types';
import { createFadeInUpVariant, STAGGER_DELAYS } from './_constants/animations';

/** 로딩 스켈레톤 */
function ArchiveLoading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-pulse text-emerald-500">Loading...</div>
    </div>
  );
}

/** 메인 아카이브 콘텐츠 (useSearchParams 사용) */
function ArchiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 아카이브 데이터 조회
  const { availableDates, allNewsletters } = useArchiveData();

  // 사용 가능한 날짜 Set (참조 안정성을 위해 useMemo 사용)
  const availableDatesSet = useMemo(() => new Set(availableDates), [availableDates]);

  // URL에서 날짜 추출 (단일 진실 소스)
  const urlDate = searchParams.get('date');
  const selectedDate = useMemo(() => {
    if (urlDate && isDateString(urlDate) && availableDatesSet.has(urlDate)) {
      return urlDate;
    }
    return availableDates[0] || null;
  }, [urlDate, availableDatesSet, availableDates]);

  // 캘린더 상태 관리
  const { calendarState, handlePrevMonth, handleNextMonth, navigateToDate } =
    useCalendarState(selectedDate);

  // URL의 날짜가 유효하지 않으면 수정
  useEffect(() => {
    if (urlDate && urlDate !== selectedDate && selectedDate) {
      router.replace(`/archive?date=${selectedDate}`, { scroll: false });
    }
  }, [urlDate, selectedDate, router]);

  // URL 변경 시 캘린더 월 동기화
  useEffect(() => {
    if (selectedDate) {
      navigateToDate(selectedDate);
    }
  }, [selectedDate, navigateToDate]);

  // 선택된 뉴스레터 및 티커
  const { newsletter, tickers } = useNewsletterData(selectedDate, allNewsletters);

  // 실시간 주식 시세 및 추천일 전일 종가
  const {
    prices: stockPrices,
    historicalClosePrices,
    loading: isPriceLoading,
    unavailableReason,
  } = useStockPrices(tickers, selectedDate);

  // 모바일 캘린더 상태
  const { isCalendarOpen, calendarButtonRef, toggleCalendar, closeCalendar } = useMobileCalendar();

  // 날짜 선택 핸들러 (URL만 업데이트, 상태는 URL에서 파생)
  function handleDateSelect(dateString: DateString) {
    router.push(`/archive?date=${dateString}`, { scroll: false });
    closeCalendar();
  }

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
      <div className="fixed inset-0 pointer-events-none z-1 opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-size-[100%_4px] animate-[matrix-scan_8s_linear_infinite]"
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
                  historicalClosePrices={historicalClosePrices}
                  isLoadingPrice={isPriceLoading}
                  unavailableReason={unavailableReason}
                />
              )}
            </motion.section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** 페이지 엔트리포인트 (Suspense 경계) */
export default function ArchivePage() {
  return (
    <Suspense fallback={<ArchiveLoading />}>
      <ArchiveContent />
    </Suspense>
  );
}
