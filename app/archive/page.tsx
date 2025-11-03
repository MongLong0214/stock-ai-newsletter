'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, TrendingUp } from 'lucide-react';
import AnimatedBackground from '@/components/animated-background';
import MiniCalendar from './_components/mini-calendar';
import NewsletterCard from './_components/newsletter-card';
import useArchiveData from './_hooks/use-archive-data';
import useStockPrices from './_hooks/use-stock-prices';
import type { DateString } from './_types/archive.types';
import { formatDisplayDate } from './_utils/date-formatting';

/**
 * 뉴스레터 아카이브 페이지
 */
export default function ArchivePage() {
  // 초기 데이터를 먼저 가져오기
  const { availableDates, allNewsletters } = useArchiveData(null);

  // 가장 최근 날짜로 초기화
  const mostRecentDate = availableDates[0] || null;
  const initialDate = mostRecentDate ? new Date(mostRecentDate) : new Date();

  const [calendarState, setCalendarState] = useState({
    year: initialDate.getFullYear(),
    month: initialDate.getMonth(),
  });

  const [selectedDate, setSelectedDate] = useState<DateString | null>(mostRecentDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);

  // 선택된 날짜의 뉴스레터 가져오기
  const newsletter = useMemo(() => {
    if (!selectedDate) return null;
    return allNewsletters.find((n) => n.date === selectedDate) || null;
  }, [selectedDate, allNewsletters]);

  // 뉴스레터의 모든 티커 추출
  const tickers = useMemo(() => {
    if (!newsletter) return [];
    return newsletter.stocks.map((stock) => stock.ticker);
  }, [newsletter]);

  // 실시간 주식 시세 조회 (영업일 체크 포함)
  const { prices: stockPrices } = useStockPrices(tickers, selectedDate);

  const availableDatesSet = useMemo(
    () => new Set(availableDates),
    [availableDates]
  );

  const handlePrevMonth = useCallback(() => {
    setCalendarState(prev => ({
      year: prev.month === 0 ? prev.year - 1 : prev.year,
      month: prev.month === 0 ? 11 : prev.month - 1,
    }));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCalendarState(prev => ({
      year: prev.month === 11 ? prev.year + 1 : prev.year,
      month: prev.month === 11 ? 0 : prev.month + 1,
    }));
  }, []);

  // 키보드 단축키
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlePrevMonth();
      }
      if (e.key === 'ArrowRight' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleNextMonth();
      }
      if (e.key === 'Escape' && isCalendarOpen) {
        e.preventDefault();
        setIsCalendarOpen(false);
        calendarButtonRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCalendarOpen, handlePrevMonth, handleNextMonth]);

  // 모바일 캘린더 포커스 트랩
  useEffect(() => {
    if (!isCalendarOpen) return;

    const focusableElements = document.querySelectorAll(
      '#mobile-calendar button, #mobile-calendar a, #mobile-calendar [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    function handleTabKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }

    document.addEventListener('keydown', handleTabKey);
    setTimeout(() => firstElement.focus(), 100);

    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isCalendarOpen]);

  const handleDateSelect = useCallback((dateString: DateString) => {
    setSelectedDate(dateString);
    setIsCalendarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div
          className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]"
          aria-hidden="true"
        />
      </div>

      <main className="relative z-10 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mb-12 text-center lg:text-left"
          >
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mb-4 text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-tight leading-[0.95]"
            >
              <span className="block text-emerald-500/90 mb-2">Newsletter</span>
              <span className="block font-normal bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400">
                Archive
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-lg text-white font-light leading-relaxed"
            >
              과거 발송된 AI 주식 분석 뉴스레터를 날짜별로 확인하세요
            </motion.p>
          </motion.header>

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            {/* 데스크톱 캘린더 */}
            <motion.aside
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="hidden lg:block lg:w-[340px] lg:flex-shrink-0"
            >
              <div className="sticky top-8 space-y-6">
                <MiniCalendar
                  year={calendarState.year}
                  month={calendarState.month}
                  selectedDate={selectedDate}
                  availableDates={availableDatesSet}
                  onDateSelect={handleDateSelect}
                  onPrevMonth={handlePrevMonth}
                  onNextMonth={handleNextMonth}
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

            {/* 모바일 캘린더 */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="lg:hidden"
            >
              <button
                ref={calendarButtonRef}
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
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
                  transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
                >
                  <ChevronDown className="h-5 w-5 text-slate-400" aria-hidden="true" />
                </motion.div>
              </button>

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
                    transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
                    className="mt-4 overflow-hidden"
                  >
                    <MiniCalendar
                      year={calendarState.year}
                      month={calendarState.month}
                      selectedDate={selectedDate}
                      availableDates={availableDatesSet}
                      onDateSelect={handleDateSelect}
                      onPrevMonth={handlePrevMonth}
                      onNextMonth={handleNextMonth}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 콘텐츠 영역 */}
            <motion.section
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex-1 min-w-0"
              aria-live="polite"
            >
              {!newsletter && (
                <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-12 text-center shadow-2xl">
                  <Calendar
                    className="mx-auto mb-6 h-12 w-12 sm:h-16 sm:w-16 text-slate-600"
                    aria-hidden="true"
                  />
                  <h2 className="mb-3 text-2xl font-bold text-white">
                    날짜를 선택해주세요
                  </h2>
                  <p className="text-slate-300 leading-relaxed">
                    {availableDates.length > 0
                      ? '캘린더에서 날짜를 선택하면 해당 날짜의 뉴스레터를 확인할 수 있습니다'
                      : '아직 발송된 뉴스레터가 없습니다'}
                  </p>
                </div>
              )}

              {newsletter && (() => {
                const maxRationaleItems = Math.max(
                  ...newsletter.stocks.map((stock) => stock.rationale.split('|').length)
                );

                const sortedStocks = [...newsletter.stocks].sort(
                  (a, b) => b.signals.overall_score - a.signals.overall_score
                );

                return (
                  <div
                    key={newsletter.date}
                    className="grid gap-8 md:grid-cols-2 xl:grid-cols-3"
                  >
                    {sortedStocks?.map((stock, index) => (
                      <motion.div
                        key={stock.ticker}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: 0.3 + index * 0.1,
                          ease: [0.25, 0.46, 0.45, 0.94],
                        }}
                      >
                        <NewsletterCard
                          stock={stock}
                          maxRationaleItems={maxRationaleItems}
                          newsletterDate={newsletter.date}
                          currentPrice={stockPrices.get(stock.ticker)}
                        />
                      </motion.div>
                    ))}
                  </div>
                );
              })()}
            </motion.section>
          </div>
        </div>
      </main>
    </div>
  );
}