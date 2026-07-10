from __future__ import annotations

from stats_bootstrap import (
    PRIMARY_UPPER_QUANTILE,
    BootstrapResult,
    PairedSample,
    bootstrap_delta_mean,
    bootstrap_fixed_bin_ece,
    pooled_brier,
    power_simulation,
)
from study_eval_contract import (
    BootstrapSummary,
    DeltaSummary,
    PowerPointSummary,
    PowerSummary,
    StatisticsSummary,
)


def _bootstrap_summary(result: BootstrapResult, upper_quantile: float) -> BootstrapSummary:
    return BootstrapSummary(
        seed=result.seed,
        point=result.point,
        upper=result.quantile(upper_quantile),
        replicate_sha256=result.replicate_sha256,
    )


def evaluate_statistics(sample: PairedSample, cycle_id: str, *, replicates: int) -> StatisticsSummary:
    delta = bootstrap_delta_mean(
        sample,
        cycle_id=cycle_id,
        metric="delta_brier",
        scope="primary",
        replicates=replicates,
    )
    ece = bootstrap_fixed_bin_ece(
        sample,
        cycle_id=cycle_id,
        metric="candidate_ece",
        scope="primary",
        replicates=replicates,
    )
    power = power_simulation(
        sample,
        cycle_id=cycle_id,
        comparator_brier=pooled_brier(sample.p_comparator, sample.y),
        replicates=replicates,
    )
    upper_99 = delta.quantile(PRIMARY_UPPER_QUANTILE)
    return StatisticsSummary(
        delta_brier=DeltaSummary(
            seed=delta.seed,
            point=delta.point,
            upper_99=upper_99,
            replicate_sha256=delta.replicate_sha256,
            positive_skill=delta.point < 0.0 and upper_99 < 0.0,
        ),
        candidate_ece=_bootstrap_summary(ece, 0.95),
        power=PowerSummary(
            comparator_brier=power.comparator_brier,
            minimum_relevant_effect=power.minimum_relevant_effect,
            planned_origins=power.planned_origins,
            points=tuple(
                PowerPointSummary(
                    origins=point.origins,
                    seed=point.seed,
                    margin=point.margin,
                    power=point.power,
                    replicate_sha256=point.replicate_sha256,
                )
                for point in power.points
            ),
        ),
    )
