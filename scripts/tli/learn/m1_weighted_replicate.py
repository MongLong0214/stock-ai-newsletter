from __future__ import annotations

from dataclasses import dataclass
from typing import Final, assert_never

from numpy.typing import NDArray
import numpy as np

from m1_artifact import (
    CalibrationContractArtifact,
    CoefficientsArtifact,
    EstimatorContractArtifact,
    InnerOofFoldManifest,
    InnerOofManifest,
    ModelArtifact,
    PlattCalibratorArtifact,
    ScalerArtifact,
    TrainingReport,
)
from m1_calibration import (
    CalibrationDataError,
    CrossFittedMargins,
    MIN_OOF_CLASS_COUNT,
    MIN_OOF_ORIGIN_COUNT,
    ModelFitError,
    PlattCalibrator,
    fit_base_estimator,
    fit_platt_calibrator,
    predict_calibrator,
    validate_cross_fitted_margins,
)
from m1_calibration_selection import (
    InnerOofSplit,
    PreprocessingError,
    TemporalSplitError,
    create_inner_oof_split,
    fit_preprocessor,
    transform_design,
)
from m1_dataset import TrainingDataset

ARTIFACT_VERSION: Final[str] = "tli-model-artifact-v2"


class WeightedReplicateError(RuntimeError):
    __slots__ = ("code", "detail")

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail

    def __str__(self) -> str:
        return f"{self.code}: {self.detail}"


@dataclass(frozen=True, slots=True, eq=False)
class WeightedFitRequest:
    dataset: TrainingDataset
    template: ModelArtifact
    row_weights: NDArray[np.float64]


@dataclass(frozen=True, slots=True)
class WeightedFitSuccess:
    artifact: ModelArtifact


@dataclass(frozen=True, slots=True)
class WeightedFitRejected:
    reason: str


type WeightedFitResult = WeightedFitSuccess | WeightedFitRejected


@dataclass(frozen=True, slots=True, eq=False)
class _WeightedArrays:
    values: NDArray[np.float64]
    missing: NDArray[np.bool_]
    outcomes: NDArray[np.int64]
    origins: NDArray[np.str_]
    weights: NDArray[np.int64]


@dataclass(frozen=True, slots=True, eq=False)
class _FrozenSelection:
    selected_c: float
    split: InnerOofSplit
    oof: CrossFittedMargins


def _arrays(request: WeightedFitRequest) -> _WeightedArrays:
    weights = np.asarray(request.row_weights, dtype=np.float64)
    row_count = len(request.dataset.rows)
    if weights.shape != (row_count,) or not np.all(np.isfinite(weights)):
        raise WeightedReplicateError("invalid_weights", "one finite weight is required per row")
    if np.any(weights < 0) or np.any(weights != np.floor(weights)):
        raise WeightedReplicateError("invalid_weights", "weights must be nonnegative integers")
    return _WeightedArrays(
        values=np.asarray([row.features for row in request.dataset.rows], dtype=np.float64),
        missing=np.asarray([row.missing_flags for row in request.dataset.rows], dtype=np.bool_),
        outcomes=np.asarray([int(row.y) for row in request.dataset.rows], dtype=np.int64),
        origins=np.asarray([row.base_date for row in request.dataset.rows], dtype=np.str_),
        weights=weights.astype(np.int64),
    )


def _active_indices(mask: NDArray[np.bool_], weights: NDArray[np.int64]) -> NDArray[np.int64]:
    return np.flatnonzero(mask & (weights > 0)).astype(np.int64)


def _expanded_indices(mask: NDArray[np.bool_], weights: NDArray[np.int64]) -> NDArray[np.int64]:
    indices = _active_indices(mask, weights)
    return np.repeat(indices, weights[indices])


def _cross_fitted_oof(
    c: float,
    split: InnerOofSplit,
    arrays: _WeightedArrays,
) -> CrossFittedMargins:
    margins: list[NDArray[np.float64]] = []
    outcomes: list[NDArray[np.int64]] = []
    origins: list[str] = []
    for fold in split.folds:
        train_mask = np.isin(arrays.origins, np.asarray(fold.train_origins, dtype=np.str_))
        validation_mask = arrays.origins == fold.validation_origin
        train_indices = _expanded_indices(train_mask, arrays.weights)
        validation_indices = _expanded_indices(validation_mask, arrays.weights)
        if validation_indices.size == 0:
            continue
        stats = fit_preprocessor(arrays.values[train_indices], arrays.missing[train_indices])
        train_design = transform_design(arrays.values[train_indices], arrays.missing[train_indices], stats)
        validation_design = transform_design(
            arrays.values[validation_indices],
            arrays.missing[validation_indices],
            stats,
        )
        estimator = fit_base_estimator(train_design, arrays.outcomes[train_indices], c=c)
        fold_margins = np.asarray(estimator.decision_function(validation_design), dtype=np.float64)
        fold_outcomes = arrays.outcomes[validation_indices]
        margins.append(fold_margins)
        outcomes.append(fold_outcomes)
        origins.extend(fold.validation_origin for _ in range(fold_outcomes.size))
    return validate_cross_fitted_margins(
        CrossFittedMargins(
            margins=np.concatenate(margins),
            outcomes=np.concatenate(outcomes),
            origins=tuple(origins),
        ),
    )


def _selection(arrays: _WeightedArrays, selected_c: float) -> _FrozenSelection | WeightedFitRejected:
    ordered_origins = tuple(sorted(set(arrays.origins.tolist())))
    split = create_inner_oof_split(ordered_origins)
    supported_validation_indices = tuple(
        indices
        for fold in split.folds
        if (
            indices := _active_indices(
                arrays.origins == fold.validation_origin,
                arrays.weights,
            )
        ).size
        > 0
    )
    if len(supported_validation_indices) < MIN_OOF_ORIGIN_COUNT:
        return WeightedFitRejected(reason="oof_origin_support_below_floor")
    for fold in split.folds:
        train_mask = np.isin(arrays.origins, np.asarray(fold.train_origins, dtype=np.str_))
        validation_mask = arrays.origins == fold.validation_origin
        train_indices = _expanded_indices(train_mask, arrays.weights)
        validation_indices = _expanded_indices(validation_mask, arrays.weights)
        if validation_indices.size == 0:
            continue
        if train_indices.size == 0 or np.unique(arrays.outcomes[train_indices]).size != 2:
            return WeightedFitRejected(reason="insufficient_weighted_training_support")
    distinct_validation_indices = np.unique(np.concatenate(supported_validation_indices))
    distinct_outcomes = arrays.outcomes[distinct_validation_indices]
    if any(int(np.sum(distinct_outcomes == label)) < MIN_OOF_CLASS_COUNT for label in (0, 1)):
        return WeightedFitRejected(reason="oof_distinct_class_below_floor")
    return _FrozenSelection(
        selected_c=selected_c,
        split=split,
        oof=_cross_fitted_oof(selected_c, split, arrays),
    )


def _artifact(
    request: WeightedFitRequest,
    arrays: _WeightedArrays,
    selection: _FrozenSelection,
) -> ModelArtifact:
    calibrator = fit_platt_calibrator(selection.oof)
    indices = np.repeat(np.arange(arrays.weights.size, dtype=np.int64), arrays.weights)
    stats = fit_preprocessor(arrays.values[indices], arrays.missing[indices])
    design = transform_design(arrays.values[indices], arrays.missing[indices], stats)
    outcomes = arrays.outcomes[indices]
    estimator = fit_base_estimator(design, outcomes, c=selection.selected_c)
    events = int(np.sum(outcomes))
    event_rate = float(np.mean(outcomes))
    ordered_origins = tuple(sorted(set(arrays.origins.tolist())))
    return ModelArtifact(
        artifact_version=ARTIFACT_VERSION,
        model_type="m1_logistic",
        feature_schema=request.dataset.feature_schema,
        scaler=ScalerArtifact(median=stats.medians, mad=stats.mads),
        coefficients=CoefficientsArtifact(
            intercept=float(estimator.intercept_[0]),
            weights=tuple(float(value) for value in estimator.coef_[0]),
        ),
        calibrator=PlattCalibratorArtifact(type="platt", a=calibrator.a, b=calibrator.b),
        estimator_contract=EstimatorContractArtifact(selected_c=selection.selected_c),
        calibration_contract=CalibrationContractArtifact(),
        inner_oof=InnerOofManifest(
            origin_count=selection.split.origin_count,
            fold_count=selection.split.fold_count,
            ordered_origins=ordered_origins,
            folds=tuple(
                InnerOofFoldManifest(
                    fold_id=fold.fold_id,
                    validation_origin=fold.validation_origin,
                    train_origins=fold.train_origins,
                )
                for fold in selection.split.folds
            ),
            split_origins_sha256=selection.split.split_origins_sha256,
        ),
        trained_at=request.template.trained_at,
        train_range=request.dataset.train_range,
        labeler_version=request.dataset.labeler_version,
        seed=request.template.seed,
        train_event_rate=event_rate,
        sample_report=TrainingReport(
            observed_n=int(outcomes.size),
            events=events,
            event_rate=event_rate,
            parameters=int(design.shape[1]),
            selected_c=selection.selected_c,
            candidate_scores=request.template.sample_report.candidate_scores,
            oof_rows=int(selection.oof.outcomes.size),
            oof_positive=int(np.sum(selection.oof.outcomes == 1)),
            oof_negative=int(np.sum(selection.oof.outcomes == 0)),
        ),
        runtime=request.template.runtime,
    )


def fit_weighted_replicate(request: WeightedFitRequest) -> WeightedFitResult:
    arrays = _arrays(request)
    if int(np.sum(arrays.weights)) == 0:
        return WeightedFitRejected(reason="weighted_sample_empty")
    try:
        selection = _selection(arrays, request.template.estimator_contract.selected_c)
        match selection:
            case WeightedFitRejected():
                return selection
            case _FrozenSelection():
                return WeightedFitSuccess(artifact=_artifact(request, arrays, selection))
            case _ as unreachable:
                assert_never(unreachable)
    except (CalibrationDataError, ModelFitError, PreprocessingError, TemporalSplitError):
        return WeightedFitRejected(reason="weighted_fit_contract_failure")


@dataclass(frozen=True, slots=True)
class ArtifactProbe:
    values: tuple[float, ...]
    missing: tuple[bool, ...]


def predict_artifact(artifact: ModelArtifact, probe: ArtifactProbe) -> float:
    medians = np.asarray(artifact.scaler.median, dtype=np.float64)
    mads = np.asarray(artifact.scaler.mad, dtype=np.float64)
    values = np.asarray(probe.values, dtype=np.float64)
    missing = np.asarray(probe.missing, dtype=np.bool_)
    if values.shape != medians.shape or missing.shape != medians.shape:
        raise WeightedReplicateError("invalid_probe", "probe must match the artifact feature schema")
    imputed = np.where(missing | ~np.isfinite(values), medians, values)
    design = np.concatenate(((imputed - medians) / np.where(mads > 0, mads, 1.0), missing.astype(np.float64)))
    margin = artifact.coefficients.intercept + float(
        np.dot(design, np.asarray(artifact.coefficients.weights, dtype=np.float64)),
    )
    calibrator = PlattCalibrator(a=artifact.calibrator.a, b=artifact.calibrator.b)
    return float(predict_calibrator(calibrator, np.asarray([margin], dtype=np.float64))[0])
