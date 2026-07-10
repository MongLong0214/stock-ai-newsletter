from __future__ import annotations

from dataclasses import dataclass
import json
from typing import assert_never

import numpy as np
from pydantic import BaseModel, ValidationError

from interval_ensemble import (
    FitOutcome,
    INTERVAL_ATTEMPT_CAP,
    ReplicateDraw,
    build_interval_ensemble,
    ensemble_interval,
)
from m1_artifact import ModelArtifact
from m1_calibration import PlattCalibrator, predict_calibrator
from m1_dataset import TrainingDataset
from m1_scientific_availability import ParsedScientificAvailability, build_replicate_availability
from m1_weighted_replicate import (
    WeightedFitRejected,
    WeightedFitRequest,
    WeightedFitSuccess,
    WeightedReplicateError,
    fit_weighted_replicate,
)
from stats_bootstrap import build_paired_sample, replicate_digest, sha256_hex
from study_eval_contract import (
    AttemptLedger,
    EnsembleSummary,
    Probe,
    ProbeInterval,
    ReplicateBody,
    ReplicateCoefficients,
    ReplicatePlatt,
    ReplicateScaler,
    StudyBridgeError,
)


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


@dataclass(frozen=True, slots=True)
class EnsembleBuildRequest:
    dataset: TrainingDataset
    artifact: ModelArtifact
    probe: Probe
    cycle_id: str
    availability: ParsedScientificAvailability


def canonical_model_sha(model: BaseModel) -> str:
    payload = json.dumps(
        model.model_dump(mode="json"),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return sha256_hex(payload)


def _estimator_sha256(artifact: ModelArtifact) -> str:
    payload = {
        "calibrator": artifact.calibrator.model_dump(mode="json"),
        "coefficients": artifact.coefficients.model_dump(mode="json"),
        "feature_schema": list(artifact.feature_schema),
        "scaler": artifact.scaler.model_dump(mode="json"),
        "selected_c": artifact.estimator_contract.selected_c,
    }
    return sha256_hex(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))


def build_ensemble_summary(
    request: EnsembleBuildRequest,
    *,
    replicate_count: int,
) -> EnsembleSummary:
    sample = build_paired_sample(
        [row.theme_id for row in request.dataset.rows],
        [row.base_date for row in request.dataset.rows],
        [0.5] * len(request.dataset.rows),
        [0.5] * len(request.dataset.rows),
        [int(row.y) for row in request.dataset.rows],
    )
    estimator_sha = _estimator_sha256(request.artifact)
    replicate_availability = build_replicate_availability(request.dataset, request.availability)

    def fit(draw: ReplicateDraw) -> FitOutcome:
        result = fit_weighted_replicate(
            WeightedFitRequest(
                dataset=request.dataset,
                template=request.artifact,
                row_weights=draw.row_weights,
                availability=replicate_availability,
            ),
        )
        match result:
            case WeightedFitSuccess(artifact=replicate_artifact):
                return FitOutcome(admissible=True, artifact=replicate_artifact)
            case WeightedFitRejected(reason=reason):
                return FitOutcome(admissible=False, reason=reason)
            case _ as unreachable:
                assert_never(unreachable)

    ensemble = build_interval_ensemble(
        sample.panel,
        cycle_id=request.cycle_id,
        full_fit_estimator_sha256=estimator_sha,
        fit=fit,
        replicate_count=replicate_count,
        attempt_cap=INTERVAL_ATTEMPT_CAP,
    )
    artifact_probe = ArtifactProbe(values=request.probe.values, missing=request.probe.missing)
    probabilities: list[float] = []
    accepted: list[AttemptLedger] = []
    bodies: list[ReplicateBody] = []
    for item in ensemble.replicates:
        try:
            replicate_artifact = ModelArtifact.model_validate(item.artifact)
        except ValidationError as error:
            raise StudyBridgeError("invalid_replicate_artifact", str(error)) from error
        artifact_sha = canonical_model_sha(replicate_artifact)
        probabilities.append(predict_artifact(replicate_artifact, artifact_probe))
        accepted.append(
            AttemptLedger(
                replicate_index=item.replicate_index,
                attempt_index=item.attempt_index,
                index_sha256=item.index_sha256,
                seed=item.seed,
                artifact_sha256=artifact_sha,
            ),
        )
        bodies.append(
            ReplicateBody(
                replicate_index=item.replicate_index,
                scaler=ReplicateScaler(median=replicate_artifact.scaler.median, mad=replicate_artifact.scaler.mad),
                coefficients=ReplicateCoefficients(
                    intercept=replicate_artifact.coefficients.intercept,
                    weights=replicate_artifact.coefficients.weights,
                ),
                calibrator=ReplicatePlatt(a=replicate_artifact.calibrator.a, b=replicate_artifact.calibrator.b),
            ),
        )
    full_probability = predict_artifact(request.artifact, artifact_probe)
    values = np.asarray(probabilities, dtype=np.float64)
    lower, upper = ensemble_interval(values, full_probability, expected_count=replicate_count)
    return EnsembleSummary(
        full_fit_estimator_sha256=estimator_sha,
        accepted=tuple(accepted),
        rejected=tuple(
            AttemptLedger(
                replicate_index=item.replicate_index,
                attempt_index=item.attempt_index,
                index_sha256=item.index_sha256,
                reason=item.reason,
            )
            for item in ensemble.rejected_attempts
        ),
        probe=ProbeInterval(
            full_fit_probability=full_probability,
            lower=lower,
            upper=upper,
            replicate_probability_sha256=replicate_digest(values),
        ),
        replicate_bodies=tuple(bodies),
    )
