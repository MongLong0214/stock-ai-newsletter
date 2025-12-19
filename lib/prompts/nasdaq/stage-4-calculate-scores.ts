export const STAGE_4_SCORE_AND_RANK = `# STAGE 4: Score, Rank & ENTRY WINDOW CHECK

## Mission
Apply scoring formula, confidence assessment, and **ENTRY WINDOW CHECK** to rank stocks.
Select TOP 3 with triggerHit=true AND entryWindowValid=true AND confidence >= 60.

---

## ENTRY WINDOW CHECK (CRITICAL - v3.0)

**Problem Solved**: Prevents stocks like PLTR (-82 → -18) from being recommended.
Trigger alone is not enough - must also be in valid entry range.

### Entry Window Rules

| Regime | Trigger Condition | Valid Entry Range | Example |
|--------|-------------------|-------------------|---------|
| A (Mean Reversion) | prev.willr < -80 AND willr >= -80 | -80 <= willr <= -50 | AAPL: -85 → -72 ✓ |
| B (Trend Pullback) | prev.willr <= -50 AND willr > -50 AND price >= ema20 | -50 < willr <= -30 | MSFT: -55 → -42 ✓ |

### Invalid Examples (FAIL-CLOSED)

| Ticker | prev.willr | willr | Trigger | Entry Window | Result |
|--------|------------|-------|---------|--------------|--------|
| PLTR | -82 | -18 | HIT | EXCEEDED (> -50) | **REJECTED** |
| XYZ | -85 | -75 | HIT | VALID (-80 to -50) | PASSED |
| ABC | -55 | -25 | HIT | EXCEEDED (> -30) | **REJECTED** |

---

## Trigger Detection

### Regime A (ADX < 25): Mean Reversion
\`\`\`python
def check_trigger_a(stock):
    prev_willr = stock["prev"]["willr"]
    willr = stock["indicators"]["willr"]

    # 1. Trigger: crossed up through -80
    trigger_hit = (prev_willr < -80) and (willr >= -80)

    # 2. Entry Window: must still be <= -50
    entry_valid = willr <= -50

    # BOTH must pass
    final_hit = trigger_hit and entry_valid

    return {
        "triggerHit": trigger_hit,
        "entryWindowValid": entry_valid,
        "finalPass": final_hit,
        "type": "MEAN_REVERSION",
        "triggerCalc": f"prev {prev_willr} < -80 AND current {willr} >= -80 → {'HIT' if trigger_hit else 'MISS'}",
        "entryCalc": f"current {willr} <= -50 → {'VALID' if entry_valid else 'EXCEEDED'}",
        "rejection": None if entry_valid else f"willr {willr} > -50 (추격 금지)",
        "strength": "STRONG" if prev_willr < -90 else "MODERATE" if prev_willr < -85 else "WEAK"
    }
\`\`\`

### Regime B (ADX >= 25): Trend Pullback
\`\`\`python
def check_trigger_b(stock):
    prev_willr = stock["prev"]["willr"]
    willr = stock["indicators"]["willr"]
    price = stock["price"]
    ema20 = stock["indicators"]["ema20"]

    # 1. Trigger: crossed up through -50, price above EMA20
    willr_cross = (prev_willr <= -50) and (willr > -50)
    above_ema = price >= ema20
    trigger_hit = willr_cross and above_ema

    # 2. Entry Window: must still be <= -30
    entry_valid = willr <= -30

    # BOTH must pass
    final_hit = trigger_hit and entry_valid

    return {
        "triggerHit": trigger_hit,
        "entryWindowValid": entry_valid,
        "finalPass": final_hit,
        "type": "TREND_PULLBACK",
        "triggerCalc": f"prev {prev_willr} <= -50 AND current {willr} > -50 AND price {price} >= ema20 {ema20} → {'HIT' if trigger_hit else 'MISS'}",
        "entryCalc": f"current {willr} <= -30 → {'VALID' if entry_valid else 'EXCEEDED'}",
        "rejection": None if entry_valid else f"willr {willr} > -30 (추격 금지)",
        "strength": "STRONG" if (prev_willr < -70 and price > ema20 * 1.02) else "MODERATE" if prev_willr < -60 else "WEAK",
        "emaMargin": round((price / ema20 - 1) * 100, 2)
    }
\`\`\`

---

## Scoring Formula

### 1. Trigger Score (Binary Gate)
\`\`\`python
trigger_score = 100 if final_pass else 0
# Note: finalPass requires BOTH trigger AND entry window
\`\`\`

### 2. Liquidity Score (Log Scale)
\`\`\`python
import math
liquidity_score = min(50, max(0, math.log10(addv20) * 10))
\`\`\`

### 3. Momentum Score (Regime-Specific)
\`\`\`python
if regime == "A":
    momentum_score = 10 if (rsi >= 30 or rsi > prev_rsi) else 0
else:  # regime B
    momentum_score = 10 if rsi >= 40 else 0
\`\`\`

### 4. Volatility Penalty
\`\`\`python
volatility_pct = (atr / price) * 100
volatility_penalty = min(30, max(0, volatility_pct))
\`\`\`

### 5. Total Score
\`\`\`python
total_score = trigger_score + liquidity_score + momentum_score - volatility_penalty
# Range: -30 to 160
\`\`\`

---

## Confidence Score

\`\`\`python
def calculate_confidence(stock, trigger_result, cross_validation):
    if not trigger_result["finalPass"]:
        return {"score": 0, "level": "REJECT", "reason": "No valid trigger+entry"}

    base = 50

    # Confirmations (regime-specific)
    confirmations = []
    if stock["regime"] == "A":
        if stock["indicators"]["rsi"] >= 30:
            confirmations.append("RSI above 30")
        if stock["indicators"]["rsi"] > stock["prev"]["rsi"]:
            confirmations.append("RSI improving")
        if stock["indicators"]["willr"] > stock["prev"]["willr"]:
            confirmations.append("WillR improving")
    else:
        if stock["indicators"]["rsi"] >= 40:
            confirmations.append("RSI above 40")
        if stock["price"] > stock["indicators"]["ema20"] * 1.01:
            confirmations.append("Price 1%+ above EMA20")
        if stock["indicators"]["adx"] >= 30:
            confirmations.append("Strong trend (ADX >= 30)")

    confirmation_bonus = min(30, len(confirmations) * 10)

    # Liquidity bonus
    if stock["addv20"] >= 100_000_000:
        liquidity_bonus = 15
    elif stock["addv20"] >= 50_000_000:
        liquidity_bonus = 10
    else:
        liquidity_bonus = 0

    # Volatility penalty
    vol_pct = (stock["indicators"]["atr"] / stock["price"]) * 100
    volatility_penalty = -10 if vol_pct > 5 else (-5 if vol_pct > 3 else 0)

    # Data quality
    data_quality = 5 if cross_validation["passed"] and len(cross_validation["flags"]) == 0 else (0 if cross_validation["passed"] else -10)

    # Signal strength
    signal_bonus = 10 if trigger_result["strength"] == "STRONG" else (5 if trigger_result["strength"] == "MODERATE" else 0)

    score = base + confirmation_bonus + liquidity_bonus + volatility_penalty + data_quality + signal_bonus
    score = max(0, min(100, score))

    level = "HIGH" if score >= 80 else ("MEDIUM" if score >= 60 else ("LOW" if score >= 40 else "REJECT"))

    return {
        "score": score,
        "level": level,
        "breakdown": {
            "base": base,
            "confirmationBonus": confirmation_bonus,
            "confirmations": confirmations,
            "liquidityBonus": liquidity_bonus,
            "volatilityPenalty": volatility_penalty,
            "dataQuality": data_quality,
            "signalBonus": signal_bonus
        }
    }
\`\`\`

---

## Red Flags

\`\`\`python
def generate_warnings(stock):
    warnings = []
    vol_pct = (stock["indicators"]["atr"] / stock["price"]) * 100

    if vol_pct > 5:
        warnings.append("HIGH_VOLATILITY")
    if stock["addv20"] < 50_000_000:
        warnings.append("LOW_LIQUIDITY")
    if stock["indicators"]["rsi"] < 20:
        warnings.append("EXTREME_OVERSOLD")
    if stock["indicators"]["rsi"] > 80:
        warnings.append("EXTREME_OVERBOUGHT")
    if stock["indicators"]["adx"] < 15:
        warnings.append("WEAK_TREND")
    if stock["regime"] == "B":
        ema_margin = (stock["price"] / stock["indicators"]["ema20"] - 1) * 100
        if ema_margin < 1:
            warnings.append("TIGHT_EMA_MARGIN")

    return warnings
\`\`\`

---

## TOP 3 Selection

\`\`\`python
def select_top_3(stocks):
    # Step 1: Only stocks with finalPass=true (trigger + entry window)
    triggered = [s for s in stocks if s["trigger"]["finalPass"]]

    # Step 2: Only confidence >= 60
    confident = [s for s in triggered if s["confidence"]["score"] >= 60]

    # Step 3: Sort
    sorted_stocks = sorted(
        confident,
        key=lambda s: (-s["totalScore"], -s["confidence"]["score"], -s["addv20"], s["ticker"])
    )

    # Step 4: Take top 3
    return sorted_stocks[:3]
\`\`\`

---

## Output Format

\`\`\`json
{
  "stage": 4,
  "meta": {
    "runId": "uuid-v4",
    "pipelineVersion": "v3.0",
    "sessionDate": "2024-12-18",
    "executionTime": "2024-12-19T09:34:00Z"
  },

  "inputValidation": {
    "expectedFromStage3": 40,
    "actualReceived": 40,
    "validationPassed": true
  },

  "scored": [
    {
      "ticker": "AAPL",
      "price": 196.80,
      "addv20": 15234567890,
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
      "regime": "A",
      "trigger": {
        "triggerHit": true,
        "entryWindowValid": true,
        "finalPass": true,
        "type": "MEAN_REVERSION",
        "triggerCalc": "prev -85.3 < -80 AND current -72.5 >= -80 → HIT",
        "entryCalc": "current -72.5 <= -50 → VALID",
        "rejection": null,
        "strength": "STRONG"
      },
      "score": {
        "triggerScore": 100,
        "liquidityScore": 48.2,
        "momentumScore": 10,
        "volatilityPenalty": 1.7,
        "totalScore": 156.5,
        "formula": "100 + 48.2 + 10 - 1.7 = 156.5"
      },
      "confidence": {
        "score": 85,
        "level": "HIGH",
        "breakdown": {
          "base": 50,
          "confirmationBonus": 20,
          "confirmations": ["RSI above 30", "RSI improving"],
          "liquidityBonus": 15,
          "volatilityPenalty": 0,
          "dataQuality": 5,
          "signalBonus": 10
        }
      },
      "warnings": []
    }
  ],

  "entryWindowRejected": [
    {
      "ticker": "PLTR",
      "prev.willr": -82,
      "willr": -18,
      "regime": "A",
      "triggerHit": true,
      "entryWindowValid": false,
      "rejection": "willr -18 > -50 (추격 금지 - 이미 너무 튐)"
    }
  ],

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

  "stats": {
    "inputCount": 40,
    "triggerHitCount": 8,
    "entryWindowValidCount": 5,
    "entryWindowRejectedCount": 3,
    "highConfidenceCount": 2,
    "mediumConfidenceCount": 2,
    "lowConfidenceCount": 1,
    "picksCount": 3
  },

  "auditTrail": {
    "stage3CalculatedCount": 40,
    "stage4InputCount": 40,
    "stage4TriggerHitCount": 8,
    "stage4EntryWindowPassCount": 5,
    "stage4ConfidentCount": 4,
    "stage4PicksCount": 3,
    "countReconciled": true
  }
}
\`\`\`

---

## Validation Checklist

\`\`\`
[ ] All stocks have trigger check result
[ ] entryWindowValid checked for all trigger hits
[ ] entryWindowRejected array populated for rejections
[ ] confidence calculated only for finalPass=true
[ ] picks only contains finalPass=true AND confidence>=60
[ ] picks limited to 3
[ ] All counts reconciled in auditTrail
\`\`\`

---

## Prohibited Actions

| Violation | Why Prohibited |
|-----------|----------------|
| Include stock with entryWindowValid=false | FAIL-CLOSED on entry window |
| Include stock with confidence < 60 | Quality threshold |
| Skip entry window check | Prevents chasing |
| Use subjective judgment | Must be deterministic |

---

## Output Summary Format

\`\`\`
STAGE 4 Complete: Scoring with Entry Window Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Input
   - From Stage 3: 40
   - Received: 40 ✓

🎯 Trigger Detection
   - Trigger hit: 8
   - Entry window valid: 5
   - Entry window rejected: 3 (추격 금지)

📊 Confidence Assessment
   - HIGH (80-100): 2
   - MEDIUM (60-79): 2
   - LOW (<60): 1 (excluded)

🏆 TOP 3 Selected
   - All have finalPass=true
   - All have confidence>=60
   - Sorted by score

✅ Output
   - Picks: 3
   - Ready for final output

→ Ready for Stage 5 formatting
\`\`\`
`;