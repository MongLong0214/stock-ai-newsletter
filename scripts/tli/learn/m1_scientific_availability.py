from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import re
from typing import Annotated, Final, Literal, Never

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from m1_calibration_selection import create_inner_oof_split
from m1_dataset import TrainingDataset

SIDECAR_VERSION: Final[str] = "tli-m1-inner-pit-sidecar-v1"
RECEIPT_VERSION: Final[str] = "tli-m1-inner-pit-receipt-v1"
DATE_PATTERN: Final[str] = r"^\d{4}-\d{2}-\d{2}$"
TIMESTAMP_PATTERN: Final[str] = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
SHA256_PATTERN: Final[str] = r"^[0-9a-f]{64}$"
type JsonScalar = None | bool | int | float | str
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]
type PurgeReason = Literal[
    "future_window_not_before_validation_origin",
    "label_finalized_after_validation_cutoff",
    "label_source_run_completed_after_validation_cutoff",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class AvailabilityOrigin(StrictModel):
    origin_date: Annotated[str, StringConstraints(pattern=DATE_PATTERN)]
    forecast_cutoff: Annotated[str, StringConstraints(pattern=TIMESTAMP_PATTERN)]


class AvailabilityRow(StrictModel):
    row_index: Annotated[int, Field(ge=0, strict=True)]
    row_id: Annotated[str, Field(min_length=1)]
    theme_id: Annotated[str, Field(min_length=1)]
    base_date: Annotated[str, StringConstraints(pattern=DATE_PATTERN)]
    future_dates: Annotated[tuple[Annotated[str, StringConstraints(pattern=DATE_PATTERN)], ...], Field(min_length=1)]
    finalized_at: Annotated[str, StringConstraints(pattern=TIMESTAMP_PATTERN)]
    label_source_run_completed_at: Annotated[str, StringConstraints(pattern=TIMESTAMP_PATTERN)]


class ScientificAvailabilitySidecar(StrictModel):
    sidecar_version: Literal["tli-m1-inner-pit-sidecar-v1"]
    training_input_sha256: Annotated[str, StringConstraints(pattern=SHA256_PATTERN)]
    inner_oof_split_sha256: Annotated[str, StringConstraints(pattern=SHA256_PATTERN)]
    origins: Annotated[tuple[AvailabilityOrigin, ...], Field(min_length=1)]
    rows: Annotated[tuple[AvailabilityRow, ...], Field(min_length=1)]


class PurgedRow(StrictModel):
    row_id: str
    reasons: Annotated[tuple[PurgeReason, ...], Field(min_length=1)]


class AvailabilityFoldReceipt(StrictModel):
    fold_id: str
    validation_origin: str
    validation_forecast_cutoff: str
    candidate_row_ids: Annotated[tuple[str, ...], Field(min_length=1)]
    eligible_row_ids: Annotated[tuple[str, ...], Field(min_length=1)]
    purged_rows: tuple[PurgedRow, ...]


class InnerAvailabilityReceipt(StrictModel):
    receipt_version: Literal["tli-m1-inner-pit-receipt-v1"]
    training_input_sha256: Annotated[str, StringConstraints(pattern=SHA256_PATTERN)]
    sidecar_sha256: Annotated[str, StringConstraints(pattern=SHA256_PATTERN)]
    inner_oof_split_sha256: Annotated[str, StringConstraints(pattern=SHA256_PATTERN)]
    folds: Annotated[tuple[AvailabilityFoldReceipt, ...], Field(min_length=1)]


@dataclass(frozen=True, slots=True)
class ParsedScientificAvailability:
    sidecar: ScientificAvailabilitySidecar
    sidecar_sha256: str


class ScientificAvailabilityError(RuntimeError):
    __slots__ = ("code", "detail")

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail

    def __str__(self) -> str:
        return f"{self.code}: {self.detail}"


class _DuplicateJsonKeyError(ValueError):
    pass


def _reject_duplicate_json_keys(pairs: list[tuple[str, JsonValue]]) -> dict[str, JsonValue]:
    payload: dict[str, JsonValue] = {}
    for key, value in pairs:
        if key in payload:
            raise _DuplicateJsonKeyError(key)
        payload[key] = value
    return payload


def _reject_nonstandard_number(token: str) -> Never:
    raise ScientificAvailabilityError("nonstandard_json_number", token)


def _parse_sidecar(sidecar_bytes: bytes) -> ScientificAvailabilitySidecar:
    try:
        payload = json.loads(
            sidecar_bytes,
            object_pairs_hook=_reject_duplicate_json_keys,
            parse_constant=_reject_nonstandard_number,
        )
        return ScientificAvailabilitySidecar.model_validate(payload)
    except (UnicodeDecodeError, json.JSONDecodeError, _DuplicateJsonKeyError, ValidationError) as error:
        raise ScientificAvailabilityError("invalid_availability_sidecar", str(error)) from error


def parse_scientific_availability(
    dataset: TrainingDataset,
    training_bytes: bytes,
    sidecar_bytes: bytes,
) -> ParsedScientificAvailability:
    sidecar = _parse_sidecar(sidecar_bytes)
    actual_training_sha = sha256(training_bytes).hexdigest()
    if sidecar.training_input_sha256 != actual_training_sha:
        raise ScientificAvailabilityError("training_input_sha256_mismatch", actual_training_sha)
    if len(sidecar.rows) != len(dataset.rows):
        raise ScientificAvailabilityError("availability_row_count_mismatch", str(len(sidecar.rows)))
    row_ids: set[str] = set()
    for index, (row, availability) in enumerate(zip(dataset.rows, sidecar.rows, strict=True)):
        if (
            availability.row_index != index
            or availability.theme_id != row.theme_id
            or availability.base_date != row.base_date
        ):
            raise ScientificAvailabilityError("availability_row_identity_mismatch", str(index))
        if availability.row_id in row_ids:
            raise ScientificAvailabilityError("duplicate_availability_row_id", availability.row_id)
        row_ids.add(availability.row_id)
    dataset_origins = tuple(sorted({row.base_date for row in dataset.rows}))
    sidecar_origins = tuple(origin.origin_date for origin in sidecar.origins)
    if sidecar_origins != dataset_origins or len(set(sidecar_origins)) != len(sidecar_origins):
        raise ScientificAvailabilityError("availability_origin_schedule_mismatch", repr(sidecar_origins))
    split = create_inner_oof_split(dataset_origins)
    if split.split_origins_sha256 != sidecar.inner_oof_split_sha256:
        raise ScientificAvailabilityError("availability_inner_oof_mismatch", split.split_origins_sha256)
    return ParsedScientificAvailability(sidecar=sidecar, sidecar_sha256=sha256(sidecar_bytes).hexdigest())


def _classify(row: AvailabilityRow, validation_origin: str, cutoff: str) -> tuple[PurgeReason, ...]:
    reasons: list[PurgeReason] = []
    if max(row.future_dates) >= validation_origin:
        reasons.append("future_window_not_before_validation_origin")
    if row.finalized_at > cutoff:
        reasons.append("label_finalized_after_validation_cutoff")
    if row.label_source_run_completed_at > cutoff:
        reasons.append("label_source_run_completed_after_validation_cutoff")
    return tuple(reasons)


def build_inner_availability_receipt(
    dataset: TrainingDataset,
    availability: ParsedScientificAvailability,
) -> InnerAvailabilityReceipt:
    sidecar = availability.sidecar
    split = create_inner_oof_split(tuple(origin.origin_date for origin in sidecar.origins))
    cutoff_by_origin = {origin.origin_date: origin.forecast_cutoff for origin in sidecar.origins}
    folds: list[AvailabilityFoldReceipt] = []
    for fold in split.folds:
        cutoff = cutoff_by_origin[fold.validation_origin]
        train_origins = set(fold.train_origins)
        candidates = tuple(row for row in sidecar.rows if row.base_date in train_origins)
        classified = tuple((row, _classify(row, fold.validation_origin, cutoff)) for row in candidates)
        folds.append(AvailabilityFoldReceipt(
            fold_id=fold.fold_id,
            validation_origin=fold.validation_origin,
            validation_forecast_cutoff=cutoff,
            candidate_row_ids=tuple(row.row_id for row in candidates),
            eligible_row_ids=tuple(row.row_id for row, reasons in classified if not reasons),
            purged_rows=tuple(
                PurgedRow(row_id=row.row_id, reasons=reasons)
                for row, reasons in classified
                if reasons
            ),
        ))
    if len(dataset.rows) != len(sidecar.rows):
        raise ScientificAvailabilityError("availability_dataset_drift", str(len(dataset.rows)))
    return InnerAvailabilityReceipt(
        receipt_version=RECEIPT_VERSION,
        training_input_sha256=sidecar.training_input_sha256,
        sidecar_sha256=availability.sidecar_sha256,
        inner_oof_split_sha256=sidecar.inner_oof_split_sha256,
        folds=tuple(folds),
    )
