from __future__ import annotations

from datetime import date, datetime, timedelta
from hashlib import sha256
import json
from pathlib import Path
import sys
from typing import TYPE_CHECKING

import numpy as np
from numpy.typing import NDArray
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

if TYPE_CHECKING:
    from m1_calibration_selection import PreprocessingStats
    from m1_dataset import TrainingDataset


def _iso_timestamp(origin: str, *, days: int = 0, milliseconds: int = 0) -> str:
    value = datetime.fromisoformat(f"{origin}T09:00:00+00:00") + timedelta(
        days=days,
        milliseconds=milliseconds,
    )
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _fixture() -> tuple[TrainingDataset, bytes, bytes]:
    from m1_calibration_selection import create_inner_oof_split
    from m1_dataset import FEATURE_SCHEMA, TrainingDataset, TrainingRow

    origins = tuple((date(2026, 1, 5) + timedelta(days=14 * index)).isoformat() for index in range(13))
    validation_origin = origins[8]
    validation_cutoff = _iso_timestamp(validation_origin)
    rows: list[TrainingRow] = []
    availability_rows: list[dict[str, int | str | list[str]]] = []
    for origin_index, origin in enumerate(origins):
        for theme_index in range(12):
            row_id = f"row-{origin_index:02d}-{theme_index:02d}"
            outcome = theme_index >= 6
            rows.append(TrainingRow(
                theme_id=f"theme-{theme_index:02d}",
                base_date=origin,
                features=tuple(float(theme_index + slot) for slot in range(10)),
                missing_flags=(False,) * 10,
                y=outcome,
            ))
            future_dates = [(date.fromisoformat(origin) + timedelta(days=5)).isoformat()]
            finalized_at = _iso_timestamp(origin, days=6)
            source_completed_at = _iso_timestamp(origin, days=6)
            if origin_index == 3 and theme_index == 0:
                future_dates = [validation_origin]
            if origin_index == 4 and theme_index == 0:
                finalized_at = _iso_timestamp(validation_origin, milliseconds=1)
            if origin_index == 5 and theme_index == 0:
                source_completed_at = _iso_timestamp(validation_origin, milliseconds=1)
            availability_rows.append({
                "row_index": len(availability_rows),
                "row_id": row_id,
                "theme_id": f"theme-{theme_index:02d}",
                "base_date": origin,
                "future_dates": future_dates,
                "finalized_at": finalized_at,
                "label_source_run_completed_at": source_completed_at,
            })
    dataset = TrainingDataset(
        dataset_version="tli-m1-training-dataset-v2",
        feature_schema=FEATURE_SCHEMA,
        train_range=(origins[0], origins[-1]),
        labeler_version="gta-v2",
        rows=tuple(rows),
    )
    training_bytes = (json.dumps(dataset.model_dump(mode="json"), indent=2) + "\n").encode()
    split = create_inner_oof_split(origins)
    sidecar = {
        "sidecar_version": "tli-m1-inner-pit-sidecar-v1",
        "training_input_sha256": sha256(training_bytes).hexdigest(),
        "inner_oof_split_sha256": split.split_origins_sha256,
        "origins": [
            {"origin_date": origin, "forecast_cutoff": _iso_timestamp(origin)}
            for origin in origins
        ],
        "rows": availability_rows,
    }
    sidecar_bytes = (json.dumps(sidecar, indent=2) + "\n").encode()
    assert validation_cutoff == sidecar["origins"][8]["forecast_cutoff"]
    return dataset, training_bytes, sidecar_bytes


def test_python_recomputes_all_three_inner_fold_availability_reasons() -> None:
    from m1_scientific_availability import (
        build_inner_availability_receipt,
        parse_scientific_availability,
    )

    # Given: three outer-eligible rows that fail one condition at the first inner cutoff.
    dataset, training_bytes, sidecar_bytes = _fixture()

    # When: Python parses the sidecar and independently derives its receipt.
    availability = parse_scientific_availability(dataset, training_bytes, sidecar_bytes)
    receipt = build_inner_availability_receipt(dataset, availability)

    # Then: the exact reasons occur in inner-01 only.
    assert tuple((row.row_id, row.reasons) for row in receipt.folds[0].purged_rows) == (
        ("row-03-00", ("future_window_not_before_validation_origin",)),
        ("row-04-00", ("label_finalized_after_validation_cutoff",)),
        ("row-05-00", ("label_source_run_completed_after_validation_cutoff",)),
    )
    later_purged = {row["row_id"] for fold in receipt.folds[1:] for row in fold.purged_rows}
    assert later_purged.isdisjoint({"row-03-00", "row-04-00", "row-05-00"})


def test_python_rejects_a_tampered_training_input_hash() -> None:
    from m1_scientific_availability import ScientificAvailabilityError, parse_scientific_availability

    # Given: a sidecar whose bound training-input SHA was changed after creation.
    dataset, training_bytes, sidecar_bytes = _fixture()
    payload = json.loads(sidecar_bytes)
    payload["training_input_sha256"] = "f" * 64
    tampered = (json.dumps(payload, indent=2) + "\n").encode()

    # When/Then: the boundary fails closed before any selector runs.
    with pytest.raises(ScientificAvailabilityError, match="training_input_sha256_mismatch"):
        parse_scientific_availability(dataset, training_bytes, tampered)


def test_selector_fits_each_candidate_on_the_python_eligible_mask(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: the independently parsed sidecar and a spy on the immutable fold-local preprocessor.
    import m1_scientific_selection as selection
    from m1_scientific_availability import parse_scientific_availability

    dataset, training_bytes, sidecar_bytes = _fixture()
    availability = parse_scientific_availability(dataset, training_bytes, sidecar_bytes)
    observed_train_rows: list[int] = []
    original = selection.fit_preprocessor

    def capture(
        values: NDArray[np.float64],
        missing: NDArray[np.bool_],
    ) -> PreprocessingStats:
        observed_train_rows.append(values.shape[0])
        return original(values, missing)

    monkeypatch.setattr(selection, "fit_preprocessor", capture)

    # When: all four C candidates produce fold-local preprocessing and OOF margins.
    selected = selection.select_scientific_regularization(dataset, availability)

    # Then: inner-01 uses 96 candidates minus the three unavailable rows, not the unpurged origin mask.
    assert observed_train_rows == [93, 108, 120, 132, 144] * 4
    assert selected.selection.oof.outcomes.size == 60
    assert selected.selection.selected_c in (0.01, 0.1, 1.0, 10.0)


def _runtime():
    from m1_runtime import EXPECTED_SCRIPT_LOCK_SHA256, RuntimeManifest

    return RuntimeManifest(
        uv_version="0.9.25",
        python_version="3.13.11",
        python_implementation="CPython",
        os="Darwin",
        arch="arm64",
        blas="test",
        thread_env={
            "MKL_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "PYTHONHASHSEED": "0",
        },
        resolved_packages=(),
        script_lock_sha256=EXPECTED_SCRIPT_LOCK_SHA256,
        training_code_git_sha="a" * 40,
        training_code_git_status="dirty",
    )


def test_scientific_trainer_full_fit_keeps_the_complete_outer_dataset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import train_m1_scientific as trainer

    dataset, training_bytes, sidecar_bytes = _fixture()
    observed_full_fit_rows: list[int] = []
    original = trainer.fit_preprocessor

    def capture(
        values: NDArray[np.float64],
        missing: NDArray[np.bool_],
    ) -> PreprocessingStats:
        observed_full_fit_rows.append(values.shape[0])
        return original(values, missing)

    monkeypatch.setattr(trainer, "fit_preprocessor", capture)

    artifact, receipt = trainer.train_scientific_model(
        trainer.ScientificTrainingInput(
            dataset=dataset,
            training_bytes=training_bytes,
            sidecar_bytes=sidecar_bytes,
        ),
        trainer.ScientificArtifactContext(trained_at="2026-08-02", runtime=_runtime()),
    )

    assert observed_full_fit_rows == [156]
    assert artifact.artifact_version == "tli-model-artifact-v2"
    assert artifact.sample_report.observed_n == 156
    assert artifact.sample_report.oof_rows == 60
    assert receipt.folds[0].purged_rows[0].row_id == "row-03-00"


def test_scientific_wrapper_rejects_adjacent_lock_drift_before_reading_inputs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import train_m1_scientific as trainer
    from m1_runtime import RuntimeContractError

    drifted_lock = tmp_path / "train_m1_scientific.py.lock"
    drifted_lock.write_text("drifted\n", encoding="utf-8")
    monkeypatch.setattr(trainer, "SCIENTIFIC_SCRIPT_LOCK_PATH", drifted_lock)
    files = trainer.ScientificTrainingFiles(
        input_path=tmp_path / "missing-training.json",
        sidecar_path=tmp_path / "missing-sidecar.json",
        output_path=tmp_path / "artifact.json",
        receipt_path=tmp_path / "receipt.json",
    )

    with pytest.raises(RuntimeContractError, match="scientific_script_lock_drift"):
        trainer.run_scientific_training(files, "2026-08-02", _runtime())


def test_scientific_cli_routes_adjacent_lock_drift_to_runtime_exit_two(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import train_m1_scientific as trainer
    import typer

    drifted_lock = tmp_path / "train_m1_scientific.py.lock"
    drifted_lock.write_text("drifted\n", encoding="utf-8")
    monkeypatch.setattr(trainer, "SCIENTIFIC_SCRIPT_LOCK_PATH", drifted_lock)
    monkeypatch.setattr(trainer, "enforce_runtime_contract", _runtime)

    with pytest.raises(typer.Exit) as failure:
        trainer.main(
            tmp_path / "missing-training.json",
            tmp_path / "missing-sidecar.json",
            tmp_path / "artifact.json",
            tmp_path / "receipt.json",
            "2026-08-02",
    )

    captured = capsys.readouterr()
    assert failure.value.exit_code == 2
    assert "M1 runtime contract violation" in captured.err
    assert "scientific_script_lock_drift" in captured.err
