from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from interval_ensemble import (
    EMPTY_SAMPLE_REASON,
    INTERVAL_ATTEMPT_CAP,
    INTERVAL_ENSEMBLE_VERSION,
    INTERVAL_LOWER_QUANTILE,
    INTERVAL_REPLICATE_COUNT,
    INTERVAL_UPPER_QUANTILE,
    FitOutcome,
    IntervalEnsembleError,
    ReplicateDraw,
    build_interval_ensemble,
    derive_attempt_seed,
    ensemble_interval,
    oof_fold_count,
    oof_validation_origins,
    replicate_draw,
    sampled_index_digest,
    weighted_repeat_median_mad,
)
from stats_bootstrap import BootstrapError, build_panel_index

CYCLE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
ESTIMATOR_SHA = "a" * 64
OTHER_ESTIMATOR_SHA = "b" * 64


def _panel(theme_count: int, origin_count: int):
    origins = [f"2026-{1 + index // 28:02d}-{1 + index % 28:02d}" for index in range(origin_count)]
    theme_ids: list[str] = []
    origin_dates: list[str] = []
    for origin in origins:
        for theme_index in range(theme_count):
            theme_ids.append(f"theme-{theme_index:02d}")
            origin_dates.append(origin)
    return build_panel_index(theme_ids, origin_dates)


def _always_admissible(_: ReplicateDraw) -> FitOutcome:
    return FitOutcome(admissible=True, artifact="fit")


def _never_admissible(_: ReplicateDraw) -> FitOutcome:
    return FitOutcome(admissible=False, reason="oof_minority_below_floor")


def _reject_first_attempt(draw: ReplicateDraw) -> FitOutcome:
    if draw.attempt_index == 0:
        return FitOutcome(admissible=False, reason="oof_origin_support_below_floor")
    return FitOutcome(admissible=True, artifact=f"fit-{draw.replicate_index}")


# --- seed derivation ---


def test_attempt_seed_is_pinned_to_the_contract_material() -> None:
    material = f"{CYCLE_ID}|{ESTIMATOR_SHA}|{INTERVAL_ENSEMBLE_VERSION}|007|0042".encode("utf-8")
    expected = int.from_bytes(hashlib.sha256(material).digest()[:4], "big")
    assert derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, 7, 42) == expected
    assert 0 <= expected <= 0xFFFFFFFF


def test_attempt_seed_zero_pads_replicate_and_attempt_indices() -> None:
    zero = derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, 0, 0)
    material = f"{CYCLE_ID}|{ESTIMATOR_SHA}|{INTERVAL_ENSEMBLE_VERSION}|000|0000".encode("utf-8")
    assert zero == int.from_bytes(hashlib.sha256(material).digest()[:4], "big")


def test_attempt_seed_separates_replicate_attempt_estimator_and_cycle() -> None:
    seeds = {
        derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, 0, 0),
        derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, 0, 1),
        derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, 1, 0),
        derive_attempt_seed(CYCLE_ID, OTHER_ESTIMATOR_SHA, 0, 0),
    }
    assert len(seeds) == 4


def test_attempt_seed_rejects_non_canonical_identifiers() -> None:
    with pytest.raises(BootstrapError):
        derive_attempt_seed(CYCLE_ID.upper(), ESTIMATOR_SHA, 0, 0)
    with pytest.raises(IntervalEnsembleError):
        derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA.upper(), 0, 0)
    with pytest.raises(IntervalEnsembleError):
        derive_attempt_seed(CYCLE_ID, "abc", 0, 0)
    with pytest.raises(IntervalEnsembleError):
        derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, 1000, 0)
    with pytest.raises(IntervalEnsembleError):
        derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, 0, 10_000)


# --- replicate draw ---


def test_replicate_draw_is_deterministic_and_weight_is_the_multiplicity_product() -> None:
    panel = _panel(theme_count=4, origin_count=10)
    first = replicate_draw(
        panel,
        cycle_id=CYCLE_ID,
        full_fit_estimator_sha256=ESTIMATOR_SHA,
        replicate_index=3,
        attempt_index=0,
    )
    second = replicate_draw(
        panel,
        cycle_id=CYCLE_ID,
        full_fit_estimator_sha256=ESTIMATOR_SHA,
        replicate_index=3,
        attempt_index=0,
    )
    assert first.seed == second.seed
    assert first.index_sha256 == second.index_sha256
    assert np.array_equal(first.row_weights, second.row_weights)

    expected = first.theme_multiplicity[panel.theme_index] * first.origin_multiplicity[panel.origin_index]
    assert np.array_equal(first.row_weights, expected.astype(np.float64))
    assert int(first.theme_multiplicity.sum()) == panel.theme_count
    assert int(first.origin_multiplicity.sum()) == panel.origin_count


def test_replicate_draw_keeps_active_rows_in_original_time_order() -> None:
    panel = _panel(theme_count=3, origin_count=12)
    draw = replicate_draw(
        panel,
        cycle_id=CYCLE_ID,
        full_fit_estimator_sha256=ESTIMATOR_SHA,
        replicate_index=0,
        attempt_index=0,
    )
    assert np.all(np.diff(draw.active_rows) > 0)
    assert np.all(draw.row_weights[draw.active_rows] > 0)


def test_index_digest_covers_theme_then_origin_draw_bytes() -> None:
    theme_draws = np.array([0, 2, 1], dtype=np.int64)
    origin_draws = np.array([3, 4], dtype=np.int64)
    payload = theme_draws.astype(">u4").tobytes() + origin_draws.astype(">u4").tobytes()
    assert sampled_index_digest(theme_draws, origin_draws) == hashlib.sha256(payload).hexdigest()
    assert sampled_index_digest(theme_draws, origin_draws) != sampled_index_digest(origin_draws, theme_draws)


def test_panel_rows_must_be_time_ordered() -> None:
    panel = build_panel_index(["a", "b"], ["2026-01-12", "2026-01-05"])
    with pytest.raises(BootstrapError):
        build_interval_ensemble(
            panel,
            cycle_id=CYCLE_ID,
            full_fit_estimator_sha256=ESTIMATOR_SHA,
            fit=_always_admissible,
            replicate_count=1,
        )


# --- first-admissible attempt selection ---


def test_first_attempt_is_adopted_when_admissible() -> None:
    panel = _panel(theme_count=4, origin_count=10)
    ensemble = build_interval_ensemble(
        panel,
        cycle_id=CYCLE_ID,
        full_fit_estimator_sha256=ESTIMATOR_SHA,
        fit=_always_admissible,
        replicate_count=5,
    )
    assert len(ensemble.replicates) == 5
    assert ensemble.rejected_attempts == ()
    assert [replicate.attempt_index for replicate in ensemble.replicates] == [0, 0, 0, 0, 0]
    assert [replicate.replicate_index for replicate in ensemble.replicates] == [0, 1, 2, 3, 4]


def test_attempt_zero_failure_is_followed_by_attempt_one_identically_across_runs() -> None:
    panel = _panel(theme_count=4, origin_count=10)

    def run():
        return build_interval_ensemble(
            panel,
            cycle_id=CYCLE_ID,
            full_fit_estimator_sha256=ESTIMATOR_SHA,
            fit=_reject_first_attempt,
            replicate_count=6,
        )

    first, second = run(), run()

    assert [replicate.attempt_index for replicate in first.replicates] == [1] * 6
    assert [rejected.attempt_index for rejected in first.rejected_attempts] == [0] * 6
    assert [rejected.reason for rejected in first.rejected_attempts] == ["oof_origin_support_below_floor"] * 6

    assert [replicate.seed for replicate in first.replicates] == [replicate.seed for replicate in second.replicates]
    assert [replicate.index_sha256 for replicate in first.replicates] == [
        replicate.index_sha256 for replicate in second.replicates
    ]
    assert [rejected.index_sha256 for rejected in first.rejected_attempts] == [
        rejected.index_sha256 for rejected in second.rejected_attempts
    ]
    assert [replicate.artifact for replicate in first.replicates] == [f"fit-{index}" for index in range(6)]


def test_accepted_seed_matches_the_selected_attempt_index() -> None:
    panel = _panel(theme_count=4, origin_count=10)
    ensemble = build_interval_ensemble(
        panel,
        cycle_id=CYCLE_ID,
        full_fit_estimator_sha256=ESTIMATOR_SHA,
        fit=_reject_first_attempt,
        replicate_count=3,
    )
    for replicate in ensemble.replicates:
        assert replicate.seed == derive_attempt_seed(CYCLE_ID, ESTIMATOR_SHA, replicate.replicate_index, 1)


def test_rejected_ledger_records_index_hash_and_reason_in_order() -> None:
    panel = _panel(theme_count=4, origin_count=10)
    attempts: list[tuple[int, int]] = []

    def fit(draw: ReplicateDraw) -> FitOutcome:
        attempts.append((draw.replicate_index, draw.attempt_index))
        if draw.attempt_index < 2:
            return FitOutcome(admissible=False, reason=f"reason_{draw.attempt_index}")
        return FitOutcome(admissible=True)

    ensemble = build_interval_ensemble(
        panel,
        cycle_id=CYCLE_ID,
        full_fit_estimator_sha256=ESTIMATOR_SHA,
        fit=fit,
        replicate_count=2,
    )
    assert attempts == [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2)]
    assert [(item.replicate_index, item.attempt_index, item.reason) for item in ensemble.rejected_attempts] == [
        (0, 0, "reason_0"),
        (0, 1, "reason_1"),
        (1, 0, "reason_0"),
        (1, 1, "reason_1"),
    ]
    for rejected in ensemble.rejected_attempts:
        expected = replicate_draw(
            panel,
            cycle_id=CYCLE_ID,
            full_fit_estimator_sha256=ESTIMATOR_SHA,
            replicate_index=rejected.replicate_index,
            attempt_index=rejected.attempt_index,
        )
        assert rejected.index_sha256 == expected.index_sha256


def test_exhausting_the_attempt_cap_fails_the_cycle_instead_of_skipping() -> None:
    panel = _panel(theme_count=3, origin_count=10)
    with pytest.raises(IntervalEnsembleError, match="exhausted 8 attempts"):
        build_interval_ensemble(
            panel,
            cycle_id=CYCLE_ID,
            full_fit_estimator_sha256=ESTIMATOR_SHA,
            fit=_never_admissible,
            replicate_count=2,
            attempt_cap=8,
        )


def test_empty_weighted_sample_is_rejected_without_calling_the_fit_callback() -> None:
    # theme-a는 origin 0/1에만, theme-b는 origin 2에만 존재 → 일부 attempt는 전체 weight가 0이다.
    panel = build_panel_index(
        ["theme-a", "theme-a", "theme-b"],
        ["2026-01-05", "2026-01-12", "2026-01-19"],
    )
    observed: list[tuple[int, int]] = []

    def fit(draw: ReplicateDraw) -> FitOutcome:
        observed.append((draw.replicate_index, draw.attempt_index))
        assert draw.active_rows.size > 0
        return FitOutcome(admissible=True)

    ensemble = build_interval_ensemble(
        panel,
        cycle_id=CYCLE_ID,
        full_fit_estimator_sha256=ESTIMATOR_SHA,
        fit=fit,
        replicate_count=64,
        attempt_cap=64,
    )
    assert len(ensemble.replicates) == 64
    empty = [rejected for rejected in ensemble.rejected_attempts if rejected.reason == EMPTY_SAMPLE_REASON]
    assert empty, "fixture must produce at least one all-zero weight attempt"
    # weight가 0인 attempt는 fit callback에 도달하지 않고 ledger로만 남는다.
    assert all((rejected.replicate_index, rejected.attempt_index) not in observed for rejected in empty)


def test_fit_outcome_contract_is_enforced() -> None:
    panel = _panel(theme_count=3, origin_count=10)
    with pytest.raises(IntervalEnsembleError):
        build_interval_ensemble(
            panel,
            cycle_id=CYCLE_ID,
            full_fit_estimator_sha256=ESTIMATOR_SHA,
            fit=lambda _: FitOutcome(admissible=False),
            replicate_count=1,
        )
    with pytest.raises(IntervalEnsembleError):
        build_interval_ensemble(
            panel,
            cycle_id=CYCLE_ID,
            full_fit_estimator_sha256=ESTIMATOR_SHA,
            fit=lambda _: FitOutcome(admissible=True, reason="unexpected"),
            replicate_count=1,
        )
    with pytest.raises(IntervalEnsembleError):
        build_interval_ensemble(
            panel,
            cycle_id=CYCLE_ID,
            full_fit_estimator_sha256=ESTIMATOR_SHA,
            fit=lambda _: True,
            replicate_count=1,
        )


def test_module_does_not_depend_on_sklearn() -> None:
    source = Path("scripts/tli/learn/interval_ensemble.py").read_text(encoding="utf-8")
    assert "sklearn" not in source
    assert "sklearn" not in sys.modules


# --- OOF fold plan ---


def test_oof_fold_count_matches_min_eight_t_minus_eight() -> None:
    assert oof_fold_count(13) == 5
    assert oof_fold_count(16) == 8
    assert oof_fold_count(26) == 8


def test_oof_fold_count_rejects_fewer_than_five_validation_origins() -> None:
    with pytest.raises(IntervalEnsembleError):
        oof_fold_count(12)


def test_oof_validation_origins_takes_the_last_k_origins() -> None:
    origins = tuple(f"o{index:02d}" for index in range(13))
    assert oof_validation_origins(origins) == tuple(f"o{index:02d}" for index in range(8, 13))


# --- weighted preprocessing helper ---


def test_weighted_repeat_median_mad_matches_the_repeated_multiset() -> None:
    values = np.array([1.0, 2.0, 3.0, 100.0], dtype=np.float64)
    weights = np.array([1.0, 3.0, 0.0, 1.0], dtype=np.float64)
    expected = np.array([1.0, 2.0, 2.0, 2.0, 100.0], dtype=np.float64)
    median, mad = weighted_repeat_median_mad(values, weights)
    assert median == pytest.approx(float(np.median(expected)))
    assert mad == pytest.approx(float(np.median(np.abs(expected - np.median(expected)))))


def test_weighted_repeat_median_mad_rejects_fractional_or_empty_weights() -> None:
    with pytest.raises(IntervalEnsembleError):
        weighted_repeat_median_mad(np.array([1.0]), np.array([0.5]))
    with pytest.raises(IntervalEnsembleError):
        weighted_repeat_median_mad(np.array([1.0]), np.array([0.0]))


# --- prediction envelope ---


def test_ensemble_interval_uses_type_seven_quantiles_and_clamps_around_the_full_fit() -> None:
    probabilities = np.linspace(0.10, 0.90, 500)
    lower, upper = ensemble_interval(probabilities, 0.50)
    assert lower == pytest.approx(float(np.quantile(probabilities, INTERVAL_LOWER_QUANTILE, method="linear")))
    assert upper == pytest.approx(float(np.quantile(probabilities, INTERVAL_UPPER_QUANTILE, method="linear")))
    assert 0.0 <= lower <= 0.50 <= upper <= 1.0


def test_ensemble_interval_envelopes_a_full_fit_outside_the_quantile_band() -> None:
    probabilities = np.full(500, 0.40)
    lower, upper = ensemble_interval(probabilities, 0.05)
    assert (lower, upper) == (0.05, 0.40)

    lower, upper = ensemble_interval(probabilities, 0.95)
    assert (lower, upper) == (0.40, 0.95)


def test_ensemble_interval_clamps_to_the_unit_interval() -> None:
    lower, upper = ensemble_interval(np.full(500, 0.5), 1.5)
    assert (lower, upper) == (0.5, 1.0)
    lower, upper = ensemble_interval(np.full(500, 0.5), -0.5)
    assert (lower, upper) == (0.0, 0.5)


def test_ensemble_interval_requires_exactly_five_hundred_probabilities() -> None:
    with pytest.raises(IntervalEnsembleError):
        ensemble_interval(np.full(499, 0.5), 0.5)
    with pytest.raises(IntervalEnsembleError):
        ensemble_interval(np.full(501, 0.5), 0.5)


def test_ensemble_interval_rejects_nonfinite_inputs() -> None:
    values = np.full(500, 0.5)
    values[7] = np.nan
    with pytest.raises(IntervalEnsembleError):
        ensemble_interval(values, 0.5)
    with pytest.raises(IntervalEnsembleError):
        ensemble_interval(np.full(500, 0.5), float("inf"))


def test_contract_constants_match_the_plan() -> None:
    assert INTERVAL_REPLICATE_COUNT == 500
    assert INTERVAL_ATTEMPT_CAP == 1024
    assert (INTERVAL_LOWER_QUANTILE, INTERVAL_UPPER_QUANTILE) == (0.025, 0.975)
    assert INTERVAL_ENSEMBLE_VERSION == "interval-ensemble-v2"
