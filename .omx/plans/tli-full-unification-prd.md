# TLI Full Unification PRD

Date: 2026-03-19
Owner: Codex
Status: In Progress

## Objective

TLI 전체를 `latest self-improving v4`를 중심으로 재정렬한다.

목표 상태:
- comparison runtime은 이미 v4-only 상태를 유지
- lifecycle / comparison / prediction / calibration / promotion 흐름을 `canonical runtime surface`로 명시
- `scripts/tli`와 `scripts/tli-optimizer`의 파일을 `runtime / ops / research / archive`로 분리
- 연구/백테스트/수동운영 스크립트가 실서비스 경로를 오염시키지 않음
- 폴더 구조만 보고도 어떤 파일이 실서비스에 영향을 주는지 즉시 알 수 있음

## Principles

1. No production code without failing tests first.
2. Runtime and research must not share accidental entry paths.
3. Ops scripts may depend on runtime, but runtime must not depend on ops/research.
4. Archived files must have zero non-test references.

## Tickets

### Ticket 1
Define canonical TLI boundary manifest

### Ticket 2
Unify runtime-facing entrypoints under one v4 execution surface

### Ticket 3
Isolate research/optimizer and backtest flows from runtime

### Ticket 4
Archive/remove dead files and finalize docs/tests

## Incremental Review Pattern

- Ticket 1 -> Review(1)
- Ticket 2 -> Review(1~2)
- Ticket 3 -> Review(1~3)
- Ticket 4 -> Review(1~4)
