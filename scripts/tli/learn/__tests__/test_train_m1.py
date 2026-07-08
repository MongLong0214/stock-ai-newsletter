from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from m1_calibration import select_calibrator_type
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


TEMPORAL_LOGITS = tuple(float(value) for value in np.linspace(-4.0, 4.0, 17))


def _sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def _materialize_temporal_probabilities(
    probability_blocks: tuple[tuple[float, ...], ...],
    logits: tuple[float, ...],
    repeats: int,
) -> tuple[NDArray[np.float64], NDArray[np.int64], tuple[str, ...]]:
    values: list[list[float]] = []
    labels: list[int] = []
    base_dates: list[str] = []
    for block_index, probabilities in enumerate(probability_blocks):
        base_date = f"2026-01-{block_index + 1:02d}"
        for logit, probability in zip(logits, probabilities):
            positives = round(probability * repeats)
            for repeat_index in range(repeats):
                values.append([logit])
                labels.append(1 if repeat_index < positives else 0)
                base_dates.append(base_date)
    return np.array(values, dtype=np.float64), np.array(labels, dtype=np.int64), tuple(base_dates)


def _beta_probability(logit: float) -> float:
    base = min(1 - 1e-6, max(1e-6, _sigmoid(logit)))
    return _sigmoid((1.6 * math.log(base)) + (0.35 * -math.log(1 - base)) - 0.15)


def _shifted_probability(logit: float, shift: float) -> float:
    base = _sigmoid(logit)
    if -2.0 <= logit <= 2.0:
        return min(0.95, max(0.05, base + shift))
    return base


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
            1.0 if positive else -1.0,
            signal / 4,
            0.2 if positive else 0.8,
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


def test_temporal_calibrator_selection_keeps_platt_when_isotonic_recent_block_overfits() -> None:
    probability_blocks = tuple(
        tuple(_shifted_probability(logit, 0.6 if block_index < 3 else -0.6) for logit in TEMPORAL_LOGITS)
        for block_index in range(5)
    )
    values, labels, base_dates = _materialize_temporal_probabilities(probability_blocks, TEMPORAL_LOGITS, 18)

    selection = select_calibrator_type(values, labels, base_dates)

    assert selection.selection_method == "forward_chaining"
    assert selection.chosen_type == "platt"
    assert selection.isotonic.passes_recent_block_guard is False


def test_temporal_calibrator_selection_promotes_beta_when_consistently_better_than_platt() -> None:
    probability_blocks = tuple(tuple(_beta_probability(logit) for logit in TEMPORAL_LOGITS) for _ in range(5))
    values, labels, base_dates = _materialize_temporal_probabilities(probability_blocks, TEMPORAL_LOGITS, 18)

    selection = select_calibrator_type(values, labels, base_dates)

    assert selection.chosen_type == "beta"
    assert selection.beta.beats_platt_margin is True
    assert selection.beta.passes_recent_block_guard is True


def test_temporal_calibrator_selection_falls_back_to_platt_for_thin_dates() -> None:
    probability_blocks = tuple(tuple(_sigmoid(logit) for logit in TEMPORAL_LOGITS) for _ in range(4))
    values, labels, base_dates = _materialize_temporal_probabilities(probability_blocks, TEMPORAL_LOGITS, 2)

    selection = select_calibrator_type(values, labels, base_dates)

    assert selection.chosen_type == "platt"
    assert selection.fallback_reason == "requires at least 5 distinct base_date values"
    assert selection.platt.out_of_time_ece is None


def test_temporal_calibrator_selection_is_deterministic() -> None:
    probability_blocks = tuple(tuple(_beta_probability(logit) for logit in TEMPORAL_LOGITS) for _ in range(5))
    values, labels, base_dates = _materialize_temporal_probabilities(probability_blocks, TEMPORAL_LOGITS, 18)

    first = select_calibrator_type(values, labels, base_dates)
    second = select_calibrator_type(values, labels, base_dates)

    assert first == second


def test_train_model_serializes_g3_artifact_with_sample_report() -> None:
    artifact = train_model(make_dataset(), "2026-08-02")

    assert artifact.artifact_version == "tli-model-artifact-v1"
    assert artifact.model_type == "m1_logistic"
    assert artifact.feature_schema == FEATURE_SCHEMA
    assert len(artifact.scaler.median) == 13
    assert len(artifact.scaler.mad) == 13
    assert len(artifact.coefficients.weights) == 26
    assert artifact.calibrator.type in {"platt", "beta", "isotonic"}
    assert artifact.seed == 42
    assert artifact.train_event_rate == artifact.sample_report.event_rate
    assert artifact.sample_report.cox_snell_r2 > 0.08
    assert artifact.sample_report.r2_status == "sufficient"
    assert artifact.sample_report.calibration_selection.chosen_type == artifact.calibrator.type
    assert artifact.sample_report.calibration_selection.platt.cv_log_loss > 0
    assert artifact.sample_report.calibration_selection.beta.cv_log_loss > 0
    assert artifact.sample_report.calibration_selection.isotonic.cv_log_loss > 0


def test_run_training_round_trips_json_file(tmp_path: Path) -> None:
    input_path = tmp_path / "training.json"
    output_path = tmp_path / "artifact.json"
    input_path.write_text(make_dataset().model_dump_json(), encoding="utf-8")

    run_training(input_path, output_path, "2026-08-02")
    artifact = json.loads(output_path.read_text(encoding="utf-8"))

    assert artifact["trained_at"] == "2026-08-02"
    assert artifact["train_range"] == ["2026-01-07", "2026-07-05"]
    assert artifact["labeler_version"] == "gta-v1"
    assert artifact["train_event_rate"] == artifact["sample_report"]["event_rate"]
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
    assert set(first["calibratorFixtures"].keys()) == {"platt", "beta", "isotonic"}
    assert first["artifact"]["train_event_rate"] == first["artifact"]["sample_report"]["event_rate"]
    for calibrator_type, fixture_case in first["calibratorFixtures"].items():
        assert fixture_case["artifact"]["calibrator"]["type"] == calibrator_type
        assert fixture_case["artifact"]["train_event_rate"] == fixture_case["artifact"]["sample_report"]["event_rate"]
        assert 0.0 <= fixture_case["expectedProbability"] <= 1.0
    # Fixed seed (42) synthetic data + deterministic sklearn solver settings must reproduce exactly.
    assert first["expectedProbability"] == second["expectedProbability"]
    assert first["artifact"]["coefficients"] == second["artifact"]["coefficients"]
    assert first["calibratorFixtures"] == second["calibratorFixtures"]


def test_run_golden_vector_writes_fixture_file(tmp_path: Path) -> None:
    output_path = tmp_path / "golden-vector.json"

    fixture = run_golden_vector(output_path, "2026-08-02")
    written = json.loads(output_path.read_text(encoding="utf-8"))

    assert written == fixture
    assert written["artifact"]["trained_at"] == "2026-08-02"
