from __future__ import annotations

from os import close, fdopen, fsync, replace
from pathlib import Path
from tempfile import mkstemp
from typing import Annotated, Literal
import json

from pydantic import BaseModel, ConfigDict, Field

from m1_runtime import RuntimeManifest

type JsonScalar = None | bool | int | float | str
type JsonValue = JsonScalar | list[JsonValue] | tuple[JsonValue, ...] | dict[str, JsonValue]


class ScalerArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)
    median: tuple[float, ...]
    mad: tuple[float, ...]


class CoefficientsArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)
    intercept: float
    weights: tuple[float, ...]


class PlattCalibratorArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["platt"]
    a: float
    b: float


class CandidateBrierReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    c: float
    mean_brier: float
    fold_briers: tuple[float, ...]


class TrainingReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    observed_n: int
    events: int
    event_rate: float
    parameters: int
    selected_c: float
    candidate_scores: tuple[CandidateBrierReport, ...]
    oof_rows: int
    oof_positive: int
    oof_negative: int


class InnerOofFoldManifest(BaseModel):
    model_config = ConfigDict(frozen=True)
    fold_id: str
    validation_origin: str
    train_origins: tuple[str, ...]


class InnerOofManifest(BaseModel):
    model_config = ConfigDict(frozen=True)
    origin_count: int
    fold_count: int
    ordered_origins: tuple[str, ...]
    folds: tuple[InnerOofFoldManifest, ...]
    split_origins_sha256: str


class EstimatorContractArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)
    penalty: Literal["l2"] = "l2"
    solver: Literal["lbfgs"] = "lbfgs"
    fit_intercept: Literal[True] = True
    class_weight: None = None
    max_iter: Literal[5000] = 5000
    tol: float = 1e-8
    selected_c: float


class CalibrationContractArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["platt"] = "platt"
    source: Literal["time_blocked_cross_fitted_oof_margin"] = "time_blocked_cross_fitted_oof_margin"
    penalty: None = None
    solver: Literal["lbfgs"] = "lbfgs"
    fit_intercept: Literal[True] = True
    class_weight: None = None
    max_iter: Literal[5000] = 5000
    tol: float = 1e-8
    origin_weighting: Literal["one_per_origin"] = "one_per_origin"
    probability_clamp: tuple[float, float] = (1e-6, 1 - 1e-6)


class ModelArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)
    artifact_version: Literal["tli-model-artifact-v2"]
    model_type: Literal["m1_logistic"]
    feature_schema: tuple[str, ...]
    scaler: ScalerArtifact
    coefficients: CoefficientsArtifact
    calibrator: PlattCalibratorArtifact
    estimator_contract: EstimatorContractArtifact
    calibration_contract: CalibrationContractArtifact
    inner_oof: InnerOofManifest
    trained_at: str
    train_range: tuple[str, str]
    labeler_version: str
    seed: int
    train_event_rate: Annotated[float, Field(gt=0, lt=1)]
    sample_report: TrainingReport
    runtime: RuntimeManifest


def write_json(output_path: Path, payload: JsonValue) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, indent=2, sort_keys=True) + "\n"
    descriptor, temporary_name = mkstemp(
        dir=output_path.parent,
        prefix=f".{output_path.name}.",
        suffix=".tmp",
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        with fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            descriptor = -1
            handle.write(encoded)
            handle.flush()
            fsync(handle.fileno())
        replace(temporary_path, output_path)
    finally:
        if descriptor >= 0:
            close(descriptor)
        temporary_path.unlink(missing_ok=True)
