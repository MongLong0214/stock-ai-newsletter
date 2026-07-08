from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Final, Literal, Sequence, assert_never

import numpy as np
from numpy.typing import NDArray

from m1_calibration import (
    CALIBRATOR_TYPES,
    CalibrationDataError,
    CalibratorType,
    compute_quantile_ece,
    fit_base_estimator,
    fit_calibrator,
    predict_calibrator,
)

SelectionMethod = Literal["forward_chaining"]
CALIBRATION_TEMPORAL_BLOCKS: Final[int] = 5
CALIBRATION_SELECTION_MARGIN: Final[float] = 0.10


@dataclass(frozen=True, slots=True)
class CalibrationCandidateMetric:
    cv_ece: float | None
    cv_log_loss: float | None
    out_of_time_ece: float | None
    recent_block_ece: float | None
    relative_ece_improvement_vs_platt: float | None
    beats_platt_margin: bool
    passes_recent_block_guard: bool


@dataclass(frozen=True, slots=True)
class CalibrationSelection:
    chosen_type: CalibratorType
    selection_method: SelectionMethod
    relative_improvement_margin: float
    fallback_reason: str | None
    platt: CalibrationCandidateMetric
    beta: CalibrationCandidateMetric
    isotonic: CalibrationCandidateMetric


@dataclass(frozen=True, slots=True)
class _TemporalPredictions:
    probabilities: NDArray[np.float64]
    y: NDArray[np.int64]
    recent_probabilities: NDArray[np.float64]
    recent_y: NDArray[np.int64]


@dataclass(frozen=True, slots=True)
class _TemporalPredictionFailure:
    reason: str


_TemporalPredictionResult = _TemporalPredictions | _TemporalPredictionFailure


def _log_loss(probabilities: NDArray[np.float64], y: NDArray[np.int64]) -> float:
    clipped = np.clip(probabilities, 1e-9, 1 - 1e-9)
    return float(-np.mean(y * np.log(clipped) + (1 - y) * np.log(1 - clipped)))


def _empty_metric() -> CalibrationCandidateMetric:
    return CalibrationCandidateMetric(
        cv_ece=None,
        cv_log_loss=None,
        out_of_time_ece=None,
        recent_block_ece=None,
        relative_ece_improvement_vs_platt=None,
        beats_platt_margin=False,
        passes_recent_block_guard=False,
    )


def _metric_for_predictions(predictions: _TemporalPredictions) -> CalibrationCandidateMetric:
    out_of_time_ece = compute_quantile_ece(predictions.probabilities, predictions.y)
    return CalibrationCandidateMetric(
        cv_ece=out_of_time_ece,
        cv_log_loss=_log_loss(predictions.probabilities, predictions.y),
        out_of_time_ece=out_of_time_ece,
        recent_block_ece=compute_quantile_ece(predictions.recent_probabilities, predictions.recent_y),
        relative_ece_improvement_vs_platt=None,
        beats_platt_margin=False,
        passes_recent_block_guard=False,
    )


def _temporal_blocks(base_dates: Sequence[str], row_count: int) -> tuple[tuple[NDArray[np.int64], ...], str | None]:
    if len(base_dates) != row_count:
        raise CalibrationDataError("M1 calibration selection requires one base_date per row")
    if row_count < CALIBRATION_TEMPORAL_BLOCKS:
        return (), "requires at least 5 rows"
    dates = np.asarray(base_dates, dtype=np.str_)
    unique_dates = np.unique(dates)
    if unique_dates.size < CALIBRATION_TEMPORAL_BLOCKS:
        return (), "requires at least 5 distinct base_date values"
    return tuple(
        np.flatnonzero(np.isin(dates, date_block)).astype(np.int64)
        for date_block in np.array_split(unique_dates, CALIBRATION_TEMPORAL_BLOCKS)
    ), None


def _forward_chaining_predictions(
    calibrator_type: CalibratorType,
    values: NDArray[np.float64],
    y: NDArray[np.int64],
    blocks: tuple[NDArray[np.int64], ...],
) -> _TemporalPredictionResult:
    probabilities: list[NDArray[np.float64]] = []
    actuals: list[NDArray[np.int64]] = []
    for validation_block_index in range(1, len(blocks)):
        train_index = np.concatenate(blocks[:validation_block_index])
        validation_index = blocks[validation_block_index]
        if np.unique(y[train_index]).size != 2:
            return _TemporalPredictionFailure(reason="each forward-chaining fit fold requires both classes")
        estimator = fit_base_estimator(values[train_index], y[train_index])
        train_margins = np.asarray(estimator.decision_function(values[train_index]), dtype=np.float64)
        validation_margins = np.asarray(estimator.decision_function(values[validation_index]), dtype=np.float64)
        calibrator = fit_calibrator(calibrator_type, train_margins, y[train_index])
        probabilities.append(predict_calibrator(calibrator, validation_margins))
        actuals.append(y[validation_index])
    return _TemporalPredictions(
        probabilities=np.concatenate(probabilities),
        y=np.concatenate(actuals),
        recent_probabilities=probabilities[-1],
        recent_y=actuals[-1],
    )


def _fallback_selection(reason: str) -> CalibrationSelection:
    empty = _empty_metric()
    return CalibrationSelection(
        chosen_type="platt",
        selection_method="forward_chaining",
        relative_improvement_margin=CALIBRATION_SELECTION_MARGIN,
        fallback_reason=reason,
        platt=empty,
        beta=empty,
        isotonic=empty,
    )


def _relative_improvement(platt_ece: float | None, candidate_ece: float | None) -> float | None:
    if platt_ece is None or candidate_ece is None or platt_ece <= 0:
        return None
    return (platt_ece - candidate_ece) / platt_ece


def _candidate_decision(
    metric: CalibrationCandidateMetric,
    platt: CalibrationCandidateMetric,
) -> CalibrationCandidateMetric:
    relative_improvement = _relative_improvement(platt.out_of_time_ece, metric.out_of_time_ece)
    recent_guard = (
        metric.recent_block_ece is not None
        and platt.recent_block_ece is not None
        and metric.recent_block_ece <= platt.recent_block_ece
    )
    return replace(
        metric,
        relative_ece_improvement_vs_platt=relative_improvement,
        beats_platt_margin=relative_improvement is not None and relative_improvement >= CALIBRATION_SELECTION_MARGIN,
        passes_recent_block_guard=recent_guard,
    )


def _temporal_metric(
    calibrator_type: CalibratorType,
    values: NDArray[np.float64],
    y: NDArray[np.int64],
    blocks: tuple[NDArray[np.int64], ...],
) -> CalibrationCandidateMetric | _TemporalPredictionFailure:
    predictions = _forward_chaining_predictions(calibrator_type, values, y, blocks)
    match predictions:
        case _TemporalPredictionFailure():
            return predictions
        case _TemporalPredictions():
            return _metric_for_predictions(predictions)
        case unreachable:
            assert_never(unreachable)


def select_calibrator_type(
    values: NDArray[np.float64],
    y: NDArray[np.int64],
    base_dates: Sequence[str],
) -> CalibrationSelection:
    blocks, fallback_reason = _temporal_blocks(base_dates, y.size)
    if fallback_reason is not None:
        return _fallback_selection(fallback_reason)

    metrics: list[CalibrationCandidateMetric] = []
    for metric in (_temporal_metric(calibrator_type, values, y, blocks) for calibrator_type in CALIBRATOR_TYPES):
        match metric:
            case _TemporalPredictionFailure(reason=reason):
                return _fallback_selection(reason)
            case CalibrationCandidateMetric():
                metrics.append(metric)
            case unreachable:
                assert_never(unreachable)

    platt = replace(metrics[0], relative_ece_improvement_vs_platt=0.0, passes_recent_block_guard=True)
    beta = _candidate_decision(metrics[1], platt)
    isotonic = _candidate_decision(metrics[2], platt)
    chosen_type: CalibratorType = "platt"
    if beta.beats_platt_margin and beta.passes_recent_block_guard:
        chosen_type = "beta"
    elif isotonic.beats_platt_margin and isotonic.passes_recent_block_guard:
        chosen_type = "isotonic"
    return CalibrationSelection(
        chosen_type=chosen_type,
        selection_method="forward_chaining",
        relative_improvement_margin=CALIBRATION_SELECTION_MARGIN,
        fallback_reason=None,
        platt=platt,
        beta=beta,
        isotonic=isotonic,
    )
