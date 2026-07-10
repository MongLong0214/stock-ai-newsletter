from __future__ import annotations

from datetime import date, timedelta
import sys
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

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


def _balanced_panel(
    origin_count: int,
    rows_per_origin: int = 16,
) -> tuple[NDArray[np.float64], NDArray[np.bool_], NDArray[np.int64], tuple[str, ...]]:
    continuous: list[list[float]] = []
    missing: list[list[bool]] = []
    outcomes: list[int] = []
    row_origins: list[str] = []
    for origin_index, origin in enumerate(_origins(origin_count)):
        for row_index in range(rows_per_origin):
            outcome = 1 if row_index >= rows_per_origin // 2 else 0
            signal = (1.0 if outcome else -1.0) + origin_index / 100
            continuous.append([
                signal,
                signal / 2,
                float(row_index % 3),
                signal / 3,
                abs(signal),
                float(row_index),
                signal / 4,
                1.0 if outcome else -1.0,
                float(origin_index),
                float(origin_index + 1),
            ])
            missing.append([False] * len(EXPECTED_FEATURE_SCHEMA))
            outcomes.append(outcome)
            row_origins.append(origin)
    return (
        np.asarray(continuous, dtype=np.float64),
        np.asarray(missing, dtype=np.bool_),
        np.asarray(outcomes, dtype=np.int64),
        tuple(row_origins),
    )


def test_inner_split_matches_ts_k_and_canonical_hash_contract() -> None:
    from m1_calibration_selection import create_inner_oof_split

    split_13 = create_inner_oof_split(_origins(13))
    split_26 = create_inner_oof_split(_origins(26))

    assert split_13.fold_count == 5
    assert split_26.fold_count == 8
    assert split_13.folds[0].validation_origin == _origins(13)[8]
    assert split_13.folds[0].train_origins == _origins(13)[:8]
    assert split_13.split_origins_sha256 == "43f810450b71aaa8d8d2f7eceb3b466cf835840b9198c8ddcc83579fe587b15f"


def test_inner_split_hard_fails_when_k_is_below_five() -> None:
    from m1_calibration_selection import TemporalSplitError, create_inner_oof_split

    with pytest.raises(TemporalSplitError, match=r"K=4 < 5"):
        create_inner_oof_split(_origins(12))


def test_preprocessor_uses_raw_mad_train_stats_and_keeps_flags_binary() -> None:
    from m1_calibration_selection import fit_preprocessor, transform_design
    continuous = np.tile(np.arange(1.0, 11.0), (3, 1))
    continuous[0, 0] = 1.0
    continuous[1, 0] = 3.0
    continuous[2, 0] = np.nan
    continuous[:, 1] = 5.0
    missing = np.zeros((3, 10), dtype=np.bool_)
    missing[2, 0] = True

    stats = fit_preprocessor(continuous, missing)
    validation = np.full((1, 10), 100.0, dtype=np.float64)
    validation_missing = np.array([[True, False, True, False, True, False, True, False, True, False]])
    design = transform_design(validation, validation_missing, stats)

    assert stats.medians[0] == 2.0
    assert stats.mads[0] == 1.0
    assert stats.mads[1] == 0.0
    assert design[0, 0] == 0.0
    assert design[0, 1] == 95.0
    np.testing.assert_array_equal(design[0, 10:], validation_missing[0].astype(np.float64))


def test_preprocessor_hard_fails_when_any_train_slot_has_zero_finite_values() -> None:
    from m1_calibration_selection import PreprocessingError, fit_preprocessor
    continuous = np.ones((4, 10), dtype=np.float64)
    continuous[:, 4] = np.nan
    missing = np.zeros((4, 10), dtype=np.bool_)

    with pytest.raises(PreprocessingError, match=r"slot 4.*zero finite"):
        fit_preprocessor(continuous, missing)


def test_regularization_tie_breaks_to_the_smallest_c() -> None:
    from m1_calibration_selection import select_regularization
    continuous, missing, outcomes, row_origins = _balanced_panel(13)
    continuous.fill(0.0)

    result = select_regularization(continuous, missing, outcomes, row_origins)

    assert result.selected_c == 0.01
    assert tuple(score.c for score in result.candidate_scores) == (0.01, 0.1, 1.0, 10.0)
    assert all(score.mean_brier == pytest.approx(0.25) for score in result.candidate_scores)


def test_regularization_returns_only_time_blocked_oof_margins() -> None:
    from m1_calibration_selection import select_regularization
    continuous, missing, outcomes, row_origins = _balanced_panel(13)

    result = select_regularization(continuous, missing, outcomes, row_origins)

    expected_validation_origins = _origins(13)[8:]
    assert result.split.fold_count == 5
    assert set(result.oof.origins) == set(expected_validation_origins)
    assert len(result.oof.origins) == 5 * 16
    assert result.oof.margins.shape == result.oof.outcomes.shape == (5 * 16,)
    assert set(result.oof.origins).isdisjoint(_origins(13)[:8])
