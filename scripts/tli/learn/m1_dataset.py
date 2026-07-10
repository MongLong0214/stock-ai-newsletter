from __future__ import annotations

from pathlib import Path
from typing import Final, Never
import json
import math

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from pydantic_core import PydanticCustomError

FEATURE_SCHEMA: Final[tuple[str, ...]] = (
    "interest_slope_7d",
    "interest_accel",
    "dvi_7d",
    "interest_return_10d",
    "interest_drawdown_20d",
    "news_volume_7d",
    "news_momentum",
    "babl_phase_signal",
    "interest_source_age_days",
    "news_source_age_days",
)

type JsonScalar = None | bool | int | float | str
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]


class TrainingDataError(RuntimeError):
    pass


class TrainingRow(BaseModel):
    model_config = ConfigDict(frozen=True)

    theme_id: str
    base_date: str
    features: tuple[float, ...]
    missing_flags: tuple[bool, ...]
    y: bool

    @field_validator("features")
    @classmethod
    def check_feature_count(cls, values: tuple[float, ...]) -> tuple[float, ...]:
        if len(values) != len(FEATURE_SCHEMA):
            raise PydanticCustomError("feature_count", f"expected {len(FEATURE_SCHEMA)} feature values")
        return values

    @field_validator("missing_flags")
    @classmethod
    def check_missing_flag_count(cls, values: tuple[bool, ...]) -> tuple[bool, ...]:
        if len(values) != len(FEATURE_SCHEMA):
            raise PydanticCustomError("missing_flag_count", f"expected {len(FEATURE_SCHEMA)} missing flags")
        return values


class TrainingDataset(BaseModel):
    model_config = ConfigDict(frozen=True)

    dataset_version: str
    feature_schema: tuple[str, ...]
    train_range: tuple[str, str]
    labeler_version: str
    rows: tuple[TrainingRow, ...]

    @field_validator("feature_schema")
    @classmethod
    def check_feature_schema(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if values != FEATURE_SCHEMA:
            raise PydanticCustomError("feature_schema", "unexpected feature schema")
        return values


class _DuplicateJsonKeyError(ValueError):
    pass


class _NonstandardJsonNumberError(ValueError):
    pass


def _reject_duplicate_json_keys(pairs: list[tuple[str, JsonValue]]) -> dict[str, JsonValue]:
    payload: dict[str, JsonValue] = {}
    for key, value in pairs:
        if key in payload:
            raise _DuplicateJsonKeyError(f'duplicate JSON key "{key}"')
        payload[key] = value
    return payload


def _reject_nonstandard_json_number(token: str) -> Never:
    raise _NonstandardJsonNumberError(f'nonstandard JSON number "{token}"')


def _parse_finite_json_float(token: str) -> float:
    value = float(token)
    if not math.isfinite(value):
        raise _NonstandardJsonNumberError(f'nonfinite JSON number "{token}"')
    return value


def load_dataset(input_path: Path) -> TrainingDataset:
    try:
        payload = json.loads(
            input_path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate_json_keys,
            parse_constant=_reject_nonstandard_json_number,
            parse_float=_parse_finite_json_float,
        )
        return TrainingDataset.model_validate(payload)
    except (
        OSError,
        json.JSONDecodeError,
        _DuplicateJsonKeyError,
        _NonstandardJsonNumberError,
        ValidationError,
    ) as error:
        raise TrainingDataError(f"invalid M1 training dataset: {error}") from error
