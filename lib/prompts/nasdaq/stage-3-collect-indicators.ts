export const STAGE_3_CALCULATE_INDICATORS = `# STAGE 3: Calculate Indicators + PRICE INTEGRITY CHECK

## Mission
Calculate technical indicators from OHLCV data with FULL TRACEABILITY.
**CRITICAL**: Price integrity check happens HERE (moved from Stage 6).

---

## PRICE INTEGRITY CHECK (CRITICAL - EARLY CHECK)

**This check was moved from Stage 6 to Stage 3 for efficiency.**

\`\`\`python
def verify_price_integrity(stock, ohlcv_data, ohlcv_url):
    """
    MUST verify price matches OHLCV Close BEFORE calculating indicators.
    Prevents wasting computation on invalid data.

    CRITICAL: Record price source evidence to prevent CLOSE vs LAST_TRADE confusion.
    """
    last_bar = ohlcv_data[-1]
    ohlcv_close = last_bar["close"]
    claimed_price = stock["price"]
    epsilon = 0.05  # $0.05 허용 오차

    difference = abs(claimed_price - ohlcv_close)

    # Build raw CSV evidence
    ohlcv_row_raw = f"{last_bar['date']},{last_bar['open']},{last_bar['high']},{last_bar['low']},{last_bar['close']},{last_bar['volume']}"

    if difference > epsilon:
        return {
            "pass": False,
            "reason": "PRICE_MISMATCH",
            "detail": f"claimed {claimed_price} != OHLCV Close {ohlcv_close} (diff: \${difference:.2f})",
            "priceBasis": "UNKNOWN",  # Can't determine if mismatch
            "ohlcvSourceUrl": ohlcv_url,
            "ohlcvRowRaw": ohlcv_row_raw,
            "action": "FAIL_CLOSED - 지표 계산 스킵"
        }

    return {
        "pass": True,
        "verifiedPrice": ohlcv_close,
        "ohlcvDate": last_bar["date"],
        # === PRICE SOURCE EVIDENCE (NEW in v3.0) ===
        "priceBasis": "CLOSE",  # Confirms using OHLCV Close, NOT extended/last_trade
        "ohlcvSourceUrl": ohlcv_url,  # e.g., "https://stooq.com/q/d/l/?s=AAPL.US&i=d"
        "ohlcvRowRaw": ohlcv_row_raw  # Raw CSV line: "2024-12-18,190.5,196.8,189.2,196.8,45678900"
    }
\`\`\`

---

## Input Validation

\`\`\`python
def validate_stage3_input(stage2_output):
    expected = stage2_output["stats"]["verifiedCount"]
    # Note: flagged stocks are included in verified for indicator calculation
    if stage2_output.get("flagged"):
        expected += len(stage2_output["flagged"])

    return expected
\`\`\`

---

## Data Requirement

Minimum 100 bars of OHLCV data per stock (verified in Stage 0).

---

## Indicator Calculation Formulas

### Williams %R (14) - PRIMARY INDICATOR
\`\`\`python
def williams_r(bars, period=14):
    """
    Williams %R = ((Highest High - Close) / (Highest High - Lowest Low)) × -100
    Range: [-100, 0]
    """
    window = bars[-period:]

    highest_high = max(b["high"] for b in window)
    lowest_low = min(b["low"] for b in window)
    close = bars[-1]["close"]

    if highest_high == lowest_low:
        willr = -50.0  # Neutral when no range
    else:
        willr = ((highest_high - close) / (highest_high - lowest_low)) * -100

    # VALIDATION
    assert -100 <= willr <= 0, f"WillR out of range: {willr}"

    return {
        "value": round(willr, 2),
        "trace": {
            "highestHigh14": highest_high,
            "lowestLow14": lowest_low,
            "close": close,
            "formula": f"(({highest_high} - {close}) / ({highest_high} - {lowest_low})) × -100"
        }
    }
\`\`\`

### RSI (14, Wilder Smoothing)
\`\`\`python
def rsi(bars, period=14):
    """
    RSI = 100 - (100 / (1 + RS))
    RS = Average Gain / Average Loss (Wilder smoothing)
    Range: [0, 100]
    """
    changes = [bars[i]["close"] - bars[i-1]["close"] for i in range(1, len(bars))]
    gains = [max(c, 0) for c in changes]
    losses = [abs(min(c, 0)) for c in changes]

    # First average (simple)
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Wilder smoothing for remaining
    for i in range(period, len(changes)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        rsi_value = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi_value = 100 - (100 / (1 + rs))

    # VALIDATION
    assert 0 <= rsi_value <= 100, f"RSI out of range: {rsi_value}"

    return {
        "value": round(rsi_value, 2),
        "trace": {
            "avgGain": round(avg_gain, 4),
            "avgLoss": round(avg_loss, 4),
            "rs": round(rs, 4) if avg_loss > 0 else "inf"
        }
    }
\`\`\`

### ADX (14)
\`\`\`python
def adx(bars, period=14):
    """
    ADX = Wilder smoothed average of DX
    Range: [0, 100]
    """
    # Calculate TR, +DM, -DM for each bar
    tr_list, plus_dm_list, minus_dm_list = [], [], []

    for i in range(1, len(bars)):
        high_low = bars[i]["high"] - bars[i]["low"]
        high_prev_close = abs(bars[i]["high"] - bars[i-1]["close"])
        low_prev_close = abs(bars[i]["low"] - bars[i-1]["close"])
        tr = max(high_low, high_prev_close, low_prev_close)

        up_move = bars[i]["high"] - bars[i-1]["high"]
        down_move = bars[i-1]["low"] - bars[i]["low"]

        plus_dm = up_move if (up_move > down_move and up_move > 0) else 0
        minus_dm = down_move if (down_move > up_move and down_move > 0) else 0

        tr_list.append(tr)
        plus_dm_list.append(plus_dm)
        minus_dm_list.append(minus_dm)

    # Wilder smoothing
    atr = sum(tr_list[:period]) / period
    plus_dm_smooth = sum(plus_dm_list[:period]) / period
    minus_dm_smooth = sum(minus_dm_list[:period]) / period

    dx_list = []
    for i in range(period, len(tr_list)):
        atr = (atr * (period - 1) + tr_list[i]) / period
        plus_dm_smooth = (plus_dm_smooth * (period - 1) + plus_dm_list[i]) / period
        minus_dm_smooth = (minus_dm_smooth * (period - 1) + minus_dm_list[i]) / period

        plus_di = (plus_dm_smooth / atr) * 100 if atr > 0 else 0
        minus_di = (minus_dm_smooth / atr) * 100 if atr > 0 else 0

        di_sum = plus_di + minus_di
        dx = (abs(plus_di - minus_di) / di_sum) * 100 if di_sum > 0 else 0
        dx_list.append(dx)

    # ADX = Wilder smoothed DX
    adx_value = sum(dx_list[:period]) / period if len(dx_list) >= period else None
    for i in range(period, len(dx_list)):
        adx_value = (adx_value * (period - 1) + dx_list[i]) / period

    # VALIDATION
    assert 0 <= adx_value <= 100, f"ADX out of range: {adx_value}"

    return {"value": round(adx_value, 2)}
\`\`\`

### ATR (14, Wilder Smoothing)
\`\`\`python
def atr(bars, period=14):
    """
    ATR = Wilder smoothed average of True Range
    Range: > 0
    """
    tr_list = []
    for i in range(1, len(bars)):
        high_low = bars[i]["high"] - bars[i]["low"]
        high_prev_close = abs(bars[i]["high"] - bars[i-1]["close"])
        low_prev_close = abs(bars[i]["low"] - bars[i-1]["close"])
        tr = max(high_low, high_prev_close, low_prev_close)
        tr_list.append(tr)

    atr_value = sum(tr_list[:period]) / period
    for i in range(period, len(tr_list)):
        atr_value = (atr_value * (period - 1) + tr_list[i]) / period

    # VALIDATION
    assert atr_value > 0, f"ATR must be positive: {atr_value}"

    return {"value": round(atr_value, 4)}
\`\`\`

### EMA (20)
\`\`\`python
def ema(bars, period=20):
    """
    EMA = (Close × multiplier) + (prevEMA × (1 - multiplier))
    Range: > 0
    """
    multiplier = 2 / (period + 1)
    ema_value = sum(b["close"] for b in bars[:period]) / period

    for i in range(period, len(bars)):
        ema_value = (bars[i]["close"] * multiplier) + (ema_value * (1 - multiplier))

    # VALIDATION
    assert ema_value > 0, f"EMA must be positive: {ema_value}"

    return {"value": round(ema_value, 2)}
\`\`\`

---

## Cross-Validation Checks

\`\`\`python
def cross_validate(stock, indicators):
    """
    Sanity checks to detect calculation errors or data anomalies.
    """
    flags = []
    price = stock["price"]

    # 1. RSI-WillR Correlation
    if indicators["rsi"] < 30 and indicators["willr"] > -70:
        flags.append({
            "check": "RSI_WILLR_MISMATCH",
            "detail": f"RSI {indicators['rsi']} oversold but WillR {indicators['willr']} not",
            "severity": "WARNING"
        })

    # 2. ATR Reasonableness (0.5% - 10% of price)
    atr_pct = (indicators["atr"] / price) * 100
    if atr_pct < 0.5 or atr_pct > 10:
        flags.append({
            "check": "ATR_UNREASONABLE",
            "detail": f"ATR is {atr_pct:.2f}% of price (expected 0.5-10%)",
            "severity": "WARNING" if 0.3 < atr_pct < 15 else "ERROR"
        })

    # 3. EMA Proximity (within 15% of close)
    ema_diff = abs(indicators["ema20"] - price) / price * 100
    if ema_diff > 15:
        flags.append({
            "check": "EMA_DEVIATION",
            "detail": f"EMA20 is {ema_diff:.2f}% away from price",
            "severity": "WARNING"
        })

    # 4. ADX Range
    if indicators["adx"] < 5 or indicators["adx"] > 80:
        flags.append({
            "check": "ADX_EXTREME",
            "detail": f"ADX {indicators['adx']} is unusually extreme",
            "severity": "WARNING"
        })

    return {
        "passed": len([f for f in flags if f["severity"] == "ERROR"]) == 0,
        "flags": flags
    }
\`\`\`

---

## Regime Classification

\`\`\`python
def classify_regime(adx):
    if adx < 25:
        return {
            "regime": "A",
            "description": "Mean Reversion (Low Trend Strength)",
            "rationale": f"ADX {adx} < 25 indicates ranging market"
        }
    else:
        return {
            "regime": "B",
            "description": "Trend Pullback (Strong Trend)",
            "rationale": f"ADX {adx} >= 25 indicates trending market"
        }
\`\`\`

---

## Previous Day Indicators

**CRITICAL for trigger detection in Stage 4**

\`\`\`python
def calculate_prev_indicators(bars):
    """
    Calculate indicators for previous day (for trigger comparison).
    Uses bars[:-1] instead of bars.
    """
    prev_bars = bars[:-1]
    return {
        "willr": williams_r(prev_bars)["value"],
        "rsi": rsi(prev_bars)["value"]
    }
\`\`\`

---

## Output Format

\`\`\`json
{
  "stage": 3,
  "meta": {
    "runId": "uuid-v4",
    "pipelineVersion": "v3.0",
    "sessionDate": "2024-12-18",
    "executionTime": "2024-12-19T09:33:00Z"
  },

  "inputValidation": {
    "expectedFromStage2": 43,
    "actualReceived": 43,
    "validationPassed": true
  },

  "calculated": [
    {
      "ticker": "AAPL",
      "price": 196.80,
      "priceIntegrity": {
        "verified": true,
        "ohlcvClose": 196.80,
        "difference": 0.00,
        "priceBasis": "CLOSE",
        "ohlcvSourceUrl": "https://stooq.com/q/d/l/?s=AAPL.US&i=d",
        "ohlcvRowRaw": "2024-12-18,190.50,197.20,189.80,196.80,45678900"
      },
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
      "calculationTrace": {
        "willr": {
          "highestHigh14": 200.50,
          "lowestLow14": 188.20,
          "close": 196.80,
          "formula": "((200.50 - 196.80) / (200.50 - 188.20)) × -100 = -30.08"
        },
        "barsUsed": 100,
        "dataSource": "Stooq CSV"
      },
      "crossValidation": {
        "passed": true,
        "flags": []
      },
      "regime": "A",
      "regimeRationale": "ADX 18.3 < 25 indicates ranging market"
    }
  ],

  "excluded": [
    {
      "ticker": "BADDATA",
      "reason": "PRICE_MISMATCH",
      "detail": "claimed 150.00 != OHLCV Close 145.50 (diff: $4.50)"
    },
    {
      "ticker": "CALCERR",
      "reason": "INDICATOR_CALC_ERROR",
      "detail": "Division by zero in WillR calculation"
    }
  ],

  "stats": {
    "inputCount": 43,
    "calculatedCount": 40,
    "excludedCount": 3,
    "priceIntegrityFailed": 1,
    "indicatorCalcFailed": 2,
    "crossValidationWarnings": 5,
    "regimeBreakdown": {
      "A": 25,
      "B": 15
    }
  },

  "auditTrail": {
    "stage2VerifiedCount": 43,
    "stage3InputCount": 43,
    "stage3OutputCount": 40,
    "priceIntegrityChecksPassed": 42,
    "priceIntegrityChecksFailed": 1,
    "countReconciled": true
  }
}
\`\`\`

---

## Validation Checklist

\`\`\`
[ ] All stocks have priceIntegrity check result
[ ] Price integrity failures are excluded with PRICE_MISMATCH reason
[ ] All indicators within valid ranges
[ ] calculationTrace present for at least willr
[ ] prev indicators calculated for trigger detection
[ ] regime classification based on adx
[ ] crossValidation run for all calculated stocks
[ ] Counts reconciled in auditTrail
[ ] priceBasis is "CLOSE" for all passed stocks (NEW v3.0)
[ ] ohlcvSourceUrl present for all stocks (NEW v3.0)
[ ] ohlcvRowRaw contains valid CSV format (NEW v3.0)
\`\`\`

---

## Prohibited Actions

| Violation | Why Prohibited |
|-----------|----------------|
| Skip price integrity check | CRITICAL check, prevents bad data |
| Use external indicators | Must calculate from OHLCV |
| Estimate missing values | FAIL-CLOSED required |
| Use different periods | Fixed parameters only |
| Skip cross-validation | Data integrity required |

---

## Output Summary Format

\`\`\`
STAGE 3 Complete: Indicator Calculation with Price Integrity
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Input
   - From Stage 2: 43
   - Received: 43 ✓

🔒 Price Integrity Check (EARLY)
   - Passed: 42
   - Failed: 1 (PRICE_MISMATCH)

📊 Indicators Calculated
   - WillR(14), RSI(14), ADX(14), ATR(14), EMA(20)
   - Method: Direct from Stooq OHLCV
   - Previous day indicators: Calculated

📈 Regime Classification
   - Regime A (ADX < 25): 25 stocks
   - Regime B (ADX >= 25): 15 stocks

⚠️ Cross-Validation
   - Warnings: 5
   - Errors: 0

✅ Output
   - Calculated: 40
   - Excluded: 3

→ Ready for Stage 4 scoring
\`\`\`
`;