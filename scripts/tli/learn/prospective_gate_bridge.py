#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13.11,<3.14"
# dependencies = [
#     "numpy==2.5.1",
#     "pydantic==2.13.4",
# ]
# ///

# How to run
# PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
#   uv run --frozen --python 3.13.11 --script \
#   scripts/tli/learn/prospective_gate_bridge.py INPUT_JSON OUTPUT_JSON
# End

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from json import JSONDecodeError
from pathlib import Path
from typing import Annotated, Literal, Self

import numpy as np
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError, model_validator
from pydantic_core import PydanticCustomError

from stats_bootstrap import (
    BOOTSTRAP_CONTRACT_VERSION,
    BOOTSTRAP_REPLICATES,
    ECE_BIN_COUNT,
    ECE_UPPER_QUANTILE,
    MOVING_BLOCK_LENGTH,
    PRIMARY_UPPER_QUANTILE,
    REGIME_LOWER_QUANTILE,
    BootstrapError,
    PairedSample,
    PanelIndex,
    bootstrap_delta_mean,
    bootstrap_fixed_bin_ece,
    build_paired_sample,
)

type Regime = Literal["risk_off", "neutral", "risk_on"]
type JsonScalar = None | bool | int | float | str
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]
type JsonInput = JsonValue | tuple[JsonValue, ...]

SHA256 = r"^[0-9a-f]{64}$"
PROBABILITY = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
REGIMES: tuple[Regime, ...] = ("risk_off", "neutral", "risk_on")


def _json_array_to_tuple(value: JsonInput) -> JsonInput:
    return tuple(value) if isinstance(value, list) else value


class GateBridgeError(RuntimeError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class BridgeRow(StrictModel):
    origin_date: Annotated[str, Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")]
    theme_id: Annotated[str, Field(min_length=1)]
    candidate_probability: PROBABILITY
    comparator_probability: PROBABILITY
    outcome: bool
    regime: Regime


class BridgeOrigin(StrictModel):
    origin_date: Annotated[str, Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")]
    regime: Regime


class BridgeRequest(StrictModel):
    contract_version: Literal["prospective-gate-input-v1"]
    cycle_id: Annotated[
        str,
        Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"),
    ]
    gate_input_sha256: Annotated[str, Field(pattern=SHA256)]
    eligible_origins: Annotated[
        tuple[BridgeOrigin, ...],
        BeforeValidator(_json_array_to_tuple),
        Field(min_length=2),
    ]
    rows: Annotated[
        tuple[BridgeRow, ...],
        BeforeValidator(_json_array_to_tuple),
        Field(min_length=1),
    ]

    @model_validator(mode="after")
    def exact_pairs(self) -> Self:
        identities = [(row.origin_date, row.theme_id) for row in self.rows]
        duplicates = [identity for identity, count in Counter(identities).items() if count != 1]
        if duplicates:
            raise PydanticCustomError(
                "duplicate_exact_pair", "bridge rows must contain one exact pair per origin/theme",
            )
        origin_dates = [origin.origin_date for origin in self.eligible_origins]
        if len(set(origin_dates)) != len(origin_dates) or origin_dates != sorted(origin_dates):
            raise PydanticCustomError(
                "invalid_origin_axis", "eligible origins must be unique and time ordered",
            )
        origin_regimes = {origin.origin_date: origin.regime for origin in self.eligible_origins}
        if any(origin_regimes.get(row.origin_date) != row.regime for row in self.rows):
            raise PydanticCustomError(
                "row_origin_mismatch", "every paired row must match one eligible origin and regime",
            )
        return self


class BridgeEnvelope(StrictModel):
    canonical_request_json: Annotated[str, Field(min_length=2)]
    request_sha256: Annotated[str, Field(pattern=SHA256)]


class UpperStatistic(StrictModel):
    seed: int
    point: str
    upper99: str
    replicate_sha256: Annotated[str, Field(pattern=SHA256)]


class EceStatistic(StrictModel):
    seed: int
    point: str
    upper95: str
    replicate_sha256: Annotated[str, Field(pattern=SHA256)]


class LowerStatistic(StrictModel):
    seed: int
    point: str
    lower95: str
    replicate_sha256: Annotated[str, Field(pattern=SHA256)]


class BridgeOutput(StrictModel):
    contract_version: Literal["bootstrap-v1"]
    method: Literal["theme_x_two_week_moving_block"]
    replicates: Literal[10_000]
    moving_block_length: Literal[2]
    ece_bin_count: Literal[10]
    gate_input_sha256: Annotated[str, Field(pattern=SHA256)]
    request_sha256: Annotated[str, Field(pattern=SHA256)]
    delta_brier: UpperStatistic
    ece: EceStatistic
    regime_lower95: dict[Regime, LowerStatistic | None]
    result_sha256: Annotated[str, Field(pattern=SHA256)]


def _decimal(value: float) -> str:
    return format(value, ".17g")


def _sample(
    rows: tuple[BridgeRow, ...], eligible_origins: tuple[BridgeOrigin, ...],
) -> PairedSample:
    ordered = tuple(sorted(rows, key=lambda row: (row.origin_date, row.theme_id)))
    sample = build_paired_sample(
        [row.theme_id for row in ordered],
        [row.origin_date for row in ordered],
        [row.candidate_probability for row in ordered],
        [row.comparator_probability for row in ordered],
        [int(row.outcome) for row in ordered],
    )
    origin_dates = tuple(origin.origin_date for origin in eligible_origins)
    origin_positions = {origin_date: index for index, origin_date in enumerate(origin_dates)}
    panel = PanelIndex(
        themes=sample.panel.themes,
        origins=origin_dates,
        theme_index=sample.panel.theme_index,
        origin_index=np.array([origin_positions[row.origin_date] for row in ordered], dtype=np.int64),
    )
    return PairedSample(
        panel=panel,
        p_candidate=sample.p_candidate,
        p_comparator=sample.p_comparator,
        y=sample.y,
        delta=sample.delta,
    )


def _result_hash(payload: dict[str, JsonValue]) -> str:
    def flatten(prefix: str, value: JsonValue) -> list[str]:
        if isinstance(value, dict):
            return [item for key in sorted(value) for item in flatten(f"{prefix}.{key}", value[key])]
        return [f"{prefix}={value if value is not None else 'null'}"]

    material = "\n".join(flatten("bootstrap", payload)).encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def evaluate_request(request: BridgeRequest, request_sha256: str) -> BridgeOutput:
    sample = _sample(request.rows, request.eligible_origins)
    delta = bootstrap_delta_mean(
        sample, cycle_id=request.cycle_id, metric="delta_brier", scope="primary",
    )
    ece = bootstrap_fixed_bin_ece(
        sample, cycle_id=request.cycle_id, metric="ece", scope="primary",
    )
    regime_results: dict[Regime, LowerStatistic | None] = {}
    for regime in REGIMES:
        rows = tuple(row for row in request.rows if row.regime == regime)
        origins = tuple(origin for origin in request.eligible_origins if origin.regime == regime)
        if len(origins) < 4 or len(rows) < 100:
            regime_results[regime] = None
            continue
        result = bootstrap_delta_mean(
            _sample(rows, origins), cycle_id=request.cycle_id, metric="delta_brier", scope=regime,
        )
        regime_results[regime] = LowerStatistic(
            seed=result.seed,
            point=_decimal(result.point),
            lower95=_decimal(result.quantile(REGIME_LOWER_QUANTILE)),
            replicate_sha256=result.replicate_sha256,
        )

    body: dict[str, JsonValue] = {
        "contract_version": BOOTSTRAP_CONTRACT_VERSION,
        "method": "theme_x_two_week_moving_block",
        "replicates": BOOTSTRAP_REPLICATES,
        "moving_block_length": MOVING_BLOCK_LENGTH,
        "ece_bin_count": ECE_BIN_COUNT,
        "gate_input_sha256": request.gate_input_sha256,
        "request_sha256": request_sha256,
        "delta_brier": {
            "seed": delta.seed,
            "point": _decimal(delta.point),
            "upper99": _decimal(delta.quantile(PRIMARY_UPPER_QUANTILE)),
            "replicate_sha256": delta.replicate_sha256,
        },
        "ece": {
            "seed": ece.seed,
            "point": _decimal(ece.point),
            "upper95": _decimal(ece.quantile(ECE_UPPER_QUANTILE)),
            "replicate_sha256": ece.replicate_sha256,
        },
        "regime_lower95": {
            regime: result.model_dump(mode="json") if result is not None else None
            for regime, result in regime_results.items()
        },
    }
    return BridgeOutput.model_validate({**body, "result_sha256": _result_hash(body)}, strict=True)


def _run(input_path: Path, output_path: Path) -> None:
    raw = input_path.read_bytes()
    envelope = BridgeEnvelope.model_validate(json.loads(raw), strict=True)
    request_bytes = envelope.canonical_request_json.encode("utf-8")
    if hashlib.sha256(request_bytes).hexdigest() != envelope.request_sha256:
        raise GateBridgeError("request_sha256 does not match canonical_request_json")
    request = BridgeRequest.model_validate_json(envelope.canonical_request_json, strict=True)
    output = evaluate_request(request, envelope.request_sha256).model_dump(mode="json")
    output_path.write_text(json.dumps(output, sort_keys=True, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: prospective_gate_bridge.py INPUT_JSON OUTPUT_JSON")
    try:
        _run(Path(sys.argv[1]), Path(sys.argv[2]))
    except (BootstrapError, GateBridgeError, JSONDecodeError, OSError, ValidationError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from error
