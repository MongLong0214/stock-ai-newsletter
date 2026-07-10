#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13.11,<3.14"
# dependencies = [
#     "numpy==2.5.1",
#     "pydantic==2.13.4",
#     "scikit-learn==1.9.0",
#     "typer==0.26.8",
# ]
# ///

# How to run
# 과학 실행은 고정 런타임에서만 허용된다 (master plan "첫 confirmatory 모델 계약").
# 1. Install the pinned uv (if not installed):
#      curl -LsSf https://astral.sh/uv/0.9.25/install.sh | sh
# 2. Run with the frozen script lockfile and deterministic thread/hash env:
#      PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
#        uv run --frozen --python 3.13.11 --script scripts/tli/learn/train_m1.py \
#        --trained-at 2026-08-02 INPUT_JSON OUTPUT_JSON
# 3. Regenerate the lockfile after changing the PEP 723 dependencies:
#      uv lock --script scripts/tli/learn/train_m1.py
#    그리고 m1_runtime.EXPECTED_SCRIPT_LOCK_SHA256을 새 lock의 SHA-256으로 갱신한다.
# End

from __future__ import annotations

from datetime import date, timedelta
import json
from pathlib import Path
from typing import Final, Optional

import numpy as np
import typer

from m1_calibration import (
    CalibrationDataError,
    ModelFitError,
    PlattCalibrator,
    fit_base_estimator,
    fit_platt_calibrator,
    predict_calibrator,
)
from m1_artifact import (
    CalibrationContractArtifact,
    CandidateBrierReport,
    CoefficientsArtifact,
    EstimatorContractArtifact,
    InnerOofFoldManifest,
    InnerOofManifest,
    JsonValue,
    ModelArtifact,
    PlattCalibratorArtifact,
    ScalerArtifact,
    TrainingReport,
    write_json as _write_json,
)
from m1_dataset import FEATURE_SCHEMA, TrainingDataError, TrainingDataset, TrainingRow, load_dataset
from m1_calibration_selection import (
    CandidateScore,
    PreprocessingError,
    RegularizationSelection,
    TemporalSplitError,
    fit_preprocessor,
    select_regularization,
    transform_design,
)
from m1_runtime import RuntimeContractError, RuntimeManifest, enforce_runtime_contract

ARTIFACT_VERSION: Final[str] = "tli-model-artifact-v1"
MODEL_TYPE: Final[str] = "m1_logistic"
SEED: Final[int] = 42


def _candidate_report(score: CandidateScore) -> CandidateBrierReport:
    return CandidateBrierReport(c=score.c, mean_brier=score.mean_brier, fold_briers=score.fold_briers)


def _split_manifest(selection: RegularizationSelection, origins: tuple[str, ...]) -> InnerOofManifest:
    return InnerOofManifest(
        origin_count=selection.split.origin_count,
        fold_count=selection.split.fold_count,
        ordered_origins=origins,
        folds=tuple(
            InnerOofFoldManifest(
                fold_id=fold.fold_id,
                validation_origin=fold.validation_origin,
                train_origins=fold.train_origins,
            )
            for fold in selection.split.folds
        ),
        split_origins_sha256=selection.split.split_origins_sha256,
    )


def train_model(
    dataset: TrainingDataset,
    trained_at: str,
    runtime: RuntimeManifest,
) -> ModelArtifact:
    if not isinstance(runtime, RuntimeManifest):
        raise TrainingDataError("runtime manifest is required before M1 fitting")
    continuous = np.asarray([row.features for row in dataset.rows], dtype=np.float64)
    missing = np.asarray([row.missing_flags for row in dataset.rows], dtype=np.bool_)
    outcomes = np.asarray([int(row.y) for row in dataset.rows], dtype=np.int64)
    origins = tuple(row.base_date for row in dataset.rows)
    try:
        selection = select_regularization(continuous, missing, outcomes, origins)
        calibrator = fit_platt_calibrator(selection.oof)
        stats = fit_preprocessor(continuous, missing)
        full_design = transform_design(continuous, missing, stats)
        estimator = fit_base_estimator(full_design, outcomes, c=selection.selected_c)
    except (CalibrationDataError, ModelFitError, PreprocessingError, TemporalSplitError) as error:
        raise TrainingDataError(str(error)) from error

    event_count = int(np.sum(outcomes))
    event_rate = float(np.mean(outcomes))
    return ModelArtifact(
        artifact_version=ARTIFACT_VERSION,
        model_type=MODEL_TYPE,
        feature_schema=FEATURE_SCHEMA,
        scaler=ScalerArtifact(median=stats.medians, mad=stats.mads),
        coefficients=CoefficientsArtifact(
            intercept=float(estimator.intercept_[0]),
            weights=tuple(float(value) for value in estimator.coef_[0]),
        ),
        calibrator=PlattCalibratorArtifact(type="platt", a=calibrator.a, b=calibrator.b),
        estimator_contract=EstimatorContractArtifact(selected_c=selection.selected_c),
        calibration_contract=CalibrationContractArtifact(),
        inner_oof=_split_manifest(selection, tuple(sorted(set(origins)))),
        trained_at=trained_at,
        train_range=dataset.train_range,
        labeler_version=dataset.labeler_version,
        seed=SEED,
        train_event_rate=event_rate,
        sample_report=TrainingReport(
            observed_n=int(outcomes.size),
            events=event_count,
            event_rate=event_rate,
            parameters=int(full_design.shape[1]),
            selected_c=selection.selected_c,
            candidate_scores=tuple(_candidate_report(score) for score in selection.candidate_scores),
            oof_rows=int(selection.oof.outcomes.size),
            oof_positive=int(np.sum(selection.oof.outcomes == 1)),
            oof_negative=int(np.sum(selection.oof.outcomes == 0)),
        ),
        runtime=runtime,
    )


def run_training(
    input_path: Path,
    output_path: Path,
    trained_at: str,
    runtime: RuntimeManifest,
) -> ModelArtifact:
    artifact = train_model(load_dataset(input_path), trained_at, runtime)
    _write_json(output_path, artifact.model_dump(mode="json"))
    return artifact


GOLDEN_VECTOR_SEED: Final[int] = 42
GOLDEN_VECTOR_FIXTURE_VERSION: Final[str] = "tli-m1-golden-vector-v2"
GOLDEN_INPUT_VALUES: Final[tuple[float, ...]] = (1.2, -0.6, 0.5, 0.3, 0.1, 2.0, 0.4, 1.0, 1.0, 1.0)
GOLDEN_INPUT_MISSING: Final[tuple[bool, ...]] = (False,) * len(FEATURE_SCHEMA)


def _build_golden_synthetic_dataset() -> TrainingDataset:
    rng = np.random.default_rng(GOLDEN_VECTOR_SEED)
    rows: list[TrainingRow] = []
    first = date(2026, 1, 5)
    for origin_index in range(26):
        origin = (first + timedelta(days=7 * origin_index)).isoformat()
        for row_index in range(12):
            outcome = row_index >= 6
            direction = 1.0 if outcome else -1.0
            features = rng.normal(0.0, 0.25, len(FEATURE_SCHEMA))
            features[0] += 1.1 * direction
            features[1] += 0.7 * direction
            features[7] = direction
            rows.append(
                TrainingRow(
                    theme_id=f"golden-{row_index:03d}",
                    base_date=origin,
                    features=tuple(float(value) for value in features),
                    missing_flags=GOLDEN_INPUT_MISSING,
                    y=outcome,
                ),
            )
    last = (first + timedelta(days=7 * 25)).isoformat()
    return TrainingDataset(
        dataset_version="tli-m1-training-dataset-v2",
        feature_schema=FEATURE_SCHEMA,
        train_range=(first.isoformat(), last),
        labeler_version="gta-v2",
        rows=tuple(rows),
    )


def _predict_with_artifact(
    artifact: ModelArtifact,
    values: tuple[float, ...],
    missing: tuple[bool, ...],
) -> float:
    medians = np.asarray(artifact.scaler.median, dtype=np.float64)
    mads = np.asarray(artifact.scaler.mad, dtype=np.float64)
    raw = np.asarray(values, dtype=np.float64)
    flags = np.asarray(missing, dtype=np.bool_)
    imputed = np.where(flags | ~np.isfinite(raw), medians, raw)
    scaled = (imputed - medians) / np.where(mads > 0, mads, 1.0)
    design = np.concatenate((scaled, flags.astype(np.float64)))
    margin = artifact.coefficients.intercept + float(
        np.dot(design, np.asarray(artifact.coefficients.weights, dtype=np.float64)),
    )
    calibrator = PlattCalibrator(a=artifact.calibrator.a, b=artifact.calibrator.b)
    return float(predict_calibrator(calibrator, np.asarray([margin], dtype=np.float64))[0])


def build_golden_vector_fixture(
    trained_at: str,
    runtime: RuntimeManifest,
) -> dict[str, JsonValue]:
    artifact = train_model(_build_golden_synthetic_dataset(), trained_at, runtime)
    return {
        "fixture_version": GOLDEN_VECTOR_FIXTURE_VERSION,
        "artifact": artifact.model_dump(mode="json"),
        "inputRow": {
            "values": list(GOLDEN_INPUT_VALUES),
            "missingFlags": list(GOLDEN_INPUT_MISSING),
        },
        "expectedProbability": _predict_with_artifact(
            artifact,
            GOLDEN_INPUT_VALUES,
            GOLDEN_INPUT_MISSING,
        ),
    }


def run_golden_vector(
    output_path: Path,
    trained_at: str,
    runtime: RuntimeManifest,
) -> dict[str, JsonValue]:
    fixture = build_golden_vector_fixture(trained_at, runtime)
    _write_json(output_path, fixture)
    return fixture


def main(
    input_path: Optional[Path] = typer.Argument(None),
    output_path: Optional[Path] = typer.Argument(None),
    trained_at: str = typer.Option("2026-08-02"),
    golden_vector: bool = typer.Option(False, "--golden-vector"),
) -> None:
    try:
        runtime = enforce_runtime_contract()
    except RuntimeContractError as error:
        typer.echo(f"M1 runtime contract violation:\n{error}", err=True)
        raise typer.Exit(code=2) from error
    try:
        if golden_vector:
            if output_path is None:
                raise typer.BadParameter("--golden-vector requires OUTPUT_PATH")
            fixture = run_golden_vector(output_path, trained_at, runtime)
            typer.echo(json.dumps({"expectedProbability": fixture["expectedProbability"]}))
            return
        if input_path is None or output_path is None:
            raise typer.BadParameter("INPUT_PATH and OUTPUT_PATH are required unless --golden-vector is set")
        artifact = run_training(input_path, output_path, trained_at, runtime)
        typer.echo(json.dumps(artifact.sample_report.model_dump(mode="json"), ensure_ascii=False))
    except TrainingDataError as error:
        typer.echo(f"M1 training failed: {error}", err=True)
        raise typer.Exit(code=3) from error


if __name__ == "__main__":
    typer.run(main)
