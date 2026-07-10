from __future__ import annotations

from pathlib import Path
from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic_core import PydanticCustomError

from m1_dataset import FEATURE_SCHEMA
from stats_bootstrap import BootstrapError, canonical_cycle_id

BRIDGE_VERSION: Final[str] = "tli-study-eval-bridge-v1"
ARTIFACT_VERSION: Final[str] = "tli-model-artifact-v2"
STAT_REPLICATES: Final[int] = 10_000
ENSEMBLE_REPLICATES: Final[int] = 500
type Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
type Probability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]


class StrictModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class PairedRow(StrictModel):
    theme_id: Annotated[str, Field(min_length=1)]
    origin_date: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    candidate_probability: Probability
    comparator_probability: Probability
    y: Annotated[int, Field(strict=True, ge=0, le=1)]


class TrainingInput(StrictModel):
    fold_id: Annotated[str, Field(min_length=1)]
    path: Path
    expected_sha256: Sha256


class Probe(StrictModel):
    values: tuple[float, ...]
    missing: tuple[bool, ...]

    @field_validator("values", "missing")
    @classmethod
    def feature_count(cls, values: tuple[float, ...] | tuple[bool, ...]) -> tuple[float, ...] | tuple[bool, ...]:
        if len(values) != len(FEATURE_SCHEMA):
            raise PydanticCustomError("feature_count", f"expected {len(FEATURE_SCHEMA)} values")
        return values


class FullFitInput(StrictModel):
    training_input_path: Path
    expected_sha256: Sha256
    availability_sidecar_path: Path
    availability_sidecar_sha256: Sha256
    artifact_path: Path
    artifact_sha256: Sha256
    probe: Probe


class StudyEvalRequest(StrictModel):
    bridge_version: Literal["tli-study-eval-bridge-v1"]
    study_contract_id: Annotated[str, Field(min_length=1)]
    study_contract_sha256: Sha256
    cycle_id: str
    paired_rows: Annotated[tuple[PairedRow, ...], Field(min_length=1)]
    training_inputs: Annotated[tuple[TrainingInput, ...], Field(min_length=1)]
    full_fit: FullFitInput

    @field_validator("cycle_id")
    @classmethod
    def canonical_cycle(cls, value: str) -> str:
        try:
            return canonical_cycle_id(value)
        except BootstrapError as error:
            raise PydanticCustomError("canonical_cycle_id", str(error)) from error


class TrainingParity(StrictModel):
    fold_id: str
    expected_sha256: Sha256
    actual_sha256: Sha256
    canonical_dataset_sha256: Sha256
    row_count: int
    feature_schema: tuple[str, ...]


class BootstrapSummary(StrictModel):
    seed: int
    point: float
    upper: float
    replicate_sha256: Sha256


class DeltaSummary(StrictModel):
    seed: int
    point: float
    upper_99: float
    replicate_sha256: Sha256
    positive_skill: bool


class PowerPointSummary(StrictModel):
    origins: int
    seed: int
    margin: float
    power: float
    replicate_sha256: Sha256


class PowerSummary(StrictModel):
    comparator_brier: float
    minimum_relevant_effect: float
    planned_origins: int | None
    points: tuple[PowerPointSummary, ...]


class StatisticsSummary(StrictModel):
    delta_brier: DeltaSummary
    candidate_ece: BootstrapSummary
    power: PowerSummary


class AttemptLedger(StrictModel):
    replicate_index: int
    attempt_index: int
    index_sha256: Sha256
    reason: str | None = None
    seed: int | None = None
    artifact_sha256: Sha256 | None = None


class ProbeInterval(StrictModel):
    full_fit_probability: Probability
    lower: Probability
    upper: Probability
    replicate_probability_sha256: Sha256


class ReplicateScaler(StrictModel):
    median: tuple[float, ...]
    mad: tuple[float, ...]


class ReplicateCoefficients(StrictModel):
    intercept: float
    weights: tuple[float, ...]


class ReplicatePlatt(StrictModel):
    a: float
    b: float


class ReplicateBody(StrictModel):
    # plan Todo 13/15: frozen 500-model estimator/calibrator coefficients, persisted for row-level replay.
    replicate_index: int
    scaler: ReplicateScaler
    coefficients: ReplicateCoefficients
    calibrator: ReplicatePlatt


class EnsembleSummary(StrictModel):
    full_fit_estimator_sha256: Sha256
    accepted: tuple[AttemptLedger, ...]
    rejected: tuple[AttemptLedger, ...]
    probe: ProbeInterval
    replicate_bodies: tuple[ReplicateBody, ...]


class RuntimeSummary(StrictModel):
    uv_version: str
    python_version: str
    packages: tuple[str, ...]
    thread_env: dict[str, str]
    bridge_lock_sha256: Sha256


class StudyEvalOutput(StrictModel):
    bridge_version: Literal["tli-study-eval-bridge-v1"]
    study_contract_id: str
    study_contract_sha256: Sha256
    cycle_id: str
    runtime: RuntimeSummary
    training_parity: tuple[TrainingParity, ...]
    statistics: StatisticsSummary
    interval_ensemble: EnsembleSummary


class StudyBridgeError(RuntimeError):
    __slots__ = ("code", "detail")

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail

    def __str__(self) -> str:
        return f"{self.code}: {self.detail}"
