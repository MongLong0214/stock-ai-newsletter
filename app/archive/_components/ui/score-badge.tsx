/**
 * 점수 배지 컴포넌트
 *
 * 기술 시그널 점수를 시각적으로 표시
 * React 19 자동 최적화로 memo/useMemo 불필요
 */

'use client';

import { getScoreBadgeColors } from '../../_utils/formatting/score';

interface ScoreBadgeProps {
  /** 시그널 라벨 (예: 추세, 모멘텀) */
  label: string;
  /** 점수 (0-100) */
  score: number;
}

/**
 * 점수 배지 - 시그널 점수를 색상 코딩으로 표시
 */
export default function ScoreBadge({ label, score }: ScoreBadgeProps) {
  const colors = getScoreBadgeColors(score);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-300 uppercase tracking-wider font-mono">{label}</span>
      <div
        className={`
          inline-flex items-center justify-center
          px-3 py-1 rounded-lg
          border backdrop-blur-sm
          ${colors.bg} ${colors.border} ${colors.glow}
          transition-all duration-300
        `}
      >
        <span
          className={`
            font-mono font-bold tabular-nums
            ${colors.text}
          `}
        >
          {score}
        </span>
      </div>
    </div>
  );
}
