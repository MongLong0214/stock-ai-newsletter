from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal
import warnings

import numpy as np
from numpy.typing import NDArray
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression

CALIBRATION_EPS: Final[float] = 1e-6
MIN_OOF_CLASS_COUNT: Final[int] = 30
MIN_OOF_ORIGIN_COUNT: Final[int] = 5
MAX_ITER: Final[int] = 5000
FIT_TOLERANCE: Final[float] = 1e-8


class CalibrationDataError(RuntimeError):
    pass


class ModelFitError(RuntimeError):
    pass


class ModelConvergenceError(ModelFitError):
    pass


class NonFiniteModelError(ModelFitError):
    pass


@dataclass(frozen=True, slots=True)
class CrossFittedMargins:
    margins: NDArray[np.float64]
    outcomes: NDArray[np.int64]
    origins: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PlattCalibrator:
    a: float
    b: float
    type: Literal["platt"] = "platt"


def sigmoid(values: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1 / (1 + np.exp(-np.clip(values, -709, 709)))


def _validate_binary_outcomes(outcomes: NDArray[np.int64], context: str) -> None:
    if outcomes.ndim != 1 or outcomes.size == 0:
        raise ModelFitError(f"{context}: outcomes must be a nonempty one-dimensional array")
    if not np.all(np.isin(outcomes, np.asarray([0, 1], dtype=np.int64))):
        raise ModelFitError(f"{context}: outcomes must contain only 0 and 1")


def _fit_and_check(
    estimator: LogisticRegression,
    values: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    *,
    context: str,
    sample_weight: NDArray[np.float64] | None = None,
) -> LogisticRegression:
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="'penalty' was deprecated.*",
                category=FutureWarning,
                module="sklearn.linear_model._logistic",
            )
            warnings.simplefilter("error", ConvergenceWarning)
            if sample_weight is None:
                estimator.fit(values, outcomes)
            else:
                estimator.fit(values, outcomes, sample_weight=sample_weight)
    except ConvergenceWarning as error:
        raise ModelConvergenceError(f"{context}: lbfgs failed to converge") from error
    except (FloatingPointError, ValueError) as error:
        raise ModelFitError(f"{context}: estimator fit failed: {error}") from error

    coefficients = np.asarray(estimator.coef_, dtype=np.float64)
    intercept = np.asarray(estimator.intercept_, dtype=np.float64)
    if not np.all(np.isfinite(coefficients)) or not np.all(np.isfinite(intercept)):
        raise NonFiniteModelError(f"{context}: fitted coefficients are nonfinite")
    if int(np.max(np.asarray(estimator.n_iter_))) >= MAX_ITER:
        raise ModelConvergenceError(f"{context}: lbfgs exhausted max_iter without convergence")
    return estimator


def fit_base_estimator(
    values: NDArray[np.float64],
    outcomes: NDArray[np.int64],
    *,
    c: float,
) -> LogisticRegression:
    if values.ndim != 2 or values.shape[0] == 0:
        raise ModelFitError("base estimator: values must be a nonempty matrix")
    _validate_binary_outcomes(outcomes, "base estimator")
    if values.shape[0] != outcomes.size:
        raise ModelFitError("base estimator: values/outcomes row count mismatch")
    if not np.all(np.isfinite(values)):
        raise ModelFitError("base estimator: design matrix contains nonfinite values")
    if np.unique(outcomes).size != 2:
        raise ModelFitError("base estimator: both outcome classes are required")
    if not np.isfinite(c) or c <= 0:
        raise ModelFitError("base estimator: C must be finite and positive")

    estimator = LogisticRegression(
        penalty="l2",
        solver="lbfgs",
        fit_intercept=True,
        class_weight=None,
        max_iter=MAX_ITER,
        tol=FIT_TOLERANCE,
        C=float(c),
    )
    return _fit_and_check(estimator, values, outcomes, context="base estimator")


def validate_cross_fitted_margins(oof: CrossFittedMargins) -> CrossFittedMargins:
    if not isinstance(oof, CrossFittedMargins):
        raise CalibrationDataError("Platt calibration requires CrossFittedMargins OOF input")
    if oof.margins.ndim != 1 or oof.outcomes.ndim != 1:
        raise CalibrationDataError("OOF margins/outcomes must be one-dimensional")
    if oof.margins.size == 0 or oof.margins.size != oof.outcomes.size:
        raise CalibrationDataError("OOF margins/outcomes must be nonempty and equal length")
    if len(oof.origins) != oof.outcomes.size:
        raise CalibrationDataError("OOF origins must contain one origin per row")
    if not np.all(np.isfinite(oof.margins)):
        raise CalibrationDataError("OOF margins must all be finite")
    if not np.all(np.isin(oof.outcomes, np.asarray([0, 1], dtype=np.int64))):
        raise CalibrationDataError("OOF outcomes must contain only 0 and 1")
    if any(not isinstance(origin, str) or not origin for origin in oof.origins):
        raise CalibrationDataError("OOF origins must be nonempty strings")

    positive_count = int(np.sum(oof.outcomes == 1))
    negative_count = int(np.sum(oof.outcomes == 0))
    if positive_count < MIN_OOF_CLASS_COUNT or negative_count < MIN_OOF_CLASS_COUNT:
        raise CalibrationDataError(
            "OOF class floor failed: "
            f"positive={positive_count}, negative={negative_count}, minimum={MIN_OOF_CLASS_COUNT}",
        )
    if len(set(oof.origins)) < MIN_OOF_ORIGIN_COUNT:
        raise CalibrationDataError(
            f"OOF origin floor failed: {len(set(oof.origins))} < {MIN_OOF_ORIGIN_COUNT}",
        )
    return oof


def origin_balanced_weights(oof: CrossFittedMargins) -> NDArray[np.float64]:
    origins = np.asarray(oof.origins, dtype=np.str_)
    weights = np.empty(origins.size, dtype=np.float64)
    for origin in np.unique(origins):
        mask = origins == origin
        weights[mask] = 1 / int(np.sum(mask))
    return weights


def fit_platt_estimator(oof: CrossFittedMargins) -> LogisticRegression:
    validated = validate_cross_fitted_margins(oof)
    estimator = LogisticRegression(
        penalty=None,
        solver="lbfgs",
        fit_intercept=True,
        class_weight=None,
        max_iter=MAX_ITER,
        tol=FIT_TOLERANCE,
    )
    return _fit_and_check(
        estimator,
        validated.margins.reshape(-1, 1),
        validated.outcomes,
        context="Platt calibrator",
        sample_weight=origin_balanced_weights(validated),
    )


def fit_platt_calibrator(oof: CrossFittedMargins) -> PlattCalibrator:
    estimator = fit_platt_estimator(oof)
    return PlattCalibrator(
        a=float(-estimator.coef_[0, 0]),
        b=float(-estimator.intercept_[0]),
    )


def predict_calibrator(
    calibrator: PlattCalibrator,
    margins: NDArray[np.float64],
) -> NDArray[np.float64]:
    if margins.ndim != 1 or not np.all(np.isfinite(margins)):
        raise CalibrationDataError("calibration prediction margins must be a finite one-dimensional array")
    if not np.isfinite(calibrator.a) or not np.isfinite(calibrator.b):
        raise CalibrationDataError("calibration coefficients must be finite")
    probabilities = sigmoid(-(calibrator.a * margins + calibrator.b))
    return np.clip(probabilities, CALIBRATION_EPS, 1 - CALIBRATION_EPS)
