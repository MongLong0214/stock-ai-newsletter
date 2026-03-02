/**
 * Adaptive stage thresholds via KDE valley detection (Silverman bandwidth)
 * Finds natural cluster boundaries in the score distribution
 */

export interface StageThresholds {
  dormant: number;   // below this → Dormant
  emerging: number;  // below this → Emerging
  growth: number;    // below this → Growth
  peak: number;      // above growth → Peak eligible
}

/** Default thresholds (fallback) */
export const DEFAULT_THRESHOLDS: StageThresholds = {
  dormant: 15,
  emerging: 40,
  growth: 58,
  peak: 68,
};

/**
 * Gaussian kernel function
 */
function gaussianKernel(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Silverman's rule of thumb bandwidth
 */
function silvermanBandwidth(data: number[]): number {
  const n = data.length;
  if (n < 2) return 1;

  const sorted = [...data].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  let sum = 0;
  let sumSq = 0;
  for (const v of data) {
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const std = Math.sqrt(sumSq / n - mean * mean);

  // Silverman's rule: h = 0.9 * min(std, IQR/1.34) * n^(-1/5)
  const spread = Math.min(std, iqr / 1.34);
  if (spread < 0.001) return 1;
  return 0.9 * spread * Math.pow(n, -0.2);
}

/**
 * Estimate KDE at given points
 */
function estimateKDE(data: number[], points: number[], bandwidth: number): number[] {
  const n = data.length;
  return points.map(x => {
    let sum = 0;
    for (const xi of data) {
      sum += gaussianKernel((x - xi) / bandwidth);
    }
    return sum / (n * bandwidth);
  });
}

/**
 * Find valley points (local minima) in KDE density
 */
function findValleys(density: number[], points: number[]): number[] {
  const valleys: number[] = [];
  for (let i = 1; i < density.length - 1; i++) {
    if (density[i] < density[i - 1] && density[i] < density[i + 1]) {
      valleys.push(points[i]);
    }
  }
  return valleys;
}

/**
 * Compute adaptive stage thresholds from score distribution.
 * Returns null if insufficient data (< 30 scores) or no clear valleys found.
 *
 * @param scores Array of lifecycle scores (0-100)
 */
export function computeAdaptiveThresholds(scores: number[]): StageThresholds | null {
  if (scores.length < 30) return null;

  const bandwidth = silvermanBandwidth(scores);

  // Evaluate KDE at 200 points across [0, 100]
  const numPoints = 200;
  const evalPoints = Array.from({ length: numPoints }, (_, i) => (i / (numPoints - 1)) * 100);
  const density = estimateKDE(scores, evalPoints, bandwidth);

  const valleys = findValleys(density, evalPoints);

  if (valleys.length < 2) return null; // need at least 2 valleys for 3 boundaries

  // Sort valleys and pick the best candidates for stage boundaries
  const sorted = valleys.sort((a, b) => a - b);

  // Find valleys closest to expected ranges
  // Dormant boundary: ~10-25
  // Growth boundary: ~35-55
  // Peak boundary: ~55-75
  const dormantValley = sorted.find(v => v >= 5 && v <= 30) ?? null;
  const growthValley = sorted.find(v => v >= 30 && v <= 55) ?? null;
  // Peak valley must be strictly above growth valley to prevent growth===peak
  const peakValley = growthValley !== null
    ? sorted.find(v => v > growthValley && v <= 80) ?? null
    : sorted.find(v => v >= 55 && v <= 80) ?? null;

  if (!dormantValley || !growthValley) return null;

  return {
    dormant: Math.round(dormantValley),
    emerging: Math.round(growthValley),
    growth: Math.round(peakValley ?? growthValley + 15),
    peak: Math.round(peakValley ?? growthValley + 28),
  };
}
