#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "numpy",
#     "pydantic",
#     "scikit-learn",
#     "typer",
# ]
# ///

# How to run
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly:
#      uv run scripts/tli/learn/train_m1.py --trained-at 2026-08-02 INPUT_JSON OUTPUT_JSON
# 3. Or make executable and run:
#      chmod +x scripts/tli/learn/train_m1.py && ./scripts/tli/learn/train_m1.py INPUT_JSON OUTPUT_JSON
# End

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Optional

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, field_validator
from pydantic_core import PydanticCustomError
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
import typer

FEATURE_SCHEMA: Final[tuple[str, ...]] = (
    "interest_slope_7d",
    "interest_level_pct",
    "interest_accel",
    "dvi_7d",
    "news_volume_7d",
    "news_momentum",
    "basket_return_5d",
    "basket_volume_ratio",
    "episode_progress",
    "market_regime",
)
ARTIFACT_VERSION: Final[str] = "tli-model-artifact-v1"
MODEL_TYPE: Final[str] = "m1_logistic"
SEED: Final[int] = 42
ROBUST_SCALE: Final[float] = 1.4826
MIN_MAD: Final[float] = 0.001


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
            raise PydanticCustomError("feature_count", "expected 10 feature values")
        return values

    @field_validator("missing_flags")
    @classmethod
    def check_missing_flag_count(cls, values: tuple[bool, ...]) -> tuple[bool, ...]:
        if len(values) != len(FEATURE_SCHEMA):
            raise PydanticCustomError("missing_flag_count", "expected 10 missing flags")
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


class ScalerArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)

    median: tuple[float, ...]
    mad: tuple[float, ...]


class CoefficientsArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)

    intercept: float
    weights: tuple[float, ...]


class CalibratorArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: str
    a: float
    b: float


class SampleSizeReport(BaseModel):
    model_config = ConfigDict(frozen=True)

    observed_n: int
    events: int
    event_rate: float
    parameters: int
    cox_snell_r2: float
    r2_status: str
    riley_minimum_n: int | None
    riley_minimum_events: int | None
    sufficient: bool


class ModelArtifact(BaseModel):
    model_config = ConfigDict(frozen=True)

    artifact_version: str
    model_type: str
    feature_schema: tuple[str, ...]
    scaler: ScalerArtifact
    coefficients: CoefficientsArtifact
    calibrator: CalibratorArtifact
    trained_at: str
    train_range: tuple[str, str]
    labeler_version: str
    seed: int
    sample_report: SampleSizeReport


@dataclass(frozen=True, slots=True)
class DesignMatrix:
    values: NDArray[np.float64]
    medians: tuple[float, ...]
    mads: tuple[float, ...]


def _median(values: NDArray[np.float64]) -> float:
    return float(np.median(values)) if values.size > 0 else 0.0


def _mad(values: NDArray[np.float64], median: float) -> float:
    return float(np.median(np.abs(values - median))) if values.size > 0 else 0.0


def build_design_matrix(rows: tuple[TrainingRow, ...]) -> DesignMatrix:
    raw = np.array([row.features for row in rows], dtype=np.float64)
    missing = np.array([row.missing_flags for row in rows], dtype=bool)
    transformed = np.empty_like(raw)
    medians: list[float] = []
    mads: list[float] = []

    for index in range(len(FEATURE_SCHEMA)):
        column = raw[:, index]
        valid = np.isfinite(column) & ~missing[:, index]
        median = _median(column[valid])
        mad = _mad(column[valid], median)
        imputed = np.where(valid, column, median)
        transformed[:, index] = 0.0 if mad < MIN_MAD else (imputed - median) / (ROBUST_SCALE * mad)
        medians.append(median)
        mads.append(mad)

    design = np.concatenate([transformed, missing.astype(np.float64)], axis=1)
    return DesignMatrix(values=design, medians=tuple(medians), mads=tuple(mads))


def _log_likelihood(y: NDArray[np.int64], probabilities: NDArray[np.float64]) -> float:
    clipped = np.clip(probabilities, 1e-9, 1 - 1e-9)
    return float(np.sum(y * np.log(clipped) + (1 - y) * np.log(1 - clipped)))


def _cox_snell_r2(y: NDArray[np.int64], probabilities: NDArray[np.float64]) -> float:
    event_rate = float(np.mean(y))
    null_probabilities = np.full(y.shape, event_rate, dtype=np.float64)
    ll_model = _log_likelihood(y, probabilities)
    ll_null = _log_likelihood(y, null_probabilities)
    return max(0.0, 1 - math.exp((2 / y.size) * (ll_null - ll_model)))


def _nagelkerke_max(event_rate: float) -> float:
    terms = event_rate * math.log(event_rate) + (1 - event_rate) * math.log(1 - event_rate)
    return 1 - math.exp(2 * terms)


def _riley_minimum_n(r2: float, parameters: int, event_rate: float) -> int | None:
    if r2 <= 0 or event_rate <= 0 or event_rate >= 1:
        return None
    shrinkage_n = math.ceil(parameters / ((0.9 - 1) * math.log(1 - (r2 / 0.9))))
    risk_precision_n = math.ceil((1.96**2 * event_rate * (1 - event_rate)) / (0.05**2))
    max_r2 = _nagelkerke_max(event_rate)
    nagelkerke_n = shrinkage_n
    for candidate in range(max(parameters + 1, shrinkage_n), 1_000_001):
        lr_stat = -candidate * math.log(1 - r2)
        shrinkage = max(0.0, 1 - (parameters / lr_stat))
        adjusted_cs = 1 - math.exp(-(shrinkage * lr_stat) / candidate)
        if ((r2 / max_r2) - (adjusted_cs / max_r2)) <= 0.05:
            nagelkerke_n = candidate
            break
    return max(shrinkage_n, nagelkerke_n, risk_precision_n)


def build_sample_report(y: NDArray[np.int64], probabilities: NDArray[np.float64], parameters: int) -> SampleSizeReport:
    events = int(np.sum(y))
    event_rate = float(np.mean(y))
    r2 = _cox_snell_r2(y, probabilities)
    minimum_n = _riley_minimum_n(r2, parameters, event_rate)
    minimum_events = None if minimum_n is None else math.ceil(minimum_n * min(event_rate, 1 - event_rate))
    r2_status = "sufficient" if r2 >= 0.08 else "feature_reduction_recommended" if r2 < 0.05 else "borderline"
    return SampleSizeReport(
        observed_n=int(y.size),
        events=events,
        event_rate=event_rate,
        parameters=parameters,
        cox_snell_r2=r2,
        r2_status=r2_status,
        riley_minimum_n=minimum_n,
        riley_minimum_events=minimum_events,
        sufficient=minimum_n is not None and y.size >= minimum_n and min(events, y.size - events) >= (minimum_events or 0),
    )


def train_model(dataset: TrainingDataset, trained_at: str) -> ModelArtifact:
    y = np.array([1 if row.y else 0 for row in dataset.rows], dtype=np.int64)
    if y.size < 10 or np.unique(y).size != 2:
        raise TrainingDataError("M1 training requires at least 10 rows and both classes")

    design = build_design_matrix(dataset.rows)
    estimator = LogisticRegression(
        class_weight="balanced",
        random_state=SEED,
        solver="lbfgs",
        max_iter=1000,
    )
    estimator.fit(design.values, y)
    calibrated = CalibratedClassifierCV(estimator=FrozenEstimator(estimator), method="sigmoid")
    calibrated.fit(design.values, y)
    classifier = calibrated.calibrated_classifiers_[0]
    sigmoid = classifier.calibrators[0]
    probabilities = calibrated.predict_proba(design.values)[:, 1].astype(np.float64)

    return ModelArtifact(
        artifact_version=ARTIFACT_VERSION,
        model_type=MODEL_TYPE,
        feature_schema=FEATURE_SCHEMA,
        scaler=ScalerArtifact(median=design.medians, mad=design.mads),
        coefficients=CoefficientsArtifact(intercept=float(estimator.intercept_[0]), weights=tuple(float(v) for v in estimator.coef_[0])),
        calibrator=CalibratorArtifact(type="platt", a=float(sigmoid.a_), b=float(sigmoid.b_)),
        trained_at=trained_at,
        train_range=dataset.train_range,
        labeler_version=dataset.labeler_version,
        seed=SEED,
        sample_report=build_sample_report(y, probabilities, design.values.shape[1]),
    )


def load_dataset(input_path: Path) -> TrainingDataset:
    with input_path.open("r", encoding="utf-8") as handle:
        return TrainingDataset.model_validate_json(handle.read())


def run_training(input_path: Path, output_path: Path, trained_at: str) -> ModelArtifact:
    artifact = train_model(load_dataset(input_path), trained_at)
    output_path.write_text(json.dumps(artifact.model_dump(mode="json"), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return artifact


# --- --golden-vector fixture generation (C1) ---
# 고정 시드 합성 데이터로 학습한 뒤, 고정 입력 벡터에 대한 기대 확률을 함께 출력해
# TS 쪽 model-predict.test.ts가 "실제 Python sklearn 산출물"과 대조할 수 있게 한다.
GOLDEN_VECTOR_SEED: Final[int] = 42
GOLDEN_VECTOR_ROWS: Final[int] = 200
GOLDEN_VECTOR_FIXTURE_VERSION: Final[str] = "tli-m1-golden-vector-v1"
GOLDEN_INPUT_VALUES: Final[tuple[float, ...]] = (1.4826, -2.9652, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
GOLDEN_INPUT_MISSING: Final[tuple[bool, ...]] = tuple(False for _ in FEATURE_SCHEMA)


def _build_golden_synthetic_dataset() -> TrainingDataset:
    rng = np.random.default_rng(GOLDEN_VECTOR_SEED)
    features = rng.normal(size=(GOLDEN_VECTOR_ROWS, len(FEATURE_SCHEMA)))
    # 처음 두 피처가 라벨을 좌우하도록 해 모델이 학습할 실제 신호를 갖게 한다.
    logits = 0.9 * features[:, 0] - 0.6 * features[:, 1]
    probabilities = 1 / (1 + np.exp(-logits))
    labels = rng.uniform(size=GOLDEN_VECTOR_ROWS) < probabilities
    rows = tuple(
        TrainingRow(
            theme_id=f"golden-{index:04d}",
            base_date="2026-01-01",
            features=tuple(float(value) for value in features[index]),
            missing_flags=tuple(False for _ in FEATURE_SCHEMA),
            y=bool(labels[index]),
        )
        for index in range(GOLDEN_VECTOR_ROWS)
    )
    return TrainingDataset(
        dataset_version="tli-m1-training-dataset-v1",
        feature_schema=FEATURE_SCHEMA,
        train_range=("2026-01-01", "2026-01-01"),
        labeler_version="gta-v1",
        rows=rows,
    )


def _golden_design_row(
    artifact: ModelArtifact,
    values: tuple[float, ...],
    missing: tuple[bool, ...],
) -> NDArray[np.float64]:
    transformed = np.empty(len(FEATURE_SCHEMA), dtype=np.float64)
    for index in range(len(FEATURE_SCHEMA)):
        median = artifact.scaler.median[index]
        mad = artifact.scaler.mad[index]
        raw = values[index]
        imputed = median if missing[index] else raw
        transformed[index] = 0.0 if mad < MIN_MAD else (imputed - median) / (ROBUST_SCALE * mad)
    missing_flags = np.array([1.0 if flag else 0.0 for flag in missing], dtype=np.float64)
    return np.concatenate([transformed, missing_flags])


def _predict_with_artifact(
    artifact: ModelArtifact,
    values: tuple[float, ...],
    missing: tuple[bool, ...],
) -> float:
    design = _golden_design_row(artifact, values, missing)
    weights = np.array(artifact.coefficients.weights, dtype=np.float64)
    margin = artifact.coefficients.intercept + float(np.dot(design, weights))
    return float(1 / (1 + math.exp(artifact.calibrator.a * margin + artifact.calibrator.b)))


def build_golden_vector_fixture(trained_at: str) -> dict:
    artifact = train_model(_build_golden_synthetic_dataset(), trained_at)
    probability = _predict_with_artifact(artifact, GOLDEN_INPUT_VALUES, GOLDEN_INPUT_MISSING)
    return {
        "fixture_version": GOLDEN_VECTOR_FIXTURE_VERSION,
        "artifact": artifact.model_dump(mode="json"),
        "inputRow": {
            "values": list(GOLDEN_INPUT_VALUES),
            "missingFlags": list(GOLDEN_INPUT_MISSING),
        },
        "expectedProbability": probability,
    }


def run_golden_vector(output_path: Path, trained_at: str) -> dict:
    fixture = build_golden_vector_fixture(trained_at)
    output_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return fixture


def main(
    input_path: Optional[Path] = typer.Argument(None),
    output_path: Optional[Path] = typer.Argument(None),
    trained_at: str = typer.Option("2026-08-02"),
    golden_vector: bool = typer.Option(
        False,
        "--golden-vector",
        help="Train on fixed-seed synthetic data and emit an artifact + expected-probability fixture instead of training on INPUT_PATH",
    ),
) -> None:
    if golden_vector:
        if output_path is None:
            raise typer.BadParameter("--golden-vector requires OUTPUT_PATH")
        fixture = run_golden_vector(output_path, trained_at)
        typer.echo(json.dumps({"expectedProbability": fixture["expectedProbability"]}, ensure_ascii=False))
        return

    if input_path is None or output_path is None:
        raise typer.BadParameter("INPUT_PATH and OUTPUT_PATH are required unless --golden-vector is set")
    artifact = run_training(input_path, output_path, trained_at)
    typer.echo(json.dumps(artifact.sample_report.model_dump(mode="json"), ensure_ascii=False))


if __name__ == "__main__":
    typer.run(main)
