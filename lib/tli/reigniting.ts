/** 테마 재점화(Reigniting) 판별 모듈 */

import { avg } from './normalize';
import type { Stage, InterestMetric } from './types';

/**
 * 관심도 시계열 기반 재점화 판별 (하위 호환)
 * Decline 또는 Emerging(Decline에서 전이) 단계에서 최근 관심도 반등 감지
 */
export function checkReigniting(
  currentStage: Stage,
  twoWeekMetrics: InterestMetric[],
  prevStage?: Stage | null,
): boolean {
  // Decline→Emerging 전이: 즉시 재점화 판정
  if (prevStage === 'Decline' && currentStage === 'Emerging') return true;

  // 기존 로직: Decline 단계에서 관심도 반등 감지
  if (currentStage !== 'Decline') return false;
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
