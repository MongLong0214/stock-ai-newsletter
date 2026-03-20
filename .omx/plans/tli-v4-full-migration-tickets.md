# TLI V4 Full Migration Tickets

## Ticket 1: V4-only Serving Read Path

Files likely touched:
- `app/api/tli/themes/[id]/route.ts`
- `app/api/tli/themes/[id]/fetch-theme-data.ts`
- `app/api/tli/themes/[id]/fetch-theme-data-v4.ts`
- `app/api/tli/themes/[id]/build-comparisons.ts`
- related tests

Review focus:
- API contract parity
- no direct legacy comparison reads

## Ticket 2: V4-only Comparison/Predict Pipeline

Files likely touched:
- `scripts/tli/calculate-comparisons.ts`
- `scripts/tli/comparison-v4-shadow.ts`
- `scripts/tli/snapshot-predictions.ts`
- `scripts/tli/evaluate-comparisons.ts`
- `scripts/tli/auto-tune.ts`
- related tests

Review focus:
- no silent drop when v4 disabled
- no legacy fallback in active pipeline

## Ticket 3: Scoring / Optimizer / Calibration Alignment

Files likely touched:
- `lib/tli/stage.ts`
- `lib/tli/calculator.ts`
- `lib/tli/constants/score-config.ts`
- `scripts/tli/load-calibrations.ts`
- `scripts/tli/calibrate-noise.ts`
- `scripts/tli/calibrate-weights.ts`
- `scripts/tli-optimizer/*`
- related tests

Review focus:
- dead parameter removal
- runtime wiring correctness
- optimizer contract consistency

## Ticket 4: Legacy / Dead / Orphan Cleanup

Files likely touched:
- legacy bridge/backfill/fallback files
- dead helper files after v4 cutover
- docs/tests

Review focus:
- deletion safety
- hidden references
- final suite health
