from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
import pytest

sys.path.insert(0, str(Path("scripts/tli/learn").resolve()))

from stats_bootstrap import (
    BOOTSTRAP_REPLICATES,
    ECE_UPPER_QUANTILE,
    MOVING_BLOCK_LENGTH,
    POWER_ORIGIN_MAX,
    POWER_ORIGIN_MIN,
    PRIMARY_UPPER_QUANTILE,
    REGIME_LOWER_QUANTILE,
    BootstrapError,
    PairedSample,
    Pcg32,
    ReplicateStatistic,
    ZeroWeightReplicateError,
    bootstrap_delta_mean,
    bootstrap_fixed_bin_ece,
    build_paired_sample,
    candidate_ece_statistic,
    cycle_seed_base_hex,
    delta_mean_statistic,
    derive_run_seed,
    draw_origin_positions,
    draw_theme_indices,
    fixed_bin_ece,
    hf7_quantile,
    pooled_brier,
    power_scope,
    power_simulation,
    replicate_digest,
    two_way_paired_bootstrap,
)

CYCLE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
OTHER_CYCLE_ID = "0c1d5a1e-1c9f-4b2a-8f6f-2f4a1b7c9d31"


def _origin_dates(count: int) -> tuple[str, ...]:
    return tuple(f"2026-{1 + index // 28:02d}-{1 + index % 28:02d}" for index in range(count))


def _clustered_sample(theme_count: int, origin_count: int) -> PairedSample:
    # theme 안에서는 delta가 완전히 동일하고 theme 사이에서만 크게 갈리는 강한 cluster 구조.
    # row-level iid 재표집은 이 구조에서 분산을 과소평가한다.
    origins = _origin_dates(origin_count)
    theme_ids: list[str] = []
    origin_dates: list[str] = []
    candidate: list[float] = []
    comparator: list[float] = []
    outcomes: list[int] = []
    for theme_index in range(theme_count):
        outcome = 1 if theme_index % 2 == 0 else 0
        for origin in origins:
            theme_ids.append(f"theme-{theme_index:02d}")
            origin_dates.append(origin)
            candidate.append(0.90)
            comparator.append(0.50)
            outcomes.append(outcome)
    return build_paired_sample(theme_ids, origin_dates, candidate, comparator, outcomes)


def _near_constant_sample(theme_count: int, origin_count: int, jitter_scale: float) -> PairedSample:
    origins = _origin_dates(origin_count)
    theme_ids: list[str] = []
    origin_dates: list[str] = []
    candidate: list[float] = []
    comparator: list[float] = []
    outcomes: list[int] = []
    for theme_index in range(theme_count):
        for origin_index, origin in enumerate(origins):
            jitter = jitter_scale * (((theme_index * origin_count) + origin_index) % 3 - 1)
            theme_ids.append(f"theme-{theme_index:02d}")
            origin_dates.append(origin)
            candidate.append(0.40 + jitter)
            comparator.append(0.50)
            outcomes.append(1)
    return build_paired_sample(theme_ids, origin_dates, candidate, comparator, outcomes)


def _zero_weight_prone_sample() -> PairedSample:
    # theme-a는 origin 0/1에만, theme-b는 origin 2에만 존재한다.
    # theme draw가 모두 b이고 block draw가 origin 2를 통째로 누락하면 전체 row weight가 0이 된다.
    return build_paired_sample(
        ["theme-a", "theme-a", "theme-b"],
        ["2026-01-05", "2026-01-12", "2026-01-19"],
        [0.60, 0.60, 0.40],
        [0.50, 0.50, 0.50],
        [1, 1, 0],
    )


def _naive_iid_bootstrap(
    sample: PairedSample,
    seed: int,
    replicates: int,
    statistic: ReplicateStatistic,
) -> NDArray[np.float64]:
    rng = Pcg32(seed)
    rows = sample.row_count
    values = np.empty(replicates, dtype=np.float64)
    for index in range(replicates):
        draws = rng.bounded(rows, rows)
        weights = np.bincount(draws, minlength=rows).astype(np.float64)
        values[index] = statistic(sample, weights)
    return values


# --- PCG32 reference stream ---


def test_pcg32_matches_reference_demo_stream() -> None:
    # pcg_basic.c 데모: pcg32_srandom_r(&rng, 42u, 54u)의 첫 6개 출력.
    rng = Pcg32(seed=42, stream=54)
    assert [int(value) for value in rng.next_uint32(6)] == [
        0xA15C02B7,
        0x7B47F409,
        0xBA1D3330,
        0x83D2F293,
        0xBFA4784B,
        0xCBED606E,
    ]


def test_pcg32_batched_draws_match_sequential_stream() -> None:
    batched = Pcg32(seed=7, stream=54).next_uint32(64)
    sequential = Pcg32(seed=7, stream=54)
    one_at_a_time = np.concatenate([sequential.next_uint32(1) for _ in range(64)])
    assert np.array_equal(batched, one_at_a_time)


def test_pcg32_bounded_consumes_stream_like_sequential_rejection() -> None:
    chunked = Pcg32(seed=99).bounded(7, 40)
    stepwise = Pcg32(seed=99)
    drawn = np.concatenate([stepwise.bounded(7, 1) for _ in range(40)])
    assert np.array_equal(chunked, drawn)
    assert np.all((chunked >= 0) & (chunked < 7))


def test_pcg32_bounded_leaves_the_stream_at_the_same_position() -> None:
    chunked = Pcg32(seed=1234)
    chunked.bounded(5, 17)
    stepwise = Pcg32(seed=1234)
    for _ in range(17):
        stepwise.bounded(5, 1)
    assert np.array_equal(chunked.next_uint32(4), stepwise.next_uint32(4))


def test_pcg32_rejects_out_of_range_seed() -> None:
    with pytest.raises(BootstrapError):
        Pcg32(seed=1 << 32)


# --- seed derivation ---


def test_cycle_seed_base_hashes_lowercase_hyphenated_uuid_bytes() -> None:
    expected = hashlib.sha256(CYCLE_ID.encode("utf-8")).hexdigest()
    assert cycle_seed_base_hex(CYCLE_ID) == expected


def test_cycle_seed_base_rejects_non_canonical_uuid() -> None:
    with pytest.raises(BootstrapError):
        cycle_seed_base_hex(CYCLE_ID.upper())
    with pytest.raises(BootstrapError):
        cycle_seed_base_hex("3f2504e04f8941d39a0c0305e82c3301")
    with pytest.raises(BootstrapError):
        cycle_seed_base_hex("not-a-uuid")


def test_derive_run_seed_is_pinned_to_the_contract_material() -> None:
    base = cycle_seed_base_hex(CYCLE_ID)
    material = f"{base}|delta_brier|primary|bootstrap-v1".encode("utf-8")
    expected = int.from_bytes(hashlib.sha256(material).digest()[:4], "big")
    assert derive_run_seed(base, "delta_brier", "primary") == expected
    assert 0 <= expected <= 0xFFFFFFFF


def test_derive_run_seed_separates_metric_scope_and_cycle() -> None:
    base = cycle_seed_base_hex(CYCLE_ID)
    other = cycle_seed_base_hex(OTHER_CYCLE_ID)
    seeds = {
        derive_run_seed(base, "delta_brier", "primary"),
        derive_run_seed(base, "ece", "primary"),
        derive_run_seed(base, "delta_brier", "risk_off"),
        derive_run_seed(other, "delta_brier", "primary"),
    }
    assert len(seeds) == 4


def test_power_scope_is_stable() -> None:
    assert power_scope(16) == "power_origins_16"
    assert power_scope(52) == "power_origins_52"


# --- Hyndman-Fan type 7 ---


def test_hf7_quantile_matches_known_values() -> None:
    values = np.array([1.0, 2.0, 3.0, 4.0], dtype=np.float64)
    assert hf7_quantile(values, 0.0) == pytest.approx(1.0)
    assert hf7_quantile(values, 0.025) == pytest.approx(1.075)
    assert hf7_quantile(values, 0.05) == pytest.approx(1.15)
    assert hf7_quantile(values, 0.5) == pytest.approx(2.5)
    assert hf7_quantile(values, 0.95) == pytest.approx(3.85)
    assert hf7_quantile(values, 0.975) == pytest.approx(3.925)
    assert hf7_quantile(values, 0.99) == pytest.approx(3.97)
    assert hf7_quantile(values, 1.0) == pytest.approx(4.0)


def test_hf7_quantile_agrees_with_numpy_linear_method() -> None:
    rng = np.random.default_rng(20260710)
    values = rng.normal(size=257)
    for quantile in (0.0, 0.025, 0.05, 0.5, 0.95, 0.975, 0.99, 1.0):
        assert hf7_quantile(values, quantile) == pytest.approx(
            float(np.quantile(values, quantile, method="linear")),
            abs=1e-12,
        )


def test_hf7_quantile_rejects_empty_and_out_of_range() -> None:
    with pytest.raises(BootstrapError):
        hf7_quantile(np.empty(0, dtype=np.float64), 0.5)
    with pytest.raises(BootstrapError):
        hf7_quantile(np.array([1.0]), 1.5)


# --- resampling structure ---


def test_moving_block_draws_are_adjacent_pairs_cut_at_exact_length() -> None:
    rng = Pcg32(seed=derive_run_seed(cycle_seed_base_hex(CYCLE_ID), "structure", "blocks"))
    positions = draw_origin_positions(rng, origin_count=12, positions=12)
    assert positions.size == 12
    assert np.all((positions >= 0) & (positions < 12))
    for index in range(0, positions.size - 1, MOVING_BLOCK_LENGTH):
        assert positions[index + 1] == positions[index] + 1


def test_moving_block_cuts_an_odd_position_count_exactly() -> None:
    rng = Pcg32(seed=3)
    positions = draw_origin_positions(rng, origin_count=9, positions=5)
    assert positions.size == 5


def test_moving_block_start_never_exceeds_origin_count_minus_two() -> None:
    rng = Pcg32(seed=11)
    for _ in range(200):
        positions = draw_origin_positions(rng, origin_count=5, positions=5)
        assert int(positions.max()) <= 4


def test_theme_draws_are_exactly_j_with_replacement() -> None:
    rng = Pcg32(seed=5)
    draws = draw_theme_indices(rng, 9)
    assert draws.size == 9
    assert np.all((draws >= 0) & (draws < 9))


def test_panel_requires_two_origins_for_block_resampling() -> None:
    with pytest.raises(BootstrapError):
        build_paired_sample(["a", "b"], ["2026-01-05", "2026-01-05"], [0.5, 0.5], [0.5, 0.5], [1, 0])


def test_paired_sample_rejects_non_probability_inputs() -> None:
    with pytest.raises(BootstrapError):
        build_paired_sample(["a", "b"], ["2026-01-05", "2026-01-06"], [1.5, 0.5], [0.5, 0.5], [1, 0])
    with pytest.raises(BootstrapError):
        build_paired_sample(["a", "b"], ["2026-01-05", "2026-01-06"], [0.5, np.nan], [0.5, 0.5], [1, 0])
    with pytest.raises(BootstrapError):
        build_paired_sample(["a", "b"], ["2026-01-05", "2026-01-06"], [0.5, 0.5], [0.5, 0.5], [1, 2])


def test_delta_is_paired_squared_error_difference() -> None:
    sample = build_paired_sample(
        ["a", "b"],
        ["2026-01-05", "2026-01-06"],
        [0.8, 0.2],
        [0.5, 0.5],
        [1, 0],
    )
    assert sample.delta[0] == pytest.approx((0.8 - 1) ** 2 - (0.5 - 1) ** 2)
    assert sample.delta[1] == pytest.approx((0.2 - 0) ** 2 - (0.5 - 0) ** 2)


# --- determinism ---


def test_same_seed_bootstrap_runs_are_byte_identical() -> None:
    sample = _clustered_sample(theme_count=6, origin_count=10)
    first = bootstrap_delta_mean(sample, cycle_id=CYCLE_ID, metric="delta_brier", scope="primary", replicates=300)
    second = bootstrap_delta_mean(sample, cycle_id=CYCLE_ID, metric="delta_brier", scope="primary", replicates=300)
    assert first.seed == second.seed
    assert first.replicate_sha256 == second.replicate_sha256
    assert first.replicates.astype(">f8").tobytes() == second.replicates.astype(">f8").tobytes()
    assert replicate_digest(first.replicates) == first.replicate_sha256


def test_different_cycle_id_changes_the_replicate_stream() -> None:
    sample = _clustered_sample(theme_count=6, origin_count=10)
    first = bootstrap_delta_mean(sample, cycle_id=CYCLE_ID, metric="delta_brier", scope="primary", replicates=120)
    second = bootstrap_delta_mean(
        sample,
        cycle_id=OTHER_CYCLE_ID,
        metric="delta_brier",
        scope="primary",
        replicates=120,
    )
    assert first.replicate_sha256 != second.replicate_sha256


def test_bootstrap_point_estimate_uses_unit_weights() -> None:
    sample = _clustered_sample(theme_count=4, origin_count=6)
    result = bootstrap_delta_mean(sample, cycle_id=CYCLE_ID, metric="delta_brier", scope="primary", replicates=50)
    assert result.point == pytest.approx(float(sample.delta.mean()))


# --- golden values on a small fixed fixture ---

GOLDEN_DELTA_SEED = 2_364_618_576
GOLDEN_DELTA_UPPER99 = 0.56
GOLDEN_DELTA_REPLICATE_SHA = "d45a9dfcea01f44312f9b7f6ab37a6740e977e452fe4a13970e7bb816c68b64f"
GOLDEN_ECE_UPPER95 = 0.8624999999999985
GOLDEN_ECE_REPLICATE_SHA = "03079c96aecfea2ead90518a2f2d93920ef586bf1ae8059c1e3942555b715c03"


def test_small_fixture_delta_bootstrap_golden_values() -> None:
    sample = _clustered_sample(theme_count=4, origin_count=6)
    result = bootstrap_delta_mean(sample, cycle_id=CYCLE_ID, metric="delta_brier", scope="primary", replicates=64)
    assert result.seed == GOLDEN_DELTA_SEED
    assert result.point == pytest.approx(0.16)
    assert result.quantile(PRIMARY_UPPER_QUANTILE) == pytest.approx(GOLDEN_DELTA_UPPER99, abs=1e-12)
    assert result.replicate_sha256 == GOLDEN_DELTA_REPLICATE_SHA


def test_small_fixture_ece_bootstrap_golden_values() -> None:
    sample = _clustered_sample(theme_count=4, origin_count=6)
    result = bootstrap_fixed_bin_ece(sample, cycle_id=CYCLE_ID, metric="ece", scope="primary", replicates=64)
    assert result.point == pytest.approx(0.4)
    assert result.quantile(ECE_UPPER_QUANTILE) == pytest.approx(GOLDEN_ECE_UPPER95, abs=1e-12)
    assert result.replicate_sha256 == GOLDEN_ECE_REPLICATE_SHA


# --- fixed-bin ECE ---


def test_fixed_bin_ece_places_edge_probabilities_in_the_upper_bin() -> None:
    probabilities = np.array([0.0, 0.1, 0.3, 0.9, 1.0], dtype=np.float64)
    outcomes = np.array([0, 0, 0, 1, 1], dtype=np.int64)
    weights = np.ones(5, dtype=np.float64)
    assert fixed_bin_ece(probabilities, outcomes, weights) == pytest.approx((0.0 + 0.1 + 0.3 + 0.05 * 2) / 5)


def test_fixed_bin_ece_ignores_empty_bins() -> None:
    probabilities = np.array([0.05, 0.05], dtype=np.float64)
    outcomes = np.array([0, 1], dtype=np.int64)
    weights = np.ones(2, dtype=np.float64)
    assert fixed_bin_ece(probabilities, outcomes, weights) == pytest.approx(0.45)


def test_fixed_bin_ece_rejects_zero_weight() -> None:
    with pytest.raises(ZeroWeightReplicateError):
        fixed_bin_ece(np.array([0.5]), np.array([1]), np.array([0.0]))


def test_pooled_brier_matches_mean_squared_error() -> None:
    assert pooled_brier(np.array([0.25, 0.75]), np.array([0, 1])) == pytest.approx(0.0625)


# --- dependence-aware CI is conservative ---


def test_two_way_delta_ci_is_at_least_as_wide_as_naive_iid_ci() -> None:
    sample = _clustered_sample(theme_count=8, origin_count=12)
    seed = derive_run_seed(cycle_seed_base_hex(CYCLE_ID), "delta_brier", "primary")
    two_way = two_way_paired_bootstrap(sample, seed=seed, statistic=delta_mean_statistic, replicates=400)
    naive = _naive_iid_bootstrap(sample, seed, 400, delta_mean_statistic)

    two_way_width = hf7_quantile(two_way.replicates, 0.975) - hf7_quantile(two_way.replicates, 0.025)
    naive_width = hf7_quantile(naive, 0.975) - hf7_quantile(naive, 0.025)
    assert two_way_width >= naive_width
    assert two_way.quantile(PRIMARY_UPPER_QUANTILE) >= hf7_quantile(naive, PRIMARY_UPPER_QUANTILE)


def test_two_way_ece_ci_is_at_least_as_wide_as_naive_iid_ci() -> None:
    sample = _clustered_sample(theme_count=8, origin_count=12)
    seed = derive_run_seed(cycle_seed_base_hex(CYCLE_ID), "ece", "primary")
    two_way = two_way_paired_bootstrap(sample, seed=seed, statistic=candidate_ece_statistic, replicates=400)
    naive = _naive_iid_bootstrap(sample, seed, 400, candidate_ece_statistic)

    two_way_width = hf7_quantile(two_way.replicates, 0.975) - hf7_quantile(two_way.replicates, 0.025)
    naive_width = hf7_quantile(naive, 0.975) - hf7_quantile(naive, 0.025)
    assert two_way_width >= naive_width
    assert two_way.quantile(ECE_UPPER_QUANTILE) >= hf7_quantile(naive, ECE_UPPER_QUANTILE)


def test_regime_lower_bound_uses_type_seven_q005() -> None:
    sample = _clustered_sample(theme_count=6, origin_count=8)
    result = bootstrap_delta_mean(sample, cycle_id=CYCLE_ID, metric="delta_brier", scope="risk_off", replicates=200)
    assert result.quantile(REGIME_LOWER_QUANTILE) == pytest.approx(
        float(np.quantile(result.replicates, 0.05, method="linear")),
        abs=1e-12,
    )


# --- zero effective weight fails the whole run ---


def test_zero_effective_weight_replicate_fails_the_entire_run() -> None:
    with pytest.raises(ZeroWeightReplicateError):
        two_way_paired_bootstrap(
            _zero_weight_prone_sample(),
            seed=derive_run_seed(cycle_seed_base_hex(CYCLE_ID), "delta_brier", "sparse"),
            statistic=delta_mean_statistic,
            replicates=200,
        )


def test_zero_effective_weight_failure_is_reproducible_and_not_redrawn() -> None:
    sample = _zero_weight_prone_sample()
    seed = derive_run_seed(cycle_seed_base_hex(CYCLE_ID), "delta_brier", "sparse")
    messages: list[str] = []
    for _ in range(2):
        with pytest.raises(ZeroWeightReplicateError) as error:
            two_way_paired_bootstrap(sample, seed=seed, statistic=delta_mean_statistic, replicates=200)
        messages.append(str(error.value))
    assert messages[0] == messages[1]


def test_zero_effective_weight_also_fails_power_simulation() -> None:
    # 계약상 replicate 수(10,000)에서는 n=16 block 추출이 희소 origin을 통째로 누락하는 replicate가 나타난다.
    with pytest.raises(ZeroWeightReplicateError, match="n=16"):
        power_simulation(
            _zero_weight_prone_sample(),
            cycle_id=CYCLE_ID,
            comparator_brier=0.25,
            replicates=BOOTSTRAP_REPLICATES,
        )


# --- power simulation ---


def test_power_simulation_freezes_first_origin_count_reaching_target() -> None:
    sample = _near_constant_sample(theme_count=6, origin_count=6, jitter_scale=1e-6)
    result = power_simulation(sample, cycle_id=CYCLE_ID, comparator_brier=0.25, replicates=200)
    assert result.planned_origins == POWER_ORIGIN_MIN
    assert result.points[-1].origins == POWER_ORIGIN_MIN
    assert result.points[-1].power >= 0.80
    assert result.minimum_relevant_effect == pytest.approx(0.02 * 0.25)
    assert result.delta_mean == pytest.approx(float(sample.delta.mean()))


def test_power_simulation_returns_none_when_52_origins_are_insufficient() -> None:
    sample = _clustered_sample(theme_count=6, origin_count=6)
    result = power_simulation(sample, cycle_id=CYCLE_ID, comparator_brier=0.25, replicates=40)
    assert result.planned_origins is None
    assert result.points[0].origins == POWER_ORIGIN_MIN
    assert result.points[-1].origins == POWER_ORIGIN_MAX
    assert len(result.points) == POWER_ORIGIN_MAX - POWER_ORIGIN_MIN + 1


def test_power_simulation_is_deterministic_across_runs() -> None:
    sample = _near_constant_sample(theme_count=5, origin_count=6, jitter_scale=0.02)
    first = power_simulation(sample, cycle_id=CYCLE_ID, comparator_brier=0.24, replicates=80)
    second = power_simulation(sample, cycle_id=CYCLE_ID, comparator_brier=0.24, replicates=80)
    assert first.planned_origins == second.planned_origins
    assert [point.replicate_sha256 for point in first.points] == [point.replicate_sha256 for point in second.points]
    assert [point.margin for point in first.points] == [point.margin for point in second.points]
    assert [point.power for point in first.points] == [point.power for point in second.points]
    assert [point.seed for point in first.points] == [point.seed for point in second.points]


def test_power_simulation_seed_is_scoped_per_origin_count() -> None:
    sample = _near_constant_sample(theme_count=5, origin_count=6, jitter_scale=0.02)
    result = power_simulation(
        sample,
        cycle_id=CYCLE_ID,
        comparator_brier=0.24,
        replicates=20,
        stop_at_first_success=False,
    )
    base = cycle_seed_base_hex(CYCLE_ID)
    for point in result.points:
        assert point.seed == derive_run_seed(base, "power", power_scope(point.origins))
    assert len({point.seed for point in result.points}) == len(result.points)


def test_power_simulation_centers_delta_before_applying_the_minimum_effect() -> None:
    sample = _near_constant_sample(theme_count=6, origin_count=6, jitter_scale=0.0)
    result = power_simulation(sample, cycle_id=CYCLE_ID, comparator_brier=0.30, replicates=32)
    # delta가 상수면 d_null=0 → margin=0, effect_mean=-0.02*B0 <0 → power=1.0
    assert result.points[0].margin == pytest.approx(0.0, abs=1e-15)
    assert result.points[0].power == 1.0
    assert result.planned_origins == POWER_ORIGIN_MIN


def test_power_simulation_rejects_invalid_comparator_brier() -> None:
    sample = _near_constant_sample(theme_count=4, origin_count=6, jitter_scale=0.01)
    with pytest.raises(BootstrapError):
        power_simulation(sample, cycle_id=CYCLE_ID, comparator_brier=float("nan"), replicates=10)
    with pytest.raises(BootstrapError):
        power_simulation(sample, cycle_id=CYCLE_ID, comparator_brier=-0.1, replicates=10)


def test_contract_constants_match_the_plan() -> None:
    assert BOOTSTRAP_REPLICATES == 10_000
    assert MOVING_BLOCK_LENGTH == 2
    assert (POWER_ORIGIN_MIN, POWER_ORIGIN_MAX) == (16, 52)
    assert (PRIMARY_UPPER_QUANTILE, ECE_UPPER_QUANTILE, REGIME_LOWER_QUANTILE) == (0.99, 0.95, 0.05)
