'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import ScoreBadge from './score-badge';
import type { StockData, DateString } from '../_types/archive.types';
import { formatPrice } from '../_utils/price-formatting';
import { getOverallScoreColor } from '../_utils/score-formatting';
import { DURATION, EASING, getStaggerDelay } from '../_constants/animation';
import { useReducedMotion } from '../_hooks/use-reduced-motion';

interface NewsletterCardProps {
  stock: StockData;
  index: number;
  maxRationaleItems: number;
  newsletterDate: DateString;
}

/**
 * 뉴스레터 카드 컴포넌트 (S++ 엔터프라이즈급 - Matrix 테마)
 *
 * Matrix 사이버펑크 미학으로 주식 추천 표시
 *
 * 기능:
 * - Matrix 그린 글래스모피즘 디자인
 * - 전체 점수 강조 (대형 그라데이션 숫자)
 * - 색상 코딩이 적용된 7개 시그널 배지
 * - 스태거가 적용된 부드러운 입장 애니메이션
 * - 접근성을 위한 모션 감소 지원
 * - 스프링 물리 효과가 적용된 호버 효과
 * - 터미널 스타일 타이포그래피
 * - 불필요한 리렌더링 방지를 위한 React.memo
 * - 비용이 많이 드는 계산을 위한 useMemo
 * - 장식용 아이콘에 일관된 aria-hidden
 * - 유틸리티 함수 import로 타입 안전성
 *
 * 성능:
 * - React.memo로 메모이제이션된 컴포넌트
 * - 메모이제이션된 계산 (그라데이션, 가격)
 * - 포맷팅을 위한 유틸리티 함수
 * - 일관성을 위한 애니메이션 상수
 *
 * 접근성:
 * - 시맨틱 HTML (article, headings)
 * - 카드 제목을 위한 aria-labelledby
 * - aria-hidden="true"가 적용된 장식용 아이콘
 * - 키보드 네비게이션을 위한 focus-visible ring
 */
const NewsletterCard = memo(function NewsletterCard({ stock, index, maxRationaleItems, newsletterDate }: NewsletterCardProps) {
  const { ticker, name, close_price, rationale, signals } = stock;
  const shouldReduceMotion = useReducedMotion();

  // 비용이 많이 드는 계산 메모이제이션
  const overallGradient = useMemo(
    () => getOverallScoreColor(signals.overall_score),
    [signals.overall_score]
  );

  const formattedPrice = useMemo(() => formatPrice(close_price), [close_price]);

  // 전일 영업일 날짜 계산 (주말 건너뛰기)
  const previousDate = useMemo(() => {
    const date = new Date(newsletterDate);
    const dayOfWeek = date.getDay(); // 0: 일요일, 1: 월요일, ..., 6: 토요일

    // 월요일(1)이면 3일 전(금요일), 그 외는 1일 전
    const daysToSubtract = dayOfWeek === 1 ? 3 : 1;

    date.setDate(date.getDate() - daysToSubtract);
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }, [newsletterDate]);

  // rationale 아이템 분리
  const rationaleItems = useMemo(() => rationale.split('|'), [rationale]);

  // 모든 카드가 동일한 높이를 갖도록 최대 아이템 개수 기준으로 타이트하게 계산
  // 아이템 하나당: py-1.5(12px) + text-xs 2줄(32px) + gap(8px) = 약 42px
  const itemHeight = 42; // 2줄 텍스트를 고려한 타이트한 높이
  const headerHeight = 32; // "추천 이유" 헤더
  const bottomPadding = 24; // pb-6
  const rationaleHeight = maxRationaleItems * itemHeight + headerHeight + bottomPadding;

  // 모션 감소 지원이 적용된 애니메이션 props
  const initialAnimation = shouldReduceMotion
    ? false
    : { opacity: 0, y: 30, scale: 0.95 };

  const animateAnimation = shouldReduceMotion
    ? false
    : { opacity: 1, y: 0, scale: 1 };

  const hoverAnimation = {};

  return (
    <motion.article
      initial={initialAnimation}
      animate={animateAnimation}
      transition={{
        duration: DURATION.slow,
        delay: getStaggerDelay(index),
        ease: EASING.smooth,
      }}
      whileHover={hoverAnimation}
      className="
        group relative will-change-transform
        rounded-2xl border border-emerald-500/20
        bg-slate-900/60 backdrop-blur-xl
        p-6 shadow-2xl
        transition-all duration-150
        hover:border-emerald-500/40
        hover:shadow-[0_20px_60px_rgba(16,185,129,0.15)]
        focus-within:ring-2 focus-within:ring-emerald-500
      "
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
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={shouldReduceMotion ? false : { opacity: 1, scale: 1 }}
            transition={{
              duration: DURATION.slow,
              delay: getStaggerDelay(index, 0.2),
              ease: EASING.smooth,
            }}
            className="flex flex-col items-end justify-between flex-shrink-0 w-[90px] min-h-[110px] py-1"
          >
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-mono whitespace-nowrap">
              Overall
            </span>
            <motion.div
              whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
              className={`
                text-5xl sm:text-6xl font-black tabular-nums
                bg-gradient-to-br ${overallGradient}
                bg-clip-text text-transparent
                drop-shadow-[0_0_20px_rgba(16,185,129,0.5)]
                leading-none
              `}
            >
              {signals.overall_score}
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* 가격 - 고정 높이 */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
        animate={shouldReduceMotion ? false : { opacity: 1, x: 0 }}
        transition={{
          duration: DURATION.normal,
          delay: getStaggerDelay(index, 0.3),
        }}
        className="flex justify-end items-center gap-2 mb-6 h-[40px]"
      >
        <div className="flex flex-col gap-0.5 items-end">
          <span className="text-2xl font-bold text-white font-mono tabular-nums">
            {formattedPrice}
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            ({previousDate} 종가 기준)
          </span>
        </div>
      </motion.div>

      {/* 추천 근거 - 동적 높이로 일관성 유지 */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={shouldReduceMotion ? false : { opacity: 1 }}
        transition={{
          duration: DURATION.slow,
          delay: getStaggerDelay(index, 0.4),
        }}
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
            <motion.div
              key={idx}
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={shouldReduceMotion ? false : { opacity: 1, scale: 1 }}
              transition={{
                duration: DURATION.fast,
                delay: shouldReduceMotion ? 0 : getStaggerDelay(index, 0.4) + idx * 0.03,
              }}
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
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* 시그널 점수 */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={shouldReduceMotion ? false : { opacity: 1 }}
        transition={{
          duration: DURATION.slow,
          delay: getStaggerDelay(index, 0.5),
        }}
        className="space-y-3"
      >
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 font-mono">
          Technical Signals
        </h4>

        <ScoreBadge
          label="Trend"
          score={signals.trend_score}
          delay={getStaggerDelay(index, 0.6)}
          shouldReduceMotion={shouldReduceMotion}
        />
        <ScoreBadge
          label="Momentum"
          score={signals.momentum_score}
          delay={getStaggerDelay(index, 0.65)}
          shouldReduceMotion={shouldReduceMotion}
        />
        <ScoreBadge
          label="Volume"
          score={signals.volume_score}
          delay={getStaggerDelay(index, 0.7)}
          shouldReduceMotion={shouldReduceMotion}
        />
        <ScoreBadge
          label="Volatility"
          score={signals.volatility_score}
          delay={getStaggerDelay(index, 0.75)}
          shouldReduceMotion={shouldReduceMotion}
        />
        <ScoreBadge
          label="Pattern"
          score={signals.pattern_score}
          delay={getStaggerDelay(index, 0.8)}
          shouldReduceMotion={shouldReduceMotion}
        />
        <ScoreBadge
          label="Sentiment"
          score={signals.sentiment_score}
          delay={getStaggerDelay(index, 0.85)}
          shouldReduceMotion={shouldReduceMotion}
        />
      </motion.div>

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
    </motion.article>
  );
});

export default NewsletterCard;