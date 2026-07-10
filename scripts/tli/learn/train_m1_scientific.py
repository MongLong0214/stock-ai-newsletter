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
# PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
#   uv run --frozen --python 3.13.11 --script scripts/tli/learn/train_m1_scientific.py \
#   --trained-at 2026-08-02 TRAINING_JSON AVAILABILITY_JSON ARTIFACT_JSON RECEIPT_JSON
# End

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
from typing import Final

import numpy as np
import typer

from m1_artifact import (
    CalibrationContractArtifact,
    CandidateBrierReport,
    CoefficientsArtifact,
    EstimatorContractArtifact,
    InnerOofFoldManifest,
    InnerOofManifest,
    ModelArtifact,
    PlattCalibratorArtifact,
    ScalerArtifact,
    TrainingReport,
    write_json,
)
from m1_calibration import (
    CalibrationDataError,
    ModelFitError,
    fit_base_estimator,
    fit_platt_calibrator,
)
from m1_calibration_selection import (
    CandidateScore,
    PreprocessingError,
    RegularizationSelection,
    TemporalSplitError,
    fit_preprocessor,
    transform_design,
)
from m1_dataset import FEATURE_SCHEMA, TrainingDataError, TrainingDataset, load_dataset
from m1_runtime import (
    EXPECTED_SCRIPT_LOCK_SHA256,
    RuntimeContractError,
    RuntimeManifest,
    enforce_runtime_contract,
)
from m1_scientific_availability import (
    InnerAvailabilityReceipt,
    ScientificAvailabilityError,
    parse_scientific_availability,
)
from m1_scientific_selection import select_scientific_regularization

ARTIFACT_VERSION: Final[str] = "tli-model-artifact-v2"
MODEL_TYPE: Final[str] = "m1_logistic"
SEED: Final[int] = 42
SCIENTIFIC_SCRIPT_LOCK_PATH: Final[Path] = Path(f"{__file__}.lock")


@dataclass(frozen=True, slots=True)
class ScientificTrainingInput:
    dataset: TrainingDataset
    training_bytes: bytes
    sidecar_bytes: bytes


@dataclass(frozen=True, slots=True)
class ScientificArtifactContext:
    trained_at: str
    runtime: RuntimeManifest


@dataclass(frozen=True, slots=True)
class ScientificTrainingFiles:
    input_path: Path
    sidecar_path: Path
    output_path: Path
    receipt_path: Path


def _candidate_report(score: CandidateScore) -> CandidateBrierReport:
    return CandidateBrierReport(c=score.c, mean_brier=score.mean_brier, fold_briers=score.fold_briers)


def _split_manifest(selection: RegularizationSelection, origins: tuple[str, ...]) -> InnerOofManifest:
    return InnerOofManifest(
        origin_count=selection.split.origin_count,
        fold_count=selection.split.fold_count,
        ordered_origins=origins,
        folds=tuple(InnerOofFoldManifest(
            fold_id=fold.fold_id,
            validation_origin=fold.validation_origin,
            train_origins=fold.train_origins,
        ) for fold in selection.split.folds),
        split_origins_sha256=selection.split.split_origins_sha256,
    )


def train_scientific_model(
    input_data: ScientificTrainingInput,
    artifact_context: ScientificArtifactContext,
) -> tuple[ModelArtifact, InnerAvailabilityReceipt]:
    dataset = input_data.dataset
    availability = parse_scientific_availability(
        dataset,
        input_data.training_bytes,
        input_data.sidecar_bytes,
    )
    continuous = np.asarray([row.features for row in dataset.rows], dtype=np.float64)
    missing = np.asarray([row.missing_flags for row in dataset.rows], dtype=np.bool_)
    outcomes = np.asarray([int(row.y) for row in dataset.rows], dtype=np.int64)
    origins = tuple(row.base_date for row in dataset.rows)
    try:
        scientific = select_scientific_regularization(dataset, availability)
        selection = scientific.selection
        calibrator = fit_platt_calibrator(selection.oof)
        stats = fit_preprocessor(continuous, missing)
        full_design = transform_design(continuous, missing, stats)
        estimator = fit_base_estimator(full_design, outcomes, c=selection.selected_c)
    except (CalibrationDataError, ModelFitError, PreprocessingError, TemporalSplitError) as error:
        raise TrainingDataError(str(error)) from error
    event_count = int(np.sum(outcomes))
    event_rate = float(np.mean(outcomes))
    artifact = ModelArtifact(
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
        trained_at=artifact_context.trained_at,
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
        runtime=artifact_context.runtime,
    )
    return artifact, scientific.receipt


def enforce_scientific_script_lock(runtime: RuntimeManifest) -> None:
    if not SCIENTIFIC_SCRIPT_LOCK_PATH.is_file():
        raise RuntimeContractError(f"scientific_script_lock_missing: {SCIENTIFIC_SCRIPT_LOCK_PATH.name}")
    actual = sha256(SCIENTIFIC_SCRIPT_LOCK_PATH.read_bytes()).hexdigest()
    if actual != EXPECTED_SCRIPT_LOCK_SHA256:
        raise RuntimeContractError(
            f"scientific_script_lock_drift: {actual} != expected {EXPECTED_SCRIPT_LOCK_SHA256}"
        )
    if runtime.script_lock_sha256 != actual:
        raise RuntimeContractError(
            f"scientific_runtime_lock_mismatch: {runtime.script_lock_sha256} != actual {actual}"
        )


def run_scientific_training(
    files: ScientificTrainingFiles,
    trained_at: str,
    runtime: RuntimeManifest,
) -> ModelArtifact:
    enforce_scientific_script_lock(runtime)
    training_bytes = files.input_path.read_bytes()
    sidecar_bytes = files.sidecar_path.read_bytes()
    artifact, receipt = train_scientific_model(
        ScientificTrainingInput(
            dataset=load_dataset(files.input_path),
            training_bytes=training_bytes,
            sidecar_bytes=sidecar_bytes,
        ),
        ScientificArtifactContext(trained_at=trained_at, runtime=runtime),
    )
    write_json(files.output_path, artifact.model_dump(mode="json"))
    write_json(files.receipt_path, receipt.model_dump(mode="json"))
    return artifact


def main(
    input_path: Path,
    sidecar_path: Path,
    output_path: Path,
    receipt_path: Path,
    trained_at: str = typer.Option("2026-08-02"),
) -> None:
    try:
        runtime = enforce_runtime_contract()
        artifact = run_scientific_training(
            ScientificTrainingFiles(
                input_path=input_path,
                sidecar_path=sidecar_path,
                output_path=output_path,
                receipt_path=receipt_path,
            ),
            trained_at,
            runtime,
        )
    except RuntimeContractError as error:
        typer.echo(f"M1 runtime contract violation:\n{error}", err=True)
        raise typer.Exit(code=2) from error
    except (OSError, ScientificAvailabilityError, TrainingDataError) as error:
        typer.echo(f"M1 scientific training failed: {error}", err=True)
        raise typer.Exit(code=3) from error
    typer.echo(json.dumps(artifact.sample_report.model_dump(mode="json"), ensure_ascii=False))


if __name__ == "__main__":
    typer.run(main)
