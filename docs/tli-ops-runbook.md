# TLI Ops Runbook

> **`superseded_for_scientific_claims`**: For scientific claims and execution criteria, the master plan takes precedence; the pre-existing content in this document is retained to preserve intent and research history. Master plan: `.omo/plans/tli-v3-scientific-rebuild-master.md`.

## Goal

Provide the canonical operator entrypoints for TLI runtime maintenance, v4 comparison governance, and the self-improving loop.

## Scientific Promotion and Exposure Freeze

- Current state: promotion and exposure are frozen. All legacy M1 models are `invalidated` / `blocked`; B-Abl is `unvalidated` / `blocked`.
- Promotion remains blocked unless `TLI_M1_PROMOTION_ENABLED === 'true'` and the frozen candidate cycle passes the master plan's prospective gate. The flag alone does not unlock promotion.
- Exposure remains empty unless `TLI_PREDICTIONS_V3_EXPOSURE_ENABLED === 'true'`, the registry row has `status='champion'`, `scientific_claim_status='eligible'`, and `scientific_release_status='public'`, and the prediction exactly joins that registry row by `experiment_cycle_id`, model version, and `role='candidate'`. The flag alone does not unlock exposure.
- Unfreeze condition: complete master plan Todos 16-17 for the same frozen candidate, including Todo 16 data-floor, power simulation, preregistration, and cycle start, followed by Todo 17's full prospective and four-canary gates. Any failed or incomplete gate keeps promotion and exposure blocked.

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
