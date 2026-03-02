/** Dynamic Time Warping with Sakoe-Chiba band constraint (Ali 2019 + Rani 2012) */

/**
 * DTW distance with Sakoe-Chiba band constraint.
 * Band width = ceil(max(a.length, b.length) * bandRatio)
 * Time complexity: O(n * w) where w = band width
 */
export function dtwDistance(a: number[], b: number[], bandRatio = 0.15): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Infinity;

  const w = Math.max(1, Math.ceil(Math.max(n, m) * bandRatio));

  // Cost matrix (use flat array for performance)
  const INF = Number.MAX_VALUE;
  const cost = new Float64Array((n + 1) * (m + 1)).fill(INF);
  cost[0] = 0; // cost[0][0] = 0

  for (let i = 1; i <= n; i++) {
    const jStart = Math.max(1, i - w);
    const jEnd = Math.min(m, i + w);
    for (let j = jStart; j <= jEnd; j++) {
      const d = (a[i - 1] - b[j - 1]) ** 2;
      const idx = i * (m + 1) + j;
      cost[idx] = d + Math.min(
        cost[(i - 1) * (m + 1) + j],       // insertion
        cost[i * (m + 1) + (j - 1)],       // deletion
        cost[(i - 1) * (m + 1) + (j - 1)], // match
      );
    }
  }

  const finalCost = cost[n * (m + 1) + m];
  return finalCost === INF ? INF : Math.sqrt(finalCost / Math.max(n, m));
}

/**
 * DTW similarity: converts distance to [0, 1] similarity score.
 * Uses exponential decay: sim = exp(-distance * scale)
 */
export function dtwSimilarity(a: number[], b: number[], bandRatio = 0.15): number {
  if (a.length === 0 || b.length === 0) return 0;
  const dist = dtwDistance(a, b, bandRatio);
  if (!isFinite(dist)) return 0;
  // Scale factor: distance=0→1.0, distance=0.5→0.61, distance=1.0→0.37
  return Math.exp(-dist);
}
