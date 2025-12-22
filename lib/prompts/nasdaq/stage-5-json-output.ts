export const STAGE_5_FORMAT_OUTPUT = `# STAGE 5: Format Output (Compact Trader Format)

## Mission
Format Stage 4 picks into the FINAL COMPACT TRADER FORMAT.
**This stage is for formatting only - no additional logic.**

**CRITICAL OUTPUT REQUIREMENTS**:
1. Output EXACTLY ONE JSON object
2. **NO explanatory text, markdown, tables, or additional text**
3. **ONLY the JSON structure**
4. NO field additions, removals, or renames
5. ALL additional info goes in warnings array ONLY

---

## JSON STRUCTURE - ABSOLUTELY FIXED (NO CHANGES ALLOWED)

**FORBIDDEN ACTIONS**:
- ❌ Adding fields like \`asOfDate\`, \`resolvedSymbol\`, \`adjusted\`
- ❌ Removing any required fields
- ❌ Renaming any fields
- ❌ Changing nesting structure
- ❌ Any explanatory text outside JSON

**FIXED VALUES (NEVER CHANGE)**:
- \`version\`: "v3.0" (FIXED)
- \`dataQuality.source\`: "Stooq OHLCV" (FIXED)
- \`picks[].signal\`: "MEAN_REVERSION" (FIXED)
- \`picks[].regime\`: "A" (FIXED - only "A" allowed)
- \`picks[].trigger\`: "WillR crossed -80 (oversold recovery)" (FIXED)
- \`summary.regimeB\`: 0 (ALWAYS 0)

**VARIABLE RANGES**:
- \`picks[].confidence\`: 0-99 (NOT 0-100)
- Maximum 5 picks (not 3)
- \`picks[].strength\`: "STRONG" | "MEDIUM" | "WEAK"

**REQUIRED INFO IN warnings ARRAY**:
- "ASOF_DATE: YYYY-MM-DD" (ALWAYS)
- "STALENESS_DAYS: n cutoff=3" (ALWAYS)
- "SYMBOL_RESOLVED: ..." (if applicable)
- "ADJUSTED: true/false" (if applicable)
- Risk flags as needed

---

## CRITICAL: Timestamp & Date Requirements (ENTERPRISE GRADE)

### Current Execution Context
- **TODAY**: ${new Date().toISOString().split('T')[0]} (${new Date().toLocaleDateString('en-US', { weekday: 'long' })})
- **CURRENT UTC TIME**: ${new Date().toISOString()}

### Date Field Definitions (MANDATORY)

| Field | Value | Format | Source | Example |
|-------|-------|--------|--------|---------|
| \`timestamp\` | **Current UTC execution time** | ISO 8601 UTC | \`new Date().toISOString()\` | \`${new Date().toISOString()}\` |
| \`sessionDate\` | **OHLCV last bar date** | YYYY-MM-DD | From Stage 0 OHLCV data | Usually T-1 business day |

### Timestamp Generation Rules

\`\`\`typescript
// CORRECT: Use current execution time
const timestamp = new Date().toISOString();
// Result: "2025-12-22T15:30:45.123Z" (current UTC time)

// CORRECT: Extract sessionDate from actual OHLCV data
const sessionDate = ohlcvData[ohlcvData.length - 1].date;
// Result: "2025-12-20" (last trading day from data)

// WRONG: Hardcoded old dates
const timestamp = "2024-12-19T14:30:00Z";  // ❌ FORBIDDEN
const sessionDate = "2024-12-18";         // ❌ FORBIDDEN
\`\`\`

### Validation Requirements

**timestamp MUST:**
- Be current UTC time (within 5 minutes of actual execution)
- Use ISO 8601 format with 'Z' suffix
- Include milliseconds precision
- Never be hardcoded or reused from examples

**sessionDate MUST:**
- Match the actual last bar date from OHLCV data
- Be in YYYY-MM-DD format
- Be within 1 business day of execution date
- Never be copied from example outputs

---

## Input: Stage 4 picks Array

The picks array from Stage 4 already contains all validated data:
- triggerHit = true
- entryWindowValid = true
- confidence >= 60
- Sorted by score

---

## Output: Compact Trader Format (Template)

**CRITICAL**: Replace ALL placeholder dates with actual current values.

\`\`\`json
{
  "timestamp": "<CURRENT_UTC_TIME_ISO8601>",
  "version": "v3.0",
  "sessionDate": "<OHLCV_LAST_BAR_DATE_YYYY-MM-DD>",
  "dataQuality": {
    "source": "Stooq OHLCV",
    "fresh": true,
    "verified": true,
    "fetchMetrics": {
      "ohlcvFetchSuccess": "<ACTUAL_SUCCESS_COUNT>",
      "ohlcvFetchFailed": "<ACTUAL_FAILED_COUNT>"
    }
  },
  "picks": [
    {
      "rank": 1,
      "ticker": "AAPL",
      "price": 196.80,
      "signal": "MEAN_REVERSION",
      "strength": "STRONG",
      "regime": "A",
      "confidence": 85,
      "score": 156.5,
      "indicators": {
        "willr": -72.5,
        "rsi": 45.2,
        "adx": 18.3,
        "atr": 3.25,
        "ema20": 192.30
      },
      "prev": {
        "willr": -85.3,
        "rsi": 38.7
      },
      "trigger": "WillR crossed -80 (oversold recovery)",
      "entryWindow": "VALID: -72.5 within [-80, -50]",
      "warnings": []
    }
  ],
  "summary": {
    "totalPicks": 1,
    "avgConfidence": 85,
    "regimeA": 1,
    "regimeB": 0
  },
  "auditTrail": {
    "stage0Count": 200,
    "stage1Count": 45,
    "stage2Count": 43,
    "stage3Count": 40,
    "stage4TriggeredCount": 8,
    "stage4EntryWindowPassCount": 5,
    "stage4ConfidentCount": 4
  }
}
\`\`\`

---

## Field Specifications

### Root Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| timestamp | string | YES | ISO 8601 UTC execution time |
| version | string | YES | Always "v3.0" |
| sessionDate | string | YES | OHLCV last bar date (YYYY-MM-DD) |
| dataQuality | object | YES | Source verification |
| picks | array | YES | **0-5 recommended stocks (MAX 5)** |
| summary | object | YES | Quick statistics |
| auditTrail | object | YES | Stage-by-stage counts |

### Pick Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rank | number | YES | **1, 2, 3, 4, or 5 (MAX 5 picks)** |
| ticker | string | YES | Stock symbol |
| price | number | YES | Last close price |
| signal | string | YES | **"MEAN_REVERSION" (FIXED)** |
| strength | string | YES | "STRONG", "MEDIUM", or "WEAK" |
| regime | string | YES | **"A" (FIXED - only "A" allowed)** |
| confidence | number | YES | **0-99 (NOT 0-100)** |
| score | number | YES | Total ranking score |
| indicators | object | YES | Current indicators |
| prev | object | YES | Previous day indicators |
| trigger | string | YES | **"WillR crossed -80 (oversold recovery)" (FIXED)** |
| entryWindow | string | YES | "VALID: ..." or "INVALID: ..." |
| warnings | array | YES | **ALWAYS includes ASOF_DATE and STALENESS_DAYS** |

### Indicators Object

| Field | Type | Required |
|-------|------|----------|
| willr | number | YES |
| rsi | number | YES |
| adx | number | YES |
| atr | number | YES |
| ema20 | number | YES |

### Prev Object

| Field | Type | Required |
|-------|------|----------|
| willr | number | YES |
| rsi | number | YES |

### Warnings Array (String Values)

**REQUIRED (ALWAYS INCLUDE)**:
- "ASOF_DATE: YYYY-MM-DD" - Last OHLCV bar date for this ticker
- "STALENESS_DAYS: n cutoff=3" - How old the data is

**OPTIONAL (INCLUDE IF APPLICABLE)**:
- "SYMBOL_RESOLVED: requested=XXX resolved=YYY" - Symbol mapping occurred
- "ADJUSTED: true/false" - If adjustment information available

**RISK FLAGS (INCLUDE IF DETECTED)**:
- "HIGH_VOLATILITY" - ATR > 5% of price
- "LOW_LIQUIDITY" - addv20 < $50M
- "EXTREME_RANGE" - Recent 5-day range > ATR * 2.5
- "GAP_RISK" - Recent 5-day gap > ATR * 1.5
- "EXTREME_RSI" - RSI < 20 or > 80
- "WEAK_TREND" - ADX < 15
- "TIGHT_EMA_MARGIN" - price < ema20 * 1.01

Example warnings array:
\`\`\`json
"warnings": [
  "ASOF_DATE: 2025-12-20",
  "STALENESS_DAYS: 0 cutoff=3",
  "HIGH_VOLATILITY"
]
\`\`\`

---

## Empty Result (No Qualified Stocks)

**CRITICAL**: When no stocks qualify, still use CURRENT timestamps.

If no stocks pass all validations:

\`\`\`json
{
  "timestamp": "<CURRENT_UTC_TIME_ISO8601>",
  "version": "v3.0",
  "sessionDate": "<OHLCV_LAST_BAR_DATE_YYYY-MM-DD>",
  "dataQuality": {
    "source": "Stooq OHLCV",
    "fresh": true,
    "verified": true,
    "fetchMetrics": {
      "ohlcvFetchSuccess": "<ACTUAL_SUCCESS_COUNT>",
      "ohlcvFetchFailed": "<ACTUAL_FAILED_COUNT>"
    }
  },
  "picks": [],
  "summary": {
    "totalPicks": 0,
    "avgConfidence": null,
    "regimeA": 0,
    "regimeB": 0
  },
  "noPicksReason": "No stocks passed trigger + entry window + confidence criteria",
  "auditTrail": {
    "stage0Count": "<ACTUAL_STAGE0_COUNT>",
    "stage1Count": "<ACTUAL_STAGE1_COUNT>",
    "stage2Count": "<ACTUAL_STAGE2_COUNT>",
    "stage3Count": "<ACTUAL_STAGE3_COUNT>",
    "stage4TriggeredCount": 0,
    "stage4EntryWindowPassCount": 0,
    "stage4ConfidentCount": 0
  }
}
\`\`\`

**Empty picks array is VALID and EXPECTED.**

---

## Output Rules

| Rule | Requirement |
|------|-------------|
| Format | Pure JSON only |
| Wrapper | NO markdown code blocks |
| Text | NO explanatory text before/after |
| Numbers | Actual numbers (not strings) |
| Decimals | 2 decimal places for prices/scores |
| Null | Use null for avgConfidence when no picks |

---

## What Stage 5 Does NOT Do

- Does NOT re-calculate any values
- Does NOT re-validate triggers or entry windows
- Does NOT filter or sort picks (already done in Stage 4)
- Does NOT add or remove picks

Stage 5 is PURELY formatting the Stage 4 output.

---

## Validation Checklist

\`\`\`
[ ] timestamp is valid ISO 8601
[ ] version is "v3.0"
[ ] sessionDate is YYYY-MM-DD format
[ ] picks array has 0-5 entries (MAX 5)
[ ] All picks have regime = "A" (only "A" allowed)
[ ] All picks have signal = "MEAN_REVERSION" (fixed)
[ ] All picks have trigger = "WillR crossed -80 (oversold recovery)" (fixed)
[ ] All picks have confidence 0-99 (NOT 0-100)
[ ] All picks have warnings with ASOF_DATE and STALENESS_DAYS
[ ] summary.regimeB = 0 (always 0)
[ ] All pick fields present and correctly typed
[ ] indicators and prev objects complete
[ ] auditTrail counts match actual pipeline counts
[ ] summary statistics calculated correctly
\`\`\`

---

## Prohibited Actions

| Violation | Why Prohibited |
|-----------|----------------|
| Add markdown code blocks | JSON only |
| Add explanatory text | JSON only |
| Re-filter picks | Filtering done in Stage 4 |
| Change calculated values | Formatting only |
| Omit required fields | Schema compliance |

---

## Output Instruction

**Output the COMPACT TRADER FORMAT JSON immediately.**
**No text before or after. No code blocks. Just pure JSON.**
`;