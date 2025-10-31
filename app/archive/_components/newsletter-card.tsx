'use client';

import { memo, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import ScoreBadge from './score-badge';
import type { StockData, DateString } from '../_types/archive.types';
import { formatPrice } from '../_utils/price-formatting';
import { getOverallScoreColor } from '../_utils/score-formatting';

interface NewsletterCardProps {
  stock: StockData;
  maxRationaleItems: number;
  newsletterDate: DateString;
}

/**
 * 뉴스레터 카드 컴포넌트
 */
const NewsletterCard = memo(function NewsletterCard({ stock, maxRationaleItems, newsletterDate }: NewsletterCardProps) {
  const { ticker, name, close_price, rationale, signals } = stock;

  const overallGradient = useMemo(
    () => getOverallScoreColor(signals.overall_score),
    [signals.overall_score]
  );

  const formattedPrice = useMemo(() => formatPrice(close_price), [close_price]);

  const previousDate = useMemo(() => {
    const date = new Date(newsletterDate);
    const dayOfWeek = date.getDay();
    const daysToSubtract = dayOfWeek === 1 ? 3 : 1;
    date.setDate(date.getDate() - daysToSubtract);
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }, [newsletterDate]);

  const rationaleItems = useMemo(() => rationale.split('|'), [rationale]);

  const itemHeight = 42;
  const headerHeight = 32;
  const bottomPadding = 24;
  const rationaleHeight = maxRationaleItems * itemHeight + headerHeight + bottomPadding;

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

      {/* 가격 - 고정 높이 */}
      <div className="flex justify-end items-center gap-2 mb-6 h-[40px]">
        <div className="flex flex-col gap-0.5 items-end">
          <span className="text-2xl font-bold text-white font-mono tabular-nums">
            {formattedPrice}
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            ({previousDate} 종가 기준)
          </span>
        </div>
      </div>

      {/* 추천 근거 - 동적 높이로 일관성 유지 */}
      <div
        style={{ height: `${rationaleHeight}px` }}
        className="mb-6 pb-6 border-b border-slate-700/50"
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            추천 이유
          </h4>
        </div>
        <div
          style={{ height: `${rationaleHeight - 50}px` }}
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