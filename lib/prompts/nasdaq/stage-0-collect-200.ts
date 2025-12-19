export const STAGE_0_COLLECT_UNIVERSE = `# STAGE 0: Collect Universe (Top 200 by ADDV20)

## Mission
Build a universe of 200 NASDAQ common stocks ranked by Average Daily Dollar Volume (ADDV20).

**CRITICAL**: This stage requires PROOF of actual data fetching. No proof = Hallucination detected.

---

## ANTI-HALLUCINATION: MANDATORY EVIDENCE FIELDS

**WITHOUT these fields, Stage 0 output is INVALID and will be rejected.**

### 1. Fetch Metrics (REQUIRED)
\`\`\`json
{
  "fetchMetrics": {
    "symbolListUrl": "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "symbolListFetchedAt": "2024-12-19T09:30:01Z",
    "symbolListHttpStatus": 200,
    "symbolListFileCreationTime": "2024-12-19 06:00:00",
    "totalSymbolsInFile": 3487,

    "ohlcvFetchAttempts": 250,
    "ohlcvFetchSuccess": 245,
    "ohlcvFetchFailed": 5,
    "ohlcvFetchSkipped": 0,

    "totalFetchTimeMs": 75000,
    "avgFetchTimeMs": 300,

    "fetchMethod": "SERIAL" | "PARALLEL_RATE_LIMITED" | "CACHED",
    "cacheUsed": false,
    "rateLimitHits": 3,
    "retryCount": 7
  }
}
\`\`\`

### 2. Raw Data Samples (REQUIRED - 3 tickers minimum)
\`\`\`json
{
  "rawDataSamples": [
    {
      "ticker": "AAPL",
      "ohlcvUrl": "https://stooq.com/q/d/l/?s=AAPL.US&i=d",
      "fetchedAt": "2024-12-19T09:30:05Z",
      "httpStatus": 200,
      "rawLineCount": 102,
      "headerLine": "Date,Open,High,Low,Close,Volume",
      "lastTwoLines": [
        "2024-12-17,194.50,196.20,193.80,195.10,45678900",
        "2024-12-18,195.30,197.50,194.90,196.80,52345600"
      ],
      "barsAvailable": 100
    },
    {
      "ticker": "MSFT",
      "ohlcvUrl": "https://stooq.com/q/d/l/?s=MSFT.US&i=d",
      "fetchedAt": "2024-12-19T09:30:08Z",
      "httpStatus": 200,
      "rawLineCount": 102,
      "headerLine": "Date,Open,High,Low,Close,Volume",
      "lastTwoLines": [
        "2024-12-17,375.20,378.50,374.10,376.80,23456789",
        "2024-12-18,377.00,380.20,376.50,379.50,28765432"
      ],
      "barsAvailable": 100
    },
    {
      "ticker": "NVDA",
      "ohlcvUrl": "https://stooq.com/q/d/l/?s=NVDA.US&i=d",
      "fetchedAt": "2024-12-19T09:30:11Z",
      "httpStatus": 200,
      "rawLineCount": 102,
      "headerLine": "Date,Open,High,Low,Close,Volume",
      "lastTwoLines": [
        "2024-12-17,132.50,135.80,131.20,134.60,98765432",
        "2024-12-18,135.00,138.20,134.50,137.80,112345678"
      ],
      "barsAvailable": 100
    }
  ]
}
\`\`\`

### 3. Failed Fetches Log (REQUIRED if any failures)
\`\`\`json
{
  "failedFetches": [
    {
      "ticker": "NEWIPO",
      "url": "https://stooq.com/q/d/l/?s=NEWIPO.US&i=d",
      "attemptedAt": "2024-12-19T09:30:15Z",
      "httpStatus": 404,
      "error": "No data available",
      "excludeReason": "NO_OHLCV_DATA"
    }
  ]
}
\`\`\`

---

## PHYSICAL REALITY CHECK

### Time Sanity Validation

| Scenario | Claimed Fetches | Claimed Time | Valid? |
|----------|-----------------|--------------|--------|
| Serial fetching | 200 | 60-200 sec | YES |
| Parallel (10 concurrent) | 200 | 15-60 sec | YES |
| Serial fetching | 200 | < 30 sec | **SUSPICIOUS** |
| Any fetching | 200 | < 10 sec | **IMPOSSIBLE** |

**If you claim to fetch 200 OHLCVs in under 30 seconds:**
- You MUST explain how (caching? pre-fetched?)
- You MUST set \`fetchMethod: "CACHED"\` or similar
- If serial fetching claimed, this is HALLUCINATION

---

## Data Sources

### Step 1: Fetch NASDAQ Symbol List (FRESH - 캐시 금지)
\`\`\`
URL: https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
Format: Pipe-delimited (|)

CRITICAL:
- 매 실행마다 새로 fetch (캐시된 파일 사용 금지)
- 파일 마지막 줄에 "File Creation Time" 확인
- fileCreationTime 기록 필수
\`\`\`

### Step 2: Fetch OHLCV Data
\`\`\`
URL Template: https://stooq.com/q/d/l/?s={TICKER}.US&i=d
Required: Last 100 trading days minimum

sessionDate: OHLCV 마지막 바의 Date (예: 2024-12-18)
\`\`\`

---

## Exchange Determination (PLTR 이전 케이스 대응)

**Problem**: PLTR은 2024-11-14에 NYSE → NASDAQ 이전 완료.
**Solution**: 거래소 판정은 **오직 nasdaqlisted.txt**에서만.

\`\`\`python
def is_nasdaq_stock(ticker, nasdaqlisted_data):
    """
    거래소 판정 규칙:
    1. nasdaqlisted.txt에 있으면 → NASDAQ 종목 (무조건)
    2. nasdaqlisted.txt에 없으면 → NASDAQ 아님 (유니버스 제외)

    다른 소스(Yahoo, Google, 과거 캐시)로 거래소 판정 금지.
    """
    return ticker in nasdaqlisted_data
\`\`\`

---

## Symbol Filtering Rules

### From nasdaqlisted.txt, INCLUDE only if:

| Column | Condition | Reason |
|--------|-----------|--------|
| ETF | == "N" | Exclude ETFs |
| Test Issue | == "N" | Exclude test symbols |
| Financial Status | != "D" | Exclude deficient |

### EXCLUDE by Security Name patterns:

| Pattern | Reason | excludeReason |
|---------|--------|---------------|
| "Warrant" | Not common stock | AMBIGUOUS_SECURITY_TYPE |
| "Right" | Not common stock | AMBIGUOUS_SECURITY_TYPE |
| "Unit" | Not common stock | AMBIGUOUS_SECURITY_TYPE |
| "Preferred" | Not common stock | AMBIGUOUS_SECURITY_TYPE |
| "%" (in name) | Likely preferred | AMBIGUOUS_SECURITY_TYPE |

---

## ADDV20 Calculation

\`\`\`python
def calculate_addv20(ohlcv_bars):
    """
    Average Daily Dollar Volume over last 20 trading days.

    EVIDENCE REQUIRED:
    - The calculation must be traceable
    - Include sum and count for verification
    """
    last_20 = ohlcv_bars[-20:]

    dollar_volumes = [bar.close * bar.volume for bar in last_20]
    total = sum(dollar_volumes)
    count = len(dollar_volumes)
    addv20 = total / count

    return {
        "addv20": addv20,
        "calculation": {
            "daysUsed": count,
            "totalDollarVolume": total,
            "formula": f"sum({count} days dollar volume) / {count}"
        }
    }
\`\`\`

---

## Error Handling

| Condition | Action | excludeReason |
|-----------|--------|---------------|
| Stooq returns empty/error | Exclude symbol | NO_OHLCV_DATA |
| Less than 100 bars available | Exclude symbol | INSUFFICIENT_BARS |
| Less than 20 bars available | Exclude symbol | INSUFFICIENT_BARS |
| Volume = 0 for all days | Exclude symbol | NO_OHLCV_DATA |
| HTTP timeout | Retry once, then exclude | FETCH_TIMEOUT |
| Rate limited | Wait and retry | (log in rateLimitHits) |

---

## Output Format

\`\`\`json
{
  "stage": 0,
  "meta": {
    "runId": "uuid-v4",
    "pipelineVersion": "v3.0",
    "sessionDate": "2024-12-18",
    "executionTime": "2024-12-19T09:30:00Z"
  },

  "fetchMetrics": {
    "symbolListUrl": "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "symbolListFetchedAt": "2024-12-19T09:30:01Z",
    "symbolListHttpStatus": 200,
    "symbolListFileCreationTime": "2024-12-19 06:00:00",
    "totalSymbolsInFile": 3487,

    "ohlcvFetchAttempts": 250,
    "ohlcvFetchSuccess": 245,
    "ohlcvFetchFailed": 5,
    "totalFetchTimeMs": 75000,
    "avgFetchTimeMs": 300,
    "fetchMethod": "SERIAL",
    "rateLimitHits": 3,
    "retryCount": 7
  },

  "rawDataSamples": [
    {
      "ticker": "AAPL",
      "ohlcvUrl": "https://stooq.com/q/d/l/?s=AAPL.US&i=d",
      "fetchedAt": "2024-12-19T09:30:05Z",
      "httpStatus": 200,
      "rawLineCount": 102,
      "headerLine": "Date,Open,High,Low,Close,Volume",
      "lastTwoLines": [
        "2024-12-17,194.50,196.20,193.80,195.10,45678900",
        "2024-12-18,195.30,197.50,194.90,196.80,52345600"
      ],
      "barsAvailable": 100
    }
  ],

  "universe": [
    {
      "ticker": "AAPL",
      "securityName": "Apple Inc. Common Stock",
      "price": 196.80,
      "addv20": 15234567890,
      "addv20Calc": {
        "daysUsed": 20,
        "totalDollarVolume": 304691357800,
        "formula": "sum(20 days) / 20"
      },
      "barsAvailable": 100,
      "lastBarDate": "2024-12-18"
    }
  ],

  "excluded": [
    {
      "ticker": "NEWIPO",
      "reason": "INSUFFICIENT_BARS",
      "detail": "Only 45 bars available, need 100"
    },
    {
      "ticker": "XYZ",
      "reason": "NO_OHLCV_DATA",
      "detail": "Stooq returned HTTP 404"
    }
  ],

  "failedFetches": [
    {
      "ticker": "XYZ",
      "url": "https://stooq.com/q/d/l/?s=XYZ.US&i=d",
      "attemptedAt": "2024-12-19T09:30:20Z",
      "httpStatus": 404,
      "error": "No data available"
    }
  ],

  "stats": {
    "symbolsInNasdaqList": 3487,
    "symbolsAfterTypeFilter": 3200,
    "symbolsOhlcvAttempted": 250,
    "symbolsOhlcvSuccess": 245,
    "symbolsExcluded": 45,
    "universeCount": 200,
    "exclusionBreakdown": {
      "NO_OHLCV_DATA": 15,
      "INSUFFICIENT_BARS": 20,
      "AMBIGUOUS_SECURITY_TYPE": 10
    }
  }
}
\`\`\`

---

## Validation Checklist (BEFORE OUTPUT)

\`\`\`
[ ] fetchMetrics.totalSymbolsInFile is realistic (2000-5000 range)
[ ] fetchMetrics.ohlcvFetchAttempts <= totalSymbolsInFile
[ ] fetchMetrics.ohlcvFetchSuccess + ohlcvFetchFailed = ohlcvFetchAttempts
[ ] fetchMetrics.totalFetchTimeMs is realistic for claimed fetches
[ ] rawDataSamples has at least 3 entries
[ ] rawDataSamples[*].lastTwoLines are actual CSV rows (Date,OHLCV format)
[ ] universe.length == 200 (or less if not enough qualified)
[ ] All universe entries have price, addv20, barsAvailable
[ ] sessionDate matches lastBarDate in samples
[ ] excluded array accounts for difference between attempted and universe
\`\`\`

---

## Prohibited Actions

| Violation | Why Prohibited |
|-----------|----------------|
| Output without fetchMetrics | No proof of actual fetch |
| Output without rawDataSamples | No verifiable data |
| Claim <30 sec for 200 fetches | Physically impossible (serial) |
| Use Yahoo/Google for OHLCV | Not authorized source |
| Estimate ADDV20 from market cap | Fabrication |
| Include ETFs in universe | Must filter ETF="N" |
| Skip symbols with partial data | Must explicitly exclude |

---

## Output Summary Format

\`\`\`
STAGE 0 Complete: Universe Collection with Evidence
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Data Sources
   - Symbol List: nasdaqlisted.txt (fetched: 2024-12-19T09:30:01Z)
   - File Creation: 2024-12-19 06:00:00
   - Total Symbols: 3,487

📡 Fetch Metrics
   - OHLCV Attempted: 250
   - OHLCV Success: 245 (98.0%)
   - OHLCV Failed: 5
   - Total Time: 75,000 ms
   - Avg per Fetch: 300 ms
   - Method: SERIAL

📈 Universe Built
   - Universe Size: 200
   - Excluded: 45
   - Session Date: 2024-12-18

✅ Evidence Provided
   - Raw samples: 3 tickers
   - Failed fetch log: 5 entries
   - ADDV20 calculations: traceable

→ Ready for Stage 1 filtering
\`\`\`
`;