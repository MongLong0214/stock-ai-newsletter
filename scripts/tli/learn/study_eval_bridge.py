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
# 1. Install uv: curl -LsSf https://astral.sh/uv/0.9.25/install.sh | sh
# 2. Run with the frozen environment:
#      PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
#        uv run --frozen --python 3.13.11 --script scripts/tli/learn/study_eval_bridge.py INPUT_JSON OUTPUT_JSON
# 3. Regenerate only after an intentional dependency change:
#      uv lock --script scripts/tli/learn/study_eval_bridge.py
# End

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Never

from pydantic import BaseModel, ConfigDict, ValidationError
import typer

from m1_artifact import ModelArtifact, write_json
from m1_dataset import TrainingDataError, load_dataset
from m1_runtime import EXPECTED_SCRIPT_LOCK_SHA256, RuntimeContractError, enforce_runtime_contract
from stats_bootstrap import build_paired_sample
from study_eval_contract import (
    ARTIFACT_VERSION,
    BRIDGE_VERSION,
    ENSEMBLE_REPLICATES,
    STAT_REPLICATES,
    FullFitInput,
    RuntimeSummary,
    StudyBridgeError,
    StudyEvalOutput,
    StudyEvalRequest,
    TrainingInput,
    TrainingParity,
)
from study_eval_interval import EnsembleBuildRequest, build_ensemble_summary, canonical_model_sha
from study_eval_statistics import evaluate_statistics

type JsonScalar = None | bool | int | float | str
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]


class _ArtifactVersionProbe(BaseModel):
    model_config = ConfigDict(frozen=True)
    artifact_version: str


def _verified_bytes(path: Path, expected_sha256: str) -> bytes:
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise StudyBridgeError("input_read_failed", str(path)) from error
    actual = hashlib.sha256(payload).hexdigest()
    if actual != expected_sha256:
        raise StudyBridgeError("sha256_mismatch", f"{path}: {actual} != {expected_sha256}")
    return payload


def load_training_parity(training_inputs: tuple[TrainingInput, ...]) -> tuple[TrainingParity, ...]:
    parity: list[TrainingParity] = []
    for item in training_inputs:
        payload = _verified_bytes(item.path, item.expected_sha256)
        dataset = load_dataset(item.path)
        parity.append(
            TrainingParity(
                fold_id=item.fold_id,
                expected_sha256=item.expected_sha256,
                actual_sha256=hashlib.sha256(payload).hexdigest(),
                canonical_dataset_sha256=canonical_model_sha(dataset),
                row_count=len(dataset.rows),
                feature_schema=dataset.feature_schema,
            ),
        )
    return tuple(parity)


def enforce_runtime() -> RuntimeSummary:
    try:
        runtime = enforce_runtime_contract()
    except RuntimeContractError as error:
        raise StudyBridgeError("runtime_contract_violation", str(error)) from error
    lock_path = Path(__file__).with_name("study_eval_bridge.py.lock")
    try:
        lock_sha = hashlib.sha256(lock_path.read_bytes()).hexdigest()
    except OSError as error:
        raise StudyBridgeError("bridge_lock_missing", str(lock_path)) from error
    if lock_sha != EXPECTED_SCRIPT_LOCK_SHA256:
        raise StudyBridgeError("bridge_lock_drift", lock_sha)
    return RuntimeSummary(
        uv_version=runtime.uv_version,
        python_version=runtime.python_version,
        packages=runtime.resolved_packages,
        thread_env=runtime.thread_env,
        bridge_lock_sha256=lock_sha,
    )


class _DuplicateJsonKeyError(ValueError):
    pass


def _reject_duplicate_keys(pairs: list[tuple[str, JsonValue]]) -> dict[str, JsonValue]:
    payload: dict[str, JsonValue] = {}
    for key, value in pairs:
        if key in payload:
            raise _DuplicateJsonKeyError(key)
        payload[key] = value
    return payload


def _reject_nonstandard_number(token: str) -> Never:
    raise StudyBridgeError("nonstandard_json_number", token)


def _parse_finite_float(token: str) -> float:
    value = float(token)
    if not math.isfinite(value):
        raise StudyBridgeError("nonfinite_json_number", token)
    return value


def load_request(path: Path) -> StudyEvalRequest:
    try:
        payload = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=_reject_nonstandard_number,
            parse_float=_parse_finite_float,
        )
        return StudyEvalRequest.model_validate(payload)
    except (OSError, json.JSONDecodeError, _DuplicateJsonKeyError, ValidationError) as error:
        raise StudyBridgeError("invalid_request", str(error)) from error


def _load_artifact(full_fit: FullFitInput) -> ModelArtifact:
    payload = _verified_bytes(full_fit.artifact_path, full_fit.artifact_sha256)
    try:
        version = _ArtifactVersionProbe.model_validate_json(payload).artifact_version
        if version != ARTIFACT_VERSION:
            raise StudyBridgeError("unsupported_legacy_artifact", version)
        return ModelArtifact.model_validate_json(payload)
    except ValidationError as error:
        raise StudyBridgeError("invalid_full_fit_artifact", str(error)) from error


def run_bridge(request: StudyEvalRequest, runtime: RuntimeSummary) -> StudyEvalOutput:
    parity = load_training_parity(request.training_inputs)
    _verified_bytes(request.full_fit.training_input_path, request.full_fit.expected_sha256)
    dataset = load_dataset(request.full_fit.training_input_path)
    artifact = _load_artifact(request.full_fit)
    if (
        artifact.feature_schema != dataset.feature_schema
        or artifact.train_range != dataset.train_range
        or artifact.labeler_version != dataset.labeler_version
    ):
        raise StudyBridgeError("full_fit_contract_mismatch", str(request.full_fit.artifact_path))
    sample = build_paired_sample(
        [row.theme_id for row in request.paired_rows],
        [row.origin_date for row in request.paired_rows],
        [row.candidate_probability for row in request.paired_rows],
        [row.comparator_probability for row in request.paired_rows],
        [row.y for row in request.paired_rows],
    )
    return StudyEvalOutput(
        bridge_version=BRIDGE_VERSION,
        study_contract_id=request.study_contract_id,
        study_contract_sha256=request.study_contract_sha256,
        cycle_id=request.cycle_id,
        runtime=runtime,
        training_parity=parity,
        statistics=evaluate_statistics(sample, request.cycle_id, replicates=STAT_REPLICATES),
        interval_ensemble=build_ensemble_summary(
            EnsembleBuildRequest(
                dataset=dataset,
                artifact=artifact,
                probe=request.full_fit.probe,
                cycle_id=request.cycle_id,
            ),
            replicate_count=ENSEMBLE_REPLICATES,
        ),
    )


def main(input_path: Path, output_path: Path) -> None:
    request = load_request(input_path)
    output = run_bridge(request, enforce_runtime())
    write_json(output_path, output.model_dump(mode="json"))


if __name__ == "__main__":
    typer.run(main)
