# TLI Theme Cycle Analog Retrieval Enterprise Development Tickets

- Source PRD: [tli-theme-cycle-analog-retrieval-enterprise-prd.md](/Users/isaac/projects/stock-ai-newsletter/docs/tli-theme-cycle-analog-retrieval-enterprise-prd.md)
- Canonical PRD mirror: [prd-tli-theme-cycle-analog-retrieval.md](/Users/isaac/.openclaw/workspace/.omx/plans/prd-tli-theme-cycle-analog-retrieval.md)
- Date: 2026-03-12
- Status: Proposed enterprise backlog

## Delivery Order

1. Epic A: Phase 0 Bridge and Policy Freeze
2. Epic B: Episode Registry and Point-in-Time Data Plane
3. Epic C: Baseline Analog Retrieval and Evidence
4. Epic D: Future-Aligned Retrieval
5. Epic E: Probabilistic Forecasting and Calibration
6. Epic F: Serving, Cutover, and Rollout Governance

## Global Execution Rule: Mandatory TDD

이 문서의 모든 `TCAR-*` 티켓은 예외 없이 TDD로만 진행한다.

중요:

- **TDD가 아닌 구현은 무효다.**
- failing test 또는 failing validator 없이 시작한 티켓은 `In Progress`로 인정하지 않는다.
- GREEN 증빙 없이 끝낸 티켓은 `Done`으로 인정하지 않고 재오픈한다.

핵심 규칙:

1. **NO PRODUCTION CODE WITHOUT A FAILING TEST OR VALIDATOR FIRST**
2. 각 티켓은 `RED -> GREEN -> REFACTOR` 순서를 반드시 따른다.
3. migration/ops 티켓도 dry-run validator, parity check, rollback drill, audit validator 중 하나를 먼저 만든다.
4. failing test 또는 failing validator 없이 작성된 production code는 완료로 인정하지 않는다.
5. policy/gate 변경은 테스트와 문서 version bump 없이 반영할 수 없다.

각 티켓 공통 완료 조건:

- 관련 failing test 또는 failing validator가 먼저 존재한다.
- 최소 한 번의 RED 증빙이 있다.
- 구현 후 GREEN 증빙이 있다.
- 관련 회귀 테스트가 green이다.
- 산출물이 필요한 티켓은 실제 artifact/report가 생성된다.

각 티켓 공통 금지 사항:

- point-in-time leakage를 silent fallback으로 덮는 것
- inferred boundary를 observed boundary처럼 승격 표본에 섞는 것
- aggregate metric만으로 ship/promotion을 승인하는 것
- fail-open serving path를 남기는 것
- threshold를 문서/테스트 없이 임의 조정하는 것

## Enterprise Definition of Done

아래 조건이 모두 만족되어야 enterprise rollout candidate로 간주한다.

1. `Phase 0 Bridge` parity, cutover, rollback contract가 코드와 artifact로 존재한다.
2. `episode/query/label` data plane이 point-in-time reconstruction 기준을 충족한다.
3. executable label policy와 audit validators가 green이다.
4. baseline analog retrieval과 future-aligned retrieval의 evidence surface가 존재한다.
5. forecast + calibration + abstention path가 numeric gate를 통과한다.
6. serving cutover는 `forecast_control_v1`과 rollback drill evidence를 갖는다.

## Epic A. Phase 0 Bridge and Policy Freeze

### TCAR-001 Define Canonical Enterprise Contracts and Policy Versions

- Priority: P0
- Size: M
- Goal: enterprise PRD의 artifact/policy/gate vocabulary를 타입과 상수로 고정한다.
- Scope:
  - artifact contract types
  - `boundary_source` enum
  - policy version fields
  - gate threshold constants
  - bridge contract types
- Target files:
  - 신규 `lib/tli/analog/types.ts`
  - 신규 `lib/tli/forecast/types.ts`
  - `lib/tli/types/db.ts`
  - `lib/tli/comparison/level4-types.ts`
- Acceptance:
  - PRD의 `episode_registry_v1`, `query_snapshot_v1`, `label_table_v1`, `analog_candidates_v1`, `analog_evidence_v1`, `forecast_control_v1`가 타입 수준에서 정의된다.
  - `theme_definition_version`, `episode_policy_version`, `label_policy_version`, `retrieval_spec_version`, `forecast_version`가 필수 필드로 존재한다.
  - gate 상수는 spec module에서만 관리된다.
- Dependencies: 없음

### TCAR-002 Add Phase 0 Bridge Schema and Control Tables

- Priority: P0
- Size: XL
- Goal: bridge parity/cutover/rollback 판단을 저장할 schema와 control plane을 추가한다.
- Scope:
  - `episode_registry_v1`
  - `query_snapshot_v1`
  - `label_table_v1`
  - `analog_candidates_v1`
  - `analog_evidence_v1`
  - `forecast_control_v1`
  - `bridge_run_audits_v1`
  - indexes, retention fields, service-role policies
- Target files:
  - `supabase/migrations/*`
  - `lib/tli/types/db.ts`
  - 신규 `scripts/tli/forecast-control.ts`
- Acceptance:
  - 모든 새 artifact table과 control table이 migration에 존재한다.
  - raw tables는 service-role only로 제한된다.
  - bridge audit row가 parity, cutover, rollback verdict를 기록할 수 있다.
- Dependencies:
  - `TCAR-001`

### TCAR-003 Implement Bridge Parity Harness

- Priority: P0
- Size: L
- Goal: legacy artifact와 새 artifact 간 parity를 검증할 framework와 row-level validator를 먼저 구축한다.
- Scope:
  - active-theme coverage diff 계산
  - overlapping episode validator
  - point-in-time snapshot reconstruction validator
  - dual-write completeness validator
  - audit trail completeness validator
- Target files:
  - 신규 `scripts/tli/run-phase0-bridge.ts`
  - 신규 `scripts/tli/phase0-bridge.ts`
  - 신규 `scripts/tli/__tests__/phase0-bridge.test.ts`
  - `scripts/tli/comparison-v4-manifest.ts`
- Acceptance:
  - PRD의 4개 bridge row에 대응하는 validator interface와 artifact schema가 존재한다.
  - producer artifact가 아직 없는 row는 `pending_not_materialized`로 명시된다.
  - validator framework는 final bridge verdict ticket에서 그대로 재사용된다.
- Dependencies:
  - `TCAR-002`

### TCAR-004 Implement Rollback Drill and Fail-Closed Verification

- Priority: P0
- Size: L
- Goal: forecast cutover 이전 rollback과 fail-closed 정책을 자동 검증한다.
- Scope:
  - rollback drill runner
  - fail-open detector
  - `forecast_control_v1` write path
  - cutover eligibility evaluator
- Target files:
  - 신규 `scripts/tli/forecast-control.ts`
  - 신규 `scripts/tli/__tests__/forecast-control.test.ts`
  - `scripts/tli/comparison-v4-control.ts`
  - `scripts/tli/comparison-v4-cutover.ts`
- Acceptance:
  - rollback drill 성공/실패가 control artifact로 남는다.
  - fail-open detection 시 cutover-ready가 false가 된다.
  - serving cutover는 rollback drill 2회 성공 없이는 통과하지 못한다.
- Dependencies:
  - `TCAR-002`

### TCAR-003A Run Full Phase 0 Bridge Certification

- Priority: P0
- Size: L
- Goal: materialized producer artifacts를 기준으로 PRD의 4개 bridge row를 실제로 검증하고 cutover-ready verdict를 생성한다.
- Scope:
  - full bridge parity execution
  - weekly bridge verdict artifact
  - cutover-ready evaluator
  - failure-to-rollback trigger mapping
- Target files:
  - `scripts/tli/run-phase0-bridge.ts`
  - `scripts/tli/phase0-bridge.ts`
  - 신규 `scripts/tli/__tests__/phase0-bridge-certification.test.ts`
  - `scripts/tli/forecast-control.ts`
- Acceptance:
  - `themes + theme_state_history_v2 -> episode_registry_v1`, `lifecycle_scores + snapshots -> query_snapshot_v1 + label_table_v1`, `theme_comparisons -> analog_candidates_v1 + analog_evidence_v1`, `comparison control/promote path -> forecast_control_v1`의 4개 bridge row가 모두 실행된다.
  - 각 row는 PRD의 parity, cutover, rollback 기준을 그대로 사용해 `pass/fail/pending` verdict를 남긴다.
  - full bridge certification 없이는 `cutover_ready=true`를 기록할 수 없다.
- Dependencies:
  - `TCAR-003`
  - `TCAR-004`
  - `TCAR-006`
  - `TCAR-007`
  - `TCAR-010`

### TCAR-005 Freeze Executable Label Policy and Audit Validators

- Priority: P0
- Size: L
- Goal: label policy를 구현 가능한 규칙과 audit test로 내린다.
- Scope:
  - episode start/end rules
  - inferred boundary policy
  - primary peak rule
  - multi-peak and reignition handling
  - audit test suite
- Target files:
  - 신규 `lib/tli/episode-policy.ts`
  - 신규 `lib/tli/__tests__/episode-policy.test.ts`
  - `scripts/tli/theme-state-history.ts`
  - `scripts/tli/first-spike-date.ts`
- Acceptance:
  - `boundary_source`별 처리 규칙이 코드에 존재한다.
  - inferred episode end는 `notSeenDays >= 30` and recent `14` days lifecycle score `< 15` 규칙으로만 생성된다.
  - dormant gap `>= 14`일 후 재활성화는 새 episode로 처리되고, later local max가 episode max의 `5%` 이내이며 dormant gap `< 14`일이면 `multi_peak=true`로 유지된다.
  - inferred-boundary rows `<= 15%` overall, `<= 10%` in any priority slice 검사가 자동화된다.
  - overlapping episodes `= 0`, future-informed boundary change `= 0`, right-censored used as completed negatives `= 0` 검사가 자동화된다.
  - policy 변경 시 version bump가 강제된다.
- Dependencies:
  - `TCAR-001`

## Epic B. Episode Registry and Point-in-Time Data Plane

### TCAR-006 Build Episode Registry from Theme Lifecycle History

- Priority: P0
- Size: XL
- Goal: 현재 `theme_state_history_v2`와 lifecycle signals를 episode registry로 변환한다.
- Scope:
  - active/inactive transition -> episode boundary mapping
  - reactivation -> new episode mapping
  - `multi_peak` flag 계산
  - registry persistence
- Target files:
  - 신규 `scripts/tli/build-episode-registry.ts`
  - 신규 `scripts/tli/__tests__/build-episode-registry.test.ts`
  - `scripts/tli/theme-lifecycle.ts`
  - `scripts/tli/theme-state-history.ts`
- Acceptance:
  - `theme lifecycle transition -> episode boundary`가 deterministic하게 동작한다.
  - dormant gap `>= 14`일 후 재활성화는 새 episode가 된다.
  - overlapping episode rows는 생성되지 않는다.
- Dependencies:
  - `TCAR-002`
  - `TCAR-005`

### TCAR-007 Build Query Snapshot and Label Tables

- Priority: P0
- Size: XL
- Goal: point-in-time reconstruction 가능한 query snapshot과 label table을 생성한다.
- Scope:
  - query-time feature snapshot builder
  - point-in-time source cutoff tracking
  - label row generation
  - missing snapshot classification
- Target files:
  - 신규 `scripts/tli/build-query-snapshots.ts`
  - 신규 `scripts/tli/build-label-table.ts`
  - 신규 `scripts/tli/__tests__/build-query-snapshots.test.ts`
  - `scripts/tli/calculate-comparisons.ts`
  - `scripts/tli/backtest-comparisons.ts`
- Acceptance:
  - reconstruction success `>= 99%`를 측정하는 validator가 존재한다.
  - missing point-in-time snapshot은 explicit reason으로 기록된다.
  - `query_snapshot_v1`과 `label_table_v1`은 source cutoff metadata를 저장한다.
- Dependencies:
  - `TCAR-002`
  - `TCAR-005`
  - `TCAR-006`

### TCAR-008 Isolate Inferred-Boundary Rows and Promotion Eligibility

- Priority: P0
- Size: M
- Goal: inferred row가 primary promotion metrics를 오염시키지 않도록 격리한다.
- Scope:
  - inferred row tagging
  - promotion eligibility filter
  - separate audit-pass path
- Target files:
  - 신규 `lib/tli/promotion-eligibility.ts`
  - 신규 `lib/tli/__tests__/promotion-eligibility.test.ts`
  - `scripts/tli/build-label-table.ts`
  - `scripts/tli/comparison-v4-promotion.ts`
- Acceptance:
  - `inferred-v1` row는 기본적으로 primary promotion metrics에서 제외된다.
  - 별도 audit pass 없이는 ship gate 입력으로 쓸 수 없다.
  - eligibility 이유가 artifact로 기록된다.
- Dependencies:
  - `TCAR-005`
  - `TCAR-007`

## Epic C. Baseline Analog Retrieval and Evidence

### TCAR-009 Implement Baseline Candidate Retrieval Pack

- Priority: P0
- Size: L
- Goal: baseline analog retrieval을 세 가지 표면으로 구현한다.
- Scope:
  - normalized price-volume kNN
  - DTW baseline
  - regime-filtered nearest neighbor
  - candidate generation API
- Target files:
  - 신규 `lib/tli/analog/baselines.ts`
  - 신규 `lib/tli/__tests__/analog-baselines.test.ts`
  - `lib/tli/comparison/dtw.ts`
  - `lib/tli/comparison/features.ts`
  - `scripts/tli/calculate-comparisons.ts`
- Acceptance:
  - top-N candidate generator가 baseline 3종을 지원한다.
  - retrieval corpus는 query 시점 이전 observable episode만 사용한다.
  - candidate generation이 deterministic하다.
- Dependencies:
  - `TCAR-006`
  - `TCAR-007`

### TCAR-010 Build Analog Evidence Artifact Writer

- Priority: P0
- Size: M
- Goal: forecast와 리뷰에 필요한 analog evidence package를 artifact로 저장한다.
- Scope:
  - top-5 analog persistence
  - retrieval reason persistence
  - mismatch summary fields
  - evidence quality flag
- Target files:
  - 신규 `scripts/tli/analog-evidence.ts`
  - 신규 `scripts/tli/__tests__/analog-evidence.test.ts`
  - `scripts/tli/comparison-v4-eval-writer.ts`
  - `app/api/tli/themes/[id]/comparison-v4-reader.ts`
- Acceptance:
  - 모든 analog result는 evidence package와 함께 저장된다.
  - serving path가 artifact-only evidence를 읽을 수 있다.
  - evidence quality flag가 null 없이 채워진다.
- Dependencies:
  - `TCAR-002`
  - `TCAR-009`

### TCAR-011 Extend Replay Harness for Episode-Aware Retrieval Evaluation

- Priority: P0
- Size: L
- Goal: replay_holdout에서 episode-aware retrieval metric을 계산한다.
- Scope:
  - `FuturePathCorr@K`
  - `PeakHit@K`
  - `PeakGap@K`
  - slice-wise evaluation
  - block bootstrap lower bound
- Target files:
  - 신규 `scripts/tli/evaluate-analog-retrieval.ts`
  - 신규 `scripts/tli/__tests__/evaluate-analog-retrieval.test.ts`
  - `lib/tli/stats/comparison-stats.ts`
  - `scripts/tli/comparison-v4-backtest.ts`
- Acceptance:
  - retrieval metric report가 replay_holdout 기준으로 생성된다.
  - lower bound가 weekly cohort block bootstrap 기준으로 계산된다.
  - priority slice별 minimum N 부족 시 explicit insufficient-data verdict를 낸다.
- Dependencies:
  - `TCAR-007`
  - `TCAR-009`
  - `TCAR-010`

## Epic D. Future-Aligned Retrieval

### TCAR-012 Build Future-Aligned Training Dataset and Targets

- Priority: P0
- Size: XL
- Goal: future-aligned retrieval 학습용 pairwise/contrastive dataset을 만든다.
- Scope:
  - positive/negative pair generation
  - future-path-aligned target definition
  - slice metadata attachment
  - dataset lineage persistence
- Target files:
  - 신규 `scripts/tli/build-future-aligned-dataset.ts`
  - 신규 `scripts/tli/__tests__/build-future-aligned-dataset.test.ts`
  - 신규 `lib/tli/analog/targets.ts`
- Acceptance:
  - dataset row는 query snapshot, candidate episode, future alignment label을 모두 가진다.
  - right-censored row 처리 정책이 explicit하다.
  - dataset lineage artifact가 저장된다.
- Dependencies:
  - `TCAR-007`
  - `TCAR-008`
  - `TCAR-011`

### TCAR-013 Implement Future-Aligned Reranker

- Priority: P0
- Size: XL
- Goal: baseline candidates를 미래 정렬 목표로 재랭킹한다.
- Scope:
  - reranker training/inference module
  - numeric + context feature fusion
  - artifact-backed model versioning
  - rerank output persistence
- Target files:
  - 신규 `lib/tli/analog/reranker.ts`
  - 신규 `lib/tli/__tests__/analog-reranker.test.ts`
  - `scripts/tli/build-future-aligned-dataset.ts`
  - `scripts/tli/calculate-comparisons.ts`
- Acceptance:
  - reranker output이 baseline candidate order와 구분된다.
  - model version이 artifact metadata로 기록된다.
  - inference path는 query-time observable features만 사용한다.
- Dependencies:
  - `TCAR-012`

### TCAR-014 Implement Retrieval Gate and Slice Audit Pack

- Priority: P0
- Size: L
- Goal: retrieval gate를 enterprise ship 기준으로 코드화한다.
- Scope:
  - lower-bound evaluator
  - priority slice minimum N check
  - regression detector
  - retrieval gate artifact
- Target files:
  - 신규 `scripts/tli/retrieval-gate.ts`
  - 신규 `scripts/tli/__tests__/retrieval-gate.test.ts`
  - `scripts/tli/comparison-v4-promotion.ts`
  - `scripts/tli/run-level4-certification.ts`
- Acceptance:
  - priority slice minimum sample contract `>= 300 eval rows OR >= 50 completed episodes`가 코드로 검증된다.
  - `delta FuturePathCorr@5 >= +0.02` lower bound, `delta PeakHit@5 >= +0.03` lower bound, `PeakGap@5 >= 5%` improvement가 코드로 검증된다.
  - priority slice regression `< -0.01`이면 fail한다.
  - Stage 2 gate fail 시 Stage 3 학습이 차단된다.
- Dependencies:
  - `TCAR-003A`
  - `TCAR-011`
  - `TCAR-013`

## Epic E. Probabilistic Forecasting and Calibration

### TCAR-015 Build Retrieval-Conditioned Forecast Head

- Priority: P0
- Size: XL
- Goal: retrieved analog를 조건으로 horizon/event-time forecast를 생성한다.
- Scope:
  - analog-weighted baseline forecaster
  - event-time / survival head
  - `peak<=5/10/20d` outputs
  - post-peak risk head
- Target files:
  - 신규 `lib/tli/forecast/model.ts`
  - 신규 `lib/tli/forecast/survival.ts`
  - 신규 `lib/tli/__tests__/forecast-model.test.ts`
  - `lib/tli/prediction.ts`
- Acceptance:
  - forecast head가 primary outputs를 모두 생성한다.
  - right-censored subset 처리 정책이 explicit하다.
  - Stage 2 gate artifact 없이 학습/추론이 실행되지 않는다.
- Dependencies:
  - `TCAR-014`

### TCAR-016 Implement Calibration, Abstention, and Evidence-Quality Scoring

- Priority: P0
- Size: L
- Goal: forecast probabilities를 calibration하고 low-evidence abstention을 강제한다.
- Scope:
  - calibration fitter
  - global and slice ECE computation
  - evidence-quality score
  - abstention policy
- Target files:
  - 신규 `lib/tli/forecast/calibration.ts`
  - 신규 `lib/tli/forecast/evidence-quality.ts`
  - 신규 `lib/tli/__tests__/forecast-calibration.test.ts`
  - `lib/tli/confidence-calibration.ts`
  - `scripts/tli/calibrate-confidence.ts`
- Acceptance:
  - global `ECE <= 0.05`와 worst priority slice `ECE <= 0.08` 검증이 가능하다.
  - confident prediction은 `analog_support >= 5`, `candidate concentration Gini <= 0.60`, `top-1 analog weight <= 0.35`를 모두 만족할 때만 허용된다.
  - abstention verdict와 evidence quality score가 artifact로 남는다.
- Dependencies:
  - `TCAR-010`
  - `TCAR-015`

### TCAR-017 Implement Forecast Ship Gate and Shadow Evaluator

- Priority: P0
- Size: L
- Goal: forecast ship gate를 shadow 환경에서 검증한다.
- Scope:
  - `IBS` evaluator
  - `Brier@5/10/20` evaluator
  - global + slice live-query floor checker
  - worst-slice calibration verifier
  - confidence-gating verifier
  - ship verdict artifact
- Target files:
  - 신규 `scripts/tli/evaluate-forecast-shadow.ts`
  - 신규 `scripts/tli/forecast-ship-gate.ts`
  - 신규 `scripts/tli/__tests__/forecast-ship-gate.test.ts`
  - `scripts/tli/evaluate-predictions.ts`
- Acceptance:
  - prospective shadow `>= 6 weeks`, live queries `>= 400`, priority slice `>= 50` live queries를 검증한다.
  - `IBS >= 5%` relative improvement와 `Brier@5/10/20` 중 2개 이상 `>= 3%` 개선 여부가 artifact로 남는다.
  - global `ECE <= 0.05`와 worst priority slice `ECE <= 0.08`가 ship verdict에 포함된다.
  - confident prediction gating (`analog_support >= 5`, `candidate concentration Gini <= 0.60`, `top-1 analog weight <= 0.35`) 충족 여부가 ship artifact에 포함된다.
  - ship gate fail 시 ship artifact는 `cutover_recommended=false`를 명시한다.
- Dependencies:
  - `TCAR-003A`
  - `TCAR-016`

## Epic F. Serving, Cutover, and Rollout Governance

### TCAR-018 Implement Forecast Control Plane and Fail-Closed Serving Reader

- Priority: P0
- Size: L
- Goal: serving이 `forecast_control_v1`과 artifact-backed verdict만 읽도록 만든다.
- Scope:
  - control row reader
  - ship-verdict-to-control-plane writer
  - fail-closed serving policy
  - version pinning
  - rollback target loading
- Target files:
  - 신규 `app/api/tli/themes/[id]/forecast-reader.ts`
  - `app/api/tli/themes/[id]/comparison-v4-reader.ts`
  - `app/api/tli/themes/[id]/build-comparisons.ts`
  - `scripts/tli/forecast-control.ts`
- Acceptance:
  - ship verdict artifact가 `forecast_control_v1.cutover_ready=true|false`로 반영되는 explicit writer가 존재한다.
  - cutover-ready가 false면 forecast serving이 열리지 않는다.
  - serving path는 artifact-backed version만 반환한다.
  - rollback target이 없으면 fail-open 대신 fail-closed 된다.
- Dependencies:
  - `TCAR-004`
  - `TCAR-003A`
  - `TCAR-017`

### TCAR-019 Extend API Payloads and Analyst-Facing UI

- Priority: P1
- Size: L
- Goal: probability, uncertainty, analog evidence를 사용자-facing payload와 UI로 노출한다.
- Scope:
  - API response extension
  - prediction card
  - analog evidence card
  - abstention / low-evidence badge
- Target files:
  - `app/api/tli/themes/[id]/build-response.ts`
  - `lib/tli/types/api.ts`
  - `app/themes/[id]/_components/theme-prediction/*`
  - `app/themes/[id]/_components/comparison-list/*`
- Acceptance:
  - payload에 probability, uncertainty, analog evidence metadata가 포함된다.
  - low-evidence case는 confident wording을 금지한다.
  - UI tests 또는 snapshot tests가 존재한다.
- Dependencies:
  - `TCAR-016`
  - `TCAR-018`

### TCAR-020 Create Runbooks, Rollout Memo, and Enterprise Certification Pack

- Priority: P1
- Size: M
- Goal: 운영팀이 cutover를 반복 가능하게 수행할 문서와 evidence pack을 만든다.
- Scope:
  - Phase 0 runbook
  - rollback drill template
  - retrieval gate report template
  - forecast ship memo template
- Target files:
  - 신규 `docs/tli-theme-cycle-analog-retrieval-runbook.md`
  - 신규 `docs/tli-theme-cycle-analog-retrieval-certification.md`
  - `.omx/scientist/reports/`
- Acceptance:
  - cutover/rollback 절차가 문서화된다.
  - ship approval memo가 numeric gate 기준을 그대로 인용한다.
  - enterprise certification pack이 재생성 가능하다.
- Dependencies:
  - `TCAR-017`
  - `TCAR-018`
  - `TCAR-019`

## Recommended Order

1. `TCAR-001`
2. `TCAR-005`
3. `TCAR-002`
4. `TCAR-003`
5. `TCAR-004`
6. `TCAR-006`
7. `TCAR-007`
8. `TCAR-008`
9. `TCAR-009`
10. `TCAR-010`
11. `TCAR-003A`
12. `TCAR-011`
13. `TCAR-012`
14. `TCAR-013`
15. `TCAR-014`
16. `TCAR-015`
17. `TCAR-016`
18. `TCAR-017`
19. `TCAR-018`
20. `TCAR-019`
21. `TCAR-020`

## Current Execution Choice

이 문서 작성 시점 기준으로 바로 구현을 시작하는 첫 티켓은 `TCAR-001`이다.

정답은 아래 순서다.

1. `TCAR-001`로 contract와 version vocabulary를 먼저 고정한다.
2. 바로 `TCAR-005`로 label policy를 executable spec으로 고정한다.
3. 그 다음 `TCAR-002`와 `TCAR-003`으로 bridge와 data plane을 연다.

즉 첫 실제 실행 묶음은 `TCAR-001`, `TCAR-005`, `TCAR-002`, `TCAR-003`이다.
