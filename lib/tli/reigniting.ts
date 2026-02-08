/** 테마 재점화(Reigniting) 판별 모듈 */

import { avg } from './normalize';
import type { Stage, InterestMetric } from './types';

export function checkReigniting(
  currentStage: Stage,
  twoWeekMetrics: InterestMetric[],
): boolean {
  if (currentStage !== 'Decay') return false;
  if (twoWeekMetrics.length < 7) return false;

  const sorted = [...twoWeekMetrics].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const midpoint = Math.floor(sorted.length / 2);
  const olderValues = sorted.slice(0, midpoint).map(m => m.normalized);
  const recentValues = sorted.slice(midpoint).map(m => m.normalized);

  const olderAvg = avg(olderValues);
  const recentAvg = avg(recentValues);

  if (olderAvg <= 0) return false;

  const growthRate = (recentAvg - olderAvg) / olderAvg;
  return growthRate >= 0.30;
}
