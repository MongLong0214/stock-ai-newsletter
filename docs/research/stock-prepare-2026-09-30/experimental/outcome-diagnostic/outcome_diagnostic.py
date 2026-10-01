"""Pure five-session OHLC diagnostic. No file/network/data-loader access.

Caller supplies the exact five actual trading-calendar dates. Returns are fractions,
not percent numbers. Costs are fixed *total round-trip* fractions of entry capital:
net = gross - bps / 10_000. These are modeled proxies, never actual order fills.
Raw OHLC marks may be observable on zero-volume candles; exit proxies require all
five candles to have valid positive OHLC and positive volume. Missing sessions are
never skipped or replaced. A target opening gap gets the +10% cap; a stop opening
gap uses the observed open and may lose more than 5%. Intraday order on a candle
that crosses both barriers is unknown, so both order bounds are retained.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from decimal import Decimal, localcontext
from math import isfinite
import re
from typing import Any

SCHEMA_VERSION = "five-session-outcome-diagnostic-v1"
COST_BPS = (30, 60, 100)
TARGET_RETURN = Decimal("0.10")
STOP_RETURN = Decimal("-0.05")


def _decimal(value: Any) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        return None
    result = value if isinstance(value, Decimal) else Decimal(str(value))
    return result if result.is_finite() else None


def _number(value: Decimal | None) -> float | None:
    if value is None:
        return None
    result = float(value)
    if not isfinite(result):
        raise ValueError("derived_nonfinite_outcome")
    return result


def _outcome(exit_reason: str, exit_date: str, exit_price: Decimal, entry: Decimal) -> dict:
    return {"exitReason": exit_reason, "exitDate": exit_date,
            "exitPrice": _number(exit_price), "grossReturn": (exit_price / entry) - 1}


def _target_only(dates: Sequence[str], rows: Sequence[dict], entry: Decimal) -> dict:
    target = entry * (1 + TARGET_RETURN)
    for session, row in zip(dates, rows):
        if row["high"] >= target:
            return {"status": "known", **_outcome("target", session, target, entry)}
    return {"status": "known", **_outcome("horizon_close", dates[-1], rows[-1]["close"], entry)}


def _target_stop(dates: Sequence[str], rows: Sequence[dict], entry: Decimal) -> dict:
    target = entry * (1 + TARGET_RETURN)
    stop = entry * (1 + STOP_RETURN)
    for session, row in zip(dates, rows):
        # The open is the first observed price of this session, before its high/low.
        if row["open"] <= stop:
            result = _outcome("stop_gap", session, row["open"], entry)
        elif row["open"] >= target:
            result = _outcome("target", session, target, entry)
        elif row["high"] >= target and row["low"] <= stop:
            return {"status": "ambiguous", "sameDayAmbiguous": True,
                    "ambiguousDate": session,
                    "conservative": _outcome("stop", session, stop, entry),
                    "optimistic": _outcome("target", session, target, entry)}
        elif row["low"] <= stop:
            result = _outcome("stop", session, stop, entry)
        elif row["high"] >= target:
            result = _outcome("target", session, target, entry)
        else:
            continue
        return {"status": "known", "sameDayAmbiguous": False, "ambiguousDate": None,
                "conservative": result, "optimistic": dict(result)}
    result = _outcome("horizon_close", dates[-1], rows[-1]["close"], entry)
    return {"status": "known", "sameDayAmbiguous": False, "ambiguousDate": None,
            "conservative": result, "optimistic": dict(result)}


def _net(gross: Decimal | None, cost: Decimal) -> dict:
    value = None if gross is None else gross - cost
    return {"netReturn": _number(value),
            "allNegative": None if value is None else value < 0,
            "lossAtLeast5Pct": None if value is None else value <= STOP_RETURN}


def _unknown_exit() -> dict:
    return {"exitReason": None, "exitDate": None, "exitPrice": None, "grossReturn": None}


def _calendar_valid(dates: Sequence[Any]) -> bool:
    if len(dates) != 5 or any(not isinstance(d, str) for d in dates):
        return False
    if len(set(dates)) != 5 or list(dates) != sorted(dates):
        return False
    try:
        return all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) and date.fromisoformat(d) for d in dates)
    except ValueError:
        return False


def diagnose_five_session_outcomes(
    session_dates: Sequence[str], bars: Mapping[str, Mapping[str, Any]], *,
    entry_open: int | float | Decimal | None = None,
) -> dict:
    """Accept date-keyed {open,high,low,close,volume,date?} records for exact D1..D5.

    Optional entry_open must equal D1's actual open. Bars outside supplied dates
    are not read. `status` reports strict proxy coverage; `rawMarkStatus` separately
    reports complete OHLC observations. All missing outcomes remain None.
    """
    with localcontext() as context:
        context.prec = 50
        return _diagnose(session_dates, bars, entry_open)


def _diagnose(dates: Sequence[str], bars: Mapping[str, Mapping[str, Any]], supplied_entry: Any) -> dict:
    dates = list(dates)
    reasons: list[dict] = []
    rows: list[dict | None] = []
    valid_calendar = _calendar_valid(dates)
    if not valid_calendar:
        reasons.append({"date": None, "reason": "calendar_requires_exactly_five_ordered_distinct_iso_dates"})
    if not isinstance(bars, Mapping):
        reasons.append({"date": None, "reason": "bars_must_be_date_keyed_mapping"})
    if valid_calendar and isinstance(bars, Mapping):
        for session in dates:
            source = bars.get(session)
            if not isinstance(source, Mapping) or source.get("missing") is True:
                rows.append(None)
                reasons.append({"date": session, "reason": "missing_bar"})
                continue
            if any(source.get(field) != session for field in ("date", "trade_date") if field in source):
                rows.append(None)
                reasons.append({"date": session, "reason": "bar_date_mismatch"})
                continue
            values = {field: _decimal(source.get(field)) for field in ("open", "high", "low", "close")}
            valid = all(value is not None and value > 0 for value in values.values())
            if valid:
                valid = (values["low"] <= min(values["open"], values["close"])
                         and values["high"] >= max(values["open"], values["close"])
                         and values["low"] <= values["high"])
            if not valid:
                rows.append(None)
                reasons.append({"date": session, "reason": "invalid_ohlc"})
                continue
            volume = _decimal(source.get("volume"))
            if volume is None or volume <= 0:
                reasons.append({"date": session, "reason": "missing_invalid_or_nonpositive_volume"})
            rows.append({**values, "volume": volume})
    entry = rows[0]["open"] if rows and rows[0] is not None else None
    if supplied_entry is not None:
        supplied = _decimal(supplied_entry)
        if supplied is None or supplied <= 0:
            reasons.append({"date": dates[0] if valid_calendar else None, "reason": "invalid_entry_open"})
            entry = None
        elif entry is None or supplied != entry:
            reasons.append({"date": dates[0] if valid_calendar else None, "reason": "entry_open_mismatch"})
            entry = None
    raw_known = valid_calendar and len(rows) == 5 and all(row is not None for row in rows) and entry is not None
    strict = raw_known and not reasons
    raw = {"targetTouch10": None, "day1Bullish": None, "grossD5": None, "full5Mae": None}
    if raw_known:
        raw = {"targetTouch10": any(row["high"] >= entry * (1 + TARGET_RETURN) for row in rows),
               "day1Bullish": rows[0]["close"] > rows[0]["open"],
               "grossD5": rows[-1]["close"] / entry - 1,
               "full5Mae": min(row["low"] for row in rows) / entry - 1}
    target_only = _target_only(dates, rows, entry) if strict else {"status": "unknown", **_unknown_exit()}
    target_stop = _target_stop(dates, rows, entry) if strict else {
        "status": "unknown", "sameDayAmbiguous": None, "ambiguousDate": None,
        "conservative": _unknown_exit(), "optimistic": _unknown_exit()}
    sensitivities = []
    for bps in COST_BPS:
        cost = Decimal(bps) / 10_000
        d5 = _net(raw["grossD5"], cost)
        d5_return = None if raw["grossD5"] is None else raw["grossD5"] - cost
        lower = _net(target_stop["conservative"]["grossReturn"], cost)
        upper = _net(target_stop["optimistic"]["grossReturn"], cost)
        sensitivities.append({
            "roundTripBps": bps, "costFraction": _number(cost),
            "rawMark": {"netD5": d5["netReturn"], "allNegativeD5": d5["allNegative"],
                "lossAtLeast5Pct": d5["lossAtLeast5Pct"],
                "targetTouchAndD5NetPositive": None if not raw_known else raw["targetTouch10"] and d5_return > 0,
                "targetTouchAndD5NetNonnegative": None if not raw_known else raw["targetTouch10"] and d5_return >= 0},
            "targetOnly": _net(target_only["grossReturn"], cost),
            "targetStop": {"netReturnLower": lower["netReturn"], "netReturnUpper": upper["netReturn"],
                "allNegativePossible": lower["allNegative"], "allNegativeCertain": upper["allNegative"],
                "lossAtLeast5PctPossible": lower["lossAtLeast5Pct"], "lossAtLeast5PctCertain": upper["lossAtLeast5Pct"]}})
    def public(value: Any) -> Any:
        if isinstance(value, Decimal):
            return _number(value)
        if isinstance(value, dict):
            return {key: public(item) for key, item in value.items()}
        return value
    return {"schemaVersion": SCHEMA_VERSION,
            "scope": "OHLC modeled diagnostic proxies; not actual order fills or realized profits",
            "returnUnits": "fraction", "costConvention": "fixed total round-trip bps of entry capital; gross minus bps/10000",
            "targetGapConvention": "cap at +10 percent; no favorable opening-gap bonus",
            "stopGapConvention": "exit proxy at observed session open if at or below stop",
            "status": "known" if strict else "unknown", "sessionDates": dates,
            "entryOpen": _number(entry), "strictAll5PositiveOhlcv": strict,
            "rawMarkStatus": "known" if raw_known else "unknown", "unknownReasons": reasons,
            "raw": public(raw), "models": {"targetOnly": public(target_only), "targetStop": public(target_stop)},
            "costSensitivity": sensitivities}
