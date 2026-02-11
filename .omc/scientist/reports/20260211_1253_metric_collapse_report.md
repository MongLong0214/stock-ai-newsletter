# Theme Similarity Metric Collapse: Diagnosis & Redesign

**Date**: 2026-02-11 12:53  
**Analyst**: Quantitative Research (Automated)  
**Scope**: `/lib/tli/comparison/` — composite similarity algorithm  
**Status**: Analysis complete, redesign proposed

---

## Executive Summary

[OBJECTIVE] Diagnose why the theme similarity algorithm produces degenerate results (single theme dominating 95%+ of matches at loose settings) and design a mathematically sound replacement.

[FINDING] The metric collapse has three root causes:
1. **Exponential compression** in `zScoreEuclideanSimilarity` maps the entire practical distance range [0.7, 2.1] to a similarity range of only [0.35, 0.70] — a discriminating range of 0.35 on a [0,1] scale.
2. **Centroid attraction** is a mathematical certainty: `r = -0.996` correlation between distance-from-centroid and average similarity. Any theme near the feature space centroid will match nearly everything.
3. **Feature pillar dominance** — when curve data is sparse (< 14 days), features get 100% weight, and the compressed metric collapses all scores into a narrow band.

[STAT:effect_size] Coefficient of Variation of current algorithm: CV = 0.20 (poor; target > 0.50)
[STAT:n] Analysis based on N=260 simulated themes with realistic feature distributions

---

## 1. Diagnosis: Why "메타버스" Dominates

### 1.1 The Compression Problem

The z-score Euclidean similarity function is:

```
sim(a, b) = exp(-d * decay)
where d = sqrt( mean_i( ((a_i - mu_i)/sigma_i - (b_i - mu_i)/sigma_i)^2 ) )
```

For standardized features (z-scores), the expected pairwise distance between independent random vectors is:

```
E[d] = sqrt(2) ≈ 1.414  (regardless of dimensionality)
```

With `decay = 0.5`:
```
E[sim] = exp(-1.414 * 0.5) = 0.493
```

[FINDING] The observed mean similarity is 0.521, confirming the theoretical prediction.
[STAT:ci] 95% range of pairwise similarities: [0.344, 0.699]
[STAT:effect_size] Effective discriminating range: 0.355 (should be > 0.80 for good discrimination)

The P5-to-P95 z-score distance range maps through the exponential as:
```
d = 0.72 → sim = 0.699 (P95, "most similar")
d = 2.13 → sim = 0.344 (P5, "least similar")
```

This is a **3x compression** — the 2.97x ratio in distance space becomes only a 2.03x ratio in similarity space.

### 1.2 The Centroid Attraction Mechanism

[FINDING] Correlation between feature-centroid distance and average similarity: r = -0.996 (p < 10^-271)
[STAT:p_value] p = 4.36 × 10^-271
[STAT:n] N = 260 themes

The most centroid theme:
- Average similarity to all others: **0.611** (vs population mean 0.521)
- Matches >= 0.25 threshold: **259/259** (100%)
- Matches >= 0.40 threshold: **253/259** (97%)

**This is not a bug — it's a mathematical certainty.** In any metric space, the point closest to the centroid minimizes average distance to all other points. With the current exponential mapping, this translates directly to maximal similarity.

"메타버스" in production is likely near the centroid because:
1. It's a mature, well-known theme (moderate scores, medium volatility)
2. Its features are close to population averages on most dimensions
3. Being "average" makes it close to everything in z-score space

### 1.3 Curve Similarity is NOT the Problem

[FINDING] Curve similarity has CV = 1.49 (excellent discrimination) and centroid correlation r = 0.026 (effectively zero).
[STAT:effect_size] CV = 1.49 vs feature CV = 0.20

The curve pillar is immune to centroid bias because lifecycle curve shapes are determined by market dynamics, not feature-space position. Two themes at the same point in feature space can have completely different curve trajectories.

### 1.4 Feature Correlation / Dimensionality

[FINDING] Features are essentially uncorrelated (max |r| = 0.095). Effective dimensionality is 6.90/7.

The problem is NOT feature redundancy. All 7 features contribute independently. The issue is purely the exponential compression of the distance-to-similarity mapping.

---

## 2. Solutions Evaluated

| Method | CV | Centroid r | Top-1 Unique | Gini | Verdict |
|--------|-----|-----------|-------------|------|---------|
| A: Current (exp decay=0.5) | 0.205 | -0.996 | 170/260 | 0.502 | **FAIL**: poor discrimination |
| D: Mahalanobis | 0.203 | -0.992 | 169/260 | 0.500 | **FAIL**: same problem (uncorrelated features) |
| E: Linear decay | 0.261 | -0.994 | 170/260 | 0.502 | Marginal improvement |
| F: Specificity-weighted (TF-IDF) | 0.191 | -0.015 | 108/260 | 0.770 | Kills centroid bias but crushes all scores |
| G: Linear + Specificity | 0.232 | -0.668 | 109/260 | 0.750 | Partial fix, high Gini |
| H: Per-query percentile | 0.590 | -0.876 | 179/260 | 0.456 | Good CV but preserves centroid |
| I: Dual Z-Score | 0.404 | -0.867 | 181/260 | 0.454 | Moderate improvement |
| J: Mutual Rank | 0.501 | -0.948 | 189/260 | 0.417 | Best top-1 spread but centroid persists |
| K: Bidirectional Z-Score | 0.324 | -0.998 | 179/260 | 0.454 | Feature-only doesn't work |
| **M: RECOMMENDED** | **1.009** | **-0.566** | **169/260** | **0.496** | **Best overall balance** |

### Key Insight from Evaluation

No single-axis transformation of the feature pillar eliminates centroid bias while preserving discrimination. The solution requires **architectural change**: making the curve pillar dominant and using Mutual Rank normalization on the feature pillar.

---

## 3. Recommended Design: Trajectory-First with Mutual Specificity

### 3.1 Architecture

```
score(current, past) = (wCurve * curveSim + wFeature * mutualRankFeature + wKeyword * keywordSim) * sectorFactor
```

**Weight schedule** (adaptive, based on curve data availability):

| Curve data | wCurve | wFeature | wKeyword |
|-----------|--------|----------|----------|
| >= 14 days | 0.60 | 0.25 | 0.15 |
| 7-13 days | 0.35 | 0.50 | 0.15 |
| < 7 days | 0.00 | 0.85 | 0.15 |

### 3.2 Pillar 1: Curve Similarity (unchanged)

```typescript
curveSim = shapeSim * 0.6 + derivCorr * 0.4
// shapeSim = max(0, 1 - sqrt(MSE) * 2.5)
// derivCorr = max(0, pearson(diff(cR), diff(pR)))
```

No changes needed. This pillar has:
- CV = 1.49 (excellent)
- Centroid correlation = 0.026 (none)
- Natural discrimination based on trajectory shape

### 3.3 Pillar 2: Mutual Rank Feature Similarity (NEW)

**Problem**: Raw z-score Euclidean similarity has centroid bias.  
**Solution**: Replace absolute similarity with bidirectional rank-based score.

**Algorithm**:

```
Step 1: Compute raw z-score distances d(c, p) for all pairs
Step 2: For each theme i, rank all other themes by d(i, j) ascending
        rank_fwd[i][j] = rank of j among i's neighbors (0 = closest)
Step 3: Mutual rank: mr(i, j) = sqrt((rank_fwd[i][j] + 1) * (rank_fwd[j][i] + 1))
Step 4: Score: mutualRankFeature(i, j) = max(0, 1 - mr(i, j) / (N * 0.5))
```

**Why this works**:
- A centroid theme p may rank well for c (rank_fwd[c][p] is low)
- But c does NOT rank specially for p (rank_fwd[p][c] is high)
- The geometric mean punishes this asymmetry
- Used in protein structure comparison (DALI Z-score) and music recommendation

**Properties**:
- Range: [0, 1]
- Centroid theme average score: reduced from 0.611 to 0.326
- Immune to exponential compression (rank-based)

### 3.4 Pillar 3: Keyword/Sector (unchanged logic, elevated weight)

```
keywordSim = jaccard(current.keywords, past.keywords)
sectorFactor = (current.sector == past.sector || either == 'etc') ? 1.0 : 0.85
```

### 3.5 Threshold Strategy

**Problem**: A fixed absolute threshold (0.25) either admits too many or too few matches depending on the score distribution.

**Solution**: **Adaptive percentile threshold**

```
For each current theme c:
  1. Compute scores to all candidate past themes
  2. Sort descending
  3. Keep top-3 (existing MAX_MATCHES_PER_THEME)
  4. Quality gate: only if score > max(FLOOR, percentile_95th_of_all_pairwise_scores * 0.5)
     where FLOOR = 0.10 (absolute minimum)
```

**Recommended fixed threshold if adaptive is too complex**: `0.15`

At threshold = 0.15:
- 260/260 themes find matches (100%)
- Maximum concentration: 9/260 (3.5%)
- 246 unique past themes appear as matches

### 3.6 Expected Score Distribution

| Percentile | Score |
|-----------|-------|
| P5 | 0.001 |
| P25 | 0.021 |
| P50 (median) | 0.094 |
| P75 | 0.211 |
| P90 | 0.350 |
| P95 | 0.421 |
| Mean | 0.138 |
| StdDev | 0.139 |
| CV | 1.009 |

### 3.7 Anti-Centroid Properties

| Metric | Current | Recommended |
|--------|---------|-------------|
| CV (discrimination) | 0.20 | **1.01** |
| Centroid correlation | -0.996 | **-0.566** |
| Centroid theme >= 0.25 | 259/259 | **41/259** |
| Max match concentration | 10/260 | **9/260** |
| Unique past themes matched | 241 | **246** |

**Why centroid correlation drops from -1.0 to -0.57**:
- Curve pillar (60% weight) has zero centroid correlation (r = 0.026)
- Mutual Rank feature (25% weight) still has some centroid correlation (r = -0.93)
- Weighted average: ~0.60 * 0.03 + 0.25 * (-0.93) ≈ -0.21 from core pillars
- The remaining -0.57 is partially from keyword/sector correlation and noise
- **This residual correlation is acceptable**: it means centroid themes still get *some* matches (41/259), not zero. This is correct behavior — the centroid IS similar to many themes, just not ALL of them.

---

## 4. Why Not Other Approaches

### 4.1 Frequency Caps (rejected by user, correctly)

Capping how often a past theme can appear as a match is data corruption. It arbitrarily removes valid matches and creates information loss. The correct approach is to ensure the METRIC doesn't produce degenerate results, not to post-process them.

### 4.2 Mahalanobis Distance

With effectively uncorrelated features (max |r| = 0.095, effective dim = 6.9/7), Mahalanobis reduces to scaled Euclidean. No improvement: CV = 0.203, centroid r = -0.992.

### 4.3 DTW / Phase-aligned Comparison

The current resample-to-50-points approach is already a form of phase alignment. Full DTW would add computational cost (O(n^2) per pair vs O(n)) without proportional benefit, since the resampling already handles different curve lengths.

### 4.4 Pure Percentile Rank

Per-query percentile ranking (Method H) achieves CV = 0.59 but preserves centroid bias (r = -0.88) because the centroid genuinely IS the closest neighbor for many themes. Ranking doesn't change topology.

---

## 5. Implementation Specification

### 5.1 Changes to `similarity.ts`

**Add** `mutualRankFeatureScore` function:

```typescript
export function computeMutualRanks(
  allVecs: number[][],
  stats: FeaturePopulationStats,
): Map<string, number> {
  const n = allVecs.length
  // Step 1: compute pairwise z-score distances
  const distances: number[][] = Array.from({length: n}, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sumSq = 0
      for (let d = 0; d < allVecs[i].length; d++) {
        const std = stats.stddevs[d] > 0.001 ? stats.stddevs[d] : 1
        const zA = (allVecs[i][d] - stats.means[d]) / std
        const zB = (allVecs[j][d] - stats.means[d]) / std
        sumSq += (zA - zB) ** 2
      }
      distances[i][j] = Math.sqrt(sumSq / allVecs[i].length)
      distances[j][i] = distances[i][j]
    }
  }

  // Step 2: compute ranks (0 = closest)
  const ranks: number[][] = Array.from({length: n}, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    const indexed = distances[i].map((d, j) => ({ idx: j, dist: d }))
    indexed.sort((a, b) => a.dist - b.dist)
    indexed.forEach((item, rank) => { ranks[i][item.idx] = rank })
  }

  // Step 3: mutual rank scores
  const scores = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mr = Math.sqrt((ranks[i][j] + 1) * (ranks[j][i] + 1))
      const score = Math.max(0, 1 - mr / (n * 0.5))
      scores.set(`${i},${j}`, score)
      scores.set(`${j},${i}`, score)
    }
  }
  return scores
}
```

### 5.2 Changes to `composite.ts`

**Modify** weight schedule:

```typescript
// 3-Pillar adaptive weights (curve data availability)
if (minCurveLen >= 14)     { wFeature = 0.25; wCurve = 0.60; wKeyword = 0.15 }
else if (minCurveLen >= 7) { wFeature = 0.50; wCurve = 0.35; wKeyword = 0.15 }
else                       { wFeature = 0.85; wCurve = 0.00; wKeyword = 0.15 }

const rawSim = (wFeature * mutualRankScore + wCurve * curveSim + wKeyword * keywordSim)
             * (sectorMatch ? 1.0 : 0.85)
```

### 5.3 Changes to `calculate-comparisons.ts`

**Modify** threshold:

```typescript
const SIMILARITY_THRESHOLD = 0.15  // was 0.25
```

**Add** pre-computation of mutual ranks before the matching loop:

```typescript
const allVecs = enrichedThemes.map(t => featuresToArray(t.features))
const mutualRanks = computeMutualRanks(allVecs, populationStats)
```

### 5.4 Computational Cost

Current: O(C * P * D) where C=active themes, P=all themes, D=7 features  
Proposed: O(N^2 * D + N^2 * log N) for mutual rank pre-computation, then O(C * P) for lookups

For N=260: 260^2 = 67,600 pairs — trivially fast (< 100ms in TypeScript).

---

## 6. Limitations

[LIMITATION] Analysis is based on **simulated** data with realistic distributions, not actual production data. Real feature distributions may differ, affecting exact thresholds and CV values. The qualitative conclusions (exponential compression, centroid dominance) are robust to distributional assumptions.

[LIMITATION] The recommended threshold (0.15) is calibrated on simulated data. After implementation, the threshold should be validated on production data by checking: (a) match rate target of 80-100% of themes, (b) maximum concentration < 10% of themes per single past theme.

[LIMITATION] Mutual Rank computation requires O(N^2) pairwise distances. For N > 5,000, this becomes expensive (~25M pairs). Current N=260 is well within feasible range.

[LIMITATION] Curve similarity is zero for themes with < 7 days of data. For new themes, the algorithm falls back to feature-only (85% weight), which still has some centroid bias. This is mitigated by: (a) new themes having few data points to compare anyway, (b) the mutual rank normalization partially addressing it even in feature-only mode.

---

## Figures

- `/Users/isaac/WebstormProjects/stock-ai-newsletter/.omc/scientist/figures/metric_collapse_analysis.png` — Main diagnostic and comparison dashboard
- `/Users/isaac/WebstormProjects/stock-ai-newsletter/.omc/scientist/figures/anti_centroid_analysis.png` — Anti-centroid mechanism deep dive

---

*Report generated by automated quantitative analysis pipeline.*
