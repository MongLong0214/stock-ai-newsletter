from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from train_m1 import (
    FEATURE_SCHEMA,
    GOLDEN_INPUT_MISSING,
    GOLDEN_INPUT_VALUES,
    TrainingDataError,
    TrainingDataset,
    build_golden_vector_fixture,
    run_golden_vector,
    run_training,
    train_model,
)


def make_dataset(rows: int = 80) -> TrainingDataset:
    payload = {
        "dataset_version": "tli-m1-training-dataset-v1",
        "feature_schema": list(FEATURE_SCHEMA),
        "train_range": ["2026-01-07", "2026-07-05"],
        "labeler_version": "gta-v1",
        "rows": [],
    }
    for index in range(rows):
        positive = index >= rows // 2
        signal = 1.5 + index / rows if positive else -1.5 + index / rows
        features = [
            signal,
            index / rows,
            signal / 2,
            abs(signal),
            0.5 + index / 100,
            1.2 if positive else 0.2,
            signal / 3,
            1.0,
            0.4 + index / 200,
            1.0 if index % 2 == 0 else -1.0,
        ]
        missing_flags = [False] * len(FEATURE_SCHEMA)
        if index % 11 == 0:
            missing_flags[7] = True
            features[7] = 0.0
        payload["rows"].append({
            "theme_id": f"theme-{index % 8}",
            "base_date": f"2026-06-{(index % 20) + 1:02d}",
            "features": features,
            "missing_flags": missing_flags,
            "y": positive,
        })
    return TrainingDataset.model_validate(payload)


def test_train_model_serializes_g3_artifact_with_sample_report() -> None:
    artifact = train_model(make_dataset(), "2026-08-02")

    assert artifact.artifact_version == "tli-model-artifact-v1"
    assert artifact.model_type == "m1_logistic"
    assert artifact.feature_schema == FEATURE_SCHEMA
    assert len(artifact.scaler.median) == 10
    assert len(artifact.scaler.mad) == 10
    assert len(artifact.coefficients.weights) == 20
    assert artifact.calibrator.type == "platt"
    assert artifact.seed == 42
    assert artifact.sample_report.cox_snell_r2 > 0.08
    assert artifact.sample_report.r2_status == "sufficient"


def test_run_training_round_trips_json_file(tmp_path: Path) -> None:
    input_path = tmp_path / "training.json"
    output_path = tmp_path / "artifact.json"
    input_path.write_text(make_dataset().model_dump_json(), encoding="utf-8")

    run_training(input_path, output_path, "2026-08-02")
    artifact = json.loads(output_path.read_text(encoding="utf-8"))

    assert artifact["trained_at"] == "2026-08-02"
    assert artifact["train_range"] == ["2026-01-07", "2026-07-05"]
    assert artifact["labeler_version"] == "gta-v1"
    assert artifact["sample_report"]["observed_n"] == 80


def test_train_model_rejects_single_class_dataset() -> None:
    dataset = make_dataset(20)
    payload = dataset.model_dump(mode="json")
    payload["rows"] = [{**row, "y": True} for row in payload["rows"]]

    with pytest.raises(TrainingDataError):
        train_model(TrainingDataset.model_validate(payload), "2026-08-02")


def test_golden_vector_fixture_is_deterministic_and_bounded() -> None:
    first = build_golden_vector_fixture("2026-08-02")
    second = build_golden_vector_fixture("2026-08-02")

    assert first["fixture_version"] == "tli-m1-golden-vector-v1"
    assert first["inputRow"]["values"] == list(GOLDEN_INPUT_VALUES)
    assert first["inputRow"]["missingFlags"] == list(GOLDEN_INPUT_MISSING)
    assert 0.0 < first["expectedProbability"] < 1.0
    # Fixed seed (42) synthetic data + deterministic sklearn solver settings must reproduce exactly.
    assert first["expectedProbability"] == second["expectedProbability"]
    assert first["artifact"]["coefficients"] == second["artifact"]["coefficients"]


def test_run_golden_vector_writes_fixture_file(tmp_path: Path) -> None:
    output_path = tmp_path / "golden-vector.json"

    fixture = run_golden_vector(output_path, "2026-08-02")
    written = json.loads(output_path.read_text(encoding="utf-8"))

    assert written == fixture
    assert written["artifact"]["trained_at"] == "2026-08-02"
