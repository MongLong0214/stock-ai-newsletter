export const STAGE_1_HARD_FILTER = `# STAGE 1: Hard Filter (Price & Liquidity)

## Mission
Apply hard filters to Stage 0 universe to select liquid, tradeable stocks.

**CRITICAL**: Input count MUST match Stage 0 output. Mismatches = Pipeline error.

---

## Input Validation (FROM STAGE 0)

\`\`\`python
def validate_stage1_input(stage0_output, stage1_input):
    """
    Stage 1 input MUST exactly match Stage 0 output.
    Any mismatch indicates data loss or fabrication.
    """
    expected_count = stage0_output["stats"]["universeCount"]
    actual_count = len(stage1_input)

    if actual_count != expected_count:
        raise ValueError(
            f"INPUT_MISMATCH: Stage 0 output {expected_count} != Stage 1 input {actual_count}"
        )

    # Verify sample tickers exist
    stage0_tickers = {s["ticker"] for s in stage0_output["universe"]}
    stage1_tickers = {s["ticker"] for s in stage1_input}

    if stage0_tickers != stage1_tickers:
        missing = stage0_tickers - stage1_tickers
        extra = stage1_tickers - stage0_tickers
        raise ValueError(
            f"TICKER_MISMATCH: Missing {missing}, Extra {extra}"
        )

    return True
\`\`\`

---

## Hard Filter Criteria

| Filter | Threshold | Field | Fail Action |
|--------|-----------|-------|-------------|
| Price | >= $5.00 | price | Exclude: BELOW_PRICE_THRESHOLD |
| Liquidity | >= $20,000,000 | addv20 | Exclude: BELOW_LIQUIDITY_THRESHOLD |

---

## Filter Logic

\`\`\`python
def apply_hard_filter(universe):
    """
    Apply price and liquidity filters.
    MUST preserve exact counts for audit trail.
    """
    filtered = []
    excluded = []

    for stock in universe:
        if stock["price"] < 5.00:
            excluded.append({
                "ticker": stock["ticker"],
                "reason": "BELOW_PRICE_THRESHOLD",
                "detail": f"price {stock['price']:.2f} < $5.00",
                "value": stock["price"]
            })
        elif stock["addv20"] < 20_000_000:
            excluded.append({
                "ticker": stock["ticker"],
                "reason": "BELOW_LIQUIDITY_THRESHOLD",
                "detail": f"addv20 {stock['addv20']:,.0f} < $20M",
                "value": stock["addv20"]
            })
        else:
            filtered.append(stock)

    # VALIDATION: Counts must add up
    assert len(filtered) + len(excluded) == len(universe), \\
        "FILTER_ERROR: Counts don't add up"

    return filtered, excluded
\`\`\`

---

## Output Format

\`\`\`json
{
  "stage": 1,
  "meta": {
    "runId": "uuid-v4-from-stage0",
    "pipelineVersion": "v3.0",
    "sessionDate": "2024-12-18",
    "executionTime": "2024-12-19T09:31:00Z"
  },

  "inputValidation": {
    "expectedFromStage0": 200,
    "actualReceived": 200,
    "tickersVerified": true,
    "validationPassed": true
  },

  "filtered": [
    {
      "ticker": "AAPL",
      "price": 196.80,
      "addv20": 15234567890,
      "barsAvailable": 100,
      "passedFilters": ["PRICE_OK", "LIQUIDITY_OK"]
    },
    {
      "ticker": "MSFT",
      "price": 379.50,
      "addv20": 8765432100,
      "barsAvailable": 100,
      "passedFilters": ["PRICE_OK", "LIQUIDITY_OK"]
    }
  ],

  "excluded": [
    {
      "ticker": "PENNY",
      "reason": "BELOW_PRICE_THRESHOLD",
      "detail": "price 2.50 < $5.00",
      "value": 2.50
    },
    {
      "ticker": "ILLIQUID",
      "reason": "BELOW_LIQUIDITY_THRESHOLD",
      "detail": "addv20 5,000,000 < $20M",
      "value": 5000000
    }
  ],

  "stats": {
    "inputCount": 200,
    "filteredCount": 45,
    "excludedCount": 155,
    "exclusionBreakdown": {
      "BELOW_PRICE_THRESHOLD": 85,
      "BELOW_LIQUIDITY_THRESHOLD": 70
    },
    "filterRates": {
      "pricePassRate": "57.5%",
      "liquidityPassRate": "61.1%",
      "overallPassRate": "22.5%"
    }
  },

  "auditTrail": {
    "stage0UniverseCount": 200,
    "stage1InputCount": 200,
    "stage1OutputCount": 45,
    "countReconciled": true
  }
}
\`\`\`

---

## Validation Checklist

\`\`\`
[ ] inputValidation.expectedFromStage0 == stats.inputCount
[ ] stats.filteredCount + stats.excludedCount == stats.inputCount
[ ] All excluded entries have reason, detail, and value
[ ] All filtered entries have passedFilters array
[ ] exclusionBreakdown values sum to excludedCount
[ ] auditTrail shows reconciled counts
\`\`\`

---

## Prohibited Actions

| Violation | Why Prohibited |
|-----------|----------------|
| Input count != Stage 0 output | Data integrity violation |
| Use RSI/Williams %R for filtering | Indicator filtering is Stage 3+ |
| Skip filter for "promising" stocks | All stocks must pass hard filter |
| Round prices up to pass threshold | Falsification |
| Estimate addv20 | Must use calculated value from Stage 0 |

---

## Output Summary Format

\`\`\`
STAGE 1 Complete: Hard Filter Applied
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Input Validation
   - Expected from Stage 0: 200
   - Received: 200 ✓
   - Tickers verified: Yes ✓

🔍 Filter Criteria
   - Price: >= $5.00
   - Liquidity: >= $20M ADDV20

📊 Results
   - Passed: 45 (22.5%)
   - Excluded: 155
     - BELOW_PRICE_THRESHOLD: 85
     - BELOW_LIQUIDITY_THRESHOLD: 70

✅ Audit Trail
   - Input/Output reconciled: Yes
   - All exclusions documented: Yes

→ Ready for Stage 2 price verification
\`\`\`
`;