from __future__ import annotations

from datetime import date, timedelta
import sys
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from numpy.typing import NDArray
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from m1_runtime import RuntimeManifest

if TYPE_CHECKING:
    from m1_calibration import CrossFittedMargins, PlattCalibrator
    from sklearn.linear_model import LogisticRegression
    from train_m1 import TrainingDataset


EXPECTED_FEATURE_SCHEMA = (
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


def _origins(count: int) -> tuple[str, ...]:
    first = date(2026, 1, 5)
    return tuple((first + timedelta(days=7 * index)).isoformat() for index in range(count))


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


def _dataset(
    *,
    origin_count: int = 13,
    rows_per_origin: int = 12,
    sparse_validation_positives: bool = False,
) -> TrainingDataset:
    import train_m1

    rows = []
    origins = _origins(origin_count)
    validation_start = origin_count - min(8, origin_count - 8)
    for origin_index, origin in enumerate(origins):
        for row_index in range(rows_per_origin):
            if sparse_validation_positives and origin_index >= validation_start:
                outcome = row_index == rows_per_origin - 1
            else:
                outcome = row_index >= rows_per_origin // 2
            direction = 1.0 if outcome else -1.0
            signal = direction + origin_index / 100 + row_index / 1000
            features = (
                signal,
                signal / 2,
                float(row_index % 3),
                signal / 3,
                abs(signal),
                float(row_index),
                signal / 4,
                direction,
                float(origin_index),
                float(origin_index + 1),
            )
            rows.append(
                train_m1.TrainingRow(
                    theme_id=f"theme-{row_index:03d}",
                    base_date=origin,
                    features=features,
                    missing_flags=(False,) * 10,
                    y=outcome,
                ),
            )
    return train_m1.TrainingDataset(
        dataset_version="tli-m1-training-dataset-v2",
        feature_schema=EXPECTED_FEATURE_SCHEMA,
        train_range=(origins[0], origins[-1]),
        labeler_version="gta-v2",
        rows=tuple(rows),
    )


def test_final_artifact_records_exact_contract_runtime_and_split_manifest() -> None:
    import train_m1

    runtime = _runtime()

    artifact = train_m1.train_model(_dataset(), "2026-08-02", runtime)

    assert train_m1.FEATURE_SCHEMA == EXPECTED_FEATURE_SCHEMA
    assert artifact.artifact_version == "tli-model-artifact-v1"
    assert artifact.feature_schema == EXPECTED_FEATURE_SCHEMA
    assert len(artifact.scaler.median) == len(artifact.scaler.mad) == 10
    assert len(artifact.coefficients.weights) == 20
    assert artifact.calibrator.type == "platt"
    assert artifact.estimator_contract.model_dump() == {
        "penalty": "l2",
        "solver": "lbfgs",
        "fit_intercept": True,
        "class_weight": None,
        "max_iter": 5000,
        "tol": 1e-8,
        "selected_c": artifact.sample_report.selected_c,
    }
    assert artifact.calibration_contract.source == "time_blocked_cross_fitted_oof_margin"
    assert artifact.calibration_contract.probability_clamp == (1e-6, 1 - 1e-6)
    assert artifact.inner_oof.fold_count == 5
    assert artifact.inner_oof.ordered_origins == _origins(13)
    assert artifact.inner_oof.split_origins_sha256 == (
        "43f810450b71aaa8d8d2f7eceb3b466cf835840b9198c8ddcc83579fe587b15f"
    )
    assert artifact.runtime == runtime
    assert artifact.runtime.script_lock_sha256 == "a" * 64
    assert artifact.runtime.training_code_git_sha == "b" * 40


def test_final_estimator_refits_selected_c_on_all_clean_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import train_m1

    observed: list[tuple[tuple[int, int], int, float]] = []
    original_fit = train_m1.fit_base_estimator

    def capture_fit(
        values: NDArray[np.float64],
        outcomes: NDArray[np.int64],
        *,
        c: float,
    ) -> LogisticRegression:
        observed.append((values.shape, outcomes.size, c))
        return original_fit(values, outcomes, c=c)

    monkeypatch.setattr(train_m1, "fit_base_estimator", capture_fit)
    artifact = train_m1.train_model(_dataset(), "2026-08-02", _runtime())

    assert observed == [((13 * 12, 20), 13 * 12, artifact.sample_report.selected_c)]


def test_trainer_passes_only_time_blocked_oof_margins_to_platt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import m1_calibration
    import train_m1

    observed: list[CrossFittedMargins] = []
    original_fit = train_m1.fit_platt_calibrator

    def capture_fit(oof: CrossFittedMargins) -> PlattCalibrator:
        observed.append(oof)
        return original_fit(oof)

    monkeypatch.setattr(train_m1, "fit_platt_calibrator", capture_fit)
    train_m1.train_model(_dataset(), "2026-08-02", _runtime())

    assert len(observed) == 1
    assert isinstance(observed[0], m1_calibration.CrossFittedMargins)
    assert set(observed[0].origins) == set(_origins(13)[8:])
    assert observed[0].margins.shape == (5 * 12,)
