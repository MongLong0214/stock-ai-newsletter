# TLI Review Remediation Tickets

- Source: `app/themes` 심층 리뷰 결과
- Date: 2026-03-12
- Status: Proposed backlog

## Global Execution Rule: Mandatory TDD

이 문서의 모든 `TLIRR-*` 티켓은 예외 없이 TDD로만 진행한다.

핵심 규칙:

1. production code 수정 전 반드시 failing test를 먼저 추가한다.
2. 각 티켓은 `RED -> GREEN -> REFACTOR` 순서를 따른다.
3. 테스트가 처음부터 통과하면 테스트를 수정해 실제 실패를 먼저 만든다.
4. 한 TDD cycle에서는 하나의 동작만 바꾼다.
5. refactor 후에는 관련 테스트와 회귀 테스트를 다시 실행한다.

각 티켓 공통 완료 조건:

- 신규 동작을 설명하는 failing test가 먼저 존재한다.
- 최소 한 번의 RED 실행 결과가 남아 있다.
- 최소 구현 후 GREEN 실행 결과가 있다.
- 관련 회귀 테스트가 모두 GREEN이다.

## Delivery Order

1. TLIRR-001 Market Summary Population Split
2. TLIRR-002 Ranking Summary Noise Filter Consistency
3. TLIRR-003 Signal Label and Selection Integrity
4. TLIRR-004 Prediction Interpretation Decoupling
5. TLIRR-005 Scenario Semantics and Sampling Robustness
6. TLIRR-006 News Score Prior Removal
7. TLIRR-007 Comparison Insight Consistency

## TLIRR-001 Market Summary Population Split

- Priority: P0
- Size: M
- Goal: 시장 요약이 stage cap으로 잘린 표본이 아니라 uncapped eligible population을 기준으로 계산되게 한다.
- Scope:
  - `lib/tli/quality-gate.ts`
  - `app/api/tli/scores/ranking/ranking-helpers.ts`
  - `app/themes/_services/get-ranking-server.ts`
  - `app/api/tli/scores/ranking/route.ts`
  - `lib/tli/types/api.ts`
- Acceptance:
  - `summary.totalThemes`, `summary.byStage`, `summary.avgScore`, `summary.hottestTheme`, `summary.surging`가 cap 이전 모집단 기준으로 계산된다.
  - display list는 기존처럼 stage cap을 유지한다.
  - SSR service와 API route의 계산이 동일하다.

## TLIRR-002 Ranking Summary Noise Filter Consistency

- Priority: P0
- Size: S
- Goal: `surging` 선별 시 raw-interest 최소 기준이 실제로 적용되게 한다.
- Scope:
  - `app/api/tli/scores/ranking/ranking-helpers.ts`
  - `app/themes/_services/get-ranking-server.ts`
  - `app/api/tli/scores/ranking/route.ts`
- Acceptance:
  - raw interest가 기준 미만인 테마는 `summary.surging` 후보에서 제외된다.
  - SSR과 API 응답이 동일하다.

## TLIRR-003 Signal Label and Selection Integrity

- Priority: P0
- Size: M
- Goal: `오늘의 시그널` 각 카드의 라벨과 실제 선별 규칙을 정합하게 맞춘다.
- Scope:
  - `app/themes/_components/today-signals.tsx`
  - 필요한 경우 순수 helper 분리
- Acceptance:
  - `점수 급등`은 양의 변화율 임계치를 만족하는 테마만 노출한다.
  - `새로 등장`은 단순히 모든 Emerging을 나열하지 않는다.
  - 카드 타이틀과 실제 필터가 의미적으로 일치한다.

## TLIRR-004 Prediction Interpretation Decoupling

- Priority: P0
- Size: L
- Goal: 비교 기반 예측이 현재 stage/score에 의해 덮어써지지 않도록 해석 로직을 분리한다.
- Scope:
  - `lib/tli/prediction.ts`
  - `lib/tli/prediction-helpers.ts`
  - `app/themes/[id]/_components/theme-prediction/index.tsx`
- Acceptance:
  - `phase`, `risk`, 핵심 메시지는 비교군 기반 계산 결과를 반영한다.
  - 현재 stage는 보조 컨텍스트로만 사용된다.
  - stage를 바꿔도 비교군이 동일하면 해석이 불필요하게 뒤집히지 않는다.

## TLIRR-005 Scenario Semantics and Sampling Robustness

- Priority: P0
- Size: L
- Goal: 시나리오 라벨을 중립적으로 바꾸고, 예측이 상위 3개 표본에 과도하게 의존하지 않게 한다.
- Scope:
  - `lib/tli/prediction-helpers.ts`
  - `lib/tli/prediction.ts`
  - `app/api/tli/themes/[id]/fetch-theme-data.ts`
  - `app/themes/[id]/_components/theme-prediction/*`
  - `app/themes/[id]/_components/comparison-list/insight.ts`
- Acceptance:
  - 시나리오 라벨이 `낙관/비관` 대신 중립적 시간 경로 의미를 갖는다.
  - 예측 계산용 comparison fetch 수가 3개보다 충분히 크다.
  - 유효 비교군 일부 탈락 시에도 예측이 쉽게 사라지지 않는다.

## TLIRR-006 News Score Prior Removal

- Priority: P0
- Size: M
- Goal: 뉴스 데이터 부재가 자동 가산점으로 해석되지 않도록 점수 산식을 수정한다.
- Scope:
  - `lib/tli/calculator.ts`
  - `lib/tli/score-confidence.ts`
- Acceptance:
  - 뉴스가 0건이면 뉴스 점수가 보너스를 주지 않는다.
  - `interestScore = newsScore * 0.7` 같은 축 간 덮어쓰기가 제거되거나 강하게 제한된다.
  - 데이터 부족은 점수보다 confidence에서 표현된다.

## TLIRR-007 Comparison Insight Consistency

- Priority: P1
- Size: S
- Goal: 비교 인사이트/카드의 문구가 새 예측 규칙과 일치하도록 조정한다.
- Scope:
  - `app/themes/[id]/_components/comparison-list/insight.ts`
  - `app/themes/[id]/_components/comparison-list/comparison-card.tsx`
- Acceptance:
  - `정점까지 약 X일` 문구는 충분한 비교 근거가 있을 때만 노출된다.
  - 비교 인사이트 요약이 새 시나리오 semantics와 충돌하지 않는다.

## Follow-up (Out of Current 7 Tickets)

- `first_spike_date`를 계산일로 백필하는 상류 스크립트 문제는 별도 티켓으로 분리한다.
- 현재 티켓 범위는 심층 리뷰의 7개 findings만 대상으로 한다.
