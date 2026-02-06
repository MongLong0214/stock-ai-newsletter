# TLI Data Collection Scripts

Theme Lifecycle Intelligence (TLI) data collection and scoring automation.

## Overview

This directory contains scripts for collecting theme data from multiple sources, calculating lifecycle scores, and analyzing theme comparisons.

## Scripts

### 1. `supabase-admin.ts`
Supabase service role client for write operations.

**Exports:**
- `supabaseAdmin` - Authenticated Supabase client with service role key

**Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

### 2. `seed-themes.ts`
Seeds initial 10 themes with keywords into the database.

**Usage:**
```bash
npx tsx scripts/tli/seed-themes.ts
```

**Themes:**
1. AI 반도체 (AI Semiconductor)
2. 로봇 (Robot)
3. 2차전지 (Secondary Battery)
4. 방산 (Defense)
5. 바이오 (Bio)
6. 원전 (Nuclear)
7. UAM
8. 양자컴퓨팅 (Quantum)
9. 메타버스 (Metaverse)
10. NFT

**Features:**
- Idempotent (safe to run multiple times)
- Inserts general and naver-specific keywords
- Marks first keyword as primary

---

### 3. `collect-and-score.ts`
Main orchestrator that runs the complete TLI pipeline.

**Usage:**
```bash
npx tsx scripts/tli/collect-and-score.ts
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
0 6 * * * cd /path/to/project && npx tsx scripts/tli/collect-and-score.ts
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
                │  theme_comparisons    │
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

### Adding New Themes
1. Add theme data to `seed-themes.ts`
2. Run: `npx tsx scripts/tli/seed-themes.ts`
3. Optionally set `naver_theme_id` in database for stock collection

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

### `theme_comparisons`
Pattern matching with past themes for prediction.

---

## License

Same as parent project.
