from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Final, Sequence

import numpy as np
from numpy.typing import NDArray

from m1_calibration import (
    CrossFittedMargins,
    fit_base_estimator,
    sigmoid,
    validate_cross_fitted_margins,
)
from interval_ensemble import OOF_FOLD_MAX, OOF_FOLD_MIN, OOF_TRAIN_ORIGIN_RESERVE, oof_fold_count
from stats_bootstrap import sha256_hex

CONTINUOUS_SLOT_COUNT: Final[int] = 10
REGULARIZATION_CANDIDATES: Final[tuple[float, ...]] = (0.01, 0.1, 1.0, 10.0)
_ISO_DATE_PATTERN: Final[re.Pattern[str]] = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class TemporalSplitError(RuntimeError):
    pass


class PreprocessingError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class PreprocessingStats:
    medians: tuple[float, ...]
    mads: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class InnerOofFold:
    fold_id: str
    validation_origin: str
    train_origins: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class InnerOofSplit:
    origin_count: int
    fold_count: int
    folds: tuple[InnerOofFold, ...]
    split_origins_sha256: str


@dataclass(frozen=True, slots=True)
class CandidateScore:
    c: float
    mean_brier: float
    fold_briers: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class RegularizationSelection:
    selected_c: float
    candidate_scores: tuple[CandidateScore, ...]
    split: InnerOofSplit
    oof: CrossFittedMargins


type SplitHashPayload = dict[str, int | str | list[dict[str, str | list[str]]]]


def _canonical_sha256(payload: SplitHashPayload) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return sha256_hex(encoded)


def create_inner_oof_split(origins: Sequence[str]) -> InnerOofSplit:
    for origin in origins:
        if _ISO_DATE_PATTERN.fullmatch(origin) is None:
            raise TemporalSplitError(f'inner-oof-split: origin "{origin}" is not an ISO date')
    sorted_origins = tuple(sorted(origins))
    for index in range(1, len(sorted_origins)):
        if sorted_origins[index] == sorted_origins[index - 1]:
            raise TemporalSplitError(
                f'inner-oof-split: duplicate origin "{sorted_origins[index]}"',
            )

    origin_count = len(sorted_origins)
    if (candidate_fold_count := min(OOF_FOLD_MAX, origin_count - OOF_TRAIN_ORIGIN_RESERVE)) < OOF_FOLD_MIN:
        raise TemporalSplitError(
            f"inner-oof-split: K={candidate_fold_count} < {OOF_FOLD_MIN} "
            f"for N={origin_count} distinct origins",
        )
    fold_count = oof_fold_count(origin_count)

    folds: list[InnerOofFold] = []
    for index in range(fold_count):
        validation_index = origin_count - fold_count + index
        folds.append(
            InnerOofFold(
                fold_id=f"inner-{index + 1:02d}",
                validation_origin=sorted_origins[validation_index],
                train_origins=sorted_origins[:validation_index],
            ),
        )
    payload = {
        "kind": "inner-oof-split-v1",
        "originCount": origin_count,
        "foldCount": fold_count,
        "folds": [
            {
                "validationOrigin": fold.validation_origin,
                "trainOrigins": list(fold.train_origins),
            }
            for fold in folds
        ],
    }
    return InnerOofSplit(
        origin_count=origin_count,
        fold_count=fold_count,
        folds=tuple(folds),
        split_origins_sha256=_canonical_sha256(payload),
    )


def _validated_feature_arrays(
    continuous: NDArray[np.float64],
    missing: NDArray[np.bool_],
) -> tuple[NDArray[np.float64], NDArray[np.bool_]]:
    try:
        values = np.asarray(continuous, dtype=np.float64)
    except (TypeError, ValueError) as error:
        raise PreprocessingError(f"continuous values are not numeric: {error}") from error
    raw_flags = np.asarray(missing)
    expected_shape = (values.shape[0], CONTINUOUS_SLOT_COUNT) if values.ndim == 2 else None
    if values.ndim != 2 or values.shape[0] == 0 or values.shape[1] != CONTINUOUS_SLOT_COUNT:
        raise PreprocessingError(
            f"continuous values must be a nonempty matrix with {CONTINUOUS_SLOT_COUNT} slots",
        )
    if raw_flags.shape != expected_shape:
        raise PreprocessingError("missing flags must match the continuous value matrix")
    if not np.all(np.isin(raw_flags, np.asarray([0, 1]))):
        raise PreprocessingError("missing flags must contain only 0 and 1")
    return values, raw_flags.astype(np.bool_)


def fit_preprocessor(
    continuous: NDArray[np.float64],
    missing: NDArray[np.bool_],
) -> PreprocessingStats:
    values, flags = _validated_feature_arrays(continuous, missing)
    medians: list[float] = []
    mads: list[float] = []
    for slot in range(CONTINUOUS_SLOT_COUNT):
        observed = values[:, slot][np.isfinite(values[:, slot]) & ~flags[:, slot]]
        if observed.size == 0:
            raise PreprocessingError(f"slot {slot} has zero finite observed values")
        median = float(np.median(observed))
        mad = float(np.median(np.abs(observed - median)))
        if not np.isfinite(median) or not np.isfinite(mad):
            raise PreprocessingError(f"slot {slot} produced nonfinite median/MAD statistics")
        medians.append(median)
        mads.append(mad)
    return PreprocessingStats(medians=tuple(medians), mads=tuple(mads))


def transform_design(
    continuous: NDArray[np.float64],
    missing: NDArray[np.bool_],
    stats: PreprocessingStats,
) -> NDArray[np.float64]:
    values, flags = _validated_feature_arrays(continuous, missing)
    medians = np.asarray(stats.medians, dtype=np.float64)
    mads = np.asarray(stats.mads, dtype=np.float64)
    if medians.shape != (CONTINUOUS_SLOT_COUNT,) or mads.shape != (CONTINUOUS_SLOT_COUNT,):
        raise PreprocessingError("preprocessing statistics do not match the 10-slot contract")
    if not np.all(np.isfinite(medians)) or not np.all(np.isfinite(mads)) or np.any(mads < 0):
        raise PreprocessingError("preprocessing statistics must be finite with nonnegative MAD")
    imputed = np.where(flags | ~np.isfinite(values), medians, values)
    divisors = np.where(mads > 0, mads, 1.0)
    scaled = (imputed - medians) / divisors
    design = np.column_stack((scaled, flags.astype(np.float64))).astype(np.float64)
    if not np.all(np.isfinite(design)):
        raise PreprocessingError("transformed design matrix contains nonfinite values")
    return design


def _validated_training_inputs(
    continuous: NDArray[np.float64],
    missing: NDArray[np.bool_],
    outcomes: NDArray[np.int64],
    row_origins: Sequence[str],
) -> tuple[NDArray[np.float64], NDArray[np.bool_], NDArray[np.int64], NDArray[np.str_]]:
    values, flags = _validated_feature_arrays(continuous, missing)
    labels = np.asarray(outcomes, dtype=np.int64)
    if labels.ndim != 1 or labels.size != values.shape[0]:
        raise PreprocessingError("outcomes must contain one value per training row")
    if not np.all(np.isin(labels, np.asarray([0, 1], dtype=np.int64))):
        raise PreprocessingError("outcomes must contain only 0 and 1")
    if len(row_origins) != values.shape[0]:
        raise TemporalSplitError("row origins must contain one origin per training row")
    for origin in row_origins:
        if _ISO_DATE_PATTERN.fullmatch(origin) is None:
            raise TemporalSplitError(f'row origin "{origin}" is not an ISO date')
    return values, flags, labels, np.asarray(row_origins, dtype=np.str_)


def _evaluate_candidate(
    c: float,
    split: InnerOofSplit,
    continuous: NDArray[np.float64],
    missing: NDArray[np.bool_],
    outcomes: NDArray[np.int64],
    row_origins: NDArray[np.str_],
) -> tuple[CandidateScore, CrossFittedMargins]:
    fold_briers: list[float] = []
    margins: list[NDArray[np.float64]] = []
    actuals: list[NDArray[np.int64]] = []
    origins: list[str] = []
    for fold in split.folds:
        train_mask = np.isin(row_origins, np.asarray(fold.train_origins, dtype=np.str_))
        validation_mask = row_origins == fold.validation_origin
        if not np.any(train_mask) or not np.any(validation_mask):
            raise TemporalSplitError(f"{fold.fold_id}: train and validation rows are required")
        stats = fit_preprocessor(continuous[train_mask], missing[train_mask])
        train_design = transform_design(continuous[train_mask], missing[train_mask], stats)
        validation_design = transform_design(
            continuous[validation_mask],
            missing[validation_mask],
            stats,
        )
        estimator = fit_base_estimator(train_design, outcomes[train_mask], c=c)
        fold_margins = np.asarray(
            estimator.decision_function(validation_design),
            dtype=np.float64,
        )
        fold_actuals = outcomes[validation_mask]
        fold_briers.append(float(np.mean((sigmoid(fold_margins) - fold_actuals) ** 2)))
        margins.append(fold_margins)
        actuals.append(fold_actuals)
        origins.extend(fold.validation_origin for _ in range(fold_actuals.size))

    oof = CrossFittedMargins(
        margins=np.concatenate(margins),
        outcomes=np.concatenate(actuals),
        origins=tuple(origins),
    )
    validate_cross_fitted_margins(oof)
    score = CandidateScore(
        c=c,
        mean_brier=float(np.mean(np.asarray(fold_briers, dtype=np.float64))),
        fold_briers=tuple(fold_briers),
    )
    return score, oof


def select_regularization(
    continuous: NDArray[np.float64],
    missing: NDArray[np.bool_],
    outcomes: NDArray[np.int64],
    row_origins: Sequence[str],
) -> RegularizationSelection:
    values, flags, labels, origins = _validated_training_inputs(
        continuous,
        missing,
        outcomes,
        row_origins,
    )
    split = create_inner_oof_split(tuple(sorted(set(row_origins))))
    evaluations = tuple(
        _evaluate_candidate(c, split, values, flags, labels, origins)
        for c in REGULARIZATION_CANDIDATES
    )
    selected_index = min(
        range(len(evaluations)),
        key=lambda index: (evaluations[index][0].mean_brier, evaluations[index][0].c),
    )
    return RegularizationSelection(
        selected_c=evaluations[selected_index][0].c,
        candidate_scores=tuple(evaluation[0] for evaluation in evaluations),
        split=split,
        oof=evaluations[selected_index][1],
    )
