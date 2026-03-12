# TLI Comparison Level-4 Implementation Review

- Date: 2026-03-12
- Reviewer: worker-3
- Scope: `TLI4-001` through `TLI4-015`
- Source docs:
  - `docs/tli-comparison-level4-execution-prd.md`
  - `docs/tli-comparison-level4-tickets.md`
- Review basis:
  - repository file presence check
  - targeted code inspection of current serving, control, and UI paths

## Executive Summary

현재 저장소에는 `comparison-v4` foundation은 존재하지만, `Level-4` 실행 티켓은 아직 backlog 상태에 가깝다.

확인한 핵심 사실:

1. `scripts/tli/level4/` 구현은 아직 사실상 비어 있다. 확인된 파일은 `scripts/tli/load-calibrations.ts` 뿐이다.
2. 현재 serving path는 여전히 `similarity_score` 중심이다.
3. 현재 comparison payload 타입에는 level-4 probability/CI metadata가 없다.
4. 현재 promotion/control path에는 calibration/weight/drift certification artifact linkage가 없다.
5. UI에는 confidence badge/copy guardrail용 level-4 데이터 계약이 아직 연결되지 않았다.

## Snapshot Findings

### Present today

- `docs/tli-comparison-level4-execution-prd.md`
- `docs/tli-comparison-level4-tickets.md`
- `app/api/tli/themes/[id]/comparison-v4-reader.ts`
- `scripts/tli/comparison-v4-control.ts`
- `scripts/tli/promote-comparison-v4.ts`
- `app/themes/[id]/_components/comparison-list/*`
- `app/themes/[id]/_components/theme-prediction/*`

### Missing today

- `lib/tli/comparison/level4-types.ts`
- `scripts/tli/level4/readers.ts`
- `scripts/tli/level4/calibration-artifact.ts`
- `scripts/tli/level4/calibrate-comparisons.ts`
- `lib/tli/comparison/level4-serving.ts`
- `scripts/tli/level4/promotion-gate.ts`
- `scripts/tli/level4/drift-report.ts`
- `scripts/tli/level4/drift-baseline.ts`
- `scripts/tli/level4/auto-hold.ts`
- `scripts/tli/level4/tune-weights.ts`
- `scripts/tli/level4/weight-artifact.ts`
- `docs/tli-comparison-level4-certification-report.md`

## Ticket Review

| Ticket | Status | Evidence in repo | Main gap |
| --- | --- | --- | --- |
| `TLI4-001` | Not started | `app/api/openapi.json/route.ts` exists, but no `lib/tli/comparison/level4-types.ts` | No artifact/source-surface contract layer |
| `TLI4-002` | Partial foundation | `app/api/tli/themes/[id]/comparison-v4-reader.ts` exists | No certification reader boundary or fail-closed source-surface enforcement |
| `TLI4-003` | Not started | target writer file missing | No calibration artifact persistence contract |
| `TLI4-004` | Not started | script + test missing | No certification calibration report generator |
| `TLI4-005` | Not started | `build-comparisons.ts` still maps raw `similarity_score` | No probability/CI mapper |
| `TLI4-006` | Partial foundation | `build-response.ts` and `lib/tli/types/api.ts` exist | Level-4 fields are not present in API types/contracts |
| `TLI4-007` | Partial foundation | comparison/prediction UI components exist | UI has no level-4 confidence badge/disclaimer inputs to render |
| `TLI4-008` | Not started | `scripts/tli/promote-comparison-v4.ts` exists | No statistical promotion gate evaluator or tests |
| `TLI4-009` | Partial foundation | `scripts/tli/comparison-v4-control.ts` exists | Control row does not track calibration/weight/drift artifact versions |
| `TLI4-010` | Not started | drift generator/test missing | No monthly drift report artifact path |
| `TLI4-011` | Not started | baseline guard file missing | No maturity guard or observation-only artifact contract |
| `TLI4-012` | Partial foundation | orchestration file exists | No auto-hold engine implementation |
| `TLI4-013` | Not started | tuning runner/test missing | No full candidate-pool tuning certification flow |
| `TLI4-014` | Partial foundation | `lib/tli/comparison/composite.ts` exists | No weight artifact writer or artifact-backed serving switch |
| `TLI4-015` | Not started | certification report doc missing | No end-to-end rehearsal evidence |

## Code Evidence Notes

### 1. Serving is still similarity-first

`app/api/tli/themes/[id]/build-comparisons.ts` currently returns fields such as:

- `similarity`
- `currentDay`
- `pastPeakDay`
- `estimatedDaysToPeak`

It does **not** return:

- `relevanceProbability`
- `probabilityCiLower`
- `probabilityCiUpper`
- `supportCount`
- `confidenceTier`
- `calibrationVersion`

This means `TLI4-005` and the contract portion of `TLI4-006` are still open.

### 2. API types are not Level-4-ready

`lib/tli/types/api.ts` defines `ComparisonResult` without level-4 probability metadata. Current client contract still centers on raw similarity and historical timeline fields.

### 3. Reader boundary is not certification-grade yet

`app/api/tli/themes/[id]/comparison-v4-reader.ts` can read `v4` rows and map them back into the legacy comparison shape, but it does not enforce:

- certification-only artifact eligibility
- `source_surface` validation
- fail-closed behavior when only legacy diagnostic artifacts exist

### 4. Promotion metadata is still too thin

`scripts/tli/comparison-v4-control.ts` currently tracks only:

- `production_version`
- `serving_enabled`
- `promoted_by`
- `promoted_at`

This is insufficient for `TLI4-009`, which requires calibration/weight/drift artifact version linkage and rollback traceability.

### 5. UI components are present but not wired for Level-4 semantics

Reviewed files:

- `app/themes/[id]/_components/comparison-list/comparison-card.tsx`
- `app/themes/[id]/_components/theme-prediction/index.tsx`

The components still present similarity-centric labels and comparison-count disclaimers. They do not yet consume probability CI or confidence-tier metadata, so `TLI4-007` remains blocked on upstream payload work.

## Recommended Documentation Follow-up

1. Keep `docs/tli-comparison-level4-tickets.md` as the implementation backlog source.
2. Use this review document as the current-state baseline before engineering execution starts.
3. Update this review after the first P0 slice (`TLI4-001` to `TLI4-004`) lands.
4. Do not mark Level-4 as in progress for rollout until a certification artifact path exists in code, not just in docs.

## Verification

### PASS — file presence audit

- Command: `find scripts/tli -maxdepth 2 -type f | rg 'level4|calibration|promotion-gate|drift-report|auto-hold|weight-artifact'`
- Result: only `scripts/tli/load-calibrations.ts` matched, confirming missing level-4 implementation files.

### PASS — serving contract audit

- Command: `rg -n "relevanceProbability|probabilityCiLower|probabilityCiUpper|confidenceTier|calibrationVersion|weightVersion|source_surface" app lib scripts`
- Result: no level-4 serving contract implementation was found in the active code paths inspected.

### PASS — targeted code inspection

- Files inspected:
  - `app/api/tli/themes/[id]/build-comparisons.ts`
  - `lib/tli/types/api.ts`
  - `app/api/tli/themes/[id]/comparison-v4-reader.ts`
  - `scripts/tli/comparison-v4-control.ts`
  - `scripts/tli/promote-comparison-v4.ts`
  - `app/themes/[id]/_components/comparison-list/comparison-card.tsx`
  - `app/themes/[id]/_components/theme-prediction/index.tsx`

### NOT RUN — repo-wide typecheck/test/lint

- Reason: this task produced documentation only and did not modify application code.
- Note: engineering workers implementing `TLI4-*` tickets should attach full `tsc`, test, lint, and end-to-end evidence per ticket.
