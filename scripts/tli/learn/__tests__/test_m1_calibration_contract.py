from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING, Never, get_type_hints
import warnings

import numpy as np
from numpy.typing import NDArray
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

if TYPE_CHECKING:
    from m1_calibration import CrossFittedMargins
    from sklearn.linear_model import LogisticRegression


def _base_training_data() -> tuple[NDArray[np.float64], NDArray[np.int64]]:
    signal = np.linspace(-2.0, 2.0, 80, dtype=np.float64)
    values = np.column_stack((signal, signal**2)).astype(np.float64)
    outcomes = (signal > 0).astype(np.int64)
    return values, outcomes


def _balanced_oof() -> CrossFittedMargins:
    from m1_calibration import CrossFittedMargins

    origins: list[str] = []
    margins: list[float] = []
    outcomes: list[int] = []
    for origin_index in range(5):
        origin = f"2026-0{origin_index + 1}-05"
        for row_index in range(12):
            outcome = row_index % 2
            origins.append(origin)
            outcomes.append(outcome)
            margins.append((-1.0 if outcome == 0 else 1.0) + origin_index / 10)
    return CrossFittedMargins(
        margins=np.asarray(margins, dtype=np.float64),
        outcomes=np.asarray(outcomes, dtype=np.int64),
        origins=tuple(origins),
    )


def test_base_estimator_uses_the_exact_confirmatory_configuration() -> None:
    from m1_calibration import fit_base_estimator

    values, outcomes = _base_training_data()

    estimator = fit_base_estimator(values, outcomes, c=0.1)

    params = estimator.get_params()
    assert params["penalty"] == "l2"
    assert params["solver"] == "lbfgs"
    assert params["fit_intercept"] is True
    assert params["class_weight"] is None
    assert params["max_iter"] == 5000
    assert params["tol"] == 1e-8
    assert params["C"] == 0.1


def test_platt_uses_exact_unpenalized_configuration_and_origin_weights(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import m1_calibration as calibration

    oof = _balanced_oof()
    observed_weights: list[NDArray[np.float64]] = []
    original_fit = calibration.LogisticRegression.fit

    def capture_fit(
        estimator: LogisticRegression,
        values: NDArray[np.float64],
        outcomes: NDArray[np.int64],
        sample_weight: NDArray[np.float64] | None = None,
    ) -> LogisticRegression:
        assert sample_weight is not None
        observed_weights.append(np.asarray(sample_weight, dtype=np.float64))
        return original_fit(estimator, values, outcomes, sample_weight=sample_weight)

    monkeypatch.setattr(calibration.LogisticRegression, "fit", capture_fit)
    estimator = calibration.fit_platt_estimator(oof)

    params = estimator.get_params()
    assert params["penalty"] is None
    assert params["solver"] == "lbfgs"
    assert params["fit_intercept"] is True
    assert params["class_weight"] is None
    assert params["max_iter"] == 5000
    assert params["tol"] == 1e-8
    origins = np.asarray(oof.origins, dtype=np.str_)
    for origin in np.unique(origins):
        assert float(np.sum(observed_weights[0][origins == origin])) == pytest.approx(1.0)


def test_origin_balanced_weights_give_each_origin_total_weight_one() -> None:
    from m1_calibration import CrossFittedMargins, origin_balanced_weights

    oof = CrossFittedMargins(
        margins=np.zeros(5, dtype=np.float64),
        outcomes=np.asarray([0, 1, 0, 1, 0], dtype=np.int64),
        origins=("a", "a", "b", "b", "b"),
    )

    weights = origin_balanced_weights(oof)

    np.testing.assert_allclose(weights, np.asarray([0.5, 0.5, 1 / 3, 1 / 3, 1 / 3]))


def test_platt_api_accepts_only_cross_fitted_oof_margins() -> None:
    from m1_calibration import CrossFittedMargins, fit_platt_calibrator

    assert get_type_hints(fit_platt_calibrator)["oof"] is CrossFittedMargins


def test_platt_hard_fails_below_the_oof_class_floor() -> None:
    from m1_calibration import CalibrationDataError, CrossFittedMargins, fit_platt_calibrator

    outcomes = np.asarray([1] * 29 + [0] * 31, dtype=np.int64)
    oof = CrossFittedMargins(
        margins=np.linspace(-2.0, 2.0, outcomes.size, dtype=np.float64),
        outcomes=outcomes,
        origins=tuple("2026-01-05" for _ in outcomes),
    )

    with pytest.raises(CalibrationDataError, match=r"positive=29.*minimum=30"):
        fit_platt_calibrator(oof)


def test_calibrated_probabilities_are_clamped_to_the_contract_bounds() -> None:
    from m1_calibration import PlattCalibrator, predict_calibrator

    calibrator = PlattCalibrator(a=-1_000.0, b=0.0)

    probabilities = predict_calibrator(
        calibrator,
        np.asarray([-1_000.0, 1_000.0], dtype=np.float64),
    )

    np.testing.assert_array_equal(probabilities, np.asarray([1e-6, 1 - 1e-6]))


def test_calibrated_probabilities_reject_nonfinite_margins() -> None:
    from m1_calibration import CalibrationDataError, PlattCalibrator, predict_calibrator

    calibrator = PlattCalibrator(a=-1.0, b=0.0)

    with pytest.raises(CalibrationDataError, match="finite"):
        predict_calibrator(
            calibrator,
            np.asarray([np.nan, np.inf, -np.inf], dtype=np.float64),
        )


def test_convergence_warning_is_a_hard_model_fit_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    import m1_calibration as calibration
    from sklearn.exceptions import ConvergenceWarning

    values, outcomes = _base_training_data()

    def warn_fit(*_args: Never, **_kwargs: Never) -> Never:
        warnings.warn("did not converge", ConvergenceWarning, stacklevel=2)
        raise AssertionError("warning must have been promoted to an exception")

    monkeypatch.setattr(calibration.LogisticRegression, "fit", warn_fit)

    with pytest.raises(calibration.ModelConvergenceError, match="converge"):
        calibration.fit_base_estimator(values, outcomes, c=1.0)


def test_nonfinite_coefficients_are_a_hard_model_fit_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import m1_calibration as calibration

    values, outcomes = _base_training_data()

    def nonfinite_fit(
        estimator: LogisticRegression,
        *_args: NDArray[np.float64],
        **_kwargs: NDArray[np.float64],
    ) -> LogisticRegression:
        estimator.coef_ = np.asarray([[np.nan, 0.0]], dtype=np.float64)
        estimator.intercept_ = np.asarray([0.0], dtype=np.float64)
        return estimator

    monkeypatch.setattr(calibration.LogisticRegression, "fit", nonfinite_fit)

    with pytest.raises(calibration.NonFiniteModelError, match="nonfinite"):
        calibration.fit_base_estimator(values, outcomes, c=1.0)
