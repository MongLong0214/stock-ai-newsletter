from __future__ import annotations

from datetime import date, timedelta
import hashlib
import inspect
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Never
import warnings

import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from m1_runtime import RuntimeManifest

if TYPE_CHECKING:
    from train_m1 import TrainingDataset


FEATURE_SCHEMA = (
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


def _dataset(*, sparse_validation_positives: bool = False) -> TrainingDataset:
    import train_m1

    origins = _origins(13)
    rows = []
    for origin_index, origin in enumerate(origins):
        for row_index in range(12):
            if sparse_validation_positives and origin_index >= 8:
                outcome = row_index == 11
            else:
                outcome = row_index >= 6
            direction = 1.0 if outcome else -1.0
            signal = direction + origin_index / 100 + row_index / 1000
            rows.append(
                train_m1.TrainingRow(
                    theme_id=f"theme-{row_index:03d}",
                    base_date=origin,
                    features=(
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
                    ),
                    missing_flags=(False,) * 10,
                    y=outcome,
                ),
            )
    return train_m1.TrainingDataset(
        dataset_version="tli-m1-training-dataset-v2",
        feature_schema=FEATURE_SCHEMA,
        train_range=(origins[0], origins[-1]),
        labeler_version="gta-v2",
        rows=tuple(rows),
    )


def test_runtime_manifest_is_required_and_manifestless_emission_fails(tmp_path: Path) -> None:
    import train_m1

    assert train_m1.ModelArtifact.model_fields["runtime"].is_required()
    for boundary in (
        train_m1.train_model,
        train_m1.run_training,
        train_m1.build_golden_vector_fixture,
        train_m1.run_golden_vector,
    ):
        assert inspect.signature(boundary).parameters["runtime"].default is inspect.Parameter.empty

    input_path = tmp_path / "training.json"
    output_path = tmp_path / "model.json"
    input_path.write_text(_dataset().model_dump_json(), encoding="utf-8")
    with pytest.raises(train_m1.TrainingDataError, match="runtime manifest is required"):
        train_m1.run_training(input_path, output_path, "2026-08-02", None)
    assert not output_path.exists()


def test_load_dataset_rejects_duplicate_keys_and_nonstandard_numbers(tmp_path: Path) -> None:
    import train_m1

    duplicate_path = tmp_path / "duplicate.json"
    duplicate_path.write_text(
        _dataset().model_dump_json().replace(
            '"dataset_version":"tli-m1-training-dataset-v2"',
            '"dataset_version":"ambiguous","dataset_version":"tli-m1-training-dataset-v2"',
            1,
        ),
        encoding="utf-8",
    )
    nonstandard_path = tmp_path / "nonstandard.json"
    nonstandard_path.write_text(
        _dataset().model_dump_json().replace('"features":[', '"features":[NaN,', 1),
        encoding="utf-8",
    )
    overflow_path = tmp_path / "overflow.json"
    overflow_path.write_text(
        _dataset().model_dump_json().replace('"features":[', '"features":[1e1000000,', 1),
        encoding="utf-8",
    )

    with pytest.raises(train_m1.TrainingDataError, match=r'duplicate JSON key.*dataset_version'):
        train_m1.load_dataset(duplicate_path)
    with pytest.raises(train_m1.TrainingDataError, match=r"nonstandard JSON number.*NaN"):
        train_m1.load_dataset(nonstandard_path)
    with pytest.raises(train_m1.TrainingDataError, match=r"nonfinite JSON number.*1e1000000"):
        train_m1.load_dataset(overflow_path)


def test_atomic_writer_does_not_follow_a_predictable_sibling_symlink(tmp_path: Path) -> None:
    import train_m1

    output_path = tmp_path / "model.json"
    sentinel_path = tmp_path / "sentinel.txt"
    sentinel_path.write_text("unchanged", encoding="utf-8")
    (tmp_path / ".model.json.tmp").symlink_to(sentinel_path)

    train_m1._write_json(output_path, {"status": "ok"})

    assert sentinel_path.read_text(encoding="utf-8") == "unchanged"
    assert not output_path.is_symlink()
    assert output_path.read_text(encoding="utf-8") == '{\n  "status": "ok"\n}\n'


def test_zero_finite_full_training_slot_leaves_no_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import train_m1

    dataset = _dataset()
    rows = []
    for row in dataset.rows:
        features = list(row.features)
        flags = list(row.missing_flags)
        features[4] = float("nan")
        flags[4] = True
        rows.append(row.model_copy(update={"features": tuple(features), "missing_flags": tuple(flags)}))
    failed = dataset.model_copy(update={"rows": tuple(rows)})
    output_path = tmp_path / "model.json"
    monkeypatch.setattr(train_m1, "load_dataset", lambda _path: failed)

    with pytest.raises(train_m1.TrainingDataError, match=r"slot 4.*zero finite"):
        train_m1.run_training(tmp_path / "input.json", output_path, "2026-08-02", _runtime())
    assert not output_path.exists()


def test_oof_class_floor_failure_leaves_no_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import train_m1

    output_path = tmp_path / "model.json"
    monkeypatch.setattr(train_m1, "load_dataset", lambda _path: _dataset(sparse_validation_positives=True))
    with pytest.raises(train_m1.TrainingDataError, match=r"positive=5.*minimum=30"):
        train_m1.run_training(tmp_path / "input.json", output_path, "2026-08-02", _runtime())
    assert not output_path.exists()


def test_convergence_failure_leaves_no_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import m1_calibration
    import train_m1
    from sklearn.exceptions import ConvergenceWarning

    output_path = tmp_path / "model.json"
    monkeypatch.setattr(train_m1, "load_dataset", lambda _path: _dataset())

    def warn_fit(*_args: Never, **_kwargs: Never) -> Never:
        warnings.warn("forced non-convergence", ConvergenceWarning, stacklevel=2)
        raise AssertionError("warning must have been promoted to an exception")

    monkeypatch.setattr(m1_calibration.LogisticRegression, "fit", warn_fit)
    with pytest.raises(train_m1.TrainingDataError, match="converge"):
        train_m1.run_training(tmp_path / "input.json", output_path, "2026-08-02", _runtime())
    assert not output_path.exists()


def test_nonfinite_final_coefficients_leave_no_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import m1_calibration
    import train_m1

    output_path = tmp_path / "model.json"
    monkeypatch.setattr(train_m1, "load_dataset", lambda _path: _dataset())

    def reject_nonfinite(*_args: Never, **_kwargs: Never) -> Never:
        raise m1_calibration.NonFiniteModelError("base estimator: fitted coefficients are nonfinite")

    monkeypatch.setattr(train_m1, "fit_base_estimator", reject_nonfinite)
    with pytest.raises(train_m1.TrainingDataError, match="coefficients are nonfinite"):
        train_m1.run_training(tmp_path / "input.json", output_path, "2026-08-02", _runtime())
    assert not output_path.exists()


def test_two_runs_write_byte_identical_artifacts(tmp_path: Path) -> None:
    import train_m1

    input_path = tmp_path / "training.json"
    first_path = tmp_path / "first.json"
    second_path = tmp_path / "second.json"
    input_path.write_text(_dataset().model_dump_json(), encoding="utf-8")

    train_m1.run_training(input_path, first_path, "2026-08-02", _runtime())
    train_m1.run_training(input_path, second_path, "2026-08-02", _runtime())

    assert first_path.read_bytes() == second_path.read_bytes()
    assert hashlib.sha256(first_path.read_bytes()).hexdigest() == hashlib.sha256(
        second_path.read_bytes(),
    ).hexdigest()
