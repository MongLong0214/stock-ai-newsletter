# PRD: Theme Comparison Cycle v4

- Status: Proposed
- Date: 2026-03-11
- Owner: Codex
- Canonical: This document supersedes `docs/comparison-v3-prd.md` and earlier draft PRDs for comparison-cycle redesign.
- Scope: TLI theme comparison retrieval, evaluation, calibration, rollout, and serving contract

## 1. Executive Summary

현재 comparison cycle의 핵심 문제는 수식 자체보다 `계산`, `검증`, `튜닝`, `리포트`, `API 서빙`이 같은 대상과 같은 버전을 보고 있지 않다는 점이다.

v4의 목표는 알고리즘 실험을 늘리는 것이 아니라 아래 4가지를 먼저 고정하는 것이다.

1. 어떤 comparison run이 무엇을 의미하는지 명시한다.
2. 무엇을 정답으로 보고 평가할지 명시한다.
3. shadow mode와 cutover가 현재 프로덕션 계약을 깨지 않도록 설계한다.
4. threshold와 품질 개선 주장을 held-out evidence로만 하게 만든다.

이 문서는 production-safe migration과 scientific evaluation을 우선으로 하고, 알고리즘 개선 아이디어는 `측정 체계가 고정된 뒤의 후보 실험`으로 다룬다.

## 2. Why v4 Exists

다음 리스크가 현재 상태에서 확인되었다.

- `theme_comparisons`와 `prediction_snapshots`는 현재 unique key와 upsert 정책상 same-day dual-write shadow mode를 허용하지 않는다.
- 현재 comparison 평가는 fixed-horizon retrieval 평가가 아니라 convenience sample 기반 proxy 평가에 가깝다.
- 현재 tuning은 surfaced 된 일부 검증 row에 조건부로 맞춰질 수 있다.
- 현재 사용자-facing API는 `theme_comparisons` flat 배열을 comparison list와 prediction 근거로 동시에 사용한다.
- 기존 `docs/comparison-v3-prd.md`는 유용한 개선 아이디어를 많이 담고 있지만, production migration과 metric 정의가 충분히 닫혀 있지 않다.

근거 코드:

- [calculate-comparisons.ts](/Users/isaac/WebstormProjects/stock-ai-newsletter/scripts/tli/calculate-comparisons.ts#L181)
- [evaluate-comparisons.ts](/Users/isaac/WebstormProjects/stock-ai-newsletter/scripts/tli/evaluate-comparisons.ts#L17)
- [auto-tune.ts](/Users/isaac/WebstormProjects/stock-ai-newsletter/scripts/tli/auto-tune.ts#L80)
- [snapshot-predictions.ts](/Users/isaac/WebstormProjects/stock-ai-newsletter/scripts/tli/snapshot-predictions.ts#L132)
- [fetch-theme-data.ts](/Users/isaac/WebstormProjects/stock-ai-newsletter/app/api/tli/themes/[id]/fetch-theme-data.ts#L101)
- [003_create_tli_tables.sql](/Users/isaac/WebstormProjects/stock-ai-newsletter/supabase/migrations/003_create_tli_tables.sql#L232)
- [007_create_prediction_snapshots.sql](/Users/isaac/WebstormProjects/stock-ai-newsletter/supabase/migrations/007_create_prediction_snapshots.sql#L2)

## 3. Product Decision

comparison cycle의 1차 목적은 `현재 활성 테마에 대해 예측 가능한 lifecycle analogue를 retrieval`하는 것이다.

이 문서에서 고정하는 product decision은 다음과 같다.

1. primary retrieval pool은 `archetype`이다.
   - 정의: run 시점 이전에 lifecycle이 종료된 과거 테마
2. `peer` pool은 secondary 탐색용이다.
   - UI 카드/비교 탐색용으로는 허용
   - threshold calibration과 prediction primary input에는 포함하지 않음
3. 사용자-facing API 계약은 shadow 단계에서 유지한다.
4. prediction utility는 중요한 guardrail이지만, v4의 primary scientific claim은 `retrieval quality`다.

## 4. Primary Scientific Claim

v4의 primary scientific claim은 하나만 둔다.

`Held-out fixed-horizon cohort에서 v_candidate의 phase-aligned archetype retrieval quality가 v_current 대비 비열등 이상이다.`

여기서:

- primary endpoint: `Phase-Aligned Precision@3`
- secondary efficacy metrics: `MRR@3`, `NDCG@3`, mean trajectory correlation
- operational guardrails: prediction availability, prediction phase accuracy, coverage, concentration/Gini, censoring rate

이 문서는 다중 주장을 동시에 증명하려 하지 않는다.

## 5. Non-Goals

1. lifecycle score 전체 알고리즘 재설계
2. prediction engine 전체 재설계
3. UI 대규모 개편
4. 외부 유료 데이터 소스 도입
5. 모든 v3 아이디어의 즉시 구현

## 6. Canonical Definitions

### 6.1 Run Unit

하나의 `comparison run`은 아래를 뜻한다.

- `run_date`
- `current_theme_id`
- `algorithm_version`
- `run_type`
- `candidate_pool`

하나의 run은 한 활성 테마에 대해 특정 날짜 기준으로 생성된 전체 candidate scoring 결과다.

### 6.2 Run Types

- `prod`: 현재 사용자-facing 결과를 만드는 공식 run
- `shadow`: 사용자-facing으로 노출되지 않는 실험 run
- `backtest`: historical replay 전용 run

### 6.3 Candidate Pools

- `archetype`: `run_date` 이전에 종료된 과거 테마
- `peer`: `run_date` 시점에도 활성 상태인 다른 테마
- `mixed_legacy`: legacy 데이터 backfill용 분류

### 6.4 Source Snapshot Rule

모든 replay/backtest/shadow run은 `run_date`까지 관측 가능한 데이터만 사용해야 한다.

필수 저장값:

- `source_data_cutoff_date`
- `theme_definition_version`
- `lifecycle_score_version`
- `comparison_spec_version`

추가 규칙:

- point-in-time 판정에 필요한 mutable 상태는 현재 테이블을 직접 읽지 않고 immutable snapshot 또는 history source에서 복원한다.
- 최소 요구 history:
  - theme active/inactive 상태
  - lifecycle score row
  - `first_spike_date` 및 관련 lifecycle annotation
- replay는 `run_date` 이후 수정된 현재 상태를 과거에 투영하면 안 된다.
- 이를 위해 `theme_state_history_v2` 또는 동등한 `effective_from/effective_to` 이력을 가진 source of truth를 사용한다.

### 6.5 Primary Horizon

- primary evaluation horizon: `14일`
- secondary report only: `7일`, `30일`

primary metric과 rollout gate는 오직 `14일` 기준만 사용한다.

### 6.6 Evaluation Cohort

primary evaluation cohort는 아래를 만족하는 모든 `run_date x current_theme_id` run이다.

1. current theme가 `run_date + 14일`까지 최소 10개의 관측 가능한 future point를 가진다.
2. 해당 run_date의 point-in-time source snapshot을 재구성할 수 있다.

중요:

- top-3 산출 실패는 cohort 제외 사유가 아니다.
- candidate alignment 실패도 cohort 제외 사유가 아니다.
- 위 경우 run은 cohort에 남고 primary metric에서 실패로 집계된다.

제외 가능한 유일한 primary cohort 제외 사유:

- run-level horizon immaturity
- point-in-time source snapshot 자체를 복원할 수 없는 경우

제외된 run도 모두 audit table에 기록한다.

### 6.7 Relevance and Gain

v4는 binary relevance와 graded gain을 모두 고정한다.

#### Binary relevance

candidate는 아래 조건을 만족하면 relevant다.

- `trajectory_corr_h14 >= 0.30`
- `position_stage_match_h14 = true`

즉 primary endpoint는 correlation만이 아니라 phase-aligned analogue retrieval을 측정한다.

#### Graded gain for ranking metrics

- gain 3: `trajectory_corr_h14 >= 0.60` and `position_stage_match_h14 = true`
- gain 2: `trajectory_corr_h14 >= 0.45`
- gain 1: `trajectory_corr_h14 >= 0.30`
- gain 0: 그 외

#### Stage alignment rule

`position_stage_match_h14`는 최신 stage가 아니라 lifecycle position 정렬 기반으로 계산한다.

- current theme의 평가 시점 stage: `run_date + 14일`
- past theme의 비교 stage: `current_day + 14`에 대응하는 lifecycle 위치
- 허용 오차: `±3일`

### 6.8 Censoring Rule

censoring은 metric 계산에서 silent skip 하지 않는다.

- current run 자체가 horizon 미성숙이면 run-level censoring
- candidate가 aligned future path를 만들 수 없으면 candidate-level censoring
- top-3 안의 censored candidate는 primary metric에서 gain 0으로 처리한다
- top-3를 산출하지 못한 run은 missing slot을 전부 gain 0으로 처리한다
- 모든 censoring reason은 별도 audit 분해표로 저장한다
- primary report에는 아래 sensitivity analysis를 함께 포함한다:
  - conservative: censored candidate = gain 0
  - optimistic: censored candidate excluded
  - paired delta by censor reason

run-level censoring과 candidate-level censoring은 반드시 분리 집계한다.

이 규칙은 hard case를 metric에서 제거하지 않기 위한 보수적 규칙이다.

### 6.9 Tie-Break Rule

동일 similarity score인 경우 정렬 규칙은 아래로 고정한다.

1. `similarity_score DESC`
2. `candidate_theme_id ASC`

## 7. Primary Metrics

### 7.1 Primary Endpoint

- `Phase-Aligned Precision@3`

정의:

- 분모: top-3 candidate slot 3개
- 분자: binary relevance = true 인 slot 수
- cohort aggregate: eligible run 전체 평균

top-3 slot을 모두 채우지 못한 run은 빈 slot을 실패로 간주한다.

### 7.2 Secondary Efficacy Metrics

- `MRR@3`
- `NDCG@3`
- `mean trajectory_corr_h14`
- `theme coverage`

### 7.3 Guardrail Metrics

- prediction availability rate
- prediction phase accuracy
- concentration Gini
- top-3 censoring rate
- reason별 censoring rate
- threshold stability by regime

## 8. Statistical Decision Rules

### 8.1 Test Design

- split unit: contiguous `run_date` blocks
- split scheme: anchored rolling-origin 3-fold minimum
- 각 fold는 `train -> validation -> embargo(14d) -> test` 순서를 가진다
- same `run_date`의 모든 current theme run은 항상 같은 split에 속한다

최소 fold 규격:

1. Fold A: earliest block train, middle block validation, latest block test
2. Fold B: train window를 확장한 뒤 다음 contiguous block을 test
3. Fold C: train window를 다시 확장한 뒤 마지막 contiguous block을 test

최종 held-out report는 fold 평균과 fold 간 분산을 함께 보고한다.

### 8.2 Replay Rule

historical replay는 각 run_date마다 그 날짜까지의 데이터만 사용해 재계산한다.

금지:

- test block에서 fit한 population stats를 train에 공유
- test block 이후에 종료된 archetype을 과거 후보로 사용
- run_date 이후 수정된 `first_spike_date`를 무비판적으로 재사용

추가 규칙:

- archetype 여부는 `current themes.is_active`가 아니라 point-in-time `theme_state_history_v2`에서 판정한다.
- population stats와 threshold는 fold별 train block에서만 fit한다.
- validation/test block은 train fold에서 fit된 stats와 threshold만 사용한다.
- replay 엔진은 `run_date`별 immutable manifest를 남겨야 하며, 같은 manifest를 다시 실행하면 byte-for-byte 재현 가능한 결과를 생성해야 한다.

### 8.3 Statistical Procedure

primary endpoint와 guardrail delta는 `current_theme_id` cluster bootstrap으로 계산한다.

- bootstrap unit: `current_theme_id`
- report: paired delta and one-sided 95% CI
- minimum test cohort: `100 eligible runs` and `30 unique current themes`

추가 요구:

- promotion 전 `comparison-v4-power-analysis.md` 산출물을 생성한다.
- 이 문서는 observed variance, MDE, cluster count, chosen margin의 근거를 기록한다.
- power analysis 문서가 없으면 rollout gate를 실행할 수 없다.

### 8.4 Rollout Gate

rollout은 아래를 모두 만족할 때만 통과다.

1. primary endpoint:
   - `Delta Phase-Aligned Precision@3 = v_candidate - v_current`
   - one-sided 95% CI lower bound `> -0.03`
2. coverage guardrail:
   - one-sided 95% CI lower bound of `Delta theme coverage > -0.10`
3. prediction availability guardrail:
   - one-sided 95% CI lower bound of `Delta prediction availability > -0.10`
4. prediction phase accuracy guardrail:
   - one-sided 95% CI lower bound of `Delta phase_correct > -0.05`
5. concentration guardrail:
   - one-sided 95% CI upper bound of `Delta Gini < +0.02`
6. censoring guardrail:
   - top-3 censoring rate `< 0.10`
   - any single censor reason `< 0.05`

주의:

- 위 margin은 첫 production promotion을 위한 lock 값이다.
- 이후 promotion은 새 power-analysis 문서에서 margin 재승인을 받아야 한다.

### 8.5 Baselines

baseline은 “비교 가능”이 아니라 pass/fail 기준으로 쓴다.

필수 baseline:

1. random
2. sector-only
3. feature-only
4. curve-only
5. current production
6. top-3 without threshold

조건:

- v_candidate는 primary endpoint에서 current production 비열등을 만족해야 한다.
- same held-out test set에서 `feature-only`, `curve-only`보다 명백히 열등하면 승격 불가
- `random`과 `sector-only` 대비:
  - one-sided 95% CI lower bound of primary endpoint delta `> 0`
- `top-3 without threshold` 대비:
  - primary endpoint delta lower bound `> -0.01`
  - concentration Gini upper bound `< +0.01`

각 baseline은 동일한 fold, 동일한 cohort, 동일한 censoring rule로 계산한다.

## 9. Threshold Policy

threshold는 아래 regime별로 관리한다.

1. `curve_len >= 14`
2. `curve_len 7-13`
3. `curve_len < 7`

추가 규칙:

- regime별 training run이 `100` 미만이면 독립 threshold를 학습하지 않는다
- sparse regime는 parent/global threshold로 shrinkage 한다
- threshold IQR이 `0.05`를 넘으면 unstable regime로 간주하고 global threshold 사용

## 10. Data and Schema Architecture

### 10.1 Shadow Principle

shadow 단계에서는 기존 serving table을 절대 dual-write 대상으로 쓰지 않는다.

이유:

- `theme_comparisons` unique key는 `(current_theme_id, past_theme_id, calculated_at)`다
- `prediction_snapshots` unique key는 `(theme_id, snapshot_date)`다

따라서 versioned shadow를 안전하게 돌리려면 additive internal table이 필요하다.

### 10.2 New Internal Tables

#### `theme_comparison_runs_v2`

필수 컬럼:

- `id`
- `run_date`
- `current_theme_id`
- `algorithm_version`
- `run_type`
- `candidate_pool`
- `threshold_policy_version`
- `source_data_cutoff_date`
- `comparison_spec_version`
- `status`
- `publish_ready`
- `expected_candidate_count`
- `materialized_candidate_count`
- `expected_snapshot_count`
- `materialized_snapshot_count`
- `attempt_no`
- `checkpoint_cursor`
- `last_error`
- `started_at`
- `completed_at`
- `published_at`
- `created_at`

unique key:

- `(run_date, current_theme_id, algorithm_version, run_type, candidate_pool)`

#### `theme_comparison_candidates_v2`

필수 컬럼:

- `run_id`
- `candidate_theme_id`
- `rank`
- `similarity_score`
- `feature_sim`
- `curve_sim`
- `keyword_sim`
- `current_day`
- `past_peak_day`
- `past_total_days`
- `estimated_days_to_peak`
- `message`
- `past_peak_score`
- `past_final_stage`
- `past_decline_days`
- `is_selected_top3`

unique key:

- `(run_id, candidate_theme_id)`

#### `theme_comparison_eval_v2`

필수 컬럼:

- `run_id`
- `candidate_theme_id`
- `evaluation_horizon_days`
- `trajectory_corr_h14`
- `position_stage_match_h14`
- `binary_relevant`
- `graded_gain`
- `censored_reason`
- `evaluated_at`

unique key:

- `(run_id, candidate_theme_id, evaluation_horizon_days)`

#### `prediction_snapshots_v2`

필수 컬럼:

- legacy `prediction_snapshots` 필드 전부
- `comparison_run_id`
- `algorithm_version`
- `run_type`
- `candidate_pool`
- `evaluation_horizon_days`
- `comparison_spec_version`

unique key:

- `(theme_id, snapshot_date, algorithm_version, run_type, candidate_pool, evaluation_horizon_days)`

#### `theme_state_history_v2`

필수 컬럼:

- `theme_id`
- `effective_from`
- `effective_to`
- `is_active`
- `closed_at`
- `first_spike_date`
- `state_version`

이 테이블은 archetype/peer point-in-time 판정의 source of truth다.

추가 규칙:

- `closed_at`가 없는 legacy theme는 backfill 시 명시적으로 `unknown` 상태로 라벨링한다.
- `unknown` 상태 theme는 primary archetype pool에 포함하지 않는다.
- `theme_state_history_v2` backfill이 끝나기 전에는 replay/test 승격 판단을 하지 않는다.

#### `comparison_backfill_manifest_v2`

필수 컬럼:

- `manifest_id`
- `source_table`
- `source_row_count`
- `target_row_count`
- `row_count_parity_ok`
- `sample_contract_parity_ok`
- `executed_at`
- `notes`

### 10.3 Legacy Tables During Migration

아래 테이블은 shadow 동안 유지한다.

- `theme_comparisons`
- `prediction_snapshots`

정책:

- shadow write 금지
- current production read only
- user-facing API는 legacy table을 계속 읽음

### 10.4 RLS and Reader Policy

- raw v2 internal tables:
  - `service_role` only
  - anon/client direct read 금지
- serving view or materialized reader:
  - anon read 허용
  - `status = 'published' AND publish_ready = true` row만 노출
- shadow data는 user-facing anon reader에 절대 노출하지 않는다

### 10.5 Required Secondary Indexes

- `theme_comparison_runs_v2`:
  - `(current_theme_id, run_date DESC, run_type, algorithm_version)`
  - `(status, publish_ready, run_type, run_date DESC)`
- `theme_comparison_candidates_v2`:
  - `(run_id, rank)`
  - `(candidate_theme_id, run_id)`
- `theme_comparison_eval_v2`:
  - `(run_id, evaluation_horizon_days)`
  - `(binary_relevant, censored_reason)`
- `prediction_snapshots_v2`:
  - `(theme_id, snapshot_date DESC, run_type, algorithm_version, candidate_pool)`

### 10.6 Storage and Partitioning Plan

- 예상 cardinality:
  - `theme_comparison_runs_v2`: 일별 활성 테마 수 x version 수
  - `theme_comparison_candidates_v2`: run 수 x candidate 수
  - `theme_comparison_eval_v2`: candidate 수 x horizon 수
- `theme_comparison_candidates_v2`와 `theme_comparison_eval_v2`는 `run_date` 월 단위 partition 또는 동등한 physical sharding 전략을 사용한다.
- retention cleanup는 partition drop 또는 batched TTL delete로 수행한다.
- partitioning/TTL job이 준비되지 않으면 shadow historical replay를 full scale로 시작하지 않는다.

### 10.7 Contract Artifacts to Update

최종 cutover 때 아래 계약 파일이 함께 갱신돼야 한다.

- `lib/tli/types/db.ts`
- `lib/tli/types/api.ts`
- `app/api/openapi.json/route.ts`
- `app/api/tli/themes/[id]/fetch-theme-data.ts`
- `app/api/tli/themes/[id]/build-comparisons.ts`
- `e2e/tli-themes.spec.ts`

## 11. Serving and Cutover Plan

### Phase 0A. Additive Migration Only

- v2 internal tables 추가
- nullable/read-safe 컬럼만 추가
- 기존 unique key와 legacy writer는 건드리지 않음

### Phase 0B. Shadow Write

- `run_type = shadow`
- internal v2 tables에만 write
- legacy API read path unchanged
- run state machine:
  - `pending -> materializing -> complete -> published`
  - failure 시 `failed`
  - rollback 시 `rolled_back`
- reader는 `published` 상태만 읽는다
- `publish_ready = true` and `materialized_candidate_count = expected_candidate_count`를 만족하지 못하면 publish 금지

### Phase 0C. Evaluation and Backfill

- legacy prod rows는 `v2_legacy` manifest로만 라벨링
- 기존 row를 새 shadow row와 같은 calibration 집계에 섞지 않음
- shadow 평가 결과와 report를 120일 보존
- replay/backfill queue와 일일 shadow queue는 분리한다
- 모든 replay/backfill job은 manifest/checkpoint 기반으로 재개 가능해야 한다
- idempotency key는 `(run_date, current_theme_id, algorithm_version, run_type, candidate_pool)`다

### Phase 0D. Dual Read Behind Flag

- 새 serving view 또는 reader 추가
- feature flag로 `v_current` vs `v_candidate` 선택 가능
- external response shape는 동일 유지
- partial run, failed run, unpublished run은 dual read 대상이 아니다

### Phase 0E. Promotion

승격 시 아래 두 옵션 중 하나만 허용한다.

1. API가 v2 serving source를 직접 읽는다
2. v2 top-3를 legacy response shape로 publish 한다

half-migrated mixed read는 허용하지 않는다.

promotion prerequisite:

- backfill manifest parity 통과
- contract parity e2e 통과
- alert channel과 rollback runbook 준비 완료

## 12. Retention and Rollback

### Retention

- `theme_comparison_runs_v2`: 365일
- `theme_comparison_candidates_v2`: 120일
- `theme_comparison_eval_v2`: 365일
- `prediction_snapshots_v2`: 365일
- `comparison_backfill_manifest_v2`: 영구 보존
- rollout report and manifests: 영구 보존
- migration 기간에는 legacy `theme_comparisons` unverified cleanup window를 `21일 -> 90일`로 완화

### Rollback

rollback은 항상 flag flip으로 먼저 가능해야 한다.

- user-facing API는 `production_version`만 읽는다
- shadow tables는 rollback 시에도 유지
- destructive migration은 production promotion 이후 별도 단계에서만 허용

## 13. Observability, Alerting, and Runbook

### 13.1 Required Dashboards

최소 대시보드:

1. shadow run throughput and failure rate
2. published run lag
3. primary endpoint / guardrail trend
4. censoring reason breakdown
5. prediction availability drift
6. storage growth by v2 table

### 13.2 Required Alerts

최소 알림:

1. `failed run rate > 5%` over 1 hour
2. unpublished complete run backlog > 1 batch window
3. `top-3 censoring rate >= 10%`
4. prediction availability delta guardrail breach
5. storage growth > planned budget
6. contract parity e2e failure on promotion candidate

### 13.3 Notification Channel

promotion 전 아래 둘 중 하나는 필수다.

1. Discord/Slack/Pager channel
2. equivalent on-call notification sink

알림 채널 owner와 secondary owner를 배정해야 한다.

### 13.4 Rollback Runbook

runbook은 최소 아래 단계를 포함해야 한다.

1. feature flag revert
2. published reader pin to `v_current`
3. shadow writer freeze 여부 판단
4. affected run/date range 조회
5. user-facing parity 확인
6. incident note 작성

## 14. Imported Ideas from `comparison-v3-prd.md`

### 14.1 Adopt into v4 Core

아래 항목은 v4 core에 포함한다.

1. skip rate / skip reasons audit
2. historical lifecycle position 기반 stage match
3. resample cache length consistency guard
4. threshold stability by regime
5. daily drift monitoring

### 14.2 Candidate Experiments After Phase 1

아래 항목은 측정 체계가 고정된 뒤 실험 후보로 유지한다.

1. curve scale unification
2. sigmoid weight smoothing
3. sector affinity matrix
4. length ratio penalty
5. inactive-theme news snapshot normalization
6. VIF diagnostic and conditional feature merge
7. N<15 Mutual Rank fallback

주의:

- `N<15 Mutual Rank fallback`은 `0 반환`이 아니라 `undefined/explicit fallback` semantics로 설계해야 한다.
- sector affinity는 현재 실제 sector key 체계와 동일한 enum 위에서만 구현한다.

### 14.3 Explicitly Deferred or Rejected

아래 항목은 v4 production PRD에서 제외한다.

1. single 70/30 temporal split만으로 holdout 주장하기
2. random baseline + binomial z-test를 canonical gate로 사용하기
3. active match를 prediction에서 즉시 제외하기
4. `KR_HOLIDAYS_2026` 같은 연도 하드코딩 보정
5. in-memory enrichment cache
6. lifecycle weight/noise/confidence calibration 순서를 comparison PRD에서 다시 정의하기
7. weighted bootstrap estimand를 t-distribution mean CI로 바꾸기

## 15. Implementation Phases

### Phase 1. Measurement Freeze

산출물:

- `lib/tli/comparison/spec.ts`
- relevance/gain/censoring formalization
- split and bootstrap utilities
- v2 internal schema

### Phase 2. Shadow Evaluation

산출물:

- historical replay engine
- fixed-horizon evaluator
- held-out report
- baseline comparison report

### Phase 3. Candidate Experiments

산출물:

- v3 imported experiments one by one
- each experiment compared only on frozen measurement stack

### Phase 4. Safe Promotion

산출물:

- v2 reader behind flag
- contract updates
- final rollout report
- go/no-go note

## 16. Acceptance Criteria

1. canonical metric definitions, tie rule, gain function, censoring rule가 문서와 코드에 동일하게 존재한다.
2. shadow mode는 legacy serving table과 unique-key 충돌 없이 동작한다.
3. user-facing API는 shadow 단계에서 기존 response contract를 유지한다.
4. `theme_comparison_candidates_v2`는 legacy comparison response를 재구성하는 데 필요한 필드를 모두 가진다.
5. `prediction_snapshots_v2`는 `comparison_run_id`와 `candidate_pool`을 포함한 lineage-safe unique key를 가진다.
6. `theme_comparison_runs_v2`는 `status`, `publish_ready`, expected/materialized count, retry metadata를 가진다.
7. raw v2 internal tables와 serving reader의 RLS 정책이 분리되어 있다.
8. replay engine은 `run_date` 이후 데이터를 사용하지 않는다.
9. held-out report는 3개 이상 rolling-origin fold와 14일 embargo를 사용한다.
10. primary endpoint와 guardrail은 current-theme cluster bootstrap CI와 sensitivity analysis를 함께 보고한다.
11. rollout gate가 수학적으로 executable하고, companion power-analysis 문서가 존재한다.
12. baseline pass/fail 규칙이 acceptance에 포함된다.
13. backfill manifest는 row-count parity, sample contract parity, rollback 근거를 남긴다.
14. contract files, OpenAPI, type definitions, e2e fixture가 cutover phase에 포함된다.
15. alert channel, dashboard owner, rollback runbook이 promotion prerequisite로 명시된다.
16. partial run/failed run/unpublished run은 serving reader에 노출되지 않는다.
17. replay idempotency, rollback drill, retention cleanup correctness, contract parity e2e가 검증 범위에 포함된다.
18. v3 imported idea 중 core/adopt/defer/reject 구분이 문서에 명시된다.
19. rollback은 flag flip만으로 가능하다.

## 17. Definition of Done

이 PRD는 아래가 모두 만족될 때 완료다!!!!

1. comparison cycle이 같은 spec과 같은 dataset rule 아래서 계산, 평가, calibration, serving을 수행한다.
2. v_candidate의 품질 주장을 held-out evidence와 CI로 설명할 수 있다.
3. shadow mode와 cutover가 현재 production API를 깨지 않는다.
4. 부분 publish, lineage 손실, historical state leakage, silent censoring이 구조적으로 차단된다.
5. 이전 PRD 간 충돌하는 measurement rule이 하나의 canonical rule로 정리된다.
