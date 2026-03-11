# Comparison v4 Rollback Runbook

## Prerequisites

- Access to Vercel environment variables
- Access to Supabase dashboard (production)
- Familiarity with `comparison_v4_control` table

## Required Steps

### 1. feature flag revert

Set `TLI_COMPARISON_V4_SERVING_ENABLED=false` in Vercel environment.

This immediately stops the API from reading v4 serving tables. Legacy `theme_comparisons` path takes over.

### 2. published reader pin to `v_current`

If `TLI_COMPARISON_V4_SERVING_VIEW=true`, also set it to `false` to bypass the serving view.

Verify the API returns legacy data by checking `/api/tli/themes/{id}` response `comparisonSource` field (should be `'legacy'` or absent).

### 3. shadow writer freeze 여부 판단

Determine whether to stop shadow writes:

- If rollback is due to data corruption: set `TLI_COMPARISON_V4_SHADOW_ENABLED=false`
- If rollback is precautionary: shadow writes can continue (they don't affect serving)

### 4. affected run/date range 조회

Query the affected range:

```sql
SELECT MIN(run_date), MAX(run_date), COUNT(*)
FROM theme_comparison_runs_v2
WHERE status = 'published'
  AND run_date >= '<incident_start_date>';
```

Record the range in the incident note.

### 5. user-facing parity 확인

After rollback, verify parity:

1. Pick 3 active themes
2. Call `/api/tli/themes/{id}` for each
3. Confirm `comparisons` array is non-empty and `comparisonSource` is `'legacy'` or absent
4. Record pass/fail in incident note

### 6. incident note 작성

Create a GitHub Issue with:

- Title: `[CMPV4 Rollback] {date} - {reason}`
- Body: affected run range, rollback trigger, parity check result, next steps
- Label: `tli-incident`
- Assign to: primary and secondary owners

## Drill Schedule

Rollback drills should be conducted:

- Before first production promotion
- After any major v4 pipeline change
- At least once per quarter

## Drill Evidence

Drill results are recorded using `buildDrillEvidence()` from `scripts/tli/comparison-v4-ops.ts`.

Each drill records:
- Date
- Pass/fail
- All 6 steps above (flag revert, reader pin, writer freeze decision, affected range, parity result, incident note)

Evidence is stored as part of the promotion prerequisite check via `isObservabilityReady({ drillEvidenceExists: true })`.
