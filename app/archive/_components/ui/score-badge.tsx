'use client';

import { memo, useMemo } from 'react';
import { getScoreBadgeColors } from '../../_utils/formatting/score';

interface ScoreBadgeProps {
  label: string;
  score: number;
  delay?: number;
  shouldReduceMotion?: boolean;
}

const ScoreBadge = memo(function ScoreBadge({
  label,
  score,
}: ScoreBadgeProps) {
  const colors = useMemo(() => getScoreBadgeColors(score), [score]);

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
});

export default ScoreBadge;