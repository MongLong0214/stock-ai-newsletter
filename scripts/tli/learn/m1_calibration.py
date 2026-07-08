from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Final, Literal, assert_never

import numpy as np
from numpy.typing import NDArray
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

CalibratorType = Literal["platt", "beta", "isotonic"]
CALIBRATOR_TYPES: Final[tuple[CalibratorType, ...]] = ("platt", "beta", "isotonic")
CALIBRATION_EPS: Final[float] = 1e-6
ECE_BINS: Final[int] = 5
ECE_MIN_BIN_SIZE: Final[int] = 30
SEED: Final[int] = 42


class CalibrationDataError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class PlattCalibrator:
    a: float
    b: float
    type: Literal["platt"] = "platt"


@dataclass(frozen=True, slots=True)
class BetaCalibrator:
    a: float
    b: float
    c: float
    type: Literal["beta"] = "beta"


@dataclass(frozen=True, slots=True)
class IsotonicCalibrator:
    thresholds: tuple[float, ...]
    values: tuple[float, ...]
    type: Literal["isotonic"] = "isotonic"


FittedCalibrator = PlattCalibrator | BetaCalibrator | IsotonicCalibrator


@dataclass(frozen=True, slots=True)
class FittedCalibrators:
    platt: PlattCalibrator
    beta: BetaCalibrator
    isotonic: IsotonicCalibrator


def fit_base_estimator(values: NDArray[np.float64], y: NDArray[np.int64]) -> LogisticRegression:
    estimator = LogisticRegression(
        class_weight="balanced",
        random_state=SEED,
        solver="lbfgs",
        max_iter=1000,
    )
    estimator.fit(values, y)
    return estimator


def sigmoid(values: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1 / (1 + np.exp(-np.clip(values, -709, 709)))


def _beta_design(margins: NDArray[np.float64]) -> NDArray[np.float64]:
    base = np.clip(sigmoid(margins), CALIBRATION_EPS, 1 - CALIBRATION_EPS)
    return np.column_stack((np.log(base), -np.log(1 - base))).astype(np.float64)


def _fit_logistic(features: NDArray[np.float64], y: NDArray[np.int64]) -> LogisticRegression:
    calibrator = LogisticRegression(
        random_state=SEED,
        solver="lbfgs",
        max_iter=1000,
    )
    calibrator.fit(features, y)
    return calibrator


def fit_calibrator(
    calibrator_type: CalibratorType,
    margins: NDArray[np.float64],
    y: NDArray[np.int64],
) -> FittedCalibrator:
    match calibrator_type:
        case "platt":
            calibrator = _fit_logistic(margins.reshape(-1, 1), y)
            return PlattCalibrator(a=float(-calibrator.coef_[0, 0]), b=float(-calibrator.intercept_[0]))
        case "beta":
            calibrator = _fit_logistic(_beta_design(margins), y)
            return BetaCalibrator(
                a=float(calibrator.coef_[0, 0]),
                b=float(calibrator.coef_[0, 1]),
                c=float(calibrator.intercept_[0]),
            )
        case "isotonic":
            base = sigmoid(margins)
            calibrator = IsotonicRegression(out_of_bounds="clip")
            calibrator.fit(base, y)
            return IsotonicCalibrator(
                thresholds=tuple(float(value) for value in calibrator.X_thresholds_),
                values=tuple(float(value) for value in calibrator.y_thresholds_),
            )
        case unreachable:
            assert_never(unreachable)


def fit_all_calibrators(margins: NDArray[np.float64], y: NDArray[np.int64]) -> FittedCalibrators:
    return FittedCalibrators(
        platt=fit_calibrator("platt", margins, y),
        beta=fit_calibrator("beta", margins, y),
        isotonic=fit_calibrator("isotonic", margins, y),
    )


def calibrator_for_type(calibrators: FittedCalibrators, calibrator_type: CalibratorType) -> FittedCalibrator:
    match calibrator_type:
        case "platt":
            return calibrators.platt
        case "beta":
            return calibrators.beta
        case "isotonic":
            return calibrators.isotonic
        case unreachable:
            assert_never(unreachable)


def predict_calibrator(calibrator: FittedCalibrator, margins: NDArray[np.float64]) -> NDArray[np.float64]:
    match calibrator:
        case PlattCalibrator(a=a, b=b):
            return sigmoid(-(a * margins + b))
        case BetaCalibrator(a=a, b=b, c=c):
            design = _beta_design(margins)
            return sigmoid(a * design[:, 0] + b * design[:, 1] + c)
        case IsotonicCalibrator(thresholds=thresholds, values=values):
            base = sigmoid(margins)
            return np.interp(
                base,
                np.array(thresholds, dtype=np.float64),
                np.array(values, dtype=np.float64),
                left=values[0],
                right=values[-1],
            ).astype(np.float64)
        case unreachable:
            assert_never(unreachable)


def compute_quantile_ece(probabilities: NDArray[np.float64], y: NDArray[np.int64]) -> float | None:
    finite = np.isfinite(probabilities)
    scored_probabilities = probabilities[finite]
    actuals = y[finite].astype(np.float64)
    if scored_probabilities.size < ECE_MIN_BIN_SIZE:
        return None

    order = np.argsort(scored_probabilities, kind="mergesort")
    sorted_probabilities = scored_probabilities[order]
    sorted_actuals = actuals[order]
    bin_count = max(1, min(ECE_BINS, math.floor(sorted_probabilities.size / ECE_MIN_BIN_SIZE)))
    ece = 0.0
    start = 0
    for index in range(bin_count):
        end = (
            sorted_probabilities.size
            if index == bin_count - 1
            else math.floor((index + 1) * sorted_probabilities.size / bin_count)
        )
        while (
            end < sorted_probabilities.size
            and sorted_probabilities[end - 1] == sorted_probabilities[end]
        ):
            end += 1
        if end <= start:
            continue
        bin_probabilities = sorted_probabilities[start:end]
        bin_actuals = sorted_actuals[start:end]
        ece += (bin_probabilities.size / sorted_probabilities.size) * abs(
            float(np.mean(bin_probabilities)) - float(np.mean(bin_actuals)),
        )
        start = end
    return ece if math.isfinite(ece) else 1.0


from m1_calibration_selection import (  # noqa: E402
    CalibrationCandidateMetric,
    CalibrationSelection,
    select_calibrator_type,
)
