/** 통계 계산 및 정규화 유틸리티 */

export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/** percentileRank에 필요한 최소 모집단 크기 — 미달 시 sigmoid fallback */
const MIN_PERCENTILE_POPULATION = 50;

/** 시그모이드 정규화 — 결과는 항상 (0, 1) 범위 */
export function sigmoid_normalize(x: number, center: number, scale: number): number {
  if (scale <= 0) return 0.5;
  if (!isFinite(x)) return 0.5;
  return 1 / (1 + Math.exp(-(x - center) / scale));
}

/** 로그 정규화 — 결과는 항상 [0, 1] 범위 */
export function log_normalize(value: number, scale: number): number {
  if (scale <= 0) return 0;
  if (value < 0) return 0;
  if (!isFinite(value)) return 0;
  return Math.min(1, Math.log(1 + value) / Math.log(1 + scale));
}

/** 백분위 순위 — 모집단 부족 시 sigmoid fallback 사용 */
export function percentileRank(value: number, sortedArray: number[]): number {
  if (sortedArray.length === 0) return 0.5;

  if (sortedArray.length < MIN_PERCENTILE_POPULATION) {
    const median = sortedArray[Math.floor(sortedArray.length / 2)];
    const sd = standardDeviation(sortedArray);
    return sigmoid_normalize(value, median, sd || 1);
  }

  // 이진 탐색으로 O(log n) 위치 결정
  let lo = 0;
  let hi = sortedArray.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedArray[mid] < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo / sortedArray.length;
}

/** 최소제곱 선형회귀 기울기 — x = 0, 1, 2, ... n-1 */
export function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  if (!isFinite(slope)) return 0;

  return slope;
}

/** 방향성 변동 지수 (DVI) — RSI 원리 기반, 상승/하락 비율로 방향성 산출 */
export function calculateDVI(values: number[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < values.length; i++) {
    deltas.push(values[i] - values[i - 1]);
  }

  const upMoves = deltas.filter(d => d > 0);
  const downMoves = deltas.filter(d => d < 0).map(d => Math.abs(d));
  const avgUp = avg(upMoves);
  const avgDown = avg(downMoves);

  if (avgUp === 0 && avgDown === 0) return 0.5;
  if (avgDown === 0) return 1.0;
  const rs = avgUp / avgDown;
  return 1 - 1 / (1 + rs);
}

/** Median Absolute Deviation — robust spread estimator (Greco 2023) */
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map(v => Math.abs(v - med));
  deviations.sort((a, b) => a - b);
  return deviations[Math.floor(deviations.length / 2)];
}

/** Robust Z-score using MAD (resistant to outliers) */
export function robustZScore(value: number, med: number, mad: number): number {
  // 0.6745 is the 75th percentile of standard normal (MAD consistency constant)
  const scaledMAD = mad * 1.4826;  // = 1/0.6745
  if (scaledMAD < 0.001) return 0;
  return (value - med) / scaledMAD;
}

/** Median of sorted array */
export function median(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}
