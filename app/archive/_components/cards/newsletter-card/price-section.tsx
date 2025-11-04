/**
 * 가격 섹션 컴포넌트 (스켈레톤, 영업일 경과, 실시간 시세)
 */

import { format } from 'date-fns';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice } from '../../../_utils/formatting/price';
import { MAX_BUSINESS_DAYS } from '../../../_utils/formatting/date';
import type { StockPrice, PriceChangeInfo } from './types';

interface PriceSectionProps {
  isLoadingPrice: boolean;
  currentPrice?: StockPrice;
  priceChange: PriceChangeInfo | null;
}

/**
 * 스켈레톤 UI 렌더링 (로딩 중)
 */
function renderLoadingSkeleton() {
  return (
    <div className="h-[168px] space-y-5">
      {/* 현재가 스켈레톤 */}
      <div className="h-[72px]">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-3 w-12 bg-slate-700/50 rounded animate-pulse" />
          <div className="h-4 w-10 bg-slate-700/50 rounded animate-pulse" />
        </div>
        <div className="h-9 w-32 bg-slate-700/50 rounded animate-pulse" />
      </div>

      {/* 수익률 스켈레톤 */}
      <div className="h-[72px]">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="h-3.5 w-3.5 bg-slate-700/50 rounded animate-pulse" />
          <div className="h-3 w-12 bg-slate-700/50 rounded animate-pulse" />
        </div>
        <div className="h-9 w-28 bg-slate-700/50 rounded animate-pulse mb-1" />
        <div className="h-5 w-24 bg-slate-700/50 rounded animate-pulse" />
      </div>
    </div>
  );
}

/**
 * 영업일 경과 메시지 렌더링 (실시간 시세 없음)
 */
function renderExpiredMessage() {
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

/**
 * 현재가 섹션 렌더링
 */
function renderCurrentPrice(currentPrice: StockPrice) {
  const today = format(new Date(), 'M월 d일');

  return (
    <div className="h-[72px]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-slate-400">현재가</span>
        <span className="px-2 py-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 rounded">
          {today}
        </span>
      </div>
      <div className="text-3xl font-bold text-white font-mono tabular-nums">
        {formatPrice(currentPrice.currentPrice)}
        <span className="text-base text-slate-500 ml-2 font-normal">원</span>
      </div>
    </div>
  );
}

/**
 * 수익률 섹션 렌더링
 */
function renderProfitSection(priceChange: PriceChangeInfo) {
  const TrendIcon = priceChange.isPositive ? TrendingUp : TrendingDown;
  const colorClass = priceChange.isPositive ? 'text-rose-400' : 'text-blue-400';
  const colorClassFaded = priceChange.isPositive ? 'text-rose-400/50' : 'text-blue-400/50';
  const sign = priceChange.isPositive ? '+' : '';

  return (
    <div className="h-[72px]">
      <div className="flex items-center gap-1.5 mb-3">
        <TrendIcon className={cn('w-3.5 h-3.5', colorClass)} />
        <span className="text-xs font-medium text-slate-400">수익률</span>
      </div>
      <div className={cn('text-3xl font-bold font-mono tabular-nums', colorClass)}>
        {sign}
        {priceChange.percent}%
      </div>
      <div className={cn('text-sm font-mono tabular-nums mt-1', colorClassFaded)}>
        {sign}
        {formatPrice(priceChange.amount)}원
      </div>
    </div>
  );
}

/**
 * 가격 섹션 - 로딩/영업일경과/실시간시세 3가지 상태 렌더링
 */
function PriceSection({ isLoadingPrice, currentPrice, priceChange }: PriceSectionProps) {
  if (isLoadingPrice) {
    return renderLoadingSkeleton();
  }

  if (!currentPrice || !priceChange) {
    return renderExpiredMessage();
  }

  return (
    <div className="h-[168px] space-y-5">
      {renderCurrentPrice(currentPrice)}
      {renderProfitSection(priceChange)}
    </div>
  );
}

export default PriceSection;