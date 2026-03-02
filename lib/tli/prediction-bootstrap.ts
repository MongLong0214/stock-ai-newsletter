/**
 * Weighted Bootstrap Prediction Intervals (Efron & Tibshirani 1993)
 * B=1000 iterations, 90% CI
 */

import type { PredictionInterval } from './types';

/**
 * Compute bootstrap confidence interval for a weighted sample.
 * @param values Array of prediction values (e.g., peak days, total days)
 * @param weights Array of similarity weights (higher = more influence)
 * @param B Number of bootstrap iterations (default: 1000)
 * @param alpha Confidence level (default: 0.10 for 90% CI)
 */
export function bootstrapCI(
  values: number[],
  weights: number[],
  B = 1000,
  alpha = 0.10,
): PredictionInterval | null {
  const n = values.length;
  if (n < 2) return null;

  // Normalize weights to probabilities
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return null;
  const probs = weights.map(w => w / totalWeight);

  // Build CDF for weighted sampling
  const cdf = new Float64Array(n);
  cdf[0] = probs[0];
  for (let i = 1; i < n; i++) {
    cdf[i] = cdf[i - 1] + probs[i];
  }

  // Bootstrap resampling
  const bootstrapMeans: number[] = [];

  // Deterministic seed via simple LCG for reproducibility
  let seed = 42;
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let b = 0; b < B; b++) {
    let sum = 0;

    for (let i = 0; i < n; i++) {
      const r = nextRandom();
      // Binary search in CDF
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cdf[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      sum += values[lo];
    }

    bootstrapMeans.push(sum / n);
  }

  // Sort bootstrap means
  bootstrapMeans.sort((a, b) => a - b);

  const lowerIdx = Math.floor(B * (alpha / 2));
  const upperIdx = Math.floor(B * (1 - alpha / 2));
  const medianIdx = Math.floor(B / 2);

  return {
    lower: Math.round(bootstrapMeans[lowerIdx]),
    upper: Math.round(bootstrapMeans[Math.min(upperIdx, B - 1)]),
    median: Math.round(bootstrapMeans[medianIdx]),
    confidenceLevel: 1 - alpha,
  };
}

/**
 * Compute prediction intervals for peak day and total days.
 */
export function computePredictionIntervals(
  comparisons: Array<{ pastPeakDay: number; pastTotalDays: number; similarity: number }>
): {
  peakDayCI: PredictionInterval | null;
  totalDaysCI: PredictionInterval | null;
} {
  const peakDays = comparisons.map(c => c.pastPeakDay);
  const totalDays = comparisons.map(c => c.pastTotalDays);
  const weights = comparisons.map(c => c.similarity);

  return {
    peakDayCI: bootstrapCI(peakDays, weights),
    totalDaysCI: bootstrapCI(totalDays, weights),
  };
}
