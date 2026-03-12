# TLI Comparison Level-4 Execution Tickets

- Source PRD: [tli-comparison-level4-execution-prd.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/tli-comparison-level4-execution-prd.md)
- Source Validation:
  - [calibration_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_120108_calibration_report.md)
  - [weight_tuning_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_120108_weight_tuning_report.md)
- Date: 2026-03-12
- Status: Proposed enterprise backlog

## Delivery Order

1. Epic A: Certification Surface
2. Epic B: Probabilistic Serving
3. Epic C: Promotion Governance
4. Epic D: Drift Monitoring and Auto-Hold
5. Epic E: Weight Tuning Certification

## Global Execution Rule: Mandatory TDD

이 문서의 모든 `TLI4-*` 티켓은 예외 없이 TDD로만 진행한다.

핵심 규칙:

1. **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST**
2. 각 티켓은 `RED -> GREEN -> REFACTOR` 순서를 반드시 따른다.
3. failing test 없이 작성된 production code는 완료로 인정하지 않는다.
4. 테스트가 처음부터 통과하면 테스트가 잘못된 것으로 간주한다.
5. migration/ops/analytics 티켓도 최소 하나의 자동 검증을 먼저 만든 뒤 구현한다.

각 티켓 공통 완료 조건:

- 신규/변경 동작을 설명하는 failing test 또는 automated validator가 먼저 존재한다.
- 최소 한 번의 RED 실행 증빙이 있다.
- 최소 구현 후 GREEN 실행 결과가 있다.
- 관련 회귀 테스트가 green이다.
- artifact/report가 요구되는 티켓은 실제 산출물이 저장된다.

각 티켓 공통 금지 사항:

- legacy diagnostic artifact를 certification artifact처럼 취급하는 것
- threshold를 문서 없이 임의로 조정하는 것
- censored sample을 silent drop 하는 것
- probability를 raw similarity로 대체하는 것

## Enterprise Definition of Done

아래 조건이 모두 만족되어야 Level-4 rollout candidate로 간주한다.

1. certification-grade calibration artifact 존재
2. uncertainty-aware serving payload 배포 가능
3. promotion gate fail-closed 동작 확인
4. drift report + auto-hold path 동작 확인
5. weight artifact versioning path 존재
6. end-to-end certification report 존재

## Epic A. Certification Surface

### TLI4-001 Define Artifact Contracts and Source-Surface Types

- Priority: P0
- Size: M
- Goal: diagnostic/legacy와 certification/v2/replay artifact를 타입 수준에서 분리한다.
- Scope:
  - calibration artifact type
  - weight artifact type
  - drift artifact type
  - `source_surface` enum
  - artifact versioning fields
- Target files:
  - `lib/tli/types/db.ts`
  - 신규 `lib/tli/comparison/level4-types.ts`
  - `app/api/openapi.json/route.ts`
- Acceptance:
  - `legacy_diagnostic`, `v2_certification`, `replay_equivalent`가 명시적으로 분리된다.
  - serving path에서 certification-grade artifact만 허용할 수 있는 타입 가드가 존재한다.
  - OpenAPI에 serving metadata schema가 반영된다.
- Dependencies: 없음

### TLI4-002 Build Certification-Grade Reader Boundary

- Priority: P0
- Size: L
- Goal: legacy diagnostic reader와 v2/replay certification reader를 분리하고 fail-closed 정책을 코드화한다.
- Scope:
  - diagnostic reader
  - certification reader
  - artifact load policy
  - fail-closed behavior
- Target files:
  - 신규 `scripts/tli/level4/readers.ts`
  - `app/api/tli/themes/[id]/comparison-v4-reader.ts`
  - promotion gate integration points
- Acceptance:
  - diagnostic reader 결과는 serving gate 입력으로 사용할 수 없다.
  - certification artifact 부재 시 serving/promotion은 실패한다.
  - 테스트에서 잘못된 `source_surface`를 명시적으로 거부한다.
- Dependencies:
  - `TLI4-001`

### TLI4-003 Implement Calibration Artifact Writer

- Priority: P0
- Size: L
- Goal: calibration 결과를 versioned artifact로 저장하고 재사용 가능하게 만든다.
- Scope:
  - artifact schema persistence
  - metadata 저장
  - bootstrap/calibration method 저장
  - artifact readback validation
- Target files:
  - `supabase/migrations/*`
  - 신규 `scripts/tli/level4/calibration-artifact.ts`
  - `lib/tli/types/db.ts`
- Acceptance:
  - artifact row에 `source_surface`, `ci_method`, `bootstrap_iterations`가 저장된다.
  - read-after-write 검증이 존재한다.
  - migration과 타입이 일치한다.
- Dependencies:
  - `TLI4-001`

### TLI4-004 Generate Certification Calibration Report

- Priority: P0
- Size: XL
- Goal: v2 또는 replay-equivalent surface에서 certification-grade calibration report를 생성한다.
- Scope:
  - calibration dataset loader
  - calibration model fitting
  - Brier/ECE before-after
  - cluster bootstrap CI
  - report + figure generation
- Target files:
  - 신규 `scripts/tli/level4/calibrate-comparisons.ts`
  - 신규 `scripts/tli/__tests__/level4-calibration.test.ts`
  - `.omx/scientist/reports/`
  - `.omx/scientist/figures/`
- Acceptance:
  - report에 `[OBJECTIVE] [DATA] [FINDING] [STAT:*] [LIMITATION]` 형식이 유지된다.
  - certification-grade artifact가 저장된다.
  - Brier/ECE metric이 artifact와 report에서 일치한다.
- Dependencies:
  - `TLI4-002`
  - `TLI4-003`

## Epic B. Probabilistic Serving

### TLI4-005 Implement Probability and CI Mapper

- Priority: P0
- Size: L
- Goal: raw similarity 대신 calibrated probability + uncertainty metadata를 계산하는 serving mapper를 구현한다.
- Scope:
  - point estimate mapping
  - CI mapping
  - support count computation
  - confidence tier computation
- Target files:
  - 신규 `lib/tli/comparison/level4-serving.ts`
  - `app/api/tli/themes/[id]/build-comparisons.ts`
  - `lib/tli/types/api.ts`
- Acceptance:
  - serving payload에 `relevanceProbability`, `probabilityCiLower`, `probabilityCiUpper`, `supportCount`, `confidenceTier`, `calibrationVersion`이 포함된다.
  - confidence tier rules가 PRD 기준과 일치한다.
  - CI width 기반 tier 분류 테스트가 존재한다.
- Dependencies:
  - `TLI4-004`

### TLI4-006 Extend User-Facing Comparison Payloads

- Priority: P0
- Size: M
- Goal: comparison API와 prediction input surface가 level-4 metadata를 전부 전달하도록 만든다.
- Scope:
  - detail API payload
  - OpenAPI schema
  - internal query/transform layers
- Target files:
  - `app/api/tli/themes/[id]/build-response.ts`
  - `app/api/openapi.json/route.ts`
  - `lib/tli/types/api.ts`
- Acceptance:
  - all comparison responses include level-4 metadata
  - OpenAPI 스키마가 payload와 일치한다.
  - backward compatibility policy가 문서화된다.
  - `weightVersion`은 임의 placeholder가 아니라 artifact-backed source에서 온다.
- Dependencies:
  - `TLI4-005`
  - `TLI4-014`

### TLI4-007 Implement UI Confidence Badges and Copy Guardrails

- Priority: P1
- Size: M
- Goal: probability/uncertainty를 사용자에게 과장 없이 노출한다.
- Scope:
  - comparison card badge
  - prediction disclaimer/copy
  - low-confidence display rules
- Target files:
  - `app/themes/[id]/_components/comparison-list/*`
  - `app/themes/[id]/_components/theme-prediction/*`
- Acceptance:
  - low-confidence item은 badge 또는 disclaimer가 강제된다.
  - deterministic wording이 probability semantics와 충돌하지 않는다.
  - UI regression tests 또는 snapshot tests가 존재한다.
- Dependencies:
  - `TLI4-006`

## Epic C. Promotion Governance

### TLI4-008 Implement Statistical Promotion Gate Evaluator

- Priority: P0
- Size: XL
- Goal: PRD의 CI lower-bound 기반 승격 조건을 코드화한다.
- Scope:
  - primary gate: `delta_precision_ci_lower > -0.01`
  - required guardrails
  - stronger optional gates
  - metric direction rules
- Target files:
  - 신규 `scripts/tli/level4/promotion-gate.ts`
  - 신규 `scripts/tli/__tests__/promotion-gate.test.ts`
  - `scripts/tli/promote-comparison-v4.ts`
- Acceptance:
  - Brier/ECE/MRR/NDCG/Gini/censoring/low-confidence-rate 조건이 모두 구현된다.
  - positive mean but failing lower-bound 케이스가 promotion 실패로 테스트된다.
  - missing certification artifact는 fail-closed 된다.
- Dependencies:
  - `TLI4-004`
  - `TLI4-005`

### TLI4-009 Wire Promotion Control Row and Rollback Metadata

- Priority: P0
- Size: L
- Goal: promotion control plane이 level-4 artifact version과 gate verdict를 추적하게 만든다.
- Scope:
  - control row fields
  - promotion/rollback metadata
  - audit trail
- Target files:
  - `scripts/tli/comparison-v4-control.ts`
  - `scripts/tli/promote-comparison-v4.ts`
  - `supabase/migrations/*`
- Acceptance:
  - promoted version에 calibration/weight/drift artifact version이 연결된다.
  - rollback 시 이전 stable version 복귀가 가능하다.
  - promotion decision trace가 남는다.
- Dependencies:
  - `TLI4-008`

## Epic D. Drift Monitoring and Auto-Hold

### TLI4-010 Implement Monthly Drift Report Generator

- Priority: P0
- Size: L
- Goal: monthly drift report artifact를 생성한다.
- Scope:
  - relevance base rate
  - ECE
  - Brier
  - concentration/Gini
  - censoring ratio
  - first_spike inference rate
  - support bucket precision
- Target files:
  - 신규 `scripts/tli/level4/drift-report.ts`
  - 신규 `scripts/tli/__tests__/drift-report.test.ts`
  - `.omx/scientist/reports/`
  - `.omx/scientist/figures/`
- Acceptance:
  - drift report artifact 저장
  - monthly report markdown 저장
  - baseline window metadata 포함
  - support bucket precision은 serving confidence-tier 정의와 동일한 규칙으로 계산된다.
- Dependencies:
  - `TLI4-003`
  - `TLI4-004`
  - `TLI4-005`

### TLI4-011 Implement Baseline Maturity Guard

- Priority: P0
- Size: M
- Goal: drift auto-hold가 immature baseline에서 켜지지 않도록 한다.
- Scope:
  - distinct months check
  - row count check
  - evaluated run dates check
  - `auto_hold_enabled` flag
- Target files:
  - 신규 `scripts/tli/level4/drift-baseline.ts`
  - `scripts/tli/__tests__/drift-report.test.ts`
- Acceptance:
  - baseline maturity 전에는 observation-only 모드
  - `auto_hold_enabled = false` artifact 저장
  - threshold boundary tests 존재
- Dependencies:
  - `TLI4-010`
  - `TLI4-005`

### TLI4-012 Implement Auto-Hold Engine

- Priority: P0
- Size: L
- Goal: PRD 기준 drift trigger를 바탕으로 serving hold를 자동 실행한다.
- Scope:
  - trigger evaluation
  - hold decision writer
  - alert/report linkage
- Target files:
  - 신규 `scripts/tli/level4/auto-hold.ts`
  - `scripts/tli/comparison-v4-control.ts`
  - `scripts/tli/comparison-v4-orchestration.ts`
- Acceptance:
  - trigger 초과 시 new promotion 차단
  - previous stable version 유지
  - hold decision이 report row와 traceable
  - low-confidence 관련 trigger는 serving confidence-tier 정의와 동일한 bucket source를 사용한다.
- Dependencies:
  - `TLI4-010`
  - `TLI4-011`
  - `TLI4-009`
  - `TLI4-005`

## Epic E. Weight Tuning Certification

### TLI4-013 Build Full Candidate-Pool Tuning Runner

- Priority: P1
- Size: XL
- Goal: served top-3 rerank가 아니라 full candidate-pool 기준의 tuning experiment를 수행한다.
- Scope:
  - v2/replay candidate pool loader
  - temporal CV
  - constrained weight search
  - cluster bootstrap delta CI
- Target files:
  - 신규 `scripts/tli/level4/tune-weights.ts`
  - 신규 `scripts/tli/__tests__/tune-weights.test.ts`
- Acceptance:
  - top-3 rerank 한계 없이 full candidate-pool 실험 가능
  - chosen weights에 CI-backed evidence 존재
  - tuning report 저장
- Dependencies:
  - `TLI4-002`
  - `TLI4-004`

### TLI4-014 Implement Weight Artifact Writer and Serving Version Switch

- Priority: P1
- Size: L
- Goal: weight artifact를 저장하고 serving이 weight version을 읽어 적용하게 만든다.
- Scope:
  - weight artifact persistence
  - serving lookup by weight version
  - promotion dependency on certification-grade weight artifact
- Target files:
  - 신규 `scripts/tli/level4/weight-artifact.ts`
  - `lib/tli/comparison/composite.ts`
  - `scripts/tli/promote-comparison-v4.ts`
- Acceptance:
  - weight change promotion은 certification-grade weight artifact 없이는 실패한다.
  - serving path가 active weight version을 읽는다.
- Dependencies:
  - `TLI4-013`
  - `TLI4-009`

### TLI4-015 End-to-End Level-4 Certification Rehearsal

- Priority: P0
- Size: L
- Goal: 실제 release candidate를 level-4 기준으로 end-to-end 검증한다.
- Scope:
  - calibration artifact
  - probability serving
  - promotion gate
  - drift report
  - rollback drill
- Target files:
  - 신규 `docs/tli-comparison-level4-certification-report.md`
  - 신규 validation script / checklist
- Acceptance:
  - end-to-end certification report 존재
  - rollback drill 증빙 존재
  - level-4 acceptance criteria 충족 여부가 명시된다.
  - user-facing payload의 probability/CI/confidence metadata가 실제 응답에서 검증된다.
  - UI low-confidence badge/copy path가 certification checklist에 포함된다.
- Dependencies:
  - `TLI4-008`
  - `TLI4-012`
  - `TLI4-014`
  - `TLI4-006`
  - `TLI4-007`

## Recommended Execution Sequence

1. `TLI4-001` → `TLI4-004`
2. `TLI4-005` → `TLI4-009`
3. `TLI4-010` → `TLI4-012`
4. `TLI4-013` → `TLI4-014`
5. `TLI4-015`

## Enterprise Gate Before Coding

아래 질문에 모두 yes여야 실행을 시작한다.

1. certification-grade `v2` 또는 replay surface 접근 경로가 확보되었는가?
2. artifact 저장 스키마를 먼저 설계했는가?
3. promotion fail-closed policy를 코드로 검증할 수 있는가?
4. drift baseline maturity 전에는 auto-hold를 observation-only로 둘 것인가?
5. 모든 티켓이 TDD 증빙을 남기도록 작업 로그 정책이 있는가?
