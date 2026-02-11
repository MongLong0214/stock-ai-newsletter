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

### 7. UI Enterprise Review Improvements (Feb 11)

#### comparison-list/index.tsx
- Client-side quality filter `MIN_PAST_TOTAL_DAYS = 14` (defense-in-depth, matches pipeline)
- Original index preserved for chart overlay selection
- Average similarity summary in subtitle
- Key changed to `comp.pastThemeId`
- Empty state: "신뢰도 높은 비교 테마가 없습니다"

#### comparison-card.tsx
- Timeline subject label: "과거 {comp.pastTheme} 주기 기준"
- Accessibility: `role="button"`, `tabIndex={0}`, `aria-pressed`, `onKeyDown`
- Removed useMemo for simple `message.split('.')`
- Extracted `isBeyondPastCycle` boolean
- Consistent `formatDays` for displayCurrentDay
- "현재 테마 N일 경과" prefix for clarity
- "과거 패턴 기준, 피크까지 약 N일 추정" text

#### pillar-bars.tsx
- Fixed redundant null coalescing after null check

#### theme-prediction/index.tsx
- Added continuous progress bar (currentProgress / peakProgress)
- Phase-colored fill bar with animated dot indicator
- Amber peak marker line
- Labels: "시작", "평균 피크 (N일)", "평균 종료 (~N일)"

### 8. enrich-themes.ts Extraction
- **File**: `scripts/tli/enrich-themes.ts` (new file, extracted from calculate-comparisons.ts)
- Contains: `enrichThemes()`, `computePopulationStats()`, `resolveFirstSpikeDate()`
- Types: `RawTheme`, `EnrichedTheme`, `ThemeDataMaps`
- calculate-comparisons.ts trimmed to 197 lines (under 200-line limit)

### 9. DB Garbage Cleanup (Feb 11)
- Deleted 2,498/2,621 records with `past_total_days < 14` (garbage from INTEGER bug period 2/6-2/10)
- Deleted 106 records with `past_peak_day > past_total_days` (uncapped peak data)
- Final: 17 valid records remaining
- Root cause: `data-ops.ts` INTEGER bug → interest data loss → empty curves → garbage comparisons

### 10. Types Cleanup
- `lib/tli/types/api.ts` — Removed `postPeakDecline` field from ComparisonResult
- `build-comparisons.ts` — Added caps: currentDay <= 365, pastPeakDay <= pastTotalDays

## Files Modified (20+ total)
- `lib/tli/comparison/composite.ts` — RMSE+deriv curveSim, weight cap, wording
- `lib/tli/comparison/similarity.ts` — exp scaling 0.7
- `lib/tli/comparison/features.ts` — 7D vector
- `lib/tli/comparison/timeline.ts` — findPeakDay sentinel
- `lib/tli/prediction.ts` — quality gate
- `lib/tli/types/api.ts` — type cleanup
- `scripts/tli/calculate-comparisons.ts` — totalDays filter, spike inference, stock loading (197 lines)
- `scripts/tli/enrich-themes.ts` — NEW: extracted enrichment logic
- `scripts/tli/backtest-comparisons.ts` — aligned with new API
- `scripts/tli/snapshot-predictions.ts` — aligned
- `app/api/tli/themes/[id]/build-comparisons.ts` — caps
- `app/themes/[id]/_components/comparison-list/index.tsx` — quality filter, summary, empty state
- `app/themes/[id]/_components/comparison-list/comparison-card.tsx` — accessibility, clarity, formatting
- `app/themes/[id]/_components/comparison-list/pillar-bars.tsx` — null check fix
- `app/themes/[id]/_components/theme-prediction/index.tsx` — progress bar
- Tests: composite, features, prediction, timeline
