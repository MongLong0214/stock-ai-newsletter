from __future__ import annotations

import hashlib
import math
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Final

import numpy as np
from numpy.typing import NDArray

BOOTSTRAP_CONTRACT_VERSION: Final[str] = "bootstrap-v1"
BOOTSTRAP_REPLICATES: Final[int] = 10_000
MOVING_BLOCK_LENGTH: Final[int] = 2
ECE_BIN_COUNT: Final[int] = 10
ECE_BIN_EDGES: Final[tuple[float, ...]] = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)

PRIMARY_UPPER_QUANTILE: Final[float] = 0.99
ECE_UPPER_QUANTILE: Final[float] = 0.95
REGIME_LOWER_QUANTILE: Final[float] = 0.05

MINIMUM_RELEVANT_EFFECT_FRACTION: Final[float] = 0.02
POWER_TARGET: Final[float] = 0.80
POWER_ORIGIN_MIN: Final[int] = 16
POWER_ORIGIN_MAX: Final[int] = 52
POWER_METRIC: Final[str] = "power"

# PCG-XSH-RR 64/32 (pcg_basic.c 참조 구현). numpy는 PCG64만 제공하므로
# plan의 "앞 32bit big-endian을 PCG32 seed" 계약을 지키기 위해 직접 구현한다.
PCG32_MULTIPLIER: Final[int] = 6364136223846793005
PCG32_DEFAULT_STREAM: Final[int] = 721347520444481703
UINT64_MASK: Final[int] = (1 << 64) - 1
UINT32_MASK: Final[int] = (1 << 32) - 1
UINT32_MODULUS: Final[int] = 1 << 32


class BootstrapError(RuntimeError):
    pass


class ZeroWeightReplicateError(BootstrapError):
    pass


@lru_cache(maxsize=4096)
def _lcg_jump(delta: int, increment: int) -> tuple[int, int]:
    # advance(state, delta) = acc_mult * state + acc_plus (mod 2^64), pcg_advance_lcg_64와 동일.
    acc_mult, acc_plus = 1, 0
    cur_mult, cur_plus = PCG32_MULTIPLIER, increment
    remaining = delta
    while remaining > 0:
        if remaining & 1:
            acc_mult = (acc_mult * cur_mult) & UINT64_MASK
            acc_plus = (acc_plus * cur_mult + cur_plus) & UINT64_MASK
        cur_plus = ((cur_mult + 1) * cur_plus) & UINT64_MASK
        cur_mult = (cur_mult * cur_mult) & UINT64_MASK
        remaining >>= 1
    return acc_mult, acc_plus


class Pcg32:
    __slots__ = ("_state", "_increment")

    def __init__(self, seed: int, stream: int = PCG32_DEFAULT_STREAM) -> None:
        if not 0 <= seed <= UINT32_MASK:
            raise BootstrapError("PCG32 seed must be an unsigned 32-bit integer")
        if not 0 <= stream <= UINT64_MASK:
            raise BootstrapError("PCG32 stream must be an unsigned 64-bit integer")
        self._increment = ((stream << 1) | 1) & UINT64_MASK
        self._state = 0
        self._step()
        self._state = (self._state + seed) & UINT64_MASK
        self._step()

    def _step(self) -> None:
        self._state = (self._state * PCG32_MULTIPLIER + self._increment) & UINT64_MASK

    def _advance(self, count: int) -> None:
        multiplier, addend = _lcg_jump(count, self._increment)
        self._state = (self._state * multiplier + addend) & UINT64_MASK

    def _states(self, count: int) -> NDArray[np.uint64]:
        states = np.empty(count, dtype=np.uint64)
        states[0] = np.uint64(self._state)
        filled = 1
        while filled < count:
            span = min(filled, count - filled)
            multiplier, addend = _lcg_jump(filled, self._increment)
            states[filled : filled + span] = states[:span] * np.uint64(multiplier) + np.uint64(addend)
            filled += span
        return states

    @staticmethod
    def _output(states: NDArray[np.uint64]) -> NDArray[np.uint32]:
        xorshifted = (((states >> np.uint64(18)) ^ states) >> np.uint64(27)).astype(np.uint32)
        rotation = (states >> np.uint64(59)).astype(np.uint32)
        counter_rotation = (np.uint32(32) - rotation) & np.uint32(31)
        return (xorshifted >> rotation) | (xorshifted << counter_rotation)

    def _peek(self, count: int) -> NDArray[np.uint32]:
        return self._output(self._states(count))

    def next_uint32(self, count: int) -> NDArray[np.uint32]:
        if count <= 0:
            return np.empty(0, dtype=np.uint32)
        drawn = self._peek(count)
        self._advance(count)
        return drawn

    def bounded(self, bound: int, count: int) -> NDArray[np.int64]:
        # pcg32_boundedrand_r과 동일한 rejection sampling. chunk peek 후 실제 소비분만 advance하므로
        # 순차 구현과 stream 소비량이 정확히 같다.
        if bound <= 0:
            raise BootstrapError("bounded draw requires a positive bound")
        if count <= 0:
            return np.empty(0, dtype=np.int64)
        threshold = np.uint32(UINT32_MODULUS % bound)
        modulus = np.uint32(bound)
        chunks: list[NDArray[np.int64]] = []
        collected = 0
        while collected < count:
            needed = count - collected
            chunk_size = max(needed, 8)
            raw = self._peek(chunk_size)
            accepted_positions = np.flatnonzero(raw >= threshold)
            if accepted_positions.size >= needed:
                taken = accepted_positions[:needed]
                chunks.append((raw[taken] % modulus).astype(np.int64))
                self._advance(int(taken[-1]) + 1)
                collected = count
            else:
                chunks.append((raw[accepted_positions] % modulus).astype(np.int64))
                self._advance(chunk_size)
                collected += int(accepted_positions.size)
        return chunks[0] if len(chunks) == 1 else np.concatenate(chunks)


def sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def canonical_cycle_id(cycle_id: str) -> str:
    try:
        parsed = uuid.UUID(cycle_id)
    except ValueError as error:
        raise BootstrapError("cycle id must be a canonical UUID") from error
    if str(parsed) != cycle_id:
        raise BootstrapError("cycle id must be the lowercase hyphenated canonical UUID string")
    return cycle_id


def cycle_seed_base(cycle_id: str) -> bytes:
    return hashlib.sha256(canonical_cycle_id(cycle_id).encode("utf-8")).digest()


def cycle_seed_base_hex(cycle_id: str) -> str:
    return cycle_seed_base(cycle_id).hex()


def derive_run_seed(seed_base_hex: str, metric: str, scope: str) -> int:
    material = f"{seed_base_hex}|{metric}|{scope}|{BOOTSTRAP_CONTRACT_VERSION}"
    digest = hashlib.sha256(material.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def power_scope(origins: int) -> str:
    return f"power_origins_{origins}"


@dataclass(frozen=True, slots=True, eq=False)
class PanelIndex:
    themes: tuple[str, ...]
    origins: tuple[str, ...]
    theme_index: NDArray[np.int64]
    origin_index: NDArray[np.int64]

    @property
    def theme_count(self) -> int:
        return len(self.themes)

    @property
    def origin_count(self) -> int:
        return len(self.origins)

    @property
    def row_count(self) -> int:
        return int(self.theme_index.size)


def build_panel_index(theme_ids: Sequence[str], origin_dates: Sequence[str]) -> PanelIndex:
    if len(theme_ids) != len(origin_dates):
        raise BootstrapError("theme ids and origin dates must be aligned")
    if len(theme_ids) == 0:
        raise BootstrapError("panel requires at least one row")
    themes = tuple(sorted(set(theme_ids)))
    origins = tuple(sorted(set(origin_dates)))
    if len(origins) < MOVING_BLOCK_LENGTH:
        raise BootstrapError(f"moving-block resampling requires at least {MOVING_BLOCK_LENGTH} origins")
    theme_positions = {theme: index for index, theme in enumerate(themes)}
    origin_positions = {origin: index for index, origin in enumerate(origins)}
    return PanelIndex(
        themes=themes,
        origins=origins,
        theme_index=np.array([theme_positions[theme] for theme in theme_ids], dtype=np.int64),
        origin_index=np.array([origin_positions[origin] for origin in origin_dates], dtype=np.int64),
    )


def ensure_time_ordered(panel: PanelIndex) -> PanelIndex:
    if np.any(np.diff(panel.origin_index) < 0):
        raise BootstrapError("panel rows must be supplied in ascending origin order")
    return panel


@dataclass(frozen=True, slots=True, eq=False)
class PairedSample:
    panel: PanelIndex
    p_candidate: NDArray[np.float64]
    p_comparator: NDArray[np.float64]
    y: NDArray[np.int64]
    delta: NDArray[np.float64]

    @property
    def row_count(self) -> int:
        return int(self.y.size)


def build_paired_sample(
    theme_ids: Sequence[str],
    origin_dates: Sequence[str],
    p_candidate: Sequence[float],
    p_comparator: Sequence[float],
    y: Sequence[int],
) -> PairedSample:
    panel = build_panel_index(theme_ids, origin_dates)
    candidate = np.asarray(p_candidate, dtype=np.float64)
    comparator = np.asarray(p_comparator, dtype=np.float64)
    outcomes = np.asarray(y, dtype=np.int64)
    if not (candidate.size == comparator.size == outcomes.size == panel.row_count):
        raise BootstrapError("paired sample columns must be aligned")
    if not (np.all(np.isfinite(candidate)) and np.all(np.isfinite(comparator))):
        raise BootstrapError("paired probabilities must be finite")
    if np.any(candidate < 0) or np.any(candidate > 1) or np.any(comparator < 0) or np.any(comparator > 1):
        raise BootstrapError("paired probabilities must lie in [0, 1]")
    if not np.all(np.isin(outcomes, (0, 1))):
        raise BootstrapError("paired outcomes must be binary")
    delta = np.square(candidate - outcomes) - np.square(comparator - outcomes)
    return PairedSample(
        panel=panel,
        p_candidate=candidate,
        p_comparator=comparator,
        y=outcomes,
        delta=delta,
    )


def draw_theme_indices(rng: Pcg32, theme_count: int) -> NDArray[np.int64]:
    return rng.bounded(theme_count, theme_count)


def draw_origin_positions(rng: Pcg32, origin_count: int, positions: int) -> NDArray[np.int64]:
    if origin_count < MOVING_BLOCK_LENGTH:
        raise BootstrapError(f"moving-block resampling requires at least {MOVING_BLOCK_LENGTH} origins")
    if positions <= 0:
        raise BootstrapError("moving-block resampling requires a positive position count")
    block_count = -(-positions // MOVING_BLOCK_LENGTH)
    start_bound = origin_count - MOVING_BLOCK_LENGTH + 1
    starts = rng.bounded(start_bound, block_count)
    offsets = np.arange(MOVING_BLOCK_LENGTH, dtype=np.int64)
    return (starts[:, None] + offsets).reshape(-1)[:positions]


def multiplicity(draws: NDArray[np.int64], size: int) -> NDArray[np.int64]:
    return np.bincount(draws, minlength=size).astype(np.int64)


def replicate_row_weights(
    panel: PanelIndex,
    theme_multiplicity: NDArray[np.int64],
    origin_multiplicity: NDArray[np.int64],
) -> NDArray[np.float64]:
    return (theme_multiplicity[panel.theme_index] * origin_multiplicity[panel.origin_index]).astype(np.float64)


def hf7_quantile(values: NDArray[np.float64], quantile: float) -> float:
    if values.size == 0:
        raise BootstrapError("quantile requires at least one value")
    if not 0.0 <= quantile <= 1.0:
        raise BootstrapError("quantile must lie in [0, 1]")
    ordered = np.sort(values, kind="stable")
    if ordered.size == 1:
        return float(ordered[0])
    position = (ordered.size - 1) * quantile
    lower = math.floor(position)
    upper = min(lower + 1, ordered.size - 1)
    fraction = position - lower
    return float(ordered[lower] + fraction * (ordered[upper] - ordered[lower]))


def _weighted_mean(values: NDArray[np.float64], weights: NDArray[np.float64]) -> float:
    total = float(weights.sum())
    if total <= 0.0:
        raise ZeroWeightReplicateError("replicate produced zero effective row weight")
    return float(np.dot(values, weights) / total)


def pooled_brier(probabilities: NDArray[np.float64], y: NDArray[np.int64]) -> float:
    return float(np.mean(np.square(probabilities - y)))


def fixed_bin_ece(
    probabilities: NDArray[np.float64],
    y: NDArray[np.int64],
    weights: NDArray[np.float64],
) -> float:
    total = float(weights.sum())
    if total <= 0.0:
        raise ZeroWeightReplicateError("replicate produced zero effective row weight")
    bins = np.searchsorted(np.asarray(ECE_BIN_EDGES, dtype=np.float64), probabilities, side="right")
    weight_per_bin = np.bincount(bins, weights=weights, minlength=ECE_BIN_COUNT)
    probability_per_bin = np.bincount(bins, weights=weights * probabilities, minlength=ECE_BIN_COUNT)
    outcome_per_bin = np.bincount(bins, weights=weights * y, minlength=ECE_BIN_COUNT)
    populated = weight_per_bin > 0
    gaps = np.abs(probability_per_bin[populated] - outcome_per_bin[populated]) / weight_per_bin[populated]
    return float(np.sum(gaps * weight_per_bin[populated]) / total)


ReplicateStatistic = Callable[[PairedSample, NDArray[np.float64]], float]


def delta_mean_statistic(sample: PairedSample, weights: NDArray[np.float64]) -> float:
    return _weighted_mean(sample.delta, weights)


def candidate_ece_statistic(sample: PairedSample, weights: NDArray[np.float64]) -> float:
    return fixed_bin_ece(sample.p_candidate, sample.y, weights)


def replicate_digest(values: NDArray[np.float64]) -> str:
    return sha256_hex(np.ascontiguousarray(values, dtype=np.float64).astype(">f8").tobytes())


@dataclass(frozen=True, slots=True, eq=False)
class BootstrapResult:
    seed: int
    point: float
    replicates: NDArray[np.float64]
    replicate_sha256: str

    def quantile(self, quantile: float) -> float:
        return hf7_quantile(self.replicates, quantile)


def two_way_paired_bootstrap(
    sample: PairedSample,
    *,
    seed: int,
    statistic: ReplicateStatistic,
    replicates: int = BOOTSTRAP_REPLICATES,
) -> BootstrapResult:
    if replicates <= 0:
        raise BootstrapError("bootstrap requires a positive replicate count")
    panel = sample.panel
    rng = Pcg32(seed)
    values = np.empty(replicates, dtype=np.float64)
    for index in range(replicates):
        theme_draws = draw_theme_indices(rng, panel.theme_count)
        origin_draws = draw_origin_positions(rng, panel.origin_count, panel.origin_count)
        weights = replicate_row_weights(
            panel,
            multiplicity(theme_draws, panel.theme_count),
            multiplicity(origin_draws, panel.origin_count),
        )
        if float(weights.sum()) <= 0.0:
            raise ZeroWeightReplicateError(f"replicate {index} produced zero effective row weight")
        values[index] = statistic(sample, weights)
    point = statistic(sample, np.ones(panel.row_count, dtype=np.float64))
    return BootstrapResult(
        seed=seed,
        point=point,
        replicates=values,
        replicate_sha256=replicate_digest(values),
    )


def bootstrap_delta_mean(
    sample: PairedSample,
    *,
    cycle_id: str,
    metric: str,
    scope: str,
    replicates: int = BOOTSTRAP_REPLICATES,
) -> BootstrapResult:
    seed = derive_run_seed(cycle_seed_base_hex(cycle_id), metric, scope)
    return two_way_paired_bootstrap(sample, seed=seed, statistic=delta_mean_statistic, replicates=replicates)


def bootstrap_fixed_bin_ece(
    sample: PairedSample,
    *,
    cycle_id: str,
    metric: str,
    scope: str,
    replicates: int = BOOTSTRAP_REPLICATES,
) -> BootstrapResult:
    seed = derive_run_seed(cycle_seed_base_hex(cycle_id), metric, scope)
    return two_way_paired_bootstrap(sample, seed=seed, statistic=candidate_ece_statistic, replicates=replicates)


@dataclass(frozen=True, slots=True)
class PowerPoint:
    origins: int
    seed: int
    margin: float
    power: float
    replicate_sha256: str


@dataclass(frozen=True, slots=True)
class PowerSimulationResult:
    seed_base_hex: str
    comparator_brier: float
    delta_mean: float
    minimum_relevant_effect: float
    points: tuple[PowerPoint, ...]
    planned_origins: int | None


def power_simulation(
    sample: PairedSample,
    *,
    cycle_id: str,
    comparator_brier: float,
    metric: str = POWER_METRIC,
    replicates: int = BOOTSTRAP_REPLICATES,
    stop_at_first_success: bool = True,
) -> PowerSimulationResult:
    if not math.isfinite(comparator_brier) or comparator_brier < 0.0:
        raise BootstrapError("comparator Brier must be finite and nonnegative")
    if replicates <= 0:
        raise BootstrapError("power simulation requires a positive replicate count")

    panel = sample.panel
    seed_base = cycle_seed_base_hex(cycle_id)
    delta_mean = float(sample.delta.mean())
    effect = MINIMUM_RELEVANT_EFFECT_FRACTION * comparator_brier
    delta_null = sample.delta - delta_mean
    delta_effect = delta_null - effect

    points: list[PowerPoint] = []
    planned: int | None = None
    for origins in range(POWER_ORIGIN_MIN, POWER_ORIGIN_MAX + 1):
        seed = derive_run_seed(seed_base, metric, power_scope(origins))
        rng = Pcg32(seed)
        null_means = np.empty(replicates, dtype=np.float64)
        effect_means = np.empty(replicates, dtype=np.float64)
        for index in range(replicates):
            theme_draws = draw_theme_indices(rng, panel.theme_count)
            origin_draws = draw_origin_positions(rng, panel.origin_count, origins)
            weights = replicate_row_weights(
                panel,
                multiplicity(theme_draws, panel.theme_count),
                multiplicity(origin_draws, panel.origin_count),
            )
            if float(weights.sum()) <= 0.0:
                raise ZeroWeightReplicateError(
                    f"power replicate {index} at n={origins} produced zero effective row weight",
                )
            null_means[index] = _weighted_mean(delta_null, weights)
            effect_means[index] = _weighted_mean(delta_effect, weights)
        margin = hf7_quantile(null_means, PRIMARY_UPPER_QUANTILE)
        power = float(np.mean(effect_means + margin < 0.0))
        points.append(
            PowerPoint(
                origins=origins,
                seed=seed,
                margin=margin,
                power=power,
                replicate_sha256=replicate_digest(np.concatenate((null_means, effect_means))),
            ),
        )
        if planned is None and power >= POWER_TARGET:
            planned = origins
            if stop_at_first_success:
                break

    return PowerSimulationResult(
        seed_base_hex=seed_base,
        comparator_brier=comparator_brier,
        delta_mean=delta_mean,
        minimum_relevant_effect=effect,
        points=tuple(points),
        planned_origins=planned,
    )
