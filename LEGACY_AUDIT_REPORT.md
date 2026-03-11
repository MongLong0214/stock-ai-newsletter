# Theme Legacy Code Full Audit (Comparison/Prediction v1 → v4 Migration)

**Date**: 2026-03-11
**Purpose**: Identify all legacy comparison/prediction code for comparison-v4 (v2 tables) migration
**Total Matches Found**: 64 references across 25 files

---

## 1. DB REFERENCES: Legacy Tables

### Tables Under Migration
- **`theme_comparisons`** (v1) → `theme_comparison_runs_v2` + `theme_comparison_candidates_v2`
- **`prediction_snapshots`** (v1) → `prediction_snapshots_v2`
- **`comparison_calibrations`** (v1) → Calibration logic moved to scripts, no v2 table yet

### Migration Status
- ✅ **v2 Tables Created**: migrations 016 (foundation), 019 (serving view)
- ✅ **v4 Serving View**: `v_comparison_v4_serving` for real-time reads
- ⏳ **Legacy Cleanup**: `COMPARISON_V4_LEGACY_CLEANUP_DAYS` = 90 (see comparison-v4-ops.ts)

---

## 2. DB MIGRATIONS — Legacy & Transition

| File | Lines | Description | Action |
|------|-------|-------------|--------|
| `supabase/migrations/003_create_tli_tables.sql` | 229-260 | Creates `theme_comparisons` table (v1 foundation) | **DEPRECATE** (v2 supersedes) |
| `supabase/migrations/006_add_comparison_pillar_scores.sql` | 1-7 | Adds 3-pillar scores to v1 `theme_comparisons` | **DEPRECATE** (pillar fields in v2 candidates) |
| `supabase/migrations/007_create_prediction_snapshots.sql` | 2-41 | Creates v1 `prediction_snapshots` table | **DEPRECATE** (v2 table exists) |
| `supabase/migrations/008_add_comparison_outcome_tracking.sql` | 2+ | Adds outcome tracking to v1 comparisons | **DEPRECATE** (v2 has evaluation table) |
| `supabase/migrations/009_tli_algorithm_v3.sql` | 22-37 | Updates stage labels (Emerging/Decline) in v1 comparisons | **DEPRECATE** (v2 fresh) |
| `supabase/migrations/013_tli_scientific_rigor.sql` | 53-54 | Adds prediction intervals to v1 `prediction_snapshots` | **DEPRECATE** (v2 has `prediction_intervals` JSON) |
| `supabase/migrations/016_comparison_v4_foundation.sql` | 83-173 | **NEW**: Creates `prediction_snapshots_v2` + v2 tables | **KEEP** (v4 foundation) |
| `supabase/migrations/019_comparison_v4_serving_view.sql` | 60+ | **NEW**: Creates `v_comparison_v4_serving` view | **KEEP** (serving layer) |

---

## 3. API ROUTES — Comparison/Prediction Readers

### fetch-theme-data.ts (Lines 53-175)
**Status**: HYBRID (Dual-mode reader with v4 fallback)

```typescript
// Line 58: Check if v4 is enabled
const useV4Serving = isComparisonV4ServingEnabled()

// Lines 65-74: Branch logic
if (useV4Serving)
  fetchPublishedComparisonRowsV4()  // Uses v4 view
else
  from('theme_comparisons')          // Falls back to v1 table

// Line 162: Fallback logic
if (shouldFallbackToLegacyComparisons(comparisonsRes)) {
  // Retry v1 table if v4 fails
}
```

**Migration Action**: **KEEP** (with v1 fallback removal after full v4 cutover)

### build-comparisons.ts (Lines 1-120)
**Status**: HYBRID (v2 candidate reader + legacy comparison builder)

```typescript
// Line 26: Transforms v2 candidates → legacy ComparisonResult
export const buildComparisonResultFromV2Candidate = (
  candidate: V2CandidateForBuild,
  context: { pastThemeName, lifecycleCurve }
): ComparisonResult => { ... }

// Lines 77-120: Legacy comparison builder
export async function buildComparisonResults(
  comparisons: Comparison[]
): Promise<ComparisonResult[]> {
  // Still reads theme names + curves from v1 lifecycle_scores
}
```

**Migration Action**: **KEEP** (transforms v2 → legacy output format for FE compatibility)

### comparison-v4-reader.ts (Lines 1-95)
**Status**: NEW v4 reader

```typescript
// Line 30: Feature toggle
export function isComparisonV4ServingEnabled() {
  return process.env.TLI_COMPARISON_V4_SERVING_ENABLED === 'true'
}

// Lines 54-69: Maps v2 candidates to legacy format
export function mapV2CandidatesToLegacyComparisons(rows: ComparisonV2CandidateRow[]) {
  return rows.map(row => ({ id: row.candidate_theme_id, ... }))
}

// Lines 72-95: Fetches from v4 serving view
async function fetchFromServingView(themeId: string) {
  from('v_comparison_v4_serving')
}
```

**Migration Action**: **KEEP** (v4 reader, fully operationalized)

### fetch-theme-data-v4.ts (Lines 1-27)
**Status**: Helper functions for v4 routing

```typescript
// Line 1-9: Query descriptor builder
export function buildComparisonsQueryDescriptor(input) {
  return input.useV4Serving
    ? { mode: 'v4', themeId }
    : { mode: 'legacy', themeId, threeDaysAgo }
}

// Lines 11-18: Fallback trigger
export function shouldFallbackToLegacyComparisons(result) {
  if (result.error || !result.data) return true
  return false
}
```

**Migration Action**: **KEEP** (routing layer, needed during transition)

### build-response.ts
**Status**: Response assembler (uses FetchThemeDataResult union type)

**Migration Action**: **KEEP** (agnostic to source)

### route.ts
**Status**: Main GET handler orchestrating fetches

**Migration Action**: **KEEP** (calls fetchThemeData which handles routing)

---

## 4. PIPELINE SCRIPTS — Legacy Comparison/Prediction Calculation

### calculate-comparisons.ts (Lines 26-235)
**Status**: LEGACY (Writes to v1 `theme_comparisons` table)

```typescript
// Line 26: Main function
export async function calculateThemeComparisons(
  themes: ThemeWithKeywords[],
  thresholdOverride?: number
)

// Line 105: Clears v1 table
from('theme_comparisons').delete()

// Lines 207, 235: Writes to v1 table
from('theme_comparisons')
  .insert(...) / .upsert(...)
  .delete()
```

**Dependencies**:
- `compositeCompare()` from `lib/tli/comparison/composite.ts`
- `buildMutualRankIndex()` from `lib/tli/comparison/mutual-rank.ts`
- Shadow config from `comparison-v4-shadow.ts`

**Migration Action**: **DEPRECATE** (replaced by comparison-v4-shadow.ts + comparison-v4-execution.ts)

### evaluate-comparisons.ts (Lines 24-160)
**Status**: LEGACY (Evaluates v1 comparisons, writes outcome_verified flag)

```typescript
// Line 31: Reads from v1
from('theme_comparisons')
  .select('id, current_theme_id, ...')
  .or('outcome_verified.is.null,outcome_verified.eq.false')
  .lte('calculated_at', cutoffDate)

// Lines 252+: Builds evaluation rows
const evalRows: ThemeComparisonEvalV2[] = [...]
```

**Scope**: 14-day horizon evaluation of unverified comparisons

**Migration Action**: **DEPRECATE** (v4 evaluation in comparison-v4-evaluator.ts + comparison-v4-eval-writer.ts)

### evaluate-predictions.ts (Lines 14-105)
**Status**: LEGACY (Evaluates v1 prediction snapshots)

```typescript
// Line 14: Reads from v1
from('prediction_snapshots')
  .select(...)
  .eq('status', 'pending')
  .limit(500)

// Line 99: Updates v1
from('prediction_snapshots')
  .update({ evaluated_at: ..., result: ... })
```

**Scope**: Marks predictions as evaluated

**Migration Action**: **DEPRECATE** (v4 predictions in snapshot-predictions.ts)

### snapshot-predictions.ts (Lines 65-220)
**Status**: HYBRID (Reads v1 comparisons, writes v2 snapshots)

```typescript
// Line 65: Reads from v1
from('theme_comparisons')
  .select(...)

// Line 202, 214: Reads from v1 prediction_snapshots
from('prediction_snapshots')
  .select(...)

// Line 103: Writes to v2
buildPredictionSnapshotRowV2({...})
```

**Migration Action**: **KEEP** (hybrid, feeds v2 pipeline)

### run-comparisons.ts
**Status**: Legacy wrapper for batch comparison run

```typescript
// Line 6: Calls legacy calculator
await calculateThemeComparisons(themes, tuning?.threshold)
```

**Migration Action**: **DEPRECATE** (use comparison-v4-orchestration.ts instead)

### calibrate-confidence.ts (Lines 23+)
**Status**: Reads from v1 prediction_snapshots for calibration

```typescript
from('prediction_snapshots')
  .select(...)
  .eq('evaluated', true)
```

**Migration Action**: **REVIEW** (may need v2 table support)

### auto-tune.ts (Lines 84+)
**Status**: Reads from v1 comparisons for threshold optimization

```typescript
from('theme_comparisons')
  .select(...)
```

**Migration Action**: **REVIEW** (calibration logic portable to v2)

### validate-horizon-fix.ts (Lines 27+)
**Status**: Reads from v1 prediction_snapshots for data validation

```typescript
from('prediction_snapshots')
```

**Migration Action**: **DEPRECATE** (validation only needed during transition)

### validate-stage-persistence.ts (Lines 80+)
**Status**: Validates stage persistence in v1 snapshots

```typescript
from('prediction_snapshots')
```

**Migration Action**: **DEPRECATE**

### backfill-comparison-v4.ts
**Status**: NEW (v4 backfill from v1 source)

```typescript
// Line 21: Reads from v1
sourceTable: 'theme_comparisons'
```

**Migration Action**: **KEEP** (essential backfill tool)

---

## 5. FRONTEND COMPONENTS — Comparison/Prediction Display

### app/themes/[id]/_components/comparison-list/index.tsx
**Status**: Displays comparisons from API response

- Calls `calculatePrediction()` with comparison data
- Uses `ComparisonResult` type from API
- **Agnostic** to DB source (v1 or v4)

**Migration Action**: **KEEP** (no change needed)

### app/themes/[id]/_components/theme-prediction/index.tsx
**Status**: Displays prediction from API response

- Calls `calculatePrediction()` from `lib/tli/prediction`
- Uses `PredictionResult` type
- **Agnostic** to source

**Migration Action**: **KEEP** (no change needed)

### app/themes/[id]/_components/detail-content.tsx
**Status**: Orchestrates detail rendering

**Migration Action**: **KEEP**

### Other detail components
- `detail-header/metric-grid.tsx`
- `theme-prediction/sub-components.tsx`

**Migration Action**: **KEEP** (read-only display)

---

## 6. TYPE DEFINITIONS & SCHEMA

### lib/tli/types/db.ts (Lines 135-248)
**Status**: Contains both v1 and v2 type definitions

| Type | Source | Status |
|------|--------|--------|
| `ThemeComparison` | v1 table | **DEPRECATE** |
| `ComparisonCalibration` | v1 table | **DEPRECATE** |
| `ThemeComparisonRunV2` | v2 table | **KEEP** |
| `ThemeComparisonCandidateV2` | v2 table | **KEEP** |
| `ThemeComparisonEvalV2` | v2 table | **KEEP** |
| `PredictionSnapshotV2` | v2 table | **KEEP** |

**Migration Action**: Remove ThemeComparison + ComparisonCalibration after v1 table deprecation

### lib/tli/types/api.ts
**Status**: API response types (agnostic to DB source)

```typescript
export type ComparisonResult = { ... }  // Legacy API format
export type PredictionResult = { ... }  // Legacy API format
```

**Migration Action**: **KEEP** (FE compatibility layer)

---

## 7. COMPARISON LOGIC MODULES (lib/tli/comparison/)

### composite.ts
**Status**: Core similarity algorithm (multi-signal composite score)

**Used by**:
- `calculate-comparisons.ts` (legacy)
- `comparison-v4-shadow.ts` (v4)

**Migration Action**: **KEEP** (algorithm, language-independent)

### similarity.ts
**Status**: Pearson correlation + feature stats

**Used by**: `composite.ts`

**Migration Action**: **KEEP** (algorithm)

### features.ts
**Status**: Feature extraction (sector, keyword, etc.)

**Used by**: `composite.ts`

**Migration Action**: **KEEP** (algorithm)

### timeline.ts
**Status**: Time-series normalization + peak finding

**Used by**: `calculate-comparisons.ts`, `enrich-themes.ts`

**Migration Action**: **KEEP** (algorithm)

### mutual-rank.ts
**Status**: Mutual rank indexing for unbiased comparisons

**Used by**: `calculate-comparisons.ts`, `comparison-v4-shadow.ts`

**Migration Action**: **KEEP** (algorithm)

### dtw.ts
**Status**: Dynamic Time Warping distance

**Used by**: Tests only (not in production)

**Migration Action**: **REVIEW** (remove if unused)

### spec.ts
**Status**: Comparison specification constants + evaluation logic

```typescript
export const COMPARISON_PRIMARY_HORIZON_DAYS = 14
export const computeBinaryRelevance = (...)
export const classifyRunLevelCensoring = (...)
```

**Used by**: `evaluate-comparisons.ts`, `comparison-v4-evaluator.ts`

**Migration Action**: **KEEP** (shared by v1 & v4)

---

## 8. PREDICTION MODULES (lib/tli/prediction*.ts)

### prediction.ts (Lines 1-100)
**Status**: Main prediction calculator

```typescript
export function calculatePrediction(
  firstSpikeDate: string | null,
  comparisons: ComparisonInput[],
  today?: string,
  score?: number,
  stage?: Stage
): PredictionResult | null
```

**Used by**:
- FE: `theme-prediction/index.tsx`
- Scripts: `snapshot-predictions.ts`

**Migration Action**: **KEEP** (algorithm, comparison-source agnostic)

### prediction-helpers.ts
**Status**: Phase derivation, confidence, momentum, risk

**Migration Action**: **KEEP** (algorithm)

### prediction-bootstrap.ts
**Status**: Bootstrap resampling for prediction intervals

**Migration Action**: **KEEP** (algorithm)

---

## 9. TEST FILES — Legacy Algorithm Validation

### Tests in `scripts/tli/__tests__/`
- `comparison-v4-schema.test.ts` — Type validation for v2 tables
- `comparison-v4-shadow.test.ts` — Shadow mode testing
- `comparison-v4-evaluator.test.ts` — Evaluation logic
- Many others with v4 suffix

**For v1 validation**: None (v1 tests may have been removed)

**Migration Action**: **VERIFY** that v4 test suite covers all v1 edge cases

---

## 10. ORCHESTRATION & WORKFLOW

### pipeline-steps.ts (Lines 1-20)
**Status**: Delegates to sub-functions

```typescript
import { calculateThemeComparisons } from './calculate-comparisons'  // LEGACY
import { snapshotPredictions } from './snapshot-predictions'        // HYBRID
import { evaluatePredictions } from './evaluate-predictions'        // LEGACY
import { evaluateComparisonOutcomes } from './evaluate-comparisons' // LEGACY
```

**Migration Action**: Update imports after deprecation

### collect-and-score.ts
**Status**: Main daily batch orchestrator

Calls:
- Step 5: `calculateAndSaveScores()` → `calculate-scores.ts` (KEEP)
- Step 6: `calculateThemeComparisons()` → **DEPRECATE**
- Step 7: `snapshotPredictions()` → **KEEP** (hybrid)
- Step 8: `evaluateComparisonOutcomes()` → **DEPRECATE**
- Step 9: `evaluatePredictions()` → **DEPRECATE**

**Migration Action**: Replace steps 6, 8, 9 with comparison-v4 equivalents

---

## 11. GITHUB ACTIONS & CI/CD

### Workflows (inferred from code)
- `tli-collect-data.yml` calls `collect-and-score.ts`
- `tli-evaluate.yml` may call `evaluate-*.ts` scripts

**Migration Action**: Update workflow to use v4 orchestration after cutover

---

## SUMMARY TABLE — All Legacy Code

| Category | File | Lines | Status | Action |
|----------|------|-------|--------|--------|
| **DB Migrations** | 003_create_tli_tables.sql | 229-260 | v1 foundation | DEPRECATE |
| | 006_add_comparison_pillar_scores.sql | 1-7 | v1 enhancement | DEPRECATE |
| | 007_create_prediction_snapshots.sql | 2-41 | v1 foundation | DEPRECATE |
| | 008_add_comparison_outcome_tracking.sql | 2+ | v1 enhancement | DEPRECATE |
| | 009_tli_algorithm_v3.sql | 22-37 | v1 enhancement | DEPRECATE |
| | 013_tli_scientific_rigor.sql | 53-54 | v1 enhancement | DEPRECATE |
| **API Routes** | fetch-theme-data.ts | 53-175 | Hybrid (dual-mode reader) | KEEP + remove v1 fallback later |
| | build-comparisons.ts | 77-120 | Legacy builder | KEEP (for output format) |
| | comparison-v4-reader.ts | 30-95 | v4 reader | KEEP |
| | fetch-theme-data-v4.ts | 1-27 | Routing helper | KEEP |
| **Pipeline Scripts** | calculate-comparisons.ts | 26-235 | Writes v1 table | DEPRECATE |
| | evaluate-comparisons.ts | 24-160 | Evaluates v1 | DEPRECATE |
| | evaluate-predictions.ts | 14-105 | Evaluates v1 snapshots | DEPRECATE |
| | snapshot-predictions.ts | 65-220 | Reads v1, writes v2 | KEEP (hybrid) |
| | run-comparisons.ts | — | Legacy wrapper | DEPRECATE |
| | calibrate-confidence.ts | 23+ | Uses v1 snapshots | REVIEW |
| | auto-tune.ts | 84+ | Uses v1 comparisons | REVIEW |
| | validate-horizon-fix.ts | 27+ | Validates v1 | DEPRECATE |
| | validate-stage-persistence.ts | 80+ | Validates v1 | DEPRECATE |
| **Frontend** | comparison-list/index.tsx | — | Display only | KEEP |
| | theme-prediction/index.tsx | — | Display only | KEEP |
| **Algorithms** (lib/tli/) | comparison/* (all) | — | Multi-signal logic | KEEP |
| | prediction.ts, helpers.ts, bootstrap.ts | — | Stage derivation | KEEP |
| **Types** | lib/tli/types/db.ts | 135-248 | v1 + v2 mix | Remove v1 types |

---

## MIGRATION ROADMAP

### Phase 1: Validate v4 Coverage (IN PROGRESS)
- ✅ V2 tables created
- ✅ V4 serving view created
- ✅ Comparison-v4-shadow deployed
- ⏳ Dual-mode reader stability validated (3-7 days)

### Phase 2: Cutover (READY FOR DECISION)
- Enable `TLI_COMPARISON_V4_SERVING_ENABLED=true`
- Replace `calculate-comparisons.ts` with comparison-v4-execution.ts
- Replace `evaluate-comparisons.ts` with comparison-v4-evaluator.ts
- Replace `evaluate-predictions.ts` with snapshot-predictions.ts (v2)
- Update `pipeline-steps.ts` imports
- Estimated duration: 1 day

### Phase 3: Legacy Cleanup (DEFERRED 90+ DAYS)
- Delete v1 tables (with backup)
- Remove v1 migrations
- Remove fallback logic from `fetch-theme-data.ts`
- Remove `shouldFallbackToLegacyComparisons()`
- Remove v1 type definitions
- Estimated duration: 1 day

---

## FILES TO MONITOR DURING MIGRATION

1. **Dual-mode reader stability**: `app/api/tli/themes/[id]/fetch-theme-data.ts`
2. **v4 Publishing status**: Check `theme_comparison_runs_v2.status = 'published'`
3. **Legacy table row counts**: Monitor `theme_comparisons` row growth (should flatten)
4. **Serving view performance**: Monitor query times for `v_comparison_v4_serving`
5. **Prediction snapshot consistency**: Verify v2 snapshots match v1 legacy logic

---

## CRITICAL DEPENDENCIES

**Must-keep modules**:
1. `lib/tli/comparison/composite.ts` — Core algorithm
2. `lib/tli/prediction.ts` — Phase derivation
3. `lib/tli/comparison/spec.ts` — Evaluation thresholds
4. All algorithm libraries (mutual-rank, features, timeline, similarity)

**Safe to deprecate**:
1. `calculate-comparisons.ts` (after v4-execution replaces it)
2. `evaluate-comparisons.ts` (after v4-evaluator replaces it)
3. `evaluate-predictions.ts` (after v2 snapshot replaces it)
4. v1 DB migrations (keep in git history, not in schema)

---

## OPEN QUESTIONS FOR ISAAC

1. **Timeline**: When should Phase 2 cutover happen? (Once v4 stability confirmed?)
2. **Calibration**: Do `calibrate-confidence.ts` and `auto-tune.ts` need v2 table support, or can they be deprecated?
3. **Validation scripts**: Should `validate-horizon-fix.ts` stay for audit purposes?
4. **Backfill strategy**: Will `backfill-comparison-v4.ts` be run once or multiple times?
