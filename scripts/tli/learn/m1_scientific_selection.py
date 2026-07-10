from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from m1_calibration import (
    CrossFittedMargins,
    fit_base_estimator,
    sigmoid,
    validate_cross_fitted_margins,
)
from m1_calibration_selection import (
    REGULARIZATION_CANDIDATES,
    CandidateScore,
    RegularizationSelection,
    TemporalSplitError,
    create_inner_oof_split,
    fit_preprocessor,
    transform_design,
)
from m1_dataset import TrainingDataset
from m1_scientific_availability import (
    InnerAvailabilityReceipt,
    ParsedScientificAvailability,
    build_inner_availability_receipt,
)


@dataclass(frozen=True, slots=True)
class ScientificRegularizationSelection:
    selection: RegularizationSelection
    receipt: InnerAvailabilityReceipt


@dataclass(frozen=True, slots=True)
class ScientificSelectionContext:
    dataset: TrainingDataset
    availability: ParsedScientificAvailability
    receipt: InnerAvailabilityReceipt


def _evaluate_candidate(
    context: ScientificSelectionContext,
    c: float,
) -> tuple[CandidateScore, CrossFittedMargins]:
    dataset = context.dataset
    continuous = np.asarray([row.features for row in dataset.rows], dtype=np.float64)
    missing = np.asarray([row.missing_flags for row in dataset.rows], dtype=np.bool_)
    outcomes = np.asarray([int(row.y) for row in dataset.rows], dtype=np.int64)
    origins = np.asarray([row.base_date for row in dataset.rows], dtype=np.str_)
    row_ids = np.asarray([row.row_id for row in context.availability.sidecar.rows], dtype=np.str_)
    fold_briers: list[float] = []
    margins: list[NDArray[np.float64]] = []
    actuals: list[NDArray[np.int64]] = []
    oof_origins: list[str] = []
    for fold in context.receipt.folds:
        train_mask = np.isin(row_ids, np.asarray(fold.eligible_row_ids, dtype=np.str_))
        validation_mask = origins == fold.validation_origin
        if not np.any(train_mask) or not np.any(validation_mask):
            raise TemporalSplitError(f"{fold.fold_id}: PIT train and validation rows are required")
        stats = fit_preprocessor(continuous[train_mask], missing[train_mask])
        train_design = transform_design(continuous[train_mask], missing[train_mask], stats)
        validation_design = transform_design(continuous[validation_mask], missing[validation_mask], stats)
        estimator = fit_base_estimator(train_design, outcomes[train_mask], c=c)
        fold_margins = np.asarray(estimator.decision_function(validation_design), dtype=np.float64)
        fold_actuals = outcomes[validation_mask]
        fold_briers.append(float(np.mean((sigmoid(fold_margins) - fold_actuals) ** 2)))
        margins.append(fold_margins)
        actuals.append(fold_actuals)
        oof_origins.extend(fold.validation_origin for _ in range(fold_actuals.size))
    oof = CrossFittedMargins(
        margins=np.concatenate(margins),
        outcomes=np.concatenate(actuals),
        origins=tuple(oof_origins),
    )
    validate_cross_fitted_margins(oof)
    return CandidateScore(
        c=c,
        mean_brier=float(np.mean(np.asarray(fold_briers, dtype=np.float64))),
        fold_briers=tuple(fold_briers),
    ), oof


def select_scientific_regularization(
    dataset: TrainingDataset,
    availability: ParsedScientificAvailability,
) -> ScientificRegularizationSelection:
    receipt = build_inner_availability_receipt(dataset, availability)
    context = ScientificSelectionContext(dataset=dataset, availability=availability, receipt=receipt)
    evaluations = tuple(
        _evaluate_candidate(context, c)
        for c in REGULARIZATION_CANDIDATES
    )
    selected_index = min(
        range(len(evaluations)),
        key=lambda index: (evaluations[index][0].mean_brier, evaluations[index][0].c),
    )
    split = create_inner_oof_split(tuple(sorted({row.base_date for row in dataset.rows})))
    selection = RegularizationSelection(
        selected_c=evaluations[selected_index][0].c,
        candidate_scores=tuple(evaluation[0] for evaluation in evaluations),
        split=split,
        oof=evaluations[selected_index][1],
    )
    return ScientificRegularizationSelection(selection=selection, receipt=receipt)
