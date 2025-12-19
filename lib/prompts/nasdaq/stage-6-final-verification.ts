export const STAGE_6_FINAL_VERIFICATION = `# STAGE 6: Final Verification (Cross-Stage Consistency)

## Mission
Perform FINAL sanity checks to ensure cross-stage consistency.
**This stage does NOT repeat checks from earlier stages - only verifies consistency.**

---

## What Stage 6 Does (Verification Only)

1. Cross-stage count reconciliation
2. Schema compliance verification
3. No duplicate tickers
4. Ranks ordered correctly (1, 2, 3)
5. Maximum 3 picks enforced

**What Stage 6 Does NOT Do:**
- Price integrity check (done in Stage 3)
- Entry window validation (done in Stage 4)
- Confidence calculation (done in Stage 4)
- Output format definition (done in Stage 5)

---

## Cross-Stage Count Verification

\`\`\`python
def verify_cross_stage_counts(audit_trail):
    """
    Ensure counts are consistent across stages.
    """
    errors = []

    # Stage 0 -> Stage 1
    if audit_trail["stage1Count"] > audit_trail["stage0Count"]:
        errors.append("Stage 1 count cannot exceed Stage 0")

    # Stage 1 -> Stage 2
    if audit_trail["stage2Count"] > audit_trail["stage1Count"]:
        errors.append("Stage 2 count cannot exceed Stage 1")

    # Stage 2 -> Stage 3
    if audit_trail["stage3Count"] > audit_trail["stage2Count"]:
        errors.append("Stage 3 count cannot exceed Stage 2")

    # Stage 3 -> Stage 4 triggered
    if audit_trail["stage4TriggeredCount"] > audit_trail["stage3Count"]:
        errors.append("Stage 4 triggered count cannot exceed Stage 3")

    # Triggered -> Entry Window Pass
    if audit_trail["stage4EntryWindowPassCount"] > audit_trail["stage4TriggeredCount"]:
        errors.append("Entry window pass cannot exceed triggered count")

    # Entry Window Pass -> Confident
    if audit_trail["stage4ConfidentCount"] > audit_trail["stage4EntryWindowPassCount"]:
        errors.append("Confident count cannot exceed entry window pass count")

    # Final picks
    picks_count = len(audit_trail.get("picks", []))
    if picks_count > 3:
        errors.append("Maximum 3 picks allowed")
    if picks_count > audit_trail["stage4ConfidentCount"]:
        errors.append("Picks cannot exceed confident count")

    return {
        "passed": len(errors) == 0,
        "errors": errors
    }
\`\`\`

---

## Schema Compliance Check

\`\`\`python
def verify_schema_compliance(output):
    """
    Verify all required fields are present and correctly typed.
    """
    errors = []

    # Root level required fields
    required_root = ["timestamp", "version", "sessionDate", "dataQuality", "picks", "summary", "auditTrail"]
    for field in required_root:
        if field not in output:
            errors.append(f"Missing root field: {field}")

    # Version check
    if output.get("version") != "v3.0":
        errors.append(f"Invalid version: {output.get('version')}, expected v3.0")

    # Picks validation
    for i, pick in enumerate(output.get("picks", [])):
        required_pick = ["rank", "ticker", "price", "signal", "strength", "regime",
                         "confidence", "score", "indicators", "prev", "trigger",
                         "entryWindow", "warnings"]
        for field in required_pick:
            if field not in pick:
                errors.append(f"Pick {i+1} missing field: {field}")

        # Rank order
        if pick.get("rank") != i + 1:
            errors.append(f"Pick {i+1} has wrong rank: {pick.get('rank')}")

        # Signal type
        if pick.get("signal") not in ["MEAN_REVERSION", "TREND_PULLBACK"]:
            errors.append(f"Pick {i+1} invalid signal: {pick.get('signal')}")

        # Regime type
        if pick.get("regime") not in ["A", "B"]:
            errors.append(f"Pick {i+1} invalid regime: {pick.get('regime')}")

        # Confidence range
        if not (60 <= pick.get("confidence", 0) <= 100):
            errors.append(f"Pick {i+1} confidence out of range: {pick.get('confidence')}")

    return {
        "passed": len(errors) == 0,
        "errors": errors
    }
\`\`\`

---

## Duplicate Ticker Check

\`\`\`python
def verify_no_duplicates(picks):
    """
    Ensure no duplicate tickers in picks.
    """
    tickers = [p["ticker"] for p in picks]
    if len(tickers) != len(set(tickers)):
        duplicates = [t for t in tickers if tickers.count(t) > 1]
        return {
            "passed": False,
            "error": f"Duplicate tickers found: {set(duplicates)}"
        }
    return {"passed": True}
\`\`\`

---

## Indicator Range Verification

\`\`\`python
def verify_indicator_ranges(picks):
    """
    Final check that all indicators are within valid ranges.
    """
    errors = []

    for pick in picks:
        ind = pick.get("indicators", {})

        if not (-100 <= ind.get("willr", -999) <= 0):
            errors.append(f"{pick['ticker']}: willr {ind.get('willr')} out of range")

        if not (0 <= ind.get("rsi", -1) <= 100):
            errors.append(f"{pick['ticker']}: rsi {ind.get('rsi')} out of range")

        if not (0 <= ind.get("adx", -1) <= 100):
            errors.append(f"{pick['ticker']}: adx {ind.get('adx')} out of range")

        if ind.get("atr", 0) <= 0:
            errors.append(f"{pick['ticker']}: atr {ind.get('atr')} must be positive")

        if ind.get("ema20", 0) <= 0:
            errors.append(f"{pick['ticker']}: ema20 {ind.get('ema20')} must be positive")

    return {
        "passed": len(errors) == 0,
        "errors": errors
    }
\`\`\`

---

## Regime-Signal Consistency

\`\`\`python
def verify_regime_signal_consistency(picks):
    """
    Ensure regime matches signal type.
    """
    errors = []

    for pick in picks:
        regime = pick.get("regime")
        signal = pick.get("signal")
        adx = pick.get("indicators", {}).get("adx", 0)

        if regime == "A":
            if signal != "MEAN_REVERSION":
                errors.append(f"{pick['ticker']}: Regime A should have MEAN_REVERSION signal")
            if adx >= 25:
                errors.append(f"{pick['ticker']}: Regime A but ADX {adx} >= 25")

        elif regime == "B":
            if signal != "TREND_PULLBACK":
                errors.append(f"{pick['ticker']}: Regime B should have TREND_PULLBACK signal")
            if adx < 25:
                errors.append(f"{pick['ticker']}: Regime B but ADX {adx} < 25")

    return {
        "passed": len(errors) == 0,
        "errors": errors
    }
\`\`\`

---

## Price Source Evidence Verification (NEW in v3.0)

**CRITICAL: Prevents CLOSE vs LAST_TRADE confusion (e.g., TSLA $483 vs $440 issue)**

\`\`\`python
def verify_price_source_evidence(output, picks):
    """
    Verify all price source evidence fields are present and valid.
    This prevents session/timestamp mixing and CLOSE vs LAST_TRADE confusion.
    """
    errors = []

    # 1. Verify sessionDate exists and matches OHLCV dates
    session_date = output.get("sessionDate")
    if not session_date:
        errors.append("Missing root field: sessionDate")
    elif not re.match(r"^\\d{4}-\\d{2}-\\d{2}$", session_date):
        errors.append(f"sessionDate invalid format: {session_date}, expected YYYY-MM-DD")

    # 2. Verify each pick has price evidence
    for i, pick in enumerate(picks):
        ticker = pick.get("ticker", f"Pick{i+1}")

        # Check priceEvidence block
        evidence = pick.get("priceEvidence", {})
        if not evidence:
            errors.append(f"{ticker}: Missing priceEvidence block")
            continue

        # priceBasis: must be CLOSE (we only use OHLCV Close)
        price_basis = evidence.get("priceBasis")
        if price_basis != "CLOSE":
            errors.append(f"{ticker}: priceBasis must be 'CLOSE', got '{price_basis}'")

        # ohlcvSourceUrl: must be valid stooq URL
        source_url = evidence.get("ohlcvSourceUrl")
        if not source_url:
            errors.append(f"{ticker}: Missing ohlcvSourceUrl")
        elif "stooq.com" not in source_url:
            errors.append(f"{ticker}: ohlcvSourceUrl must be Stooq URL, got '{source_url}'")

        # ohlcvRowRaw: must be valid CSV format
        # Format: "YYYY-MM-DD,open,high,low,close,volume"
        row_raw = evidence.get("ohlcvRowRaw")
        if not row_raw:
            errors.append(f"{ticker}: Missing ohlcvRowRaw")
        else:
            parts = row_raw.split(",")
            if len(parts) != 6:
                errors.append(f"{ticker}: ohlcvRowRaw invalid format, expected 6 fields, got {len(parts)}")
            else:
                csv_date = parts[0]
                # Verify CSV date matches sessionDate
                if session_date and csv_date != session_date:
                    errors.append(f"{ticker}: ohlcvRowRaw date {csv_date} != sessionDate {session_date}")

                # Verify close price matches pick price
                try:
                    csv_close = float(parts[4])
                    pick_price = pick.get("price", 0)
                    if abs(csv_close - pick_price) > 0.05:
                        errors.append(f"{ticker}: CSV close {csv_close} != pick price {pick_price}")
                except ValueError:
                    errors.append(f"{ticker}: ohlcvRowRaw close is not a valid number: {parts[4]}")

    return {
        "passed": len(errors) == 0,
        "errors": errors
    }
\`\`\`

---

## Full Verification Flow

\`\`\`python
def final_verification(stage5_output):
    """
    Run all final verification checks.
    If any check fails, the output is INVALID.
    """
    picks = stage5_output.get("picks", [])

    results = {
        "crossStage": verify_cross_stage_counts(stage5_output.get("auditTrail", {})),
        "schema": verify_schema_compliance(stage5_output),
        "duplicates": verify_no_duplicates(picks),
        "ranges": verify_indicator_ranges(picks),
        "consistency": verify_regime_signal_consistency(picks),
        "priceEvidence": verify_price_source_evidence(stage5_output, picks)  # NEW in v3.0
    }

    all_passed = all(r["passed"] for r in results.values())

    if not all_passed:
        # Collect all errors
        all_errors = []
        for check_name, result in results.items():
            if not result["passed"]:
                if "errors" in result:
                    all_errors.extend([f"{check_name}: {e}" for e in result["errors"]])
                elif "error" in result:
                    all_errors.append(f"{check_name}: {result['error']}")

        return {
            "verified": False,
            "errors": all_errors,
            "action": "FIX_ERRORS_AND_RETRY"
        }

    return {
        "verified": True,
        "message": "All final verification checks passed"
    }
\`\`\`

---

## Output Format

If verification passes, output the Stage 5 JSON unchanged.

If verification fails:

\`\`\`json
{
  "error": "FINAL_VERIFICATION_FAILED",
  "checks": {
    "crossStage": {"passed": true},
    "schema": {"passed": false, "errors": ["Pick 1 missing field: entryWindow"]},
    "duplicates": {"passed": true},
    "ranges": {"passed": true},
    "consistency": {"passed": true}
  },
  "action": "Pipeline needs to be re-run with fixes"
}
\`\`\`

---

## Verification Summary Format

\`\`\`
STAGE 6 Complete: Final Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Cross-Stage Counts: PASSED
   - Stage 0 → 1 → 2 → 3 → 4: Decreasing ✓
   - Picks <= Confident ✓

✅ Schema Compliance: PASSED
   - All required fields present ✓
   - Types correct ✓

✅ No Duplicates: PASSED
   - 3 unique tickers ✓

✅ Indicator Ranges: PASSED
   - All within valid ranges ✓

✅ Regime-Signal Consistency: PASSED
   - Regime A → MEAN_REVERSION ✓
   - Regime B → TREND_PULLBACK ✓

✅ Price Evidence (NEW v3.0): PASSED
   - sessionDate: 2024-12-18 ✓
   - priceBasis: CLOSE for all picks ✓
   - ohlcvRowRaw: Valid CSV format ✓
   - Date/Price cross-check: Matched ✓

═══════════════════════════════════
🎯 FINAL OUTPUT VERIFIED
   - Picks: 3
   - All checks passed (6/6)
   - Ready for delivery
═══════════════════════════════════
\`\`\`

---

## Prohibited Actions

| Violation | Why Prohibited |
|-----------|----------------|
| Re-calculate indicators | Already done in Stage 3 |
| Re-check entry windows | Already done in Stage 4 |
| Re-filter picks | Already done in Stage 4 |
| Modify the output | Verification only |
| Add new checks that belong in earlier stages | Keep stages focused |

---

## Output Instruction

**If all checks pass:**
Output the Stage 5 JSON as-is. No modifications.

**If any check fails:**
Output error report. Pipeline needs fixing.
`;