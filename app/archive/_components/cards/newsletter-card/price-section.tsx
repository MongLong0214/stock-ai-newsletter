/**
 * 가격 섹션 컴포넌트 (스켈레톤, 상태 메시지, 실시간 시세)
 */

import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Calendar, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice } from '../../../_utils/formatting/price';
import { MAX_BUSINESS_DAYS } from '../../../_utils/formatting/date';
import type { PriceUnavailableReason } from '../../../_hooks/use-stock-prices';
import type { StockPrice, PriceChangeInfo } from './types';

interface PriceSectionProps {
  isLoadingPrice: boolean;
  currentPrice?: StockPrice;
  priceChange: PriceChangeInfo | null;
  /** 현재가 조회 불가 사유 */
  unavailableReason?: PriceUnavailableReason | null;
}

/** 상태별 메시지 */
const STATUS_MESSAGES: Record<
  PriceUnavailableReason,
  { icon: typeof Calendar; title: string; subtitle: string }
> = {
  market_closed: {
    icon: Calendar,
    title: '오늘은 휴장일입니다',
    subtitle: '주말 또는 공휴일에는 시세가 제공되지 않습니다',
  },
  tracking_expired: {
    icon: Clock,
    title: `${MAX_BUSINESS_DAYS}영업일 경과`,
    subtitle: '실시간 시세 추적이 종료되었습니다',
  },
  api_error: {
    icon: AlertCircle,
    title: '시세를 불러올 수 없습니다',
    subtitle: '잠시 후 다시 시도해 주세요',
  },
};

/** 로딩 스켈레톤 */
function LoadingSkeleton() {
  return (
    <div className="h-[168px] space-y-5">
      <div className="h-[72px]">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-3 w-12 bg-slate-700/50 rounded animate-pulse" />
          <div className="h-4 w-10 bg-slate-700/50 rounded animate-pulse" />
        </div>
        <div className="h-9 w-32 bg-slate-700/50 rounded animate-pulse" />
      </div>
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

/** 상태 메시지 (휴장일/추적종료/에러) */
function StatusMessage({ reason }: { reason: PriceUnavailableReason }) {
  const { icon: Icon, title, subtitle } = STATUS_MESSAGES[reason];

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700/30 bg-gradient-to-br from-slate-900/40 via-slate-900/20 to-slate-800/40 backdrop-blur-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(100,116,139,0.1),transparent)]" />
      <div className="relative px-6 py-10 flex flex-col items-center justify-center gap-4">
        <Icon className="w-8 h-8 text-slate-400/60" aria-hidden="true" />
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-medium text-slate-300/90 text-center tracking-wide">
            {title}
          </div>
          <div className="text-sm text-slate-400/80 text-center font-light">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

/** 현재가 섹션 */
function CurrentPriceDisplay({ currentPrice }: { currentPrice: StockPrice }) {
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

/** 수익률 섹션 */
function ProfitDisplay({ priceChange }: { priceChange: PriceChangeInfo }) {
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
 * 가격 섹션 (로딩/상태/시세)
 */
function PriceSection({
  isLoadingPrice,
  currentPrice,
  priceChange,
  unavailableReason,
}: PriceSectionProps) {
  if (isLoadingPrice) {
    return <LoadingSkeleton />;
  }

  if (unavailableReason) {
    return <StatusMessage reason={unavailableReason} />;
  }

  if (!currentPrice || !priceChange) {
    return <StatusMessage reason="api_error" />;
  }

  return (
    <div className="h-[168px] space-y-5">
      <CurrentPriceDisplay currentPrice={currentPrice} />
      <ProfitDisplay priceChange={priceChange} />
    </div>
  );
}

export default PriceSection;