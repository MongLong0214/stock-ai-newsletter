from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Final

import numpy as np
from numpy.typing import NDArray

from stats_bootstrap import (
    BootstrapError,
    PanelIndex,
    Pcg32,
    canonical_cycle_id,
    draw_origin_positions,
    draw_theme_indices,
    ensure_time_ordered,
    hf7_quantile,
    multiplicity,
    replicate_row_weights,
)

INTERVAL_ENSEMBLE_VERSION: Final[str] = "interval-ensemble-v2"
INTERVAL_ENVELOPE_VERSION: Final[str] = "block_bootstrap_envelope_v1"
INTERVAL_REPLICATE_COUNT: Final[int] = 500
INTERVAL_ATTEMPT_CAP: Final[int] = 1024
INTERVAL_LOWER_QUANTILE: Final[float] = 0.025
INTERVAL_UPPER_QUANTILE: Final[float] = 0.975

OOF_FOLD_MAX: Final[int] = 8
OOF_FOLD_MIN: Final[int] = 5
OOF_TRAIN_ORIGIN_RESERVE: Final[int] = 8

EMPTY_SAMPLE_REASON: Final[str] = "weighted_sample_empty"
_SHA256_PATTERN: Final[re.Pattern[str]] = re.compile(r"^[0-9a-f]{64}$")


class IntervalEnsembleError(RuntimeError):
    pass


def canonical_sha256(value: str) -> str:
    if _SHA256_PATTERN.fullmatch(value) is None:
        raise IntervalEnsembleError("expected a lowercase 64-hex SHA-256 string")
    return value


def derive_attempt_seed(
    cycle_id: str,
    full_fit_estimator_sha256: str,
    replicate_index: int,
    attempt_index: int,
) -> int:
    if not 0 <= replicate_index <= 999:
        raise IntervalEnsembleError("replicate index must fit the zero-padded 3-digit contract")
    if not 0 <= attempt_index <= 9999:
        raise IntervalEnsembleError("attempt index must fit the zero-padded 4-digit contract")
    material = (
        f"{canonical_cycle_id(cycle_id)}"
        f"|{canonical_sha256(full_fit_estimator_sha256)}"
        f"|{INTERVAL_ENSEMBLE_VERSION}"
        f"|{replicate_index:03d}"
        f"|{attempt_index:04d}"
    )
    digest = hashlib.sha256(material.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def sampled_index_digest(
    theme_draws: NDArray[np.int64],
    origin_draws: NDArray[np.int64],
) -> str:
    payload = theme_draws.astype(">u4").tobytes() + origin_draws.astype(">u4").tobytes()
    return hashlib.sha256(payload).hexdigest()


@dataclass(frozen=True, slots=True, eq=False)
class ReplicateDraw:
    replicate_index: int
    attempt_index: int
    seed: int
    index_sha256: str
    theme_multiplicity: NDArray[np.int64]
    origin_multiplicity: NDArray[np.int64]
    row_weights: NDArray[np.float64]
    active_rows: NDArray[np.int64]


@dataclass(frozen=True, slots=True)
class FitOutcome:
    admissible: bool
    reason: str | None = None
    artifact: object | None = None


@dataclass(frozen=True, slots=True)
class RejectedAttempt:
    replicate_index: int
    attempt_index: int
    index_sha256: str
    reason: str


@dataclass(frozen=True, slots=True)
class AcceptedReplicate:
    replicate_index: int
    attempt_index: int
    seed: int
    index_sha256: str
    artifact: object


@dataclass(frozen=True, slots=True)
class IntervalEnsemble:
    cycle_id: str
    full_fit_estimator_sha256: str
    replicates: tuple[AcceptedReplicate, ...]
    rejected_attempts: tuple[RejectedAttempt, ...]


FitCallback = Callable[[ReplicateDraw], FitOutcome]


def oof_fold_count(origin_count: int) -> int:
    folds = min(OOF_FOLD_MAX, origin_count - OOF_TRAIN_ORIGIN_RESERVE)
    if folds < OOF_FOLD_MIN:
        raise IntervalEnsembleError(f"inner split requires at least {OOF_FOLD_MIN} validation origins")
    return folds


def oof_validation_origins(origins: tuple[str, ...]) -> tuple[str, ...]:
    return origins[-oof_fold_count(len(origins)) :]


def weighted_repeat_median_mad(
    values: NDArray[np.float64],
    weights: NDArray[np.float64],
) -> tuple[float, float]:
    # plan: "weight만큼 row를 반복한 multiset과 정확히 같은 값" — 정수 배수 반복으로 정확히 재현한다.
    counts = np.asarray(weights, dtype=np.float64)
    if np.any(counts < 0) or np.any(counts != np.floor(counts)):
        raise IntervalEnsembleError("replicate weights must be nonnegative integers")
    expanded = np.repeat(np.asarray(values, dtype=np.float64), counts.astype(np.int64))
    if expanded.size == 0:
        raise IntervalEnsembleError("weighted multiset is empty")
    median = float(np.median(expanded))
    mad = float(np.median(np.abs(expanded - median)))
    return median, mad


def replicate_draw(
    panel: PanelIndex,
    *,
    cycle_id: str,
    full_fit_estimator_sha256: str,
    replicate_index: int,
    attempt_index: int,
) -> ReplicateDraw:
    seed = derive_attempt_seed(cycle_id, full_fit_estimator_sha256, replicate_index, attempt_index)
    rng = Pcg32(seed)
    theme_draws = draw_theme_indices(rng, panel.theme_count)
    origin_draws = draw_origin_positions(rng, panel.origin_count, panel.origin_count)
    theme_multiplicity = multiplicity(theme_draws, panel.theme_count)
    origin_multiplicity = multiplicity(origin_draws, panel.origin_count)
    row_weights = replicate_row_weights(panel, theme_multiplicity, origin_multiplicity)
    return ReplicateDraw(
        replicate_index=replicate_index,
        attempt_index=attempt_index,
        seed=seed,
        index_sha256=sampled_index_digest(theme_draws, origin_draws),
        theme_multiplicity=theme_multiplicity,
        origin_multiplicity=origin_multiplicity,
        row_weights=row_weights,
        active_rows=np.flatnonzero(row_weights > 0.0).astype(np.int64),
    )


def _validated_outcome(outcome: FitOutcome) -> FitOutcome:
    if not isinstance(outcome, FitOutcome):
        raise IntervalEnsembleError("fit callback must return a FitOutcome")
    if outcome.admissible and outcome.reason is not None:
        raise IntervalEnsembleError("admissible attempts must not carry a rejection reason")
    if not outcome.admissible and not outcome.reason:
        raise IntervalEnsembleError("inadmissible attempts must carry a rejection reason code")
    return outcome


def build_interval_ensemble(
    panel: PanelIndex,
    *,
    cycle_id: str,
    full_fit_estimator_sha256: str,
    fit: FitCallback,
    replicate_count: int = INTERVAL_REPLICATE_COUNT,
    attempt_cap: int = INTERVAL_ATTEMPT_CAP,
) -> IntervalEnsemble:
    if replicate_count <= 0 or attempt_cap <= 0:
        raise IntervalEnsembleError("interval ensemble requires positive replicate and attempt counts")
    ensure_time_ordered(panel)
    cycle = canonical_cycle_id(cycle_id)
    estimator_sha = canonical_sha256(full_fit_estimator_sha256)

    accepted: list[AcceptedReplicate] = []
    rejected: list[RejectedAttempt] = []
    for replicate_index in range(replicate_count):
        selected: AcceptedReplicate | None = None
        for attempt_index in range(attempt_cap):
            draw = replicate_draw(
                panel,
                cycle_id=cycle,
                full_fit_estimator_sha256=estimator_sha,
                replicate_index=replicate_index,
                attempt_index=attempt_index,
            )
            if draw.active_rows.size == 0:
                rejected.append(
                    RejectedAttempt(
                        replicate_index=replicate_index,
                        attempt_index=attempt_index,
                        index_sha256=draw.index_sha256,
                        reason=EMPTY_SAMPLE_REASON,
                    ),
                )
                continue
            outcome = _validated_outcome(fit(draw))
            if outcome.admissible:
                selected = AcceptedReplicate(
                    replicate_index=replicate_index,
                    attempt_index=attempt_index,
                    seed=draw.seed,
                    index_sha256=draw.index_sha256,
                    artifact=outcome.artifact,
                )
                break
            rejected.append(
                RejectedAttempt(
                    replicate_index=replicate_index,
                    attempt_index=attempt_index,
                    index_sha256=draw.index_sha256,
                    reason=str(outcome.reason),
                ),
            )
        if selected is None:
            raise IntervalEnsembleError(
                f"replicate {replicate_index} exhausted {attempt_cap} attempts without an admissible fit",
            )
        accepted.append(selected)

    return IntervalEnsemble(
        cycle_id=cycle,
        full_fit_estimator_sha256=estimator_sha,
        replicates=tuple(accepted),
        rejected_attempts=tuple(rejected),
    )


def ensemble_interval(
    probabilities: NDArray[np.float64],
    full_fit_probability: float,
    *,
    expected_count: int = INTERVAL_REPLICATE_COUNT,
) -> tuple[float, float]:
    values = np.asarray(probabilities, dtype=np.float64)
    if values.size != expected_count:
        raise IntervalEnsembleError(f"interval completeness requires exactly {expected_count} probabilities")
    if not np.all(np.isfinite(values)):
        raise IntervalEnsembleError("ensemble probabilities must be finite")
    if not np.isfinite(full_fit_probability):
        raise IntervalEnsembleError("full-fit probability must be finite")
    try:
        lower_quantile = hf7_quantile(values, INTERVAL_LOWER_QUANTILE)
        upper_quantile = hf7_quantile(values, INTERVAL_UPPER_QUANTILE)
    except BootstrapError as error:
        raise IntervalEnsembleError(str(error)) from error
    lower = max(0.0, min(full_fit_probability, lower_quantile))
    upper = min(1.0, max(full_fit_probability, upper_quantile))
    return lower, upper
