/**
 * Shannon Entropy-based objective weighting (Cinelli 2020)
 * Computes data-driven weights from a decision matrix, bounded by domain constraints.
 */

import { WEIGHT_BOUNDS } from '../constants/score-config';

type WeightKey = 'interest' | 'newsMomentum' | 'volatility' | 'activity';

/**
 * Decision matrix: rows = themes, columns = score components
 * Each row: [interestScore, newsScore, volatilityScore, activityScore]
 */
export function computeEntropyWeights(
  decisionMatrix: number[][],
): { interest: number; newsMomentum: number; volatility: number; activity: number } | null {
  const m = decisionMatrix.length; // number of themes (alternatives)
  if (m < 3) return null; // need minimum data for meaningful entropy

  const n = 4; // number of criteria

  // Step 1: Normalize decision matrix (proportional normalization)
  const colSums = new Array(n).fill(0);
  for (const row of decisionMatrix) {
    for (let j = 0; j < n; j++) {
      colSums[j] += Math.max(row[j], 0.001); // avoid zero division
    }
  }

  const normalized: number[][] = decisionMatrix.map(row =>
    row.map((val, j) => Math.max(val, 0.001) / colSums[j])
  );

  // Step 2: Compute entropy for each criterion
  const k = 1 / Math.log(m); // normalization constant
  const entropy = new Array(n).fill(0);

  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) {
      const p = normalized[i][j];
      if (p > 0) {
        sum += p * Math.log(p);
      }
    }
    entropy[j] = -k * sum;
    // Clamp to [0, 1]
    entropy[j] = Math.max(0, Math.min(1, entropy[j]));
  }

  // Step 3: Compute divergence (1 - entropy)
  const divergence = entropy.map(e => 1 - e);
  const divSum = divergence.reduce((s, d) => s + d, 0);

  if (divSum < 0.001) {
    // All criteria have same entropy → equal weights
    return null;
  }

  // Step 4: Raw entropy weights
  const rawWeights = divergence.map(d => d / divSum);

  // Step 5: Iterative bound-clamp + renormalize (converges in 2-3 iterations)
  const keys: WeightKey[] = ['interest', 'newsMomentum', 'volatility', 'activity'];
  const weights = [...rawWeights];

  for (let iter = 0; iter < 10; iter++) {
    // Clamp to domain bounds
    let clamped = false;
    for (let i = 0; i < n; i++) {
      const [min, max] = WEIGHT_BOUNDS[keys[i]];
      if (weights[i] < min) { weights[i] = min; clamped = true; }
      if (weights[i] > max) { weights[i] = max; clamped = true; }
    }
    // Renormalize to sum = 1.0
    const wSum = weights.reduce((s, w) => s + w, 0);
    if (wSum > 0.001) {
      for (let i = 0; i < n; i++) weights[i] = weights[i] / wSum;
    }
    if (!clamped) break;
  }

  // Final clamp to guarantee bounds after renormalization
  for (let i = 0; i < n; i++) {
    const [min, max] = WEIGHT_BOUNDS[keys[i]];
    weights[i] = Math.max(min, Math.min(max, weights[i]));
  }

  // Round to 3 decimal places
  const finalWeights = weights.map(w => Math.round(w * 1000) / 1000);

  // Fix rounding: adjust largest weight to ensure sum = 1.0
  const currentSum = finalWeights.reduce((s, w) => s + w, 0);
  const diff = 1.0 - currentSum;
  if (Math.abs(diff) > 0.0001) {
    const maxIdx = finalWeights.indexOf(Math.max(...finalWeights));
    finalWeights[maxIdx] = Math.round((finalWeights[maxIdx] + diff) * 1000) / 1000;
  }

  return {
    interest: finalWeights[0],
    newsMomentum: finalWeights[1],
    volatility: finalWeights[2],
    activity: finalWeights[3],
  };
}
