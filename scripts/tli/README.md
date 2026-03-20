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

See [docs/tli-ops-runbook.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/tli-ops-runbook.md) for the operator-facing runbook.

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
