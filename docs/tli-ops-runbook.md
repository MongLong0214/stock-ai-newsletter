# TLI Ops Runbook

## Goal

Provide the canonical operator entrypoints for TLI runtime maintenance, v4 comparison governance, and the self-improving loop.

## Runtime Batch Surface

- `npm run tli:run`
  - Full collection, scoring, comparison generation, prediction snapshotting, and evaluation.
- `npm run tli:compare`
  - Rebuilds phase0 analog artifacts and v4 comparison candidates using the current auto-tuned threshold.

## Level-4 Certification Surface

- `npm run tli:level4:calibrate`
  - Builds the latest certification-grade calibration artifact from `theme_comparison_eval_v2`.
- `npm run tli:level4:weights`
  - Runs weight tuning over evaluated comparison rows and persists the selected weight artifact.
- `npm run tli:level4:drift`
  - Builds the latest drift artifact and evaluates hold conditions.
- `npm run tli:level4:certify`
  - Generates the certification report using the latest published serving state and artifacts.

## Promotion Surface

- `npm run tli:v4:promote -- <run-id> [run-id...]`
  - Promotes one or more published v4 runs after gate validation.
  - Required env:
    - `TLI_COMPARISON_V4_PRODUCTION_VERSION`
    - `TLI_COMPARISON_V4_CALIBRATION_VERSION`
    - `TLI_COMPARISON_V4_WEIGHT_VERSION`
    - `TLI_COMPARISON_V4_DRIFT_VERSION`

## Bridge Surface

- `npm run tli:phase0:materialize`
  - Builds the canonical `episode_registry_v1`, `query_snapshot_v1`, `label_table_v1`, `analog_candidates_v1`, and `analog_evidence_v1` artifacts.
  - The default compare/runtime path relies on this materialization being healthy.
- `npm run tli:phase0:bridge`
  - Executes the phase-0 bridge parity runner.
  - Used to validate bridge artifacts and cutover readiness, not request-path runtime.
- `npm run tli:state-history:backfill`
  - Ensures `theme_state_history_v2` has a baseline row for every theme before episode materialization.
- `npm run tli:first-spike:repair`
  - Re-infers `first_spike_date` for targeted suspect dates.
  - Default target: `2026-02-06`
  - Optional env: `TLI_FIRST_SPIKE_REPAIR_DATES=2026-02-06,2026-02-07`

## Operating Principles

- Request-path comparison serving is always v4.
- Request-path comparison serving prefers canonical analog artifacts (`analog_candidates_v1` / `analog_evidence_v1`) and only falls back to `theme_comparison_candidates_v2` when artifact reads are unavailable.
- If an active `comparison_v4_control` row exists, it pins the production/calibration/weight versions.
- If no active control row exists, serving falls back to the latest published v4 archetype run and latest certification-grade artifacts.
- Self-improving loop code is retained only when it feeds calibration, tuning, drift, certification, or promotion.

## Cleanup Rule

- If a `scripts/tli` file is not on one of the surfaces above and is not imported by runtime code, it is a deletion candidate.
