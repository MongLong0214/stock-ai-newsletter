from __future__ import annotations

from datetime import date, datetime, timedelta
from hashlib import sha256
import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from numpy.typing import NDArray
import pytest

if TYPE_CHECKING:
    from m1_calibration_selection import PreprocessingStats
    from m1_scientific_availability import ReplicateAvailability
    from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from m1_dataset import FEATURE_SCHEMA, TrainingDataset, TrainingRow
from m1_runtime import RuntimeManifest


def _training_bytes(dataset: TrainingDataset) -> bytes:
    return (json.dumps(dataset.model_dump(mode="json"), indent=2) + "\n").encode()


def _iso_timestamp(origin: str, *, days: int = 0, milliseconds: int = 0) -> str:
    value = datetime.fromisoformat(f"{origin}T09:00:00+00:00") + timedelta(days=days, milliseconds=milliseconds)
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _availability_from_rows(
    dataset: TrainingDataset,
    availability_rows: list[dict[str, object]],
    *,
    forecast_cutoff: dict[str, str],
) -> ReplicateAvailability:
    from m1_calibration_selection import create_inner_oof_split
    from m1_scientific_availability import build_replicate_availability, parse_scientific_availability

    origins = tuple(sorted({row.base_date for row in dataset.rows}))
    training_bytes = _training_bytes(dataset)
    split = create_inner_oof_split(origins)
    sidecar = {
        "sidecar_version": "tli-m1-inner-pit-sidecar-v1",
        "training_input_sha256": sha256(training_bytes).hexdigest(),
        "inner_oof_split_sha256": split.split_origins_sha256,
        "origins": [{"origin_date": origin, "forecast_cutoff": forecast_cutoff[origin]} for origin in origins],
        "rows": availability_rows,
    }
    sidecar_bytes = (json.dumps(sidecar, indent=2) + "\n").encode()
    return build_replicate_availability(dataset, parse_scientific_availability(dataset, training_bytes, sidecar_bytes))


def _all_available(dataset: TrainingDataset) -> ReplicateAvailability:
    rows: list[dict[str, object]] = [
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
    ]
    origins = sorted({row.base_date for row in dataset.rows})
    return _availability_from_rows(dataset, rows, forecast_cutoff={origin: "2099-01-01T00:00:00.000Z" for origin in origins})


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
                    features=(
                        signal,
                        signal / 2,
                        float(theme_index % 3),
                        signal / 3,
                        abs(signal),
                        float(theme_index),
                        signal / 4,
                        direction,
                        float(origin_index),
                        float(origin_index + 1),
                    ),
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


def test_uniform_integer_multiset_matches_the_full_training_artifact() -> None:
    from m1_weighted_replicate import WeightedFitRequest, WeightedFitSuccess, fit_weighted_replicate
    from train_m1 import train_model

    # Given: the exact 16-origin dataset and its ordinary K=8 full-fit artifact.
    dataset = _dataset(origin_count=16)
    full_fit = train_model(dataset, "2026-08-02", _runtime())
    request = WeightedFitRequest(
        dataset=dataset,
        template=full_fit,
        row_weights=np.ones(len(dataset.rows), dtype=np.float64),
        availability=_all_available(dataset),
    )

    # When: every row has multiplicity one.
    result = fit_weighted_replicate(request)

    # Then: the weighted path is byte-for-byte equivalent to the ordinary fit.
    assert isinstance(result, WeightedFitSuccess)
    assert result.artifact.model_dump_json() == full_fit.model_dump_json()
    assert result.artifact.artifact_version == "tli-model-artifact-v2"
    assert result.artifact.inner_oof.fold_count == 8


def test_template_selected_c_is_frozen_for_every_fold_and_full_estimator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import m1_weighted_replicate as weighted
    from train_m1 import train_model

    # Given: a template whose frozen C differs from the ordinary fit's selected C.
    dataset = _dataset()
    template = train_model(dataset, "2026-08-02", _runtime())
    frozen_c = 0.01
    template = template.model_copy(
        update={
            "estimator_contract": template.estimator_contract.model_copy(update={"selected_c": frozen_c}),
            "sample_report": template.sample_report.model_copy(update={"selected_c": frozen_c}),
        },
    )
    observed_c: list[float] = []
    original_fit = weighted.fit_base_estimator

    def capture_fit(
        design: NDArray[np.float64],
        outcomes: NDArray[np.int64],
        *,
        c: float,
    ) -> LogisticRegression:
        observed_c.append(c)
        return original_fit(design, outcomes, c=c)

    monkeypatch.setattr(weighted, "fit_base_estimator", capture_fit)

    # When: a replicate fits five chronological folds and the full estimator.
    result = weighted.fit_weighted_replicate(
        weighted.WeightedFitRequest(
            dataset=dataset,
            template=template,
            row_weights=np.ones(len(dataset.rows), dtype=np.float64),
            availability=_all_available(dataset),
        ),
    )

    # Then: no fit reselects or substitutes C, and both artifact reports stay frozen.
    assert isinstance(result, weighted.WeightedFitSuccess)
    assert observed_c == [frozen_c] * 6
    assert result.artifact.estimator_contract.selected_c == frozen_c
    assert result.artifact.sample_report.selected_c == frozen_c


def test_exactly_five_supported_oof_origins_are_accepted() -> None:
    from m1_weighted_replicate import WeightedFitRequest, WeightedFitSuccess, fit_weighted_replicate
    from train_m1 import train_model

    # Given: an original K=8 split whose first three validation origins have zero weight.
    dataset = _dataset(origin_count=16)
    template = train_model(dataset, "2026-08-02", _runtime())
    weights = np.ones(len(dataset.rows), dtype=np.float64)
    weights[8 * 12 : 11 * 12] = 0.0

    # When: the adapter evaluates only the five supported validation origins.
    result = fit_weighted_replicate(
        WeightedFitRequest(
            dataset=dataset,
            template=template,
            row_weights=weights,
            availability=_all_available(dataset),
        ),
    )

    # Then: the fixed chronological K plan remains recorded and the supported OOF reaches the floor.
    assert isinstance(result, WeightedFitSuccess)
    assert result.artifact.inner_oof == template.inner_oof
    assert result.artifact.sample_report.oof_rows == 5 * 12


def test_fewer_than_five_supported_oof_origins_are_rejected() -> None:
    from m1_weighted_replicate import WeightedFitRejected, WeightedFitRequest, fit_weighted_replicate
    from train_m1 import train_model

    # Given: an original K=8 split with only four nonzero validation origins.
    dataset = _dataset(origin_count=16)
    template = train_model(dataset, "2026-08-02", _runtime())
    weights = np.ones(len(dataset.rows), dtype=np.float64)
    weights[8 * 12 : 12 * 12] = 0.0

    # When: the replicate support is assessed before fitting.
    result = fit_weighted_replicate(
        WeightedFitRequest(
            dataset=dataset,
            template=template,
            row_weights=weights,
            availability=_all_available(dataset),
        ),
    )

    # Then: K support below five is inadmissible with a stable reason code.
    assert isinstance(result, WeightedFitRejected)
    assert result.reason == "oof_origin_support_below_floor"


def test_multiplicity_cannot_inflate_distinct_oof_class_support() -> None:
    from m1_weighted_replicate import WeightedFitRejected, WeightedFitRequest, fit_weighted_replicate
    from train_m1 import train_model

    # Given: five validation origins with 25 distinct positive rows expanded to 30 copies.
    dataset = _dataset()
    template = train_model(dataset, "2026-08-02", _runtime())
    weights = np.ones(len(dataset.rows), dtype=np.float64)
    for origin_index in range(8, 13):
        weights[origin_index * 12 + 6] = 0.0
        weights[origin_index * 12 + 7] = 2.0

    # When: the weighted replicate checks OOF admissibility.
    result = fit_weighted_replicate(
        WeightedFitRequest(
            dataset=dataset,
            template=template,
            row_weights=weights,
            availability=_all_available(dataset),
        ),
    )

    # Then: multiplicity cannot hide the sub-30 distinct-source-row class count.
    assert isinstance(result, WeightedFitRejected)
    assert result.reason == "oof_distinct_class_below_floor"


def _leaky_availability(dataset: TrainingDataset) -> ReplicateAvailability:
    origins = sorted({row.base_date for row in dataset.rows})
    validation_origin = origins[8]
    late = _iso_timestamp(validation_origin, milliseconds=1)
    rows: list[dict[str, object]] = []
    for index, row in enumerate(dataset.rows):
        origin_index = origins.index(row.base_date)
        theme_index = index % 12
        future_dates = [(date.fromisoformat(row.base_date) + timedelta(days=5)).isoformat()]
        finalized_at = _iso_timestamp(row.base_date, days=6)
        source_completed_at = _iso_timestamp(row.base_date, days=6)
        if origin_index == 3 and theme_index == 0:
            future_dates = [validation_origin]
        if origin_index == 4 and theme_index == 0:
            finalized_at = late
        if origin_index == 5 and theme_index == 0:
            source_completed_at = late
        rows.append({
            "row_index": index,
            "row_id": f"row-{origin_index:02d}-{theme_index:02d}",
            "theme_id": row.theme_id,
            "base_date": row.base_date,
            "future_dates": future_dates,
            "finalized_at": finalized_at,
            "label_source_run_completed_at": source_completed_at,
        })
    return _availability_from_rows(
        dataset,
        rows,
        forecast_cutoff={origin: _iso_timestamp(origin) for origin in origins},
    )


def test_replicate_inner_oof_purges_late_and_future_window_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    import m1_weighted_replicate as weighted
    from train_m1 import train_model

    # Given: a 13-origin replicate whose inner-01 train pool holds one future-window, one late-finalized,
    # and one late-source row that must be purged before any fold-local preprocessing runs.
    dataset = _dataset(origin_count=13)
    template = train_model(dataset, "2026-08-02", _runtime())
    weights = np.ones(len(dataset.rows), dtype=np.float64)
    observed_train_rows: list[int] = []
    original = weighted.fit_preprocessor

    def capture(values: NDArray[np.float64], missing: NDArray[np.bool_]) -> PreprocessingStats:
        observed_train_rows.append(values.shape[0])
        return original(values, missing)

    monkeypatch.setattr(weighted, "fit_preprocessor", capture)

    # When: the weighted replicate fits its five inner folds and the full estimator under the PIT sidecar.
    result = weighted.fit_weighted_replicate(
        weighted.WeightedFitRequest(
            dataset=dataset,
            template=template,
            row_weights=weights,
            availability=_leaky_availability(dataset),
        ),
    )

    # Then: inner-01 trains on 96 candidates minus the three unavailable rows; only the full fit keeps all 156.
    assert isinstance(result, weighted.WeightedFitSuccess)
    assert observed_train_rows == [93, 108, 120, 132, 144, 156]

    # And: with every row available the same inner-01 fold would leak all 96 candidates into training.
    all_observed: list[int] = []

    def capture_all(values: NDArray[np.float64], missing: NDArray[np.bool_]) -> PreprocessingStats:
        all_observed.append(values.shape[0])
        return original(values, missing)

    monkeypatch.setattr(weighted, "fit_preprocessor", capture_all)
    weighted.fit_weighted_replicate(
        weighted.WeightedFitRequest(
            dataset=dataset,
            template=template,
            row_weights=weights,
            availability=_all_available(dataset),
        ),
    )
    assert all_observed == [96, 108, 120, 132, 144, 156]
