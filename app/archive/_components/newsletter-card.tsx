'use client';

import { memo, useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import ScoreBadge from './score-badge';
import type { StockData, DateString } from '../_types/archive.types';
import { formatPrice } from '../_utils/price-formatting';
import { getOverallScoreColor } from '../_utils/score-formatting';
import { MAX_BUSINESS_DAYS } from '../_utils/date-formatting';

/** 실시간 주식 시세 정보 */
interface StockPrice {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  changeRate: number;
  volume: number;
  timestamp: number;
}

/** 뉴스레터 카드 Props */
interface NewsletterCardProps {
  /** 주식 데이터 */
  stock: StockData;
  /** 표시할 최대 분석 근거 개수 */
  maxRationaleItems: number;
  /** 뉴스레터 발행일 */
  newsletterDate: DateString;
  /** 실시간 시세 (선택) */
  currentPrice?: StockPrice;
}

/** 가격 변동 정보 */
interface PriceChangeInfo {
  amount: number;
  percent: string;
  isPositive: boolean;
}

const RATIONALE_LAYOUT = {
  ITEM_HEIGHT: 42,
  HEADER_HEIGHT: 32,
  BOTTOM_PADDING: 24,
  CONTENT_OFFSET: 50,
} as const;

const DATE_CALC = {
  MONDAY: 1,
  WEEKEND_OFFSET: 3,
  WEEKDAY_OFFSET: 1,
} as const;

/**
 * 뉴스레터 카드 컴포넌트
 *
 * 주식 추천 정보와 실시간 시세를 표시하는 카드
 */
const NewsletterCard = memo(function NewsletterCard({
  stock,
  maxRationaleItems,
  newsletterDate,
  currentPrice
}: NewsletterCardProps) {
  const { ticker, name, close_price, rationale, signals } = stock;

  const overallGradient = useMemo(
    () => getOverallScoreColor(signals.overall_score),
    [signals.overall_score]
  );

  const priceChange = useMemo((): PriceChangeInfo | null => {
    if (!currentPrice) return null;

    const change = currentPrice.currentPrice - close_price;
    const changePercent = ((change / close_price) * 100).toFixed(2);
    const isPositive = change >= 0;

    return {
      amount: Math.abs(change),
      percent: changePercent,
      isPositive,
    };
  }, [currentPrice, close_price]);

  const previousDate = useMemo(() => {
    const date = new Date(newsletterDate);
    const dayOfWeek = date.getDay();
    const daysToSubtract = dayOfWeek === DATE_CALC.MONDAY ? DATE_CALC.WEEKEND_OFFSET : DATE_CALC.WEEKDAY_OFFSET;
    date.setDate(date.getDate() - daysToSubtract);
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }, [newsletterDate]);

  const rationaleItems = useMemo(() => rationale.split('|'), [rationale]);

  const rationaleHeight =
    maxRationaleItems * RATIONALE_LAYOUT.ITEM_HEIGHT +
    RATIONALE_LAYOUT.HEADER_HEIGHT +
    RATIONALE_LAYOUT.BOTTOM_PADDING;

  const renderPriceSection = () => {
    // 실시간 시세 없음 (통신 실패 또는 영업일 경과)
    if (!currentPrice || !priceChange) {
      return (
        <div className="relative overflow-hidden rounded-xl border border-slate-700/30 bg-gradient-to-br from-slate-900/40 via-slate-900/20 to-slate-800/40 backdrop-blur-sm">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(100,116,139,0.1),transparent)]" />
          <div className="relative px-6 py-10 flex flex-col items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="text-sm font-medium text-slate-300/90 text-center tracking-wide">
                추천일로부터 {MAX_BUSINESS_DAYS}영업일이 경과하여
              </div>
              <div className="text-sm text-slate-400/80 text-center font-light">
                실시간 시세 추적이 종료되었습니다
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 정상: 실시간 시세 표시
    return (
      <div className="h-[168px] space-y-5">
        {/* 현재가 */}
        <div className="h-[72px]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-slate-400">현재가</span>
            <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 rounded">
              LIVE
            </span>
          </div>
          <div className="text-3xl font-bold text-white font-mono tabular-nums">
            {formatPrice(currentPrice.currentPrice)}
            <span className="text-base text-slate-500 ml-2 font-normal">원</span>
          </div>
        </div>

        {/* 수익률 */}
        <div className="h-[72px]">
          <div className="flex items-center gap-1.5 mb-3">
            {priceChange.isPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="text-xs font-medium text-slate-400">수익률</span>
          </div>
          <div className={cn(
            'text-3xl font-bold font-mono tabular-nums',
            priceChange.isPositive ? 'text-rose-400' : 'text-blue-400'
          )}>
            {priceChange.isPositive ? '+' : ''}{priceChange.percent}%
          </div>
          <div className={cn(
            'text-sm font-mono tabular-nums mt-1',
            priceChange.isPositive ? 'text-rose-400/50' : 'text-blue-400/50'
          )}>
            {priceChange.isPositive ? '+' : ''}{formatPrice(priceChange.amount)}원
          </div>
        </div>
      </div>
    );
  };

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
              className="text-xl sm:text-2xl font-bold text-white tracking-tight line-clamp-4 leading-tight"
            >
              {name}
            </h3>
            <p className="text-xs sm:text-sm font-mono text-slate-400 tracking-wide mt-auto">{ticker}</p>
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
            <span className="text-xs text-slate-500 font-light">
              {previousDate}
            </span>
          </div>
          <div className="text-3xl font-bold text-white font-mono tabular-nums">
            {formatPrice(close_price)}
            <span className="text-base text-slate-500 ml-2 font-normal">원</span>
          </div>
        </div>

        {/* 현재가 및 수익률 - 세로 배치 */}
        {renderPriceSection()}
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
          {rationaleItems.map((item, idx) => (
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

        <ScoreBadge label="Trend" score={signals.trend_score} />
        <ScoreBadge label="Momentum" score={signals.momentum_score} />
        <ScoreBadge label="Volume" score={signals.volume_score} />
        <ScoreBadge label="Volatility" score={signals.volatility_score} />
        <ScoreBadge label="Pattern" score={signals.pattern_score} />
        <ScoreBadge label="Sentiment" score={signals.sentiment_score} />
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