# Comparison v4 Development Tickets

- Source PRD: [comparison-v4-prd.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/comparison-v4-prd.md)
- Date: 2026-03-11
- Status: Proposed backlog

## Delivery Order

1. Epic A: Measurement Freeze
2. Epic B: Shadow Evaluation
3. Epic C: Safe Promotion
4. Epic D: Candidate Experiments

## Epic A. Measurement Freeze

### CMPV4-001 Define Canonical Comparison Spec

- Priority: P0
- Size: M
- Goal: PRD의 canonical metric/rule을 코드 상수로 고정한다.
- Scope:
  - `lib/tli/comparison/spec.ts` 신설
  - endpoint, relevance, gain, tie-break, censoring, threshold regime, split config 정의
  - `scripts/tli/*`, `lib/tli/comparison/*`가 참조 가능한 typed export 제공
- Target files:
  - `lib/tli/comparison/spec.ts`
  - `lib/tli/comparison/*`
  - `scripts/tli/auto-tune.ts`
  - `scripts/tli/evaluate-comparisons.ts`
- Acceptance:
  - PRD 섹션 6, 7, 8 규칙이 코드 상수로 존재
  - magic number가 spec module로 이동
  - 테스트에서 spec 값이 참조됨
- Dependencies: 없음

### CMPV4-002 Create v2 Internal Schema and Policies

- Priority: P0
- Size: XL
- Goal: shadow-safe 내부 테이블과 보안 정책을 추가한다.
- Scope:
  - `theme_comparison_runs_v2`
  - `theme_comparison_candidates_v2`
  - `theme_comparison_eval_v2`
  - `prediction_snapshots_v2`
  - `theme_state_history_v2`
  - `comparison_backfill_manifest_v2`
  - unique index, secondary index, RLS, retention fields 정의
  - partition/TTL/cleanup job 설계
  - legacy cleanup window 조정 마이그레이션
- Target files:
  - `supabase/migrations/*`
  - `lib/tli/types/db.ts`
- Acceptance:
  - raw v2 테이블은 `service_role` only
  - serving reader용 별도 read path를 위한 정책 설계 포함
  - `prediction_snapshots_v2` unique key에 `candidate_pool` 포함
  - `comparison_run_id` FK가 schema에 존재
  - `theme_comparison_runs_v2`에 status/publish metadata 존재
  - `theme_comparison_runs_v2` retention 정책이 존재
  - partition 또는 동등한 sharding/TTL 전략이 migration 산출물에 명시됨
  - legacy `theme_comparisons` cleanup window `21일 -> 90일` 변경 포함
- Dependencies:
  - `CMPV4-001`

### CMPV4-003 Build and Maintain Point-in-Time Theme State History

- Priority: P0
- Size: L
- Goal: replay와 archetype 판정의 source of truth를 만든다.
- Scope:
  - `theme_state_history_v2` backfill 로직
  - ongoing sync/write 로직
  - `unknown` 상태 라벨링 규칙
  - `archetype/peer` point-in-time 판정 유틸
- Target files:
  - `scripts/tli/*`
  - `supabase/migrations/*`
- Acceptance:
  - replay가 현재 `themes.is_active`를 직접 보지 않음
  - `unknown` 상태는 primary archetype pool에서 제외
  - state history backfill 완료 전 승격 차단 로직 존재
  - backfill 이후 신규 상태 변경도 `theme_state_history_v2`에 기록됨
  - historical archetype 판정이 `theme_state_history_v2` 기준으로 수행됨
- Dependencies:
  - `CMPV4-002`

### CMPV4-004 Implement Split, Bootstrap, and Power Analysis Utilities

- Priority: P0
- Size: L
- Goal: statistical gate를 실행 가능한 코드로 만든다.
- Scope:
  - rolling-origin fold generator
  - 14일 embargo split helper
  - current-theme cluster bootstrap
  - paired delta CI
  - power analysis 산출 스크립트
- Target files:
  - `lib/tli/stats/*`
  - `scripts/tli/backtest-*`
  - `docs/comparison-v4-power-analysis.md` 생성 로직
- Acceptance:
  - 3개 이상 fold 생성
  - bootstrap unit이 `current_theme_id`
  - power-analysis 문서 산출 가능
- Dependencies:
  - `CMPV4-001`

## Epic B. Shadow Evaluation

### CMPV4-005 Implement v2 Comparison Writer and Run State Machine

- Priority: P0
- Size: XL
- Goal: legacy 테이블을 건드리지 않고 v2 shadow run을 생성한다.
- Scope:
  - v2 run 생성
  - candidate write
  - expected/materialized count 기록
  - run state transition: `pending -> materializing -> complete -> published|failed|rolled_back`
  - idempotency key 처리
  - publish boundary enforcement
- Target files:
  - `scripts/tli/calculate-comparisons.ts`
  - 신규 v2 writer module
- Acceptance:
  - shadow write는 legacy `theme_comparisons`를 쓰지 않음
  - partial write run은 `published`로 승격 불가
  - retry 시 중복 row 생성 없음
  - `publish_ready = true`와 expected/materialized count 일치 없이는 publish 불가
  - failed/unpublished run은 serving 대상으로 표시되지 않음
- Dependencies:
  - `CMPV4-002`
  - `CMPV4-003`

### CMPV4-005A Implement v2 Prediction Snapshot Writer and Lineage

- Priority: P0
- Size: L
- Goal: v2 comparison run과 연결된 lineage-safe prediction snapshot writer를 만든다.
- Scope:
  - `prediction_snapshots_v2` writer
  - `comparison_run_id` 연결
  - `candidate_pool`, `algorithm_version`, `run_type`, `evaluation_horizon_days` 기록
  - rerun/backfill/shadow idempotency
- Target files:
  - `scripts/tli/snapshot-predictions.ts`
  - 신규 v2 snapshot writer module
  - v2 schema/types
- Acceptance:
  - shadow snapshot write는 legacy `prediction_snapshots`를 쓰지 않음
  - 같은 날짜 same theme rerun 시 lineage-safe upsert가 동작
  - archetype/peer snapshot이 서로 overwrite 하지 않음
  - `comparison_run_id` 없이 v2 snapshot row가 저장되지 않음
- Dependencies:
  - `CMPV4-002`
  - `CMPV4-003`
  - `CMPV4-005`
  - `CMPV4-006`

### CMPV4-006 Persist Legacy-Equivalent Comparison Payload

- Priority: P0
- Size: M
- Goal: v2 candidate row만으로 legacy comparison 응답을 재구성 가능하게 만든다.
- Scope:
  - `current_day`
  - `past_peak_day`
  - `past_total_days`
  - `estimated_days_to_peak`
  - `message`
  - `past_peak_score`
  - `past_final_stage`
  - `past_decline_days`
- Target files:
  - `scripts/tli/calculate-comparisons.ts`
  - v2 schema/types
- Acceptance:
  - v2 candidate만 읽어도 현재 `ComparisonResult` shape를 재구성 가능
  - theme prediction 컴포넌트 입력과 의미가 유지됨
- Dependencies:
  - `CMPV4-002`
  - `CMPV4-005`

### CMPV4-007 Implement Fixed-Horizon Evaluator

- Priority: P0
- Size: XL
- Goal: current proxy evaluator를 v4 fixed-horizon evaluator로 교체한다.
- Scope:
  - `trajectory_corr_h14`
  - `position_stage_match_h14`
  - binary relevance
  - graded gain
  - run-level / candidate-level censoring 분리
  - sensitivity analysis 산출
- Target files:
  - `scripts/tli/evaluate-comparisons.ts` 또는 v2 evaluator
  - `lib/tli/comparison/*`
- Acceptance:
  - latest-stage 비교 제거
  - top-3 미산출/unaligned candidate도 failure 또는 censor audit로 반영
  - `theme_comparison_eval_v2`에 결과 저장
- Dependencies:
  - `CMPV4-001`
  - `CMPV4-003`
  - `CMPV4-005`
  - `CMPV4-006`

### CMPV4-008 Build Historical Replay Engine

- Priority: P0
- Size: XL
- Goal: held-out evidence를 생성하는 replay 엔진을 만든다.
- Scope:
  - point-in-time source reconstruction
  - fold별 train/validation/test 실행
  - checkpoint/restart
  - backfill queue와 shadow queue 분리
- Target files:
  - `scripts/tli/backtest-*`
  - 신규 replay module
- Acceptance:
  - replay는 `run_date` 이후 데이터 미사용
  - 3개 이상 rolling-origin fold 지원
  - 재시도 시 checkpoint에서 재개
- Dependencies:
  - `CMPV4-003`
  - `CMPV4-004`
  - `CMPV4-005`
  - `CMPV4-007`

### CMPV4-009 Implement Baselines and Rollout Report

- Priority: P0
- Size: L
- Goal: baseline과 rollout gate를 자동 계산한다.
- Scope:
  - random
  - sector-only
  - feature-only
  - curve-only
  - current production
  - top-3 without threshold
  - primary endpoint delta / guardrail delta / CI 보고
- Target files:
  - `scripts/tli/backtest-*`
  - report generator
- Acceptance:
  - baseline pass/fail 규칙 자동 계산
  - `comparison-v4-power-analysis.md` 존재 확인 없으면 실패
  - rollout report에 fold 평균과 분산 포함
- Dependencies:
  - `CMPV4-004`
  - `CMPV4-008`

### CMPV4-010 Backfill Manifest and Parity Validation

- Priority: P1
- Size: L
- Goal: legacy -> v2 전환의 근거를 남긴다.
- Scope:
  - `comparison_backfill_manifest_v2`
  - row-count parity
  - sample contract parity
  - null/default mapping matrix
  - rollback 근거 기록
- Target files:
  - 신규 backfill script
  - manifest validator
- Acceptance:
  - manifest에 source/target count 저장
  - row-count parity pass/fail 기준이 명시됨
  - sample contract parity는 deterministic sample `max(100 rows, total의 5%)` 기준으로 수행
  - null/default mapping 결과가 저장됨
  - promotion prerequisite에서 manifest pass 확인
- Dependencies:
  - `CMPV4-002`
  - `CMPV4-006`
  - `CMPV4-005A`

## Epic C. Safe Promotion

### CMPV4-011 Build Serving Reader and Feature Flag Routing

- Priority: P0
- Size: L
- Goal: shadow/prod version을 안전하게 읽는 serving reader를 만든다.
- Scope:
  - serving view 또는 reader module
  - `published` + `publish_ready` filtering
  - feature flag routing
  - `production_version` pointer 정의
  - serving reader RLS/migration
- Target files:
  - `supabase/migrations/*`
  - `app/api/tli/themes/[id]/fetch-theme-data.ts`
  - serving query module
  - config/feature flag wiring
- Acceptance:
  - partial/failed/unpublished run은 노출되지 않음
  - `v_current` / `v_candidate` 전환 가능
  - rollback이 flag flip으로 가능
  - serving view/materialized reader가 생성됨
  - anon read는 serving reader만 가능하고 raw v2 table은 직접 read 불가
- Dependencies:
  - `CMPV4-005`
  - `CMPV4-006`
  - `CMPV4-005A`
  - `CMPV4-010`

### CMPV4-012 Update API, OpenAPI, Types, and E2E Contracts

- Priority: P0
- Size: M
- Goal: cutover에 필요한 계약 변경을 한 번에 묶는다.
- Scope:
  - db types
  - api types
  - OpenAPI schema
  - theme detail API builder
  - e2e fixtures/tests
- Target files:
  - `lib/tli/types/db.ts`
  - `lib/tli/types/api.ts`
  - `app/api/openapi.json/route.ts`
  - `app/api/tli/themes/[id]/build-comparisons.ts`
  - `app/api/tli/themes/[id]/fetch-theme-data.ts`
  - `e2e/tli-themes.spec.ts`
- Acceptance:
  - old response shape 유지
  - v2 reader 결과로 comparison list와 theme prediction이 모두 동작
  - contract parity e2e 통과
- Dependencies:
  - `CMPV4-011`

### CMPV4-013 Observability, Alerting, and Rollback Runbook

- Priority: P0
- Size: M
- Goal: production-safe migration에 필요한 관측성과 운영 절차를 만든다.
- Scope:
  - required dashboards
  - required alerts
  - owner 지정
  - notification channel 연결
  - rollback runbook 문서화
- Target files:
  - `docs/`
  - monitoring config
  - alert config
- Acceptance:
  - dashboard 목록과 owner가 문서/설정에 존재
  - PRD 기준 alert threshold가 config에 반영됨
  - notification channel과 primary/secondary owner가 확인 가능
  - rollback runbook 문서가 존재하고 drill evidence가 남음
- Dependencies:
  - `CMPV4-009`
  - `CMPV4-011`

### CMPV4-014 Operational Validation Suite

- Priority: P1
- Size: L
- Goal: 운영 실패 경로를 테스트로 덮는다.
- Scope:
  - replay idempotency
  - rollback drill
  - retention cleanup correctness
  - partial publish exclusion
  - contract parity e2e
- Target files:
  - `scripts/tli/__tests__/*`
  - `e2e/*`
- Acceptance:
  - acceptance criterion 17을 자동 검증할 수 있음
- Dependencies:
  - `CMPV4-010`
  - `CMPV4-011`
  - `CMPV4-012`
  - `CMPV4-013`

## Epic D. Candidate Experiments

### CMPV4-015 Core v3 Imports

- Priority: P1
- Size: M
- Goal: v3에서 이미 채택된 low-risk 개선을 frozen stack 위에서 반영한다.
- Scope:
  - skip rate / skip reasons audit
  - historical stage alignment
  - resample cache length guard
  - threshold stability by regime
  - daily drift monitoring
- Acceptance:
  - core adopted 아이템이 v2 stack 위에서 동작
- Dependencies:
  - `CMPV4-007`
  - `CMPV4-008`

### CMPV4-016 Experimental Queue A

- Priority: P2
- Size: L
- Goal: measurement freeze 이후 실험 후보를 하나씩 평가한다.
- Scope:
  - curve scale unification
  - sigmoid weight smoothing
  - sector affinity matrix
- Acceptance:
  - 각 실험은 isolated version으로만 수행
  - held-out report 없이 prod 승격 금지
- Dependencies:
  - `CMPV4-009`

### CMPV4-017 Experimental Queue B

- Priority: P2
- Size: L
- Goal: 데이터/특성 실험 후보를 검증한다.
- Scope:
  - inactive-theme news snapshot normalization
  - VIF diagnostic and conditional feature merge
  - N<15 Mutual Rank explicit fallback
- Acceptance:
  - `N<15` fallback은 `0`이 아닌 explicit fallback semantics 사용
  - sector/feature enum과 실제 코드 체계 일치
- Dependencies:
  - `CMPV4-009`

## Blockers

- `CMPV4-002`, `CMPV4-003`, `CMPV4-004`가 끝나기 전에는 meaningful replay가 불가능하다.
- `CMPV4-005` 없이는 shadow run 생성이 불가능하다.
- `CMPV4-005A` 없이는 v2 snapshot lineage 보장이 불가능하다.
- `CMPV4-006` 없이는 v2 reader cutover가 불가능하다.
- `CMPV4-013` 없이는 promotion 진행 금지다.

## Suggested Sprint Cut

### Sprint 1

- `CMPV4-001`
- `CMPV4-002`
- `CMPV4-003`

### Sprint 2

- `CMPV4-004`
- `CMPV4-005`
- `CMPV4-006`
- `CMPV4-005A`
- `CMPV4-007`

### Sprint 3

- `CMPV4-008`
- `CMPV4-009`
- `CMPV4-010`

### Sprint 4

- `CMPV4-011`
- `CMPV4-012`
- `CMPV4-013`
- `CMPV4-014`

### Later

- `CMPV4-015`
- `CMPV4-016`
- `CMPV4-017`
