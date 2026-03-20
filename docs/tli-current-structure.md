# TLI Current Structure

## Goal

Define the current enterprise structure for TLI after the v4 runtime migration and cleanup.

## Canonical Runtime Surface

Primary runtime entrypoints:

- `scripts/tli/batch/collect-and-score.ts`
- `scripts/tli/batch/run-comparisons.ts`

Canonical export surface:

- `scripts/tli/tli-runtime-surface.ts`

Canonical package scripts:

- `npm run tli:run`
- `npm run tli:compare`
- `npm run tli:level4:calibrate`
- `npm run tli:level4:weights`
- `npm run tli:level4:drift`
- `npm run tli:level4:certify`
- `npm run tli:phase0:materialize`
- `npm run tli:phase0:bridge`
- `npm run tli:v4:promote -- <run-id> [run-id...]`

Comparison serving defaults:

- request-path comparison serving is permanently v4
- no runtime feature flag is required to enable v4
- canonical analog serving artifacts are `episode_registry_v1`, `query_snapshot_v1`, `label_table_v1`, `analog_candidates_v1`, `analog_evidence_v1`
- request-path comparison serving reads analog artifacts first and only falls back to `theme_comparison_candidates_v2` when analog artifacts are unavailable
- latest published archetype run is the default reader target
- latest certification-grade calibration/weight artifacts are the default serving metadata fallback

## Directory Roles

### `scripts/tli/`

Top-level `scripts/tli/` now contains only high-level runtime metadata:

- README
- boundary manifest
- runtime surface

### `scripts/tli/batch/`

Batch runtime entrypoints:

- collection + scoring orchestrator
- comparison regeneration orchestrator
- shared batch pipeline steps

### `scripts/tli/shared/`

Runtime shared infrastructure:

- data collection and persistence
- Supabase admin/batch helpers
- shared utilities

### `scripts/tli/scoring/`

Lifecycle scoring and calibration:

- score calculation
- persisted calibration loading
- noise/confidence/weight calibration

### `scripts/tli/comparison/`

Comparison and prediction runtime:

- comparison generation/evaluation
- phase0 analog artifact materialization
- prediction snapshot/evaluation
- forecast serving helpers

### `scripts/tli/comparison/v4/`

Comparison v4-specific serving/runtime modules:

- control
- shadow writes
- evaluation writers/readers
- serving record mapping
- validation

### `scripts/tli/themes/`

Theme discovery and lifecycle management:

- discovery
- keyword enrichment
- lifecycle activation/deactivation
- theme state history
- first-spike helpers

### `scripts/tli/collectors/`

External source ingestion:

- Naver DataLab
- Naver News
- Naver Finance
- autocomplete/theme list discovery

### `scripts/tli/ops/`

Manual or scheduled operational tooling:

- bridge runners
- level4 certification/calibration/drift runners
- governance helpers
- promotion/rollback support

These are important, but they are not request-path runtime code.

### `scripts/tli/research/`

Offline improvement loop:

- backtests
- analog retrieval evaluation
- forecast shadow evaluation
- comparison-v4 statistical experiments

### `scripts/tli/research/optimizer/`

Offline TLI parameter optimization:

- historical dump
- GDDA evaluator
- Optuna search space / optimizer
- optimizer artifacts

This area is retained because it supports the self-improving loop, not because production request paths import it directly.

### `scripts/tli/level4/`

Shared level4 support modules used by ops runners and promotion flow.

## Rules

1. Runtime must not depend on `research/`.
2. Runtime must not depend on `ops/`.
3. Ops may depend on runtime and `level4/`.
4. Research may depend on runtime helpers for reproducibility, but request-path code must not depend on research.

## Maintenance Guidance

- If a file affects `/api/tli/themes/*` or scheduled production scoring, it belongs in runtime.
- If a file is used for certification, promotion, drift, or bridge execution, it belongs in ops.
- If a file exists to evaluate, tune, or experiment on the algorithm offline, it belongs in research.
- If a file fits none of those roles, it should be deleted.
