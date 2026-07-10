from __future__ import annotations

from datetime import date, timedelta
import hashlib
import json
import sys
from pathlib import Path

from pydantic import ValidationError
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from m1_dataset import FEATURE_SCHEMA, TrainingDataset, TrainingRow
from m1_runtime import RuntimeManifest
from stats_bootstrap import build_paired_sample


CYCLE_ID = "12345678-1234-4234-8234-123456789abc"
STUDY_SHA = "a" * 64
BRIDGE_VERSION = "tli-study-eval-bridge-v1"
type JsonScalar = None | bool | int | float | str
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]


def _dataset(origin_count: int = 13) -> TrainingDataset:
    first = date(2026, 1, 5)
    rows: list[TrainingRow] = []
    for origin_index in range(origin_count):
        origin = (first + timedelta(days=7 * origin_index)).isoformat()
        for theme_index in range(12):
            outcome = theme_index >= 6
            direction = 1.0 if outcome else -1.0
            signal = direction + origin_index / 100 + theme_index / 1000
            rows.append(
                TrainingRow(
                    theme_id=f"theme-{theme_index:02d}",
                    base_date=origin,
                    features=(signal,) * 7 + (direction, float(origin_index), float(origin_index + 1)),
                    missing_flags=(False,) * 10,
                    y=outcome,
                ),
            )
    return TrainingDataset(
        dataset_version="tli-m1-training-dataset-v2",
        feature_schema=FEATURE_SCHEMA,
        train_range=(rows[0].base_date, rows[-1].base_date),
        labeler_version="gta-v2",
        rows=tuple(rows),
    )


def _request_payload(training_path: Path, digest: str) -> dict[str, JsonValue]:
    return {
        "bridge_version": BRIDGE_VERSION,
        "study_contract_id": "tli-study-contract-v3",
        "study_contract_sha256": STUDY_SHA,
        "cycle_id": CYCLE_ID,
        "paired_rows": [
            {
                "theme_id": "theme-00",
                "origin_date": "2026-01-05",
                "candidate_probability": 0.2,
                "comparator_probability": 0.5,
                "y": 0,
            },
            {
                "theme_id": "theme-00",
                "origin_date": "2026-01-12",
                "candidate_probability": 0.8,
                "comparator_probability": 0.5,
                "y": 1,
            },
        ],
        "training_inputs": [{"fold_id": "outer-01", "path": str(training_path), "expected_sha256": digest}],
        "full_fit": {
            "training_input_path": str(training_path),
            "expected_sha256": digest,
            "availability_sidecar_path": str(training_path.with_name("inner-pit-sidecar.json")),
            "availability_sidecar_sha256": "d" * 64,
            "artifact_path": str(training_path.with_name("artifact.json")),
            "artifact_sha256": "b" * 64,
            "probe": {"values": [0.0] * 10, "missing": [False] * 10},
        },
    }


def _availability(dataset: TrainingDataset):
    from m1_calibration_selection import create_inner_oof_split
    from m1_scientific_availability import parse_scientific_availability

    origins = tuple(sorted({row.base_date for row in dataset.rows}))
    training_bytes = (json.dumps(dataset.model_dump(mode="json"), indent=2) + "\n").encode()
    split = create_inner_oof_split(origins)
    sidecar = {
        "sidecar_version": "tli-m1-inner-pit-sidecar-v1",
        "training_input_sha256": hashlib.sha256(training_bytes).hexdigest(),
        "inner_oof_split_sha256": split.split_origins_sha256,
        "origins": [{"origin_date": origin, "forecast_cutoff": "2099-01-01T00:00:00.000Z"} for origin in origins],
        "rows": [
            {
                "row_index": index,
                "row_id": f"row-{index:04d}",
                "theme_id": row.theme_id,
                "base_date": row.base_date,
                "future_dates": [row.base_date],
                "finalized_at": "2000-01-01T00:00:00.000Z",
                "label_source_run_completed_at": "2000-01-01T00:00:00.000Z",
            }
            for index, row in enumerate(dataset.rows)
        ],
    }
    sidecar_bytes = (json.dumps(sidecar, indent=2) + "\n").encode()
    return parse_scientific_availability(dataset, training_bytes, sidecar_bytes)


def _runtime() -> RuntimeManifest:
    return RuntimeManifest(
        uv_version="0.9.25",
        python_version="3.13.11",
        python_implementation="CPython",
        os="Darwin",
        arch="arm64",
        blas="Accelerate 1.0",
        thread_env={
            "MKL_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "PYTHONHASHSEED": "0",
        },
        resolved_packages=("numpy==2.5.1", "scikit-learn==1.9.0"),
        script_lock_sha256="a" * 64,
        training_code_git_sha="b" * 40,
        training_code_git_status="clean",
    )


def test_request_is_strict_and_rejects_noncanonical_identity(tmp_path: Path) -> None:
    from study_eval_contract import StudyEvalRequest

    # Given: a shape-correct request payload.
    path = tmp_path / "training.json"
    payload = _request_payload(path, "c" * 64)

    # When/Then: extra fields and uppercase SHA fail at the JSON boundary.
    with pytest.raises(ValidationError):
        StudyEvalRequest.model_validate({**payload, "unexpected": True})
    with pytest.raises(ValidationError):
        StudyEvalRequest.model_validate({**payload, "study_contract_sha256": STUDY_SHA.upper()})


def test_training_parity_hashes_and_loads_the_exact_ts_file(tmp_path: Path) -> None:
    from study_eval_bridge import load_training_parity
    from study_eval_contract import StudyEvalRequest

    # Given: a concrete TS-emitted training JSON and its byte hash.
    path = tmp_path / "training.json"
    encoded = _dataset().model_dump_json().encode("utf-8")
    path.write_bytes(encoded)
    digest = hashlib.sha256(encoded).hexdigest()
    request = StudyEvalRequest.model_validate(_request_payload(path, digest))

    # When: the bridge verifies its training-input ledger.
    parity = load_training_parity(request.training_inputs)

    # Then: the loaded Python dataset is pinned to the exact TS bytes.
    assert parity[0].fold_id == "outer-01"
    assert parity[0].actual_sha256 == digest
    assert parity[0].row_count == 13 * 12
    assert parity[0].feature_schema == FEATURE_SCHEMA


def test_positive_skill_requires_negative_point_and_negative_upper_99() -> None:
    from study_eval_statistics import evaluate_statistics

    # Given: a deterministic panel where candidate Brier dominates 0.5 everywhere.
    themes = [f"theme-{index % 10:02d}" for index in range(100)]
    origins = [f"2026-01-{5 + 7 * (index // 10):02d}" for index in range(100)]
    outcomes = [index % 2 for index in range(100)]
    candidates = [0.1 if outcome == 0 else 0.9 for outcome in outcomes]
    sample = build_paired_sample(themes, origins, candidates, [0.5] * 100, outcomes)

    # When: reduced deterministic replicates exercise the pure statistics adapter.
    result = evaluate_statistics(sample, CYCLE_ID, replicates=128)

    # Then: both point and 99% upper bound are required for positive skill.
    assert result.delta_brier.point < 0.0
    assert result.delta_brier.upper_99 < 0.0
    assert result.delta_brier.positive_skill is True


def test_equal_candidate_is_not_promoted_and_production_counts_are_frozen() -> None:
    from study_eval_contract import ENSEMBLE_REPLICATES, STAT_REPLICATES
    from study_eval_statistics import evaluate_statistics

    # Given: candidate and comparator probabilities are identical.
    themes = [f"theme-{index % 4}" for index in range(40)]
    origins = [f"2026-{1 + index // 20:02d}-{1 + (index // 4) % 5:02d}" for index in range(40)]
    outcomes = [index % 2 for index in range(40)]
    sample = build_paired_sample(themes, origins, [0.5] * 40, [0.5] * 40, outcomes)

    # When: the no-signal panel is evaluated.
    result = evaluate_statistics(sample, CYCLE_ID, replicates=64)

    # Then: equality never becomes positive skill and CLI constants stay non-configurable.
    assert result.delta_brier.point == 0.0
    assert result.delta_brier.upper_99 == 0.0
    assert result.delta_brier.positive_skill is False
    assert STAT_REPLICATES == 10_000
    assert ENSEMBLE_REPLICATES == 500


def test_real_first_admissible_ensemble_is_deterministic_with_reduced_count() -> None:
    from study_eval_contract import StudyEvalRequest
    from study_eval_interval import EnsembleBuildRequest, build_ensemble_summary
    from train_m1 import train_model

    # Given: a full v2 fit and a complete 16-origin by 12-theme panel.
    dataset = _dataset(origin_count=16)
    artifact = train_model(dataset, "2026-08-02", _runtime())
    request = StudyEvalRequest.model_validate(
        _request_payload(Path("training.json"), "c" * 64),
    )

    # When: the real weighted fitting callback builds two accepted replicates twice.
    build_request = EnsembleBuildRequest(
        dataset=dataset,
        artifact=artifact,
        probe=request.full_fit.probe,
        cycle_id=CYCLE_ID,
        availability=_availability(dataset),
    )
    first = build_ensemble_summary(build_request, replicate_count=2)
    second = build_ensemble_summary(build_request, replicate_count=2)

    # Then: first-admissible ledgers, real artifact hashes, and probe interval are identical.
    assert len(first.accepted) == 2
    assert all(item.artifact_sha256 is not None for item in first.accepted)
    assert first.model_dump_json() == second.model_dump_json()
    assert first.probe.lower <= first.probe.full_fit_probability <= first.probe.upper


def test_bridge_script_declares_a_frozen_pep723_environment() -> None:
    # Given/When: the committed bridge source and lock are inspected.
    source = Path("scripts/tli/learn/study_eval_bridge.py").read_text(encoding="utf-8")
    lock_path = Path("scripts/tli/learn/study_eval_bridge.py.lock")

    # Then: production usage documents and carries the frozen exact environment.
    assert source.startswith("#!/usr/bin/env -S uv run --script\n# /// script\n")
    assert "uv run --frozen --python 3.13.11 --script" in source
    assert lock_path.is_file()
    assert json.loads(json.dumps({"lock_sha256": hashlib.sha256(lock_path.read_bytes()).hexdigest()}))


def test_bridge_production_modules_stay_within_the_review_ceiling() -> None:
    # Given: every bridge-owned production module, including the weighted fitter.
    paths = (
        Path("scripts/tli/learn/m1_weighted_replicate.py"),
        Path("scripts/tli/learn/study_eval_bridge.py"),
        Path("scripts/tli/learn/study_eval_contract.py"),
        Path("scripts/tli/learn/study_eval_interval.py"),
        Path("scripts/tli/learn/study_eval_statistics.py"),
    )

    # When: pure non-comment lines are counted.
    pure_counts = {
        path.name: sum(
            1
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        )
        for path in paths
    }

    # Then: every module fits inside one reviewer-sized unit.
    assert pure_counts == {name: count for name, count in pure_counts.items() if count <= 250}


def test_bridge_domain_errors_allow_python_traceback_updates() -> None:
    from m1_weighted_replicate import WeightedReplicateError
    from study_eval_contract import StudyBridgeError

    errors = (
        StudyBridgeError("invalid_request", "fixture"),
        WeightedReplicateError("invalid_weights", "fixture"),
    )
    for error in errors:
        try:
            raise error
        except RuntimeError as caught:
            caught.__traceback__ = caught.__traceback__
