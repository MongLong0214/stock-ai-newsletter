from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from prospective_gate_bridge import (  # noqa: E402
    BridgeRequest,
    evaluate_request,
)

CYCLE_ID = "10000000-0000-4000-8000-000000000014"


def _rows() -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for origin_index in range(16):
        origin_date = f"2026-{1 + origin_index // 4:02d}-{5 + (origin_index % 4) * 7:02d}"
        regime = "risk_off" if origin_index < 4 else "risk_on" if origin_index >= 12 else "neutral"
        for theme_index in range(25):
            outcome = theme_index < 13
            result.append({
                "origin_date": origin_date,
                "theme_id": f"theme-{theme_index:02d}",
                "candidate_probability": 0.9 if outcome else 0.1,
                "comparator_probability": 0.65 if outcome else 0.35,
                "outcome": outcome,
                "regime": regime,
            })
    return result


def _request_payload() -> dict[str, object]:
    origins = []
    for origin_index in range(16):
        origin_date = f"2026-{1 + origin_index // 4:02d}-{5 + (origin_index % 4) * 7:02d}"
        regime = "risk_off" if origin_index < 4 else "risk_on" if origin_index >= 12 else "neutral"
        origins.append({"origin_date": origin_date, "regime": regime})
    return {
        "contract_version": "prospective-gate-input-v1",
        "cycle_id": CYCLE_ID,
        "gate_input_sha256": "a" * 64,
        "eligible_origins": origins,
        "rows": _rows(),
    }


def test_bridge_uses_the_committed_two_way_10000_replicate_contract() -> None:
    output = evaluate_request(
        BridgeRequest.model_validate(_request_payload(), strict=True), "b" * 64,
    )

    assert output.contract_version == "bootstrap-v1"
    assert output.method == "theme_x_two_week_moving_block"
    assert output.replicates == 10_000
    assert output.moving_block_length == 2
    assert output.ece_bin_count == 10
    assert output.gate_input_sha256 == "a" * 64
    assert output.request_sha256 == "b" * 64
    assert float(output.delta_brier.upper99) < 0
    assert float(output.ece.point) == pytest.approx(0.1)
    assert float(output.ece.upper95) <= 0.12
    assert set(output.regime_lower95) == {"risk_off", "neutral", "risk_on"}
    assert all(result is not None for result in output.regime_lower95.values())
    assert len(output.result_sha256) == 64
    assert len(output.delta_brier.replicate_sha256) == 64
    assert len(output.ece.replicate_sha256) == 64


def test_bridge_is_byte_deterministic_for_the_same_request() -> None:
    request = BridgeRequest.model_validate(_request_payload(), strict=True)
    first = evaluate_request(request, "b" * 64).model_dump(mode="json")
    second = evaluate_request(request, "b" * 64).model_dump(mode="json")

    assert json.dumps(first, sort_keys=True, separators=(",", ":")) == json.dumps(
        second, sort_keys=True, separators=(",", ":"),
    )


def test_bridge_rejects_unknown_fields_nonfinite_probabilities_and_theme_only_overrides() -> None:
    unknown = {**_request_payload(), "method": "theme_only"}
    with pytest.raises(Exception):
        BridgeRequest.model_validate(unknown, strict=True)

    nonfinite = _request_payload()
    rows = list(nonfinite["rows"])
    rows[0] = {**rows[0], "candidate_probability": float("nan")}
    nonfinite["rows"] = rows
    with pytest.raises(Exception):
        BridgeRequest.model_validate(nonfinite, strict=True)


def test_bridge_omits_bootstrap_for_an_ineligible_regime_slice() -> None:
    payload = _request_payload()
    rows = list(payload["rows"])
    payload["rows"] = [
        {**row, "regime": "neutral"}
        for row in rows
    ]
    payload["eligible_origins"] = [
        {**origin, "regime": "neutral"}
        for origin in payload["eligible_origins"]
    ]
    output = evaluate_request(BridgeRequest.model_validate(payload, strict=True), "b" * 64)

    assert output.regime_lower95["risk_off"] is None
    assert output.regime_lower95["neutral"] is not None
    assert output.regime_lower95["risk_on"] is None


def test_regime_uses_all_eligible_origins_even_when_one_has_zero_exact_pairs() -> None:
    payload = _request_payload()
    risk_off_dates = {
        origin["origin_date"]
        for origin in payload["eligible_origins"]
        if origin["regime"] == "risk_off"
    }
    zero_pair_date = sorted(risk_off_dates)[-1]
    payload["rows"] = [
        row for row in payload["rows"]
        if row["origin_date"] != zero_pair_date
    ]
    risk_off_rows = [row for row in payload["rows"] if row["regime"] == "risk_off"]
    assert len(risk_off_rows) < 100
    payload["rows"].extend([
        {
            **risk_off_rows[index % len(risk_off_rows)],
            "theme_id": f"extra-theme-{index:03d}",
        }
        for index in range(100 - len(risk_off_rows))
    ])

    output = evaluate_request(BridgeRequest.model_validate(payload, strict=True), "b" * 64)

    assert output.regime_lower95["risk_off"] is not None
