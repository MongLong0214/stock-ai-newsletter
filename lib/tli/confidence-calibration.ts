/**
 * Expected Calibration Error (ECE) computation + threshold calibration
 * Based on Platt (1999) calibration principles
 */

import type { ConfidenceLevel } from './types';

interface CalibrationSample {
  predicted: ConfidenceLevel;
  actual: boolean; // true if prediction was accurate
}

/**
 * Compute Expected Calibration Error.
 * Measures how well confidence levels match actual accuracy rates.
 * ECE = 0 means perfectly calibrated.
 */
export function computeECE(samples: CalibrationSample[]): number {
  if (samples.length === 0) return 0;

  const bins: Record<ConfidenceLevel, { correct: number; total: number }> = {
    high: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    low: { correct: 0, total: 0 },
  };

  // Expected accuracy for each level
  const expectedAccuracy: Record<ConfidenceLevel, number> = {
    high: 0.8,
    medium: 0.5,
    low: 0.2,
  };

  for (const s of samples) {
    bins[s.predicted].total++;
    if (s.actual) bins[s.predicted].correct++;
  }

  let ece = 0;
  const n = samples.length;

  for (const level of ['high', 'medium', 'low'] as ConfidenceLevel[]) {
    const bin = bins[level];
    if (bin.total === 0) continue;
    const actualAccuracy = bin.correct / bin.total;
    ece += (bin.total / n) * Math.abs(actualAccuracy - expectedAccuracy[level]);
  }

  return ece;
}

/**
 * Calibrate confidence thresholds to minimize ECE.
 * Returns optimal coverage/days thresholds.
 */
export function calibrateConfidenceThresholds(
  samples: Array<{
    coverageScore: number;
    interestDays: number;
    accurate: boolean;
  }>
): {
  highCoverage: number;
  highDays: number;
  mediumCoverage: number;
  mediumDays: number;
  ece: number;
} | null {
  if (samples.length < 30) return null;

  let bestECE = Infinity;
  let bestThresholds = {
    highCoverage: 0.7,
    highDays: 14,
    mediumCoverage: 0.4,
    mediumDays: 7,
  };

  // Grid search over threshold space
  const coverageRange = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
  const daysRange = [7, 10, 14, 21];
  const medCoverageRange = [0.25, 0.3, 0.35, 0.4, 0.45];
  const medDaysRange = [3, 5, 7, 10];

  for (const hc of coverageRange) {
    for (const hd of daysRange) {
      for (const mc of medCoverageRange) {
        for (const md of medDaysRange) {
          // Monotonicity constraint
          if (mc >= hc || md >= hd) continue;

          const classified: CalibrationSample[] = samples.map(s => {
            let predicted: ConfidenceLevel;
            if (s.coverageScore >= hc && s.interestDays >= hd) predicted = 'high';
            else if (s.coverageScore >= mc && s.interestDays >= md) predicted = 'medium';
            else predicted = 'low';
            return { predicted, actual: s.accurate };
          });

          const ece = computeECE(classified);
          if (ece < bestECE) {
            bestECE = ece;
            bestThresholds = { highCoverage: hc, highDays: hd, mediumCoverage: mc, mediumDays: md };
          }
        }
      }
    }
  }

  return { ...bestThresholds, ece: bestECE };
}
