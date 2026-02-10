# Comparison Algorithm Redesign v2 (Feb 2026)

## Overview
Full redesign of the theme comparison algorithm to fix 6 CRITICAL bugs, improve wording, and fix theme age issues.
Branch: `compare`

## Key Changes

### 1. Similarity Function: `exp(-distance * 0.7)`
- **File**: `lib/tli/comparison/similarity.ts:109`
- Changed from `exp(-distance)` → `exp(-distance * 0.7)`
- Provides better discrimination without being too aggressive (2.5 was too steep)
- distance=0→1.0, 0.5→0.70, 1.0→0.50, 2.0→0.25

### 2. Curve Similarity: RMSE + Derivative Correlation
- **File**: `lib/tli/comparison/composite.ts:57-89`
- Replaced simple Pearson correlation with dual approach:
  - RMSE shape similarity (60% weight): `1 - rmse * 2.5`
  - Derivative correlation (40% weight): Pearson on diff(curve)
- Distinguishes monotonically decreasing curves by their rate of change

### 3. Feature Vector: 5D → 7D
- **File**: `lib/tli/comparison/features.ts`
- Added `priceChangePct` ([-50,+50]% → [0,1]) and `volumeIntensity` (max 50M shares)
- New params are optional with defaults (backward compatible)
- `featuresToArray()` updated to include new dimensions

### 4. Weight Cap: 0.65
- **File**: `lib/tli/comparison/composite.ts:99`
- `wFeature = Math.min(wFeature, 0.65)` prevents single-pillar dominance
- When keywordSim=0 + curveSim=0, max similarity = 0.65 instead of 1.0

### 5. findPeakDay Sentinel: -1
- **File**: `lib/tli/comparison/timeline.ts:40-51`
- Returns -1 for empty data or all-zero values (was 0, conflicting with actual day-0 peak)
- DB stores `Math.max(0, peakDay)` — sentinel is internal only

### 6. Prediction Quality Gate
- **File**: `lib/tli/prediction.ts:114-116`
- Filters individual comparisons with `pastTotalDays < 14` instead of rejecting all
- `daysSinceSpike` capped at 365

### 7. UI Improvements
- `comparison-card.tsx` — Timeline hidden when pastTotalDays < 14 or pastPeakDay <= 0
- Days formatting: 365+ → "1년+", 30+ → "N일(~M개월)"
- Past theme name included in wording for context
- `pillar-bars.tsx` — Korean labels: 수치 유사, 흐름 유사, 연관어

### 8. Types Cleanup
- `lib/tli/types/api.ts` — Removed `postPeakDecline` field from ComparisonResult
- `build-comparisons.ts` — Added caps: currentDay <= 365, pastPeakDay <= pastTotalDays

## Files Modified (19 total)
- `lib/tli/comparison/composite.ts` — RMSE+deriv curveSim, weight cap, wording
- `lib/tli/comparison/similarity.ts` — exp scaling 0.7
- `lib/tli/comparison/features.ts` — 7D vector
- `lib/tli/comparison/timeline.ts` — findPeakDay sentinel
- `lib/tli/prediction.ts` — quality gate
- `lib/tli/types/api.ts` — type cleanup
- `scripts/tli/calculate-comparisons.ts` — totalDays filter, spike inference, stock loading
- `scripts/tli/backtest-comparisons.ts` — aligned with new API
- `scripts/tli/snapshot-predictions.ts` — aligned
- `app/api/tli/themes/[id]/build-comparisons.ts` — caps
- `app/themes/[id]/_components/comparison-list/comparison-card.tsx` — UI
- `app/themes/[id]/_components/comparison-list/pillar-bars.tsx` — labels
- `app/themes/[id]/_components/theme-prediction/index.tsx` — display
- `app/themes/[id]/_components/theme-prediction/sub-components.tsx`
- `app/themes/[id]/_components/detail-header/metric-grid.tsx`
- `lib/tli/__tests__/composite.test.ts` — 7D features
- `lib/tli/__tests__/features.test.ts` — 7D features
- `lib/tli/__tests__/prediction.test.ts` — quality gate
- `lib/tli/__tests__/timeline.test.ts` — sentinel

## SIMILARITY_THRESHOLD
- Was 0.40, plan recommended lowering to 0.35 due to steeper exp
- Final value in `calculate-comparisons.ts` should be verified after running pipeline

## Important Decisions
- exp scaling: 0.7 chosen over 2.5 (too aggressive) and 1.0 (original, no discrimination)
- Volume max: 50M shares (Korean market appropriate)
- Weight cap: 0.65 (not 0.60 — too aggressive for short-data themes)
- DB stores peakDay as 0 (not -1), sentinel is internal pipeline only
