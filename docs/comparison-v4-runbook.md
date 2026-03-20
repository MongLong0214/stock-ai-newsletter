# Comparison v4 Rollback Runbook

## Prerequisites

- Access to Vercel environment variables
- Access to Supabase dashboard (production)
- Familiarity with `comparison_v4_control` table

## Required Steps

### 1. repin to a stable v4 version

Update the active `comparison_v4_control` row so it points to a known stable `production_version`, `calibration_version`, and `weight_version`.

This keeps the API on v4 while rolling back away from the latest bad promotion.

The API should remain healthy; comparison payloads continue to come from v4, but from the stable pinned version.

### 2. verify published reader on the stable version

Verify the API returns the expected v4 comparison candidates by checking `/api/tli/themes/{id}` and confirming the comparison section is populated or degrades cleanly without affecting the rest of the payload.

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
3. Confirm the route returns `200`
4. Confirm non-comparison sections still render correctly
5. Confirm comparison arrays reflect the stable pinned v4 data
6. Record pass/fail in incident note

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

Each drill records:
- Date
- Pass/fail
- All 6 steps above (stable version repin, reader pin, writer freeze decision, affected range, parity result, incident note)

Evidence should be stored as part of the promotion prerequisite check.
