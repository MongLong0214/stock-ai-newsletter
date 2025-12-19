export const STAGE_2_VERIFY_PRICE = `# STAGE 2: Price Verification (Gap & Split Detection)

## Mission
Verify price integrity by detecting abnormal gaps and possible stock splits.

**CRITICAL**: Catch data anomalies BEFORE indicator calculation wastes resources.

---

## Input Validation

\`\`\`python
def validate_stage2_input(stage1_output, stage2_input):
    expected = stage1_output["stats"]["filteredCount"]
    actual = len(stage2_input)

    if actual != expected:
        raise ValueError(f"INPUT_MISMATCH: Stage 1 output {expected} != Stage 2 input {actual}")

    return True
\`\`\`

---

## Gap Detection

### Formula
\`\`\`python
def calculate_gap(ohlcv_data):
    """
    Calculate gap between last two trading days.
    MUST use actual OHLCV values, not estimates.
    """
    prev_close = ohlcv_data[-2]["close"]
    last_close = ohlcv_data[-1]["close"]

    gap_ratio = last_close / prev_close
    gap_percent = abs(gap_ratio - 1) * 100

    return {
        "prevClose": prev_close,
        "lastClose": last_close,
        "gapRatio": round(gap_ratio, 4),
        "gapPercent": round(gap_percent, 2),
        "direction": "UP" if gap_ratio > 1 else "DOWN"
    }
\`\`\`

---

## Split Detection (NEW in v3.0)

### Common Split Ratios

| Split Type | Ratio | Expected Gap |
|------------|-------|--------------|
| 2-for-1 | 2.0 | +100% or -50% |
| 3-for-1 | 3.0 | +200% or -66.7% |
| 4-for-1 | 4.0 | +300% or -75% |
| Reverse 1-for-2 | 0.5 | +100% or -50% |
| Reverse 1-for-3 | 0.333 | +200% or -66.7% |

### Detection Logic
\`\`\`python
KNOWN_SPLIT_RATIOS = [2.0, 3.0, 4.0, 5.0, 10.0, 0.5, 0.333, 0.25, 0.2, 0.1]

def detect_possible_split(gap_data):
    """
    Check if gap matches a common split ratio.
    """
    ratio = gap_data["gapRatio"]

    for split_ratio in KNOWN_SPLIT_RATIOS:
        if abs(ratio - split_ratio) < 0.02:  # 2% tolerance
            return {
                "detected": True,
                "possibleSplitRatio": split_ratio,
                "splitType": "FORWARD" if split_ratio > 1 else "REVERSE",
                "confidence": "HIGH" if abs(ratio - split_ratio) < 0.005 else "MEDIUM"
            }

    return {"detected": False}
\`\`\`

---

## Threshold Logic

| Gap % | Action | Reason |
|-------|--------|--------|
| <= 10% | PASS | Normal daily movement |
| 10-35% | PASS with FLAG | Significant move, add warning |
| > 35% (not split) | QUARANTINE | Possible data error |
| Matches split ratio | QUARANTINE | Needs manual verification |

---

## Processing Logic

\`\`\`python
def verify_price(stock, ohlcv_data):
    gap = calculate_gap(ohlcv_data)
    split = detect_possible_split(gap)

    # Check for split
    if split["detected"]:
        return {
            "action": "QUARANTINE",
            "reason": "POSSIBLE_SPLIT",
            "detail": f"Gap {gap['gapPercent']}% matches {split['possibleSplitRatio']}:1 split",
            "gapData": gap,
            "splitData": split
        }

    # Check for abnormal gap
    if gap["gapPercent"] > 35:
        return {
            "action": "QUARANTINE",
            "reason": "ABNORMAL_GAP",
            "detail": f"Gap {gap['gapPercent']}% exceeds 35% threshold",
            "gapData": gap
        }

    # Check for significant gap (flag but pass)
    if gap["gapPercent"] > 10:
        return {
            "action": "PASS_WITH_FLAG",
            "flag": "SIGNIFICANT_GAP",
            "detail": f"Gap {gap['gapPercent']}% is significant",
            "gapData": gap
        }

    # Normal
    return {
        "action": "PASS",
        "gapData": gap
    }
\`\`\`

---

## Output Format

\`\`\`json
{
  "stage": 2,
  "meta": {
    "runId": "uuid-v4",
    "pipelineVersion": "v3.0",
    "sessionDate": "2024-12-18",
    "executionTime": "2024-12-19T09:32:00Z"
  },

  "inputValidation": {
    "expectedFromStage1": 45,
    "actualReceived": 45,
    "validationPassed": true
  },

  "verified": [
    {
      "ticker": "AAPL",
      "price": 196.80,
      "addv20": 15234567890,
      "gapCheck": {
        "prevClose": 195.10,
        "lastClose": 196.80,
        "gapPercent": 0.87,
        "direction": "UP",
        "result": "PASS"
      }
    },
    {
      "ticker": "MSFT",
      "price": 379.50,
      "addv20": 8765432100,
      "gapCheck": {
        "prevClose": 365.20,
        "lastClose": 379.50,
        "gapPercent": 3.91,
        "direction": "UP",
        "result": "PASS"
      }
    }
  ],

  "flagged": [
    {
      "ticker": "VOLATILE",
      "price": 45.60,
      "gapCheck": {
        "prevClose": 40.50,
        "lastClose": 45.60,
        "gapPercent": 12.59,
        "direction": "UP",
        "result": "PASS_WITH_FLAG"
      },
      "flag": "SIGNIFICANT_GAP"
    }
  ],

  "quarantine": [
    {
      "ticker": "SPLIT",
      "reason": "POSSIBLE_SPLIT",
      "detail": "Gap 100.5% matches 2.0:1 split",
      "gapCheck": {
        "prevClose": 50.00,
        "lastClose": 100.25,
        "gapPercent": 100.5,
        "gapRatio": 2.005
      },
      "splitDetection": {
        "detected": true,
        "possibleSplitRatio": 2.0,
        "splitType": "REVERSE",
        "confidence": "HIGH"
      }
    },
    {
      "ticker": "ERROR",
      "reason": "ABNORMAL_GAP",
      "detail": "Gap 52.3% exceeds 35% threshold (not split pattern)",
      "gapCheck": {
        "prevClose": 100.00,
        "lastClose": 152.30,
        "gapPercent": 52.3
      }
    }
  ],

  "stats": {
    "inputCount": 45,
    "verifiedCount": 42,
    "flaggedCount": 1,
    "quarantineCount": 2,
    "quarantineBreakdown": {
      "POSSIBLE_SPLIT": 1,
      "ABNORMAL_GAP": 1
    }
  },

  "auditTrail": {
    "stage1FilteredCount": 45,
    "stage2InputCount": 45,
    "stage2VerifiedCount": 42,
    "stage2PassWithFlagCount": 1,
    "stage2QuarantineCount": 2,
    "countReconciled": true
  }
}
\`\`\`

---

## Validation Checklist

\`\`\`
[ ] inputValidation.expectedFromStage1 == stats.inputCount
[ ] stats.verifiedCount + flaggedCount + quarantineCount == inputCount
[ ] All entries have gapCheck with actual prevClose and lastClose
[ ] Quarantine entries have reason and detail
[ ] Split detection attempted for all high-gap stocks
[ ] auditTrail counts reconciled
\`\`\`

---

## Quarantine vs Exclude

| Action | When | Reversible |
|--------|------|------------|
| EXCLUDE | Data missing or invalid | No |
| QUARANTINE | Data suspicious but present | Yes (manual review) |

Quarantined stocks are removed from pipeline but logged for potential manual review.

---

## Prohibited Actions

| Violation | Why Prohibited |
|-----------|----------------|
| Ignore large gaps | Could be data error |
| Use external price source | Must use Stage 0 OHLCV data |
| Calculate indicators here | Indicators are Stage 3 |
| Auto-pass split candidates | Splits need manual verification |

---

## Output Summary Format

\`\`\`
STAGE 2 Complete: Price Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Input
   - From Stage 1: 45
   - Received: 45 ✓

🔍 Gap Analysis
   - Threshold: 35%
   - Split patterns checked: Yes

📊 Results
   - Verified (clean): 42
   - Flagged (>10% gap): 1
   - Quarantined: 2
     - POSSIBLE_SPLIT: 1
     - ABNORMAL_GAP: 1

✅ Audit Trail
   - All gaps calculated with actual prices
   - Split detection applied
   - Counts reconciled

→ Ready for Stage 3 indicator calculation
\`\`\`
`;