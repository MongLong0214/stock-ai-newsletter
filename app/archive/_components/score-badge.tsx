'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getScoreBadgeColors } from '../_utils/score-formatting';
import { DURATION, EASING } from '../_constants/animation';

interface ScoreBadgeProps {
  label: string;
  score: number;
  delay?: number;
  shouldReduceMotion?: boolean;
}

/**
 * 점수 배지 컴포넌트 (S++ 엔터프라이즈급 - Matrix 테마)
 *
 * Matrix 사이버펑크 미학 및 글로우 효과로 시그널 점수 표시
 *
 * 기능:
 * - 점수 레벨별 색상 코딩 (emerald/cyan/amber/red)
 * - 스태거 지원이 적용된 애니메이션 입장
 * - 시각적 계층 구조를 위한 글로우 효과
 * - 모노스페이스 정렬 숫자
 * - 불필요한 리렌더링 방지를 위한 React.memo
 * - 색상 계산을 위한 useMemo
 * - 모션 감소 지원
 * - 유틸리티 import로 타입 안전성
 *
 * 성능:
 * - 메모이제이션된 컴포넌트 (React.memo)
 * - 메모이제이션된 계산 (레벨, 색상)
 * - 최적화된 리렌더링 방지
 * - 유틸리티 함수 추출
 *
 * 접근성:
 * - 시맨틱 HTML
 * - 명확한 레이블-값 쌍
 * - 높은 대비 비율
 * - 읽기 쉬운 모노스페이스 폰트
 */
const ScoreBadge = memo(function ScoreBadge({
  label,
  score,
  delay = 0,
  shouldReduceMotion = false,
}: ScoreBadgeProps) {
  // 색상 계산 메모이제이션
  const colors = useMemo(() => getScoreBadgeColors(score), [score]);

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
      animate={shouldReduceMotion ? false : { opacity: 1, scale: 1 }}
      transition={{
        duration: DURATION.normal,
        delay: shouldReduceMotion ? 0 : delay,
        ease: EASING.smooth,
      }}
      className="flex items-center justify-between gap-3"
    >
      {/* 레이블 */}
      <span className="text-sm text-slate-300 uppercase tracking-wider font-mono">{label}</span>

      {/* 점수 배지 */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }}
        animate={shouldReduceMotion ? false : { opacity: 1, x: 0 }}
        transition={{
          duration: DURATION.slow,
          delay: shouldReduceMotion ? 0 : delay + 0.1,
          ease: EASING.smooth,
        }}
        className={`
          inline-flex items-center justify-center
          px-3 py-1 rounded-lg
          border backdrop-blur-sm
          ${colors.bg} ${colors.border} ${colors.glow}
          transition-all duration-300
        `}
      >
        <motion.span
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={shouldReduceMotion ? false : { opacity: 1 }}
          transition={{
            duration: DURATION.normal,
            delay: shouldReduceMotion ? 0 : delay + 0.2,
          }}
          className={`
            font-mono font-bold tabular-nums
            ${colors.text}
          `}
        >
          {score}
        </motion.span>
      </motion.div>
    </motion.div>
  );
});

export default ScoreBadge;