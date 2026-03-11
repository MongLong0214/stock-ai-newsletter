# TLI Pipeline Legacy Flow — Comprehensive Stage Mapping

> Generated: 2026-03-11 | Based on: collect-and-score.ts → pipeline-steps.ts → 8 legacy files

## Executive Summary

The TLI pipeline in `collect-and-score.ts` delegates to **8 core legacy functions** across **Steps 4-8**:
- **Step 4**: calculateAndSaveScores (scores table)
- **Step 4.5**: computeOptimalThreshold (no DB) → tuned threshold param
- **Step 5**: calculateThemeComparisons (theme_comparisons table) + **V4 shadow write**
- **Step 6**: snapshotPredictions (prediction_snapshots table) + **V4 shadow write**
- **Step 7**: evaluatePredictions (updates prediction_snapshots status)
- **Step 8**: evaluateComparisonOutcomes (theme_comparisons updates)
- **Step 3.5**: runCalibrationPhase (monthly recalibration, no writes to legacy tables)

All comparisons (Step 5) and predictions (Step 6) trigger **V4 shadow write** via `comparison-v4-shadow.ts` (enabled by ENV).

---

## Stage Details

### STEP 4: Lifecycle Score Calculation
**File**: `scripts/tli/calculate-scores.ts`
**Function**: `calculateAndSaveScores(themes: ThemeWithKeywords[])`
**Output Tables**:
- `lifecycle_scores` (upsert): id, theme_id, score, stage, calculated_at, ...scoring components

**Read Dependencies**:
- `interest_metrics` (latest normalized values)
- `news_metrics` (latest values)
- `theme_stocks` (latest price/volatility)
- `themes` (is_active, created_at)

**Scoring Algorithm** (v2):
- Interest (40%) + News Momentum (35%) + Activity (10%) + Volatility (15%)
- Confidence: high/medium/low based on data coverage
- Stage: Peak (≥80) → Growth (≥60) → Early (≥40) → Decay (≥20) → Dormant (<20)

**V4 Shadow Write**: None

---

### STEP 4.5: Comparison Threshold Auto-Tuning
**File**: `scripts/tli/auto-tune.ts`
**Function**: `computeOptimalThreshold(): Promise<OptimalThresholdResult | null>`
**Output Tables**: None (returns in-memory threshold object)

**Read Dependencies**:
- `theme_comparisons` (verified comparisons from last 30 days)
  - Filter: outcome_verified=true, verified_at >= 30 days ago

**Algorithm**:
- F1-optimized grid search over [0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
- Accuracy threshold: trajectory_correlation >= 0.5 (0.3 in evaluator, but 0.5 for tuning)
- Bayesian shrinkage: shrinks candidate threshold toward DEFAULT(0.35) by (n/100)
- Min samples: 30 (returns null if <30 verified comparisons)
- Confidence: low (<50 samples), medium (50-99), high (≥100)
- Returns: { threshold, confidence, sampleSize }

**V4 Shadow Write**: None

---

### STEP 5: Theme Comparison Analysis (Legacy)
**File**: `scripts/tli/calculate-comparisons.ts`
**Function**: `calculateThemeComparisons(themes: ThemeWithKeywords[], thresholdOverride?: number)`
**Output Tables**:
- `theme_comparisons` (upsert by id): id, current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, feature_sim, curve_sim, keyword_sim, calculated_at

**Read Dependencies**:
- `themes` (ALL themes, not just active)
- `interest_metrics` (all historical, latest 180 days+)
- `news_metrics` (all historical)
- `theme_stocks` (all historical)
- `lifecycle_scores` (all historical)

**Algorithm** (Multi-signal composite):
1. Load ALL themes + enrich with spike inference
2. Compute population stats (mean, std of 8-feature vector)
3. Build Mutual Rank index (feature-space) to prevent hub dominance
4. Build Curve Mutual Rank index (trajectory-space, exponential kernel)
5. For each ACTIVE theme:
   - Find top 3 matches (MAX_MATCHES_PER_THEME) above threshold
   - Calculate: similarity = composite(feature_sim, curve_sim, keyword_sim)
   - Save matches with metadata (past_peak_day, estimatedDaysToPeak, message)
   - **Trigger V4 shadow write** if `shadowConfig.enabled`

**V4 Shadow Write** (if enabled):
- Calls: `upsertComparisonShadowRun({ config, runDate, currentThemeId, sourceDataCutoffDate, matches })`
- Also calls: `determineShadowCandidatePool(matches)` to classify candidates
- Purpose: Record both legacy match results AND prospective V4 candidates for preview

**Threshold Handling**:
- Use `thresholdOverride` if provided (from Step 4.5)
- Fall back to DEFAULT_THRESHOLD (0.35)
- Filters matches: `similarity >= effectiveThreshold`

---

### STEP 6: Prediction Snapshot (Legacy)
**File**: `scripts/tli/snapshot-predictions.ts`
**Function**: `snapshotPredictions(): Promise<void>`
**Output Tables**:
- `prediction_snapshots` (upsert by theme_id,snapshot_date): theme_id, snapshot_date, comparison_count, avg_similarity, phase, confidence, risk_level, momentum, avg_peak_day, avg_total_days, avg_days_to_peak, current_progress, days_since_spike, best_scenario, median_scenario, worst_scenario, prediction_intervals, status='pending'

**Read Dependencies**:
- `themes` (is_active, first_spike_date)
- `theme_comparisons` (latest per (theme_id, past_theme_id))
- `lifecycle_scores` (latest score/stage for confidence calc)
- Shadow runs (if V4 enabled)

**Algorithm**:
1. Load active themes + their latest comparisons (deduplicated by theme_id|past_theme_id)
2. Check V4 shadow runs for same themes (if enabled)
3. For each theme:
   - Get legacy comparisons OR V4 shadow candidates
   - Call `calculatePrediction(first_spike_date, inputs, today, score, stage)`
   - Returns: phase, confidence, scenarios, prediction_intervals, momentum, risk_level
4. Upsert all snapshots with status='pending'
5. **Trigger V4 shadow write** via `upsertPredictionShadowSnapshot({ config, runId, themeId, candidatePool, prediction })`

**V4 Shadow Write** (if enabled):
- Calls: `upsertPredictionShadowSnapshot()` per theme
- Also calls: `markShadowRunCompleteWithoutSnapshot()` if no legacy comparisons exist
- Purpose: Save V4 prediction alongside legacy for A/B comparison

**Confidence Calculation** (v2):
- Based on: (interestCoverage × 0.6) + (newsCoverage × 0.4)
- Thresholds: high (≥0.7 + ≥14d data), medium (≥0.4 + ≥7d), low (<0.4 or <7d)

---

### STEP 7: Prediction Evaluation
**File**: `scripts/tli/evaluate-predictions.ts`
**Function**: `evaluatePredictions(): Promise<void>`
**Output Tables**:
- `prediction_snapshots` (update): status='evaluated', actual_score, actual_stage, phase_correct, peak_timing_error_days, evaluated_at

**Read Dependencies**:
- `prediction_snapshots` (status='pending', snapshot_date <= cutoff)
- `lifecycle_scores` (history for target date matching)

**Algorithm**:
1. Load pending snapshots older than EVALUATION_WINDOW (7 days, v2 changed from 14)
2. For each snapshot:
   - Find closest lifecycle_scores at (snapshot_date + 7 days)
   - Calculate phase correctness: snapshot.phase → expected_stages mapping
   - Calculate peak timing error: |daysSinceSnapshot - predictedDaysFromSnapshot|
   - Update status='evaluated' with results
3. Max tolerance: 3 days

**V4 Shadow Write**: None (reads only)

---

### STEP 8: Comparison Outcome Verification
**File**: `scripts/tli/evaluate-comparisons.ts`
**Function**: `evaluateComparisonOutcomes(tunedThreshold?: number)`
**Output Tables**:
- `theme_comparisons` (update): outcome_verified=true, trajectory_correlation, stage_match, binary_relevant, graded_gain, verified_at, ...

**Read Dependencies**:
- `theme_comparisons` (unverified, calculated_at <= MIN_VERIFICATION_DAYS ago)
- `interest_metrics` (180-day history)
- `lifecycle_scores` (all history for stage matching)
- `themes` (first_spike_date for past theme alignment)

**Algorithm**:
1. Load unverified comparisons older than COMPARISON_PRIMARY_HORIZON_DAYS (14 days)
2. For each comparison:
   - Extract current theme's future trajectory (14 days after comparison date)
   - Extract past theme's lifecycle-aligned trajectory
   - Compute Pearson correlation (trajectory_correlation) with centering
   - Find stage match at H+14
   - Calculate binary_relevant (trajectory_correlation >= 0.3)
   - Calculate graded_gain (weighted relevance score)
   - Handle censoring if data insufficient
3. Upsert verification results with outcome_verified=true

**V4 Shadow Write**: None (reads only)

---

### STEP 3.5: Calibration Phase (Monthly)
**File**: `scripts/tli/calibrate-*.ts` (3 files)
**Functions**:
- `calibrateNoiseThreshold()` → updates score config (no DB table)
- `calibrateConfidence()` → updates score config (no DB table)
- `calibrateWeights()` → updates score config (no DB table)

**Frequency**: 1st day of month only

**Output Tables**: None (all write to in-memory config)

**Read Dependencies**:
- `lifecycle_scores` (all history)
- `theme_comparisons` (all history)
- `prediction_snapshots` (all history)

**Purpose**: Monthly recalibration of:
- Minimum raw interest floor (noise dampening)
- Confidence thresholds
- Scoring weights (interest, news, activity, volatility)

---

## V4 Shadow Write Mechanism

**Controlled by**: `getComparisonV4ShadowConfig()` in `comparison-v4-shadow.ts`
**Enabled by**: Environment variable (check config retrieval)
**Active in Steps**: 5 (comparisons) and 6 (predictions)

### Shadow Comparison Run
```typescript
// Step 5: After findTopMatches()
upsertComparisonShadowRun({
  config: shadowConfig,
  runDate,
  currentThemeId,
  sourceDataCutoffDate,
  matches: MatchResult[],
})
```
- Records: run metadata + candidate pool classification
- Tables: theme_comparison_v4_runs, theme_comparison_v4_candidates

### Shadow Prediction Snapshot
```typescript
// Step 6: After calculatePrediction()
upsertPredictionShadowSnapshot({
  config: shadowConfig,
  runId,
  themeId,
  candidatePool,
  prediction: PredictionResult,
})
```
- Records: prediction alongside legacy
- Tables: prediction_v4_snapshots, prediction_v4_candidates

---

## Database Table Dependencies

### Tables Written (Steps 1-8)
| Table | Step | Write Type | Key Columns |
|-------|------|-----------|------------|
| `interest_metrics` | 1 | upsert | theme_id, time |
| `news_metrics` | 2 | upsert | theme_id, time |
| `theme_news_articles` | 2 | upsert | theme_id, link |
| `theme_stocks` | 3 | upsert | theme_id, calculated_at |
| `lifecycle_scores` | 4 | upsert | theme_id, calculated_at |
| `theme_comparisons` | 5 | upsert | current_theme_id, past_theme_id, calculated_at |
| `theme_comparison_v4_*` | 5 | upsert | (V4 shadow only) |
| `prediction_snapshots` | 6 | upsert | theme_id, snapshot_date |
| `prediction_v4_snapshots` | 6 | upsert | (V4 shadow only) |

### Tables Read (Steps 4-8)
| Table | Steps | Purpose |
|-------|-------|---------|
| `themes` | 5,8 | Theme metadata, first_spike_date, is_active |
| `interest_metrics` | 5,8 | Historical trend data (180+ days) |
| `news_metrics` | 5 | News volume trends |
| `theme_stocks` | 5 | Price/volatility data |
| `lifecycle_scores` | 5,6,7,8 | Score history for stage matching, confidence |
| `theme_comparisons` | 4.5,6,7 | Verified comparisons (for tuning, predictions, evaluation) |
| `prediction_snapshots` | 7 | Pending snapshots for evaluation |

---

## Critical Import Chains

### Step 5 → V4 Shadow
```typescript
// calculate-comparisons.ts
import { getComparisonV4ShadowConfig, upsertComparisonShadowRun } from './comparison-v4-shadow'
import { determineShadowCandidatePool } from './comparison-v4-shadow'

// Usage: After saveMatches(), if shadowConfig.enabled
await upsertComparisonShadowRun({...})
```

### Step 6 → V4 Shadow
```typescript
// snapshot-predictions.ts
import {
  getComparisonV4ShadowConfig,
  loadShadowRunsByTheme,
  loadShadowCandidatesByRunIds,
  upsertPredictionShadowSnapshot,
  markShadowRunCompleteWithoutSnapshot,
  toPredictionInputsFromShadowCandidates,
} from './comparison-v4-shadow'

// Usage: Before & after calculatePrediction()
```

---

## Key Thresholds & Constants

| Constant | Value | Usage |
|----------|-------|-------|
| `DEFAULT_THRESHOLD` | 0.35 | Step 5: fallback similarity threshold |
| `TUNING_ACCURACY_THRESHOLD` | 0.5 | Step 4.5: min trajectory_corr for "accurate" |
| `COMPARISON_PRIMARY_HORIZON_DAYS` | 14 | Step 8: evaluation window |
| `EVALUATION_WINDOW` | 7 | Step 7: days until prediction evaluation |
| `MIN_SAMPLES_FOR_TUNING` | 30 | Step 4.5: min verified comparisons |
| `MAX_MATCHES_PER_THEME` | 3 | Step 5: max similar themes per theme |
| `STAGE_TOLERANCE_DAYS` | 3 | Step 8: date matching tolerance |

---

## Failure Modes & Fallbacks

### Step 5 (Comparisons)
- V4 shadow write failure → logs warning, pipeline continues
- All matches empty → shadows null matches via `upsertComparisonShadowRun()`
- Threshold override → uses provided, else DEFAULT

### Step 6 (Predictions)
- V4 shadow load failure → uses legacy path only
- No comparisons & no shadows → skips theme
- prediction_intervals column missing → fallback to upsert without it

### Step 7 (Eval)
- Score data unavailable → skips snapshot (no update)
- Date tolerance exceeded → skips snapshot

### Step 8 (Verification)
- Interest data insufficient → marks censored
- Trajectory correlation NaN → records as 0
- First spike date unresolvable → uses created_at fallback

---

## Version Info

**Legacy Algorithm Version**: v2 (Feb 2026)
- Confidence: interest (60%) + news (40%)
- Evaluation window: 14 → 7 days (v2)
- Evaluation horizon: 14 days (fixed)
- Tuning accuracy: trajectory_correlation >= 0.5

**Comparison V4 Versions** (from shadow config):
- DEFAULT_COMPARISON_V4_ALGORITHM_VERSION
- DEFAULT_COMPARISON_V4_SPEC_VERSION
- DEFAULT_COMPARISON_V4_THRESHOLD_POLICY_VERSION
- DEFAULT_LIFECYCLE_SCORE_VERSION
- DEFAULT_THEME_DEFINITION_VERSION
