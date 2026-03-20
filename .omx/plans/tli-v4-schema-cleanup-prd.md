# TLI V4 Schema Cleanup PRD

Date: 2026-03-19
Owner: Codex
Status: In Progress

## Objective

TLI comparison domain의 legacy schema와 관련 dead code를 정리해,
코드와 DB가 모두 `v4-only comparison model`을 기준으로 일관되게 동작하도록 만든다.

## Scope

In scope:
- legacy comparison tables/functions/scripts cleanup
- forward migration 추가
- schema tests 업데이트
- dead validation utilities 제거 또는 v2 전환
- legacy db type/interface cleanup

Out of scope:
- `analog_candidates_v1`, `analog_evidence_v1`, `query_snapshot_v1`, `label_table_v1`
  등 phase0/forecast bridge에서 아직 쓰는 도메인
- newsletter/blog unrelated schema

## Legacy Targets

Primary legacy comparison artifacts:
- `theme_comparisons`
- `prediction_snapshots`
- `comparison_calibration`
- `comparison_backfill_manifest_v2` if no runtime dependency remains

Code targets:
- legacy validation scripts still reading old tables
- dead db interfaces for legacy comparison tables
- docs/schema tests that still document legacy comparison runtime as active

## Required Outcomes

1. Forward migration exists to retire legacy comparison schema safely.
2. Non-test runtime code does not reference retired legacy comparison tables.
3. Validation and maintenance scripts are either v4-native or deleted.
4. Schema tests reflect v4-only comparison domain.
5. Full TLI test suite remains green.

## Tickets

### Ticket 1
Schema test hardening for v4-only comparison domain

### Ticket 2
Forward migration for legacy comparison schema retirement

### Ticket 3
Runtime/maintenance script cleanup for retired schema

### Ticket 4
Legacy db type/docs cleanup and final verification

## Incremental Review Pattern

- Ticket 1 -> Review(1)
- Ticket 2 -> Review(1~2)
- Ticket 3 -> Review(1~3)
- Ticket 4 -> Review(1~4)

## Verification

- targeted vitest per ticket
- final:
  - `npx vitest run lib/tli/__tests__ scripts/tli/__tests__ scripts/tli-optimizer/__tests__ app/api/tli/themes`
