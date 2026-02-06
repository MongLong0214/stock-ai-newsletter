/** 테마 재점화(Reigniting) 판별 모듈 */

import { avg } from './normalize';
import type { Stage, InterestMetric } from './types';

export function checkReigniting(
  currentStage: Stage,
  twoWeekMetrics: InterestMetric[],
): boolean {
  if (currentStage !== 'Decay') return false;
  if (twoWeekMetrics.length < 14) return false;

  const sorted = [...twoWeekMetrics].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const firstWeekValues = sorted.slice(0, 7).map(m => m.normalized);
  const secondWeekValues = sorted.slice(7, 14).map(m => m.normalized);

  const firstWeekAvg = avg(firstWeekValues);
  const secondWeekAvg = avg(secondWeekValues);

  if (firstWeekAvg <= 0) return false;

  const growthRate = (secondWeekAvg - firstWeekAvg) / firstWeekAvg;
  return growthRate >= 0.30;
}
