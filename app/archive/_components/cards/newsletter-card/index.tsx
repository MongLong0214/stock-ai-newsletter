/**
 * 뉴스레터 카드 컴포넌트
 *
 * 주식 추천 정보와 실시간 시세를 표시하는 카드
 */

'use client';

import { memo, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import ScoreBadge from '../../ui/score-badge';
import { formatPrice } from '../../../_utils/formatting/price';
import { getOverallScoreColor } from '../../../_utils/formatting/score';
import PriceSection from './price-section';
import { calculatePriceChange, getPreviousDate } from './utils';
import { RATIONALE_LAYOUT, SIGNAL_BADGES } from './constants';
import type { NewsletterCardProps } from './types';

/**
 * 뉴스레터 카드 메인 컴포넌트
 */
const NewsletterCard = memo(function NewsletterCard({
  stock,
  maxRationaleItems,
  newsletterDate,
  currentPrice,
  isLoadingPrice = false,
}: NewsletterCardProps) {
  const { ticker, name, close_price, rationale, signals } = stock;

  // 전체 점수 그라데이션
  const overallGradient = useMemo(
    () => getOverallScoreColor(signals.overall_score),
    [signals.overall_score]
  );

  // 가격 변동 정보 계산
  const priceChange = useMemo(
    () => calculatePriceChange(currentPrice, close_price),
    [currentPrice, close_price]
  );

  // 추천일 전일 날짜
  const previousDate = useMemo(() => getPreviousDate(newsletterDate), [newsletterDate]);

  // 추천 근거 분리
  const rationaleItems = useMemo(() => rationale.split('|'), [rationale]);

  // 추천 근거 영역 높이 계산
  const rationaleHeight =
    maxRationaleItems * RATIONALE_LAYOUT.ITEM_HEIGHT +
    RATIONALE_LAYOUT.HEADER_HEIGHT +
    RATIONALE_LAYOUT.BOTTOM_PADDING;

  return (
    <article
      className="
        group relative
        rounded-2xl border border-emerald-500/20
        bg-slate-900/60 backdrop-blur-xl
        p-6 shadow-2xl
        transition-all duration-150
        hover:border-emerald-500/40
        hover:shadow-[0_20px_60px_rgba(16,185,129,0.15)]
        focus-within:ring-2 focus-within:ring-emerald-500
      "
      style={{
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitFontSmoothing: 'antialiased',
        contentVisibility: 'auto',
        contain: 'layout paint',
      }}
      aria-labelledby={`stock-${ticker}-title`}
    >
      {/* 헤더 - 고정 높이로 일관성 유지 */}
      <div className="mb-6 pb-5 border-b border-slate-700/50 min-h-[120px]">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[110px] py-1">
            <h3
              id={`stock-${ticker}-title`}
              className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight"
            >
              {name}
            </h3>
            <p className="text-xs sm:text-sm font-mono text-slate-400 tracking-wide mt-auto">
              {ticker}
            </p>
          </div>

          {/* 전체 점수 (강조) - 고정 너비 */}
          <div className="flex flex-col items-end justify-between flex-shrink-0 w-[90px] min-h-[110px] py-1">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-mono whitespace-nowrap">
              Overall
            </span>
            <div
              className={`
                text-5xl sm:text-6xl font-black tabular-nums
                bg-gradient-to-br ${overallGradient}
                bg-clip-text text-transparent
                drop-shadow-[0_0_20px_rgba(16,185,129,0.5)]
                leading-none
              `}
            >
              {signals.overall_score}
            </div>
          </div>
        </div>
      </div>

      {/* 가격 정보 - 고급스러운 디자인 */}
      <div className="mb-8">
        {/* 추천일 기준 전일 종가 (핵심 정보) */}
        <div className="mb-5 pb-5 border-b border-slate-700/30">
          <div className="flex items-baseline justify-between mb-3">
            <h4 className="text-xs font-medium text-emerald-400/80 tracking-wide">
              추천일 전일 종가
            </h4>
            <span className="text-xs text-slate-500 font-light">{previousDate}</span>
          </div>
          <div className="text-3xl font-bold text-white font-mono tabular-nums">
            {formatPrice(close_price)}
            <span className="text-base text-slate-500 ml-2 font-normal">원</span>
          </div>
        </div>

        {/* 현재가 및 수익률 - 세로 배치 */}
        <PriceSection
          isLoadingPrice={isLoadingPrice}
          currentPrice={currentPrice}
          priceChange={priceChange}
        />
      </div>

      {/* 추천 근거 - 동적 높이로 일관성 유지 */}
      <div
        style={{ height: `${rationaleHeight}px` }}
        className="mb-6 pb-6 border-b border-slate-700/50"
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            분석 Summary
          </h4>
        </div>
        <div
          style={{ height: `${rationaleHeight - RATIONALE_LAYOUT.CONTENT_OFFSET}px` }}
          className="flex flex-col gap-2 overflow-hidden"
        >
          {rationaleItems.map((item: string, idx: number) => (
            <div
              key={idx}
              className="
                flex items-center
                px-3 py-1.5 rounded-lg
                bg-slate-800/50 border border-emerald-500/20
                text-xs text-slate-300
                font-mono
                hover:bg-slate-800/80 hover:border-emerald-500/40
                transition-all duration-200
              "
            >
              {item.trim()}
            </div>
          ))}
        </div>
      </div>

      {/* 시그널 점수 */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 font-mono">
          Technical Signals
        </h4>

        {SIGNAL_BADGES?.map(({ label, key }) => (
          <ScoreBadge key={key} label={label} score={signals[key]} />
        ))}
      </div>

      {/* 호버 글로우 효과 */}
      <div
        className="
          absolute inset-0 -z-10 rounded-2xl
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
          bg-gradient-to-br from-emerald-500/10 to-transparent
        "
        aria-hidden="true"
      />
    </article>
  );
});

export default NewsletterCard;