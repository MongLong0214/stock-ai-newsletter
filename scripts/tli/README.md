# TLI Data Collection Scripts

Theme Lifecycle Intelligence (TLI) data collection and scoring automation.

## Overview

This directory contains scripts for collecting theme data from multiple sources, calculating lifecycle scores, and analyzing theme comparisons.

Comparison serving is now permanently v4-only.

- User-facing comparison reads always use the v4 pipeline
- The default serving path uses the latest published archetype run
- The default serving metadata uses the latest certification-grade calibration and weight artifacts
- `TLI_COMPARISON_V4_SERVING_ENABLED` is no longer required to turn serving on

## Current Layout

- `scripts/tli/`:
  Runtime core only
- `scripts/tli/collectors/`:
  External ingestion
- `scripts/tli/ops/`:
  Operational runners, certification, promotion, bridge workflows
- `scripts/tli/research/`:
  Offline evaluation and backtests
- `scripts/tli/research/optimizer/`:
  Offline parameter optimization
- `scripts/tli/level4/`:
  Shared level-4 modules used by ops

## Canonical Commands

Runtime:

- `npm run tli:run`
- `npm run tli:compare`

Ops:

- `npm run tli:level4:calibrate`
- `npm run tli:level4:weights`
- `npm run tli:level4:drift`
- `npm run tli:level4:certify`
- `npm run tli:phase0:bridge`
- `npm run tli:phase0:materialize`
- `npm run tli:v4:promote -- <run-id> [run-id...]`
- `npm run tli:reflexivity`
- `npm run tli:anchor:stability`
- `npm run tli:shadow:transition`

### Legacy label finalization

Expired legacy labels are scanned by their full versioned identity: GT-A uses `gta-v1` and GT-B uses `gtb-v1`. Existing pending rows are finalized through migration 054's exact-update RPC, which matches the stored row id plus theme, date, type, horizon, version, and pending status. Any partial or zero-row match aborts the whole RPC batch instead of reporting success.

The maturity cutoff is five Korean trading days before the latest completed trading date. On weekends and market holidays, the scheduler first anchors to the preceding trading date; this keeps the cutoff symmetric with each labeler's `base date + 5 trading days` horizon. Every run retries the current cutoff using only missing or pending identities and skips terminal identities, so a failed Friday attempt can recover on Sunday without rewriting `finalized_at`. Older pending dates are retried through the paginated backlog scan.

The runtime paginates every expired base date and chunks each terminal-row write at 500 without a per-run total cap. The observed backlog therefore runs through the normal full job as one 269-row GT-A date plus three 241-row GT-B dates; a synthetic 992-row writer input is also covered as 500 and 492. No one-off catch-up writer is required. A mature GT-A target that produces no terminal rows emits a warning instead of looking like a successful empty finalization. GT-B rows without complete KOSPI/stock prices remain pending and emit an explicit warning; price collection and KIS backfill remain separate from this scheduler behavior.

The critical backlog count still covers every labeler version so gta-v2 debt cannot disappear from fail-loud monitoring. When the threshold is exceeded, the log also breaks the count down into `gta-v1`, `gta-v2`, and `gtb-v1`.

To rehearse migrations 049-054, the unchanged scientific guards, and the 269 GT-A + 723 GT-B fixture against a production schema snapshot through migration 048:

```bash
scripts/tli/e2e/rehearse-migration-054.sh <prod-schema-through-048.sql>
```

Migration 055 adds the guarded `theme_labels` TRUNCATE boundary and the atomic latest-public-cohort RPC. Rehearse it with the same snapshot before the low-risk deployment window:

```bash
env -u JWT_SECRET scripts/tli/e2e/rehearse-migration-055.sh <prod-schema-through-048.sql>
```

Apply migration 055 before deploying the prediction loader that calls `load_tli_latest_public_scientific_predictions_v3`.

See [docs/tli-ops-runbook.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/tli-ops-runbook.md) for the operator-facing runbook.

### Anchor Stability Report

`npm run tli:anchor:stability -- --as-of=YYYY-MM-DD` emits the T-106 anchor stability report.

- It infers the primary calculator anchor observation from persisted `interest_metrics.raw_value / anchor_scaled_value`.
- It accepts optional backup candidate observations through `--observations=path/to/observations.json`.
- It reports `primary_only_report` when the calculator has 14 days of observations but backup candidates are missing.
- It emits an `issueProposal` when a sampled backup candidate has lower CV than the primary anchor.
- It does not mark T-106 complete by itself; T-106 still requires the elapsed 14-day live observation window and PRD Q2 confirmation record.

### Shadow Transition Report

`npm run tli:shadow:transition -- --as-of=YYYY-MM-DD` emits the T-306 pre-cutover readiness report.

- It checks the last 14 calendar days of `theme_predictions_v3` shadow rows for the active champion model.
- It checks the last 7 calendar days of `model_metrics_daily` rows for the active champion model.
- It checks that a rollback target exists in `model_registry` with `archived` or `rolled_back` status.
- It returns `ready_for_operator_cutover` only when all three gates pass.
- It does not flip serving or mark T-306 complete; cutover is `TLI_PREDICTIONS_V3_EXPOSURE_ENABLED=true`, immediate rollback is `false` or unset, and post-cutover monitoring remains operator-controlled evidence.

## Runtime Categories

- `scripts/tli/batch/`
  - runtime entrypoints and pipeline orchestration
- `scripts/tli/shared/`
  - shared runtime infrastructure and utilities
- `scripts/tli/scoring/`
  - lifecycle score calculation and calibration loading
- `scripts/tli/comparison/`
  - comparison generation, analog artifact materialization, prediction evaluation, forecast serving
- `scripts/tli/comparison/v4/`
  - v4-specific comparison runtime modules
- `scripts/tli/themes/`
  - theme discovery, keyword management, lifecycle state helpers

## Scripts

### 1. `supabase-admin.ts`
Supabase service role client for write operations.

**Exports:**
- `supabaseAdmin` - Authenticated Supabase client with service role key

**Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

### 2. `run-comparisons.ts`
Runs the comparison pipeline as a standalone batch entrypoint.

**Usage:**
```bash
npm run tli:compare
```

**Features:**
- Loads active themes
- Computes the current auto-tuned threshold
- Writes v4 comparison candidates
- Publishes the canonical comparison inputs used by the v4 serving path
- Intended for scheduled or manual comparison regeneration

---

### 3. `collect-and-score.ts`
Main orchestrator that runs the complete TLI pipeline.

**Usage:**
```bash
npm run tli:run
```

**Pipeline Steps:**
1. Load all active themes
2. Collect Naver DataLab interest metrics (30 days)
3. Collect Naver News article counts (14 days)
4. Collect Naver Finance theme stocks (weekly, Mondays only)
5. Calculate lifecycle scores for each theme
6. Generate theme comparisons

**Features:**
- Error isolation (failures don't stop entire pipeline)
- Detailed logging with step indicators
- Duration tracking
- Upsert operations (prevents duplicates)

**Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

---

## Collectors

### `collectors/naver-datalab.ts`
Collects search trend data from Naver DataLab API.

**Function:**
```typescript
collectNaverDatalab(
  themes: Array<{id: string, name: string, naverKeywords: string[]}>,
  startDate: string,
  endDate: string
): Promise<InterestMetric[]>
```

**Features:**
- Batch processing (5 themes per API call)
- Automatic retry with exponential backoff (3 attempts)
- Rate limiting (1s between batches)
- Returns daily interest ratios

**API Details:**
- Endpoint: `https://openapi.naver.com/v1/datalab/search`
- Method: POST
- Auth: Client ID/Secret headers

---

### `collectors/naver-news.ts`
Collects news article counts from Naver News Search API.

**Function:**
```typescript
collectNaverNews(
  themes: Array<{id: string, keywords: string[]}>,
  startDate: string,
  endDate: string
): Promise<NewsMetric[]>
```

**Features:**
- Daily article counts per theme
- OR query logic (keyword1 OR keyword2 OR ...)
- Automatic retry with exponential backoff (3 attempts)
- Rate limiting (200ms between requests)

**API Details:**
- Endpoint: `https://openapi.naver.com/v1/search/news.json`
- Method: GET
- Auth: Client ID/Secret headers

---

### `collectors/naver-finance-themes.ts`
Scrapes Naver Finance theme pages for stock listings.

**Function:**
```typescript
collectNaverFinanceStocks(
  themes: Array<{id: string, naverThemeId: string | null}>
): Promise<ThemeStock[]>
```

**Features:**
- HTML parsing with cheerio
- Extracts: symbol, name, market (KOSPI/KOSDAQ)
- Polite scraping (3s delay between requests)
- Skips themes without `naverThemeId`

**URL Pattern:**
```
https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no={naverThemeId}
```

### `collectors/google-trends.ts`
Defines the Google Trends fallback adapter contract for DataLab outage planning.

**Status:**
- Skeleton only; it performs no external collection.
- `collectDailySeries()` returns `not_implemented` until a real source is approved.
- Auth config parsing supports service account env vars or OAuth refresh-token env vars.

**Environment Variables:**
- `GOOGLE_TRENDS_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_TRENDS_PRIVATE_KEY`
- `GOOGLE_TRENDS_CLIENT_ID`
- `GOOGLE_TRENDS_CLIENT_SECRET`
- `GOOGLE_TRENDS_REFRESH_TOKEN`

---

## Scheduling

### Recommended Cron Jobs

**Daily (6 AM KST):**
```bash
0 6 * * * cd /path/to/project && npm run tli:run
```

**Weekly Stock Collection (Monday 6 AM KST):**
Stock collection is automatically handled within `collect-and-score.ts` based on day of week.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    collect-and-score.ts                      │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Naver DataLab │   │  Naver News   │   │ Naver Finance │
│  (Interest)   │   │    (News)     │   │   (Stocks)    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
                ┌───────────────────────┐
                │  Supabase Database    │
                │  - interest_metrics   │
                │  - news_metrics       │
                │  - theme_stocks       │
                └───────────┬───────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
    ┌─────────────────────┐   ┌─────────────────────┐
    │ Calculate Lifecycle │   │  Theme Comparisons  │
    │      Scores         │   │   (Past Patterns)   │
    └──────────┬──────────┘   └──────────┬──────────┘
               │                          │
               └────────────┬─────────────┘
                            ▼
                ┌───────────────────────┐
                │  lifecycle_scores     │
                │  theme_comparison_*   │
                │  prediction_snapshots_v2 │
                └───────────────────────┘
```

---

## Troubleshooting

### API Rate Limits
All collectors implement retry logic and rate limiting. If you encounter rate limit errors:
- Increase delay between requests in collector files
- Reduce batch sizes for Naver DataLab

### Missing Data
- Check environment variables are set correctly
- Verify API keys are valid
- Check Supabase service role key has write permissions

### Parsing Errors (Naver Finance)
- Website structure may change
- Check cheerio selectors in `naver-finance-themes.ts`
- Verify `naver_theme_id` values are correct

---

## Development

### Testing Individual Collectors
```bash
# Test Naver DataLab
npx tsx scripts/tli/collectors/naver-datalab.ts

# Test Naver News
npx tsx scripts/tli/collectors/naver-news.ts

# Test Naver Finance
npx tsx scripts/tli/collectors/naver-finance-themes.ts
```

### Comparison Serving Defaults
- No feature flag is required for user-facing v4 comparison serving
- If an active `comparison_v4_control` row exists, its pinned production/calibration/weight versions are used
- If no active control row exists, serving falls back to the latest published v4 run plus the latest certification-grade artifacts

### Official Ops Entry Points
- Use `npm run tli:level4:calibrate` to generate the latest calibration artifact
- Use `npm run tli:level4:weights` to tune and persist serving weights
- Use `npm run tli:level4:drift` to build the latest drift report artifact
- Use `npm run tli:level4:certify` to generate the current certification report
- Use `npm run tli:phase0:bridge` to run bridge parity checks
- Use `npm run tli:v4:promote -- <run-id> [run-id...]` to promote published v4 runs
- Use `npm run tli:reflexivity` to detect newsletter-exposure reflexivity and emit an exposure_suspect issue proposal only; it does not mutate serving state

### Adding New Themes
Add or discover new themes through the current runtime/ops flows instead of the removed legacy seed script.

### Modifying Score Calculation
Edit calculation logic in:
- `lib/tli/calculator.ts` - Core score calculation
- `lib/tli/stage.ts` - Stage determination
- `lib/tli/reigniting.ts` - Reigniting detection

---

## Database Tables

### `themes`
Core theme metadata and configuration.

### `theme_keywords`
Keywords per theme (general, naver sources).

### `theme_stocks`
Stock-theme mappings from Naver Finance.

### `interest_metrics`
Daily search interest from Naver DataLab.

### `news_metrics`
Daily article counts from Naver News Search.

### `lifecycle_scores`
Calculated scores, stages, and component breakdowns.

### `theme_comparison_runs_v2`
Comparison execution runs for the v4 pipeline.

### `theme_comparison_candidates_v2`
Top ranked comparison candidates for each v4 run.

### `theme_comparison_eval_v2`
Fixed-horizon evaluation results for v4 comparison candidates.

### `prediction_snapshots_v2`
Prediction snapshots generated from v4 comparison candidates.

---

## License

Same as parent project.
