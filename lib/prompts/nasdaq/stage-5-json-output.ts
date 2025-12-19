export const STAGE_5_FORMAT_OUTPUT = `# STAGE 5: Format Output (Compact Trader Format)

## Mission
Format Stage 4 picks into the FINAL COMPACT TRADER FORMAT.
**This stage is for formatting only - no additional logic.**

---

## Input: Stage 4 picks Array

The picks array from Stage 4 already contains all validated data:
- triggerHit = true
- entryWindowValid = true
- confidence >= 60
- Sorted by score

---

## Output: Compact Trader Format

\`\`\`json
{
  "timestamp": "2024-12-19T14:30:00Z",
  "version": "v3.0",
  "sessionDate": "2024-12-18",
  "dataQuality": {
    "source": "Stooq OHLCV",
    "fresh": true,
    "verified": true,
    "fetchMetrics": {
      "ohlcvFetchSuccess": 245,
      "ohlcvFetchFailed": 5
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
| picks | array | YES | 0-3 recommended stocks |
| summary | object | YES | Quick statistics |
| auditTrail | object | YES | Stage-by-stage counts |

### Pick Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rank | number | YES | 1, 2, or 3 |
| ticker | string | YES | Stock symbol |
| price | number | YES | Last close price |
| signal | string | YES | "MEAN_REVERSION" or "TREND_PULLBACK" |
| strength | string | YES | "STRONG", "MODERATE", or "WEAK" |
| regime | string | YES | "A" or "B" |
| confidence | number | YES | 60-100 |
| score | number | YES | Total ranking score |
| indicators | object | YES | Current indicators |
| prev | object | YES | Previous day indicators |
| trigger | string | YES | Human-readable trigger description |
| entryWindow | string | YES | Entry window validation result |
| warnings | array | YES | Risk warnings (can be empty) |

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

- "HIGH_VOLATILITY" - ATR > 5% of price
- "LOW_LIQUIDITY" - addv20 < $50M
- "WEAK_TREND" - ADX < 15
- "EXTREME_RSI" - RSI < 20 or > 80
- "TIGHT_EMA_MARGIN" - price < ema20 * 1.01

---

## Empty Result

If no stocks pass all validations:

\`\`\`json
{
  "timestamp": "2024-12-19T14:30:00Z",
  "version": "v3.0",
  "sessionDate": "2024-12-18",
  "dataQuality": {
    "source": "Stooq OHLCV",
    "fresh": true,
    "verified": true,
    "fetchMetrics": {
      "ohlcvFetchSuccess": 245,
      "ohlcvFetchFailed": 5
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
    "stage0Count": 200,
    "stage1Count": 45,
    "stage2Count": 43,
    "stage3Count": 40,
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
[ ] picks array has 0-3 entries
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