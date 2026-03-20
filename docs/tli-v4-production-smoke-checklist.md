# TLI V4 Production Smoke Checklist

## Goal

Verify that the production environment is healthy after the TLI v4 runtime migration and legacy comparison schema retirement.

## Preconditions

- latest migrations are applied
- if `comparison_v4_control` has an active row, it should point to the intended pinned production/calibration/weight versions
- if there is no active control row, the latest published v4 archetype run and latest certification-grade artifacts should still be available

## Smoke Checks

### 1. API health

Call:

```bash
curl -sS https://stockmatrix.co.kr/api/tli/themes
curl -sS https://stockmatrix.co.kr/api/tli/themes/{themeId}
```

Pass criteria:
- both return `200`
- theme detail payload is structurally complete

### 2. Comparison payload health

For 3 active themes:

- confirm comparison list exists
- confirm top entries come from `theme_comparison_candidates_v2`
- confirm level4 metadata fields are present when serving control is active:
  - `relevanceProbability`
  - `probabilityCiLower`
  - `probabilityCiUpper`
  - `supportCount`
  - `confidenceTier`

### 3. Control-row behavior

Pass criteria:
- with no active `comparison_v4_control` row, detail API still returns `200`
- the API still serves v4 comparisons if published runs + certification artifacts exist
- if serving artifacts are incomplete, the route degrades to an empty comparison list without a page-wide failure

### 4. Prediction pipeline health

Verify:
- `prediction_snapshots_v2` receives fresh rows
- `theme_comparison_runs_v2` and `theme_comparison_candidates_v2` row counts increase as expected
- `theme_comparison_eval_v2` continues to accumulate evaluations

### 5. Schema retirement confirmation

Verify legacy tables are gone:

```sql
select to_regclass('public.theme_comparisons');
select to_regclass('public.prediction_snapshots');
select to_regclass('public.comparison_calibration');
```

Pass criteria:
- all return `null`

### 6. Bridge/forecast unaffected

Verify:
- phase0/forecast routes or jobs that depend on `query_snapshot_v1`, `analog_candidates_v1`, `analog_evidence_v1` still function
- no errors due to 027 bridge schema deployment

## Rollback Note

If comparison quality regresses:
- inspect `comparison_v4_control`, latest published runs, and recent prediction snapshots
- if needed, repoint control to a known stable v4 production version instead of disabling v4 serving entirely
