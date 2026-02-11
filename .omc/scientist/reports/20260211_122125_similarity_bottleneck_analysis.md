# Theme Similarity Algorithm Analysis Report

**Date**: 2026-02-11 12:21  
**Subject**: Mathematical bottleneck analysis of composite 3-pillar similarity algorithm  
**Data**: 260 active Korean stock market themes, Monte Carlo simulation (N=33,670 pairs)

---

## [OBJECTIVE]

Identify why only 15/260 themes (5.8%) produce matches above the 25% similarity threshold, 
and propose specific formula adjustments with expected impact.

---

## [DATA] Characteristics

| Metric | Value |
|--------|-------|
| Active themes | 260 |
| Themes with matches (production) | 15 (5.8%) |
| Total match pairs (production) | 23 |
| Feature vector dimensions | 7 |
| Similarity threshold | 0.25 |
| Max matches per theme | 3 |

**Feature dimensions**: growthRate, volatility, newsIntensity, scoreLevel, activeDaysNorm, priceChangePct, volumeIntensity

---

## Bottleneck Analysis (Ranked by Impact)

### [FINDING] Bottleneck #1 (HIGHEST IMPACT): Cross-Sector Penalty x0.7

The 30% penalty applied to cross-sector theme pairs is the single largest score suppressor.

**Mathematical proof:**
- 65% of all theme pairs are cross-sector (different sector classifications)
- The penalty raises the effective threshold from 0.250 to **0.357** for cross-sector pairs
- A pair scoring 0.30 raw (genuinely similar) becomes 0.21 after penalty — **rejected**
- A pair scoring 0.35 raw becomes 0.245 — **still rejected** (just barely)

[STAT:effect_size] Cross-sector mean score 0.195 vs same-sector 0.285 — delta = 0.090 (large practical effect)
[STAT:n] n = 4,862 cross-sector pairs vs n = 2,398 same-sector pairs
[STAT:ci] Effective threshold range: same-sector 0.250, cross-sector 0.357 (43% harder to reach)

**Recommendation**: Change penalty from 0.7 to **0.85**
- Effective cross-sector threshold drops from 0.357 to 0.294
- Expected impact: +6.7% more pairs above threshold (from 34.9% to 41.6%)
- Preserves the concept that cross-sector matches should score slightly higher to qualify

### [FINDING] Bottleneck #2 (HIGH IMPACT): Z-Score Euclidean Decay Factor

The decay parameter (0.7) in `exp(-distance * decay)` creates a steep falloff that compresses 
the similarity score range for typical theme pairs.

**Mathematical proof:**
- After z-score normalization, the mean absolute z-difference per dimension is ~1.0-1.2
  (this is a mathematical property of z-scores from any distribution)
- With 7 dimensions, median z-score euclidean distance = **1.30**
- At decay=0.7: exp(-1.30 * 0.7) = **0.403** (median featureSim)
- At decay=0.5: exp(-1.30 * 0.5) = **0.522** (median featureSim) — +30% lift

Per-dimension z-score difference analysis (production-calibrated):

| Dimension | Pop StdDev | Mean |z-diff| |
|-----------|-----------|----------------|
| growthRate | 0.0405 | 1.106 |
| volatility | 0.1062 | 1.020 |
| newsIntensity | 0.1235 | 0.987 |
| scoreLevel | 0.0602 | 1.192 |
| activeDaysNorm | 0.2461 | 1.139 |
| priceChangePct | 0.0319 | 1.131 |
| volumeIntensity | 0.0745 | 0.922 |

All dimensions converge to mean |z-diff| near 1.0 regardless of raw scale.
This is expected: z-score normalization equalizes dimensions, so the 
decay factor must be calibrated to this universal baseline distance.

[STAT:effect_size] Changing decay 0.7 -> 0.5 lifts featureSim mean from 0.389 to 0.515 (+32%)
[STAT:ci] Feature contribution to final score: 0.40 * 0.389 = 0.156 (current) vs 0.40 * 0.515 = 0.206 (proposed)
[STAT:n] n = 7,260 valid pairs evaluated

**Recommendation**: Change decay from 0.7 to **0.5**
- Expected impact: +10.3% more pairs above threshold
- The P10 featureSim lifts from 0.286 to 0.409 — far more discriminative range
- Decay 0.5 means distance=1.0 yields sim=0.607 (reasonable for "average" similarity)

Feature similarity at key distance percentiles:

| Distance | Current (d=0.7) | Proposed (d=0.5) | Aggressive (d=0.4) |
|----------|-----------------|------------------|--------------------|
| P10 (0.87) | 0.543 | 0.647 | 0.705 |
| P25 (1.07) | 0.473 | 0.585 | 0.652 |
| P50 (1.30) | 0.403 | 0.522 | 0.595 |
| P75 (1.55) | 0.337 | 0.460 | 0.537 |
| P90 (1.79) | 0.286 | 0.409 | 0.489 |

### [FINDING] Bottleneck #3 (LOW IMPACT): Keyword Jaccard Dead Zone

The keyword pillar produces zero for 91-95% of theme pairs and contributes effectively 
nothing to discrimination.

**Mathematical proof:**
- Korean stock themes use highly specific keywords (e.g., "양자컴퓨팅", "HBM", "ADC")
- Two themes rarely share any keywords unless they are in the exact same niche
- When Jaccard=0, the deadweight redistribution already transfers the keyword weight 
  to feature + curve pillars
- The keyword pillar only fires for ~8.1% of pairs, contributing mean sim = 0.224

[STAT:effect_size] Removing keywords: score changes by < 0.001 for 91% of pairs
[STAT:n] n = 6,672 pairs with keywordSim=0 (91.9%), n = 588 pairs with keywordSim>0 (8.1%)

**Recommendation**: **Remove the keyword pillar entirely**
- Simplify to a 2-pillar system (feature + curve)
- Impact on scores: negligible (E vs D: 53.7% vs 54.6%, delta < 1%)
- Benefit: removes code complexity, eliminates deadweight redistribution logic
- The keyword matching is better handled at the UI/display level (show shared keywords as context)

### [FINDING] Bottleneck #4 (NO CHANGE NEEDED): RMSE Multiplier 2.5

The shape similarity formula `max(0, 1 - sqrt(MSE) * 2.5)` is well-calibrated.

**Empirical validation:**
- Same-shape curve pairs: mean shapeSim = **0.772**
- Different-shape curve pairs: mean shapeSim = **0.120**
- Discrimination ratio: **3.86x** — excellent separation

[STAT:effect_size] Discrimination ratio 3.86x between same-shape and different-shape pairs
[STAT:n] n = 403 same-shape pairs, n = 1,597 different-shape pairs

Lowering the multiplier to 1.5 would reduce the discrimination ratio:
- Same-shape: 0.863, Diff-shape: 0.472 — ratio drops to **1.83x**
- This would flood results with false-positive curve matches

**Recommendation**: Keep multiplier at 2.5. This component works correctly.

---

## Combined Recommendation

Apply changes D (or E) from the variant analysis:

| Parameter | Current | Recommended | Rationale |
|-----------|---------|-------------|-----------|
| z-score decay | 0.7 | **0.5** | Matches z-score baseline distance of ~1.0 |
| Sector penalty | 0.7 | **0.85** | Recovers cross-sector pairs near threshold |
| Keyword pillar | 3-pillar | **2-pillar (remove)** | 91% zero contribution, adds complexity |
| RMSE multiplier | 2.5 | **2.5 (no change)** | Well-calibrated discrimination |
| Threshold | 0.25 | **0.25 (no change)** | Lowering to 0.20 is an option if still too strict |

### Expected Impact (Monte Carlo validated)

| Metric | Current | Recommended (D) | Delta |
|--------|---------|-----------------|-------|
| Pairs above 25% | 34.9% | **54.6%** | **+19.7%** |
| Mean similarity | 0.225 | **0.294** | +0.069 |
| P90 score | 0.378 | **0.467** | +0.089 |
| Cross-sector mean | 0.195 | **0.277** | +0.082 |
| Same-sector mean | 0.285 | **0.329** | +0.044 |

[STAT:effect_size] Combined changes lift pair match rate by +56% relative (34.9% -> 54.6%)
[STAT:ci] Cross-sector score recovery: +42% relative lift (0.195 -> 0.277)
[STAT:n] Monte Carlo simulation with n = 260 themes, 7,260 valid pairs

**For production (where only 5.8% match currently):**
The simulation's 34.9% baseline vs production's 5.8% gap indicates additional real-world 
data sparsity not captured in simulation. Applying the +56% relative lift to production 
estimates: 5.8% * 1.56 = ~9% themes with matches. The remaining gap is from data 
completeness issues (themes lacking sufficient interest data points), which is a data 
pipeline problem, not an algorithm problem.

---

## Specific Code Changes

### Change 1: `similarity.ts` line 109

```typescript
// BEFORE
return Math.exp(-distance * 0.7)

// AFTER
return Math.exp(-distance * 0.5)
```

### Change 2: `composite.ts` line 100

```typescript
// BEFORE
const rawSim = (...) * (sectorMatch ? 1.0 : 0.7)

// AFTER
const rawSim = (...) * (sectorMatch ? 1.0 : 0.85)
```

### Change 3 (Optional): Remove keyword pillar

Remove `keywordJaccard` import and calls. Simplify weight logic:

```typescript
// Simplified 2-pillar weights (no keyword)
let wFeature: number, wCurve: number
if (minCurveLen >= 14)     { wFeature = 0.40; wCurve = 0.60 }
else if (minCurveLen >= 7) { wFeature = 0.60; wCurve = 0.40 }
else                       { wFeature = 1.00; wCurve = 0.00 }
```

---

## [LIMITATION]

1. **Simulation vs production gap**: Monte Carlo generates synthetic features that may not 
   capture the exact distribution of real Korean stock theme data. The 34.9% baseline in 
   simulation vs 5.8% in production suggests real data has additional sparsity factors 
   (missing interest data, very short-lived themes, data pipeline gaps).

2. **No false-positive validation**: This analysis measures score lift but does not validate 
   whether newly-matched pairs are semantically meaningful. A human review of newly surfaced 
   matches after parameter changes is recommended.

3. **Naver DataLab normalization**: The per-batch self-normalization of interest data creates 
   artificial variation patterns. Two themes normalized against different batches may show 
   curve dissimilarity that is an artifact of the normalization, not real behavioral difference.

4. **activeDaysNorm dominance**: This dimension has the highest raw stddev (0.246) but after 
   z-score normalization it contributes equally to distance. A theme active for 10 days vs 
   300 days will show the same z-score magnitude as a theme with score 30 vs 60. Consider 
   whether activeDaysNorm should be downweighted or excluded from the feature vector.

---

Report generated: 2026-02-11 12:21:19
