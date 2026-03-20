# TLI V4 Full Migration PRD

Date: 2026-03-19
Owner: Codex
Status: In Progress

## Objective

TLI 관련 로직을 `v4 serving + 단일 알고리즘 경로`로 전면 마이그레이션한다.

목표 상태:
- comparison read/write/eval/prediction는 `v4`만 사용
- legacy comparison 테이블/bridge/fallback 경로 제거
- dead code, orphan code, duplicated conversion code 제거
- scorer/optimizer/calibration 정합성 개선
- 테스트는 v4 단일 경로를 기준으로 재구성

## Non-Goals

- UI/디자인 개편
- unrelated newsletter/blog code 정리
- 새로운 TLI 제품 기능 추가

## Required Outcomes

1. 메인 테마 상세 API가 legacy `theme_comparisons`를 직접 읽지 않는다.
2. comparison persistence는 v4 단일 경로만 유지한다.
3. prediction snapshot/evaluation은 v4 단일 경로만 유지한다.
4. dead parameter와 calibration no-op wiring을 제거 또는 실제 연결한다.
5. 전수 테스트가 통과한다.

## Migration Rules

1. No production code without failing tests first.
2. 티켓 단위로 구현한다.
3. 티켓 완료 후 누적 리뷰 포인트를 반영한다.
4. legacy 제거는 replacement 경로가 green인 상태에서만 수행한다.

## Tickets

### Ticket 1
V4-only serving read path 도입

Scope:
- theme detail API comparison read path를 v4 reader로 통일
- legacy query descriptor/fallback dead path 제거 시작
- UI response contract 유지

Acceptance Criteria:
- theme detail API는 comparison data를 legacy table에서 직접 읽지 않는다
- existing response shape는 유지된다
- 관련 테스트가 모두 green이다

### Ticket 2
Comparison/prediction pipeline v4 단일화

Scope:
- comparison generation, snapshot, eval 경로에서 legacy fallback 제거
- v4 disabled 시 silent success 금지
- pipeline은 v4-only persistence를 강제

Acceptance Criteria:
- comparison 생성/예측/평가에서 legacy fallback이 제거된다
- disabled misconfig는 명시적 실패가 된다
- 관련 tests green

### Ticket 3
Scoring/optimizer/calibration 정합성 복구

Scope:
- `stage_growth` dead parameter 정리
- calibration wiring 실제 반영
- optimizer/live scorer 정합성 개선을 위한 구조 정리

Acceptance Criteria:
- dead parameter 제거 또는 실제 사용
- calibration state가 scorer behavior에 반영됨
- optimizer/test contract mismatch가 해소됨

### Ticket 4
Legacy/orphan/dead code cleanup

Scope:
- v4 migration 이후 불필요한 legacy scripts/utilities/routes 제거
- placeholder artifact/unused code 축소
- docs/tests 정리

Acceptance Criteria:
- 더 이상 유지되지 않는 legacy comparison path가 제거됨
- orphan utilities 제거됨
- full TLI test suite green

## Incremental Review Pattern

- Ticket 1 -> Review(1)
- Ticket 2 -> Review(1~2)
- Ticket 3 -> Review(1~3)
- Ticket 4 -> Review(1~4)

## Primary Risks


- API contract regression
- admin/ops script breakage
- serving flag semantics 변경으로 인한 runtime mismatch
- legacy 삭제 전 hidden dependency 누락

## Verification

- `npx vitest run ...` targeted tests per ticket
- final `npx vitest run lib/tli/__tests__ scripts/tli/__tests__ scripts/tli-optimizer/__tests__`
