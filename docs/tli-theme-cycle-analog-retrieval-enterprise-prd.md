# PRD: TLI Theme Cycle Analog Retrieval & Probabilistic Forecasting System

- Version: `1.0-enterprise`
- Status: `Final draft for approval`
- Date: `2026-03-12`
- Owner: `Codex`
- Scope: `stock-ai-newsletter` / TLI comparison, retrieval, forecasting, serving, governance
- Canonical: This document supersedes `docs/tli-comparison-level45-roadmap-prd.md` as the primary architecture and problem definition.
- Annex: `docs/tli-comparison-level45-roadmap-prd.md` remains the migration-era operational gate annex until Phase C ship approval.

## 1. Executive Summary

TLI의 다음 단계는 더 좋은 `similarity score`를 만드는 일이 아니다.

정식 제품 목표는 아래와 같이 재정의한다.

1. 현재 시점까지 관측 가능한 정보만으로 theme episode를 표현한다.
2. 과거 전체 episode registry에서 미래 경로가 실제로 유사했던 analog를 retrieval한다.
3. retrieved analog를 조건으로 `peak<=H`, `days_to_peak`, `post-peak risk`, uncertainty를 확률적으로 예측한다.

이 문서는 위 문제 정의를 enterprise-grade execution contract로 내린다. 핵심은 세 가지다.

1. `Phase 0 Bridge`로 현재 `theme` 중심 배치 시스템에서 `episode/query/forecast` 체계로 안전하게 이행한다.
2. `label policy`와 `audit policy`를 먼저 고정해 모델보다 라벨 정의가 성능을 좌우하는 문제를 차단한다.
3. `hybrid gates`를 사용해 현재 row-oriented 운영 표면과 새 episode-oriented 평가 표면을 함께 관리한다.

## 2. Product Decision

### 2.1 Canonical decision

TLI comparison의 canonical 목적은 아래다.

- 현재 활성 theme에 대해 미래 경로가 유사한 historical analog episode를 retrieval한다.
- retrieval 결과를 조건으로 cycle forecast를 생성한다.
- 사용자-facing 출력은 `similarity`가 아니라 `probability + evidence + uncertainty`다.

### 2.2 What is retained from the old roadmap

아래 항목은 유지한다.

- lineage and policy versioning
- fail-closed serving
- rollback drills
- segment/regime review
- lower-bound-based promotion logic
- row/cohort/sample readiness discipline

### 2.3 What is replaced

아래 항목은 더 이상 north star가 아니다.

- feature-family ranking platform을 최종 제품으로 보는 framing
- generic LTR-first serving objective
- similarity score 자체를 제품 출력으로 보는 관점

## 3. Current State

현재 운영 파이프라인은 아래 흐름에 고정되어 있다.

1. `collect-and-score.ts`
2. `interest_metrics`, `news_metrics`, `theme_stocks`
3. `lifecycle_scores`
4. `theme_comparisons`

또한 `theme` 활성/비활성은 운영 휴리스틱에 의해 바뀐다.

- activation: `naver_seen_streak >= 2`
- deactivation: `notSeenDays >= 30` and recent `14` days `score < 15`

따라서 새 PRD는 모델 교체가 아니라 데이터 모델 이행을 수반한다. `Phase 0 Bridge` 없이 바로 실행하면 dual truth와 label drift가 생긴다.

## 4. Scientific Grounding Note

이 PRD는 retrieval-augmented forecasting, future-aligned representation learning, calibration, survival analysis, delayed feedback, ML systems governance 문헌의 방향을 따른다.

중요:

- 이 문서의 scientific references는 설계 방향을 지지한다.
- 이 문서가 제시하는 metric과 gate는 TLI 도메인에서 별도 실증이 필요하다.
- 따라서 문헌은 `proof`가 아니라 `design justification`으로 취급한다.

## 5. Program Principles

1. `No future leakage`
2. `No completed-label assumption for incomplete episodes`
3. `No promotion on aggregate metrics alone`
4. `No production forecast without replay + shadow evidence`
5. `No hard switch without rollback path`
6. `No label-policy changes without version bump`
7. `No confident prediction without evidence quality`

## 6. Core Entities

### 6.1 Theme

운영상 추적되는 narrative/sector/event cluster.

### 6.2 Episode

하나의 theme가 의미 있는 점화, 확산, 정점, 감쇠를 보이는 시간 구간.

### 6.3 Query snapshot

예측 시점 `t`까지 관측 가능한 정보만 담은 point-in-time feature snapshot.

### 6.4 Analog

현재 query와 관측 구간이 유사하며, 이후 미래 경로가 예측에 참고가 될 historical episode.

### 6.5 Boundary source

- `observed`
- `inferred-v1`
- `imported`

## 7. Target Outputs

### 7.1 Primary outputs

- `P(peak <= 5d)`
- `P(peak <= 10d)`
- `P(peak <= 20d)`
- median / p10 / p90 `days_to_peak`
- `P(post_peak_drawdown >= x within 10d/20d)`
- forward path distribution for `+5d`, `+10d`, `+20d`
- uncertainty / abstention state

### 7.2 Secondary outputs

- `P(stage = ignition | expansion | peak_near | post_peak)`

### 7.3 Evidence package

모든 forecast는 아래를 포함해야 한다.

- top-5 analog episodes
- retrieval reason by analog
- analog future-path summary
- current-vs-analog mismatch notes
- evidence quality flag

## 8. Current-to-Future System Contract

### 8.1 New canonical artifacts

- `episode_registry_v1`
- `query_snapshot_v1`
- `label_table_v1`
- `analog_candidates_v1`
- `analog_evidence_v1`
- `forecast_control_v1`

### 8.2 Policy versions

모든 artifact는 최소 아래 version set을 저장해야 한다.

- `theme_definition_version`
- `episode_policy_version`
- `label_policy_version`
- `feature_family_version`
- `retrieval_spec_version`
- `calibration_version`
- `forecast_version`

## 9. Phase 0 Bridge

### 9.1 Purpose

현재 `theme row + lifecycle score + comparison row` 운영면에서 `episode + query + forecast` 체계로 안전하게 이행한다.

### 9.2 Bridge table

| Legacy artifact | New artifact | Parity check | Cutover criterion | Rollback trigger | Owner |
| --- | --- | --- | --- | --- | --- |
| `themes + theme_state_history_v2` | `episode_registry_v1` | weekly active-theme coverage diff `<= 2%`, overlapping episode rows `= 0`, `unknown/coverage_gap <= 5%` | `4` consecutive weekly passes | `2` consecutive weekly failures OR any leakage audit failure | TLI data pipeline |
| `lifecycle_scores + interest/news/stocks snapshots` | `query_snapshot_v1 + label_table_v1` | point-in-time snapshot reconstruction success `>= 99%`, missing point-in-time snapshot `<= 1%` | `4` consecutive weekly passes | any run with reconstruction success `< 99%` | TLI data pipeline |
| `theme_comparisons` | `analog_candidates_v1 + analog_evidence_v1` | artifact completeness `= 100%`, dual-write success `>= 99%`, audit trail completeness `= 100%` | `4` consecutive weekly passes and shadow-only serving stable | dual-write success `< 99%` OR any audit trail gap | TLI retrieval platform |
| `comparison control/promote path` | `forecast_control_v1` | rollback drill success `= 100%`, fail-closed path verified | `2` successful rollback drills before serving cutover | any fail-open event OR any rollback drill failure | TLI platform owner |

### 9.3 Mandatory bridge outputs

- dual-run report
- parity report
- rollback drill evidence
- cutover decision memo

## 10. Executable Label Policy

### 10.1 Episode start

- `observed`: `theme_state_history_v2.effective_from` when theme becomes active
- `inferred-v1`: allowed only when no observed boundary exists
- inferred rows are excluded from primary promotion metrics by default

### 10.2 Episode end

- `observed`: `closed_at` or `effective_to`
- `inferred-v1`: backfill only, and only when both conditions hold:
  - `notSeenDays >= 30`
  - recent `14` days of lifecycle score are all `< 15`

### 10.3 Primary peak date

- earliest date of the maximum `7`-day smoothed lifecycle score within the episode

### 10.4 Multi-peak handling

- if a later local maximum is within `5%` of episode max and there is no dormant gap `>= 14` days, keep one episode and set `multi_peak = true`
- if dormant gap `>= 14` days and the theme reactivates, open a new episode

### 10.5 Reignition rule

- `reignition -> new episode`
- dormancy is recognized only if dormant gap `>= 14` days

### 10.6 Boundary-source rules

- `observed` rows are promotion-eligible
- `inferred-v1` rows require separate audit approval
- `imported` rows require provenance metadata and are excluded from ship decisions unless explicitly certified

### 10.7 Label audit tests

아래는 hard requirement다.

- overlapping episodes `= 0`
- future-informed boundary changes in replay `= 0`
- inferred-boundary rows `<= 15%` overall
- inferred-boundary rows `<= 10%` in any priority slice
- right-censored rows used as completed negatives `= 0`

## 11. System Architecture

### 11.1 Stage 0: Episode Builder

- build leakage-safe episodes
- attach boundary source
- emit point-in-time lineage

### 11.2 Stage 1: Candidate Retrieval

- baseline candidate generation
- price-volume normalized kNN
- DTW baseline
- regime-filtered nearest neighbor

### 11.3 Stage 2: Future-Aligned Retrieval

- rerank candidates for future alignment
- allow numeric + context hybrid retrieval
- emit retrieval quality artifacts

### 11.4 Stage 3: Forecast Head

- survival / event-time head
- horizon probability head
- post-peak risk head

### 11.5 Stage 4: Calibration and Abstention

- post-hoc or joint calibration
- regime/family-aware calibration review
- abstention and low-evidence mode

### 11.6 Hard dependency rule

Stage 2 retrieval gate를 통과하기 전에는 Stage 3 forecast 학습 또는 승격을 금지한다.

## 12. Evaluation Protocol

### 12.1 Hard constraints

1. rolling-origin evaluation only
2. normalization statistics are fit only on information available at query time
3. retrieval corpus is restricted to episodes observable before query time
4. policy versions are frozen per evaluation run
5. future-informed theme merge/split is prohibited

### 12.2 Dataset splits

- `train`
- `validation`
- `replay_holdout`
- `prospective_shadow`

### 12.3 Reporting unit

모든 lower bound는 contiguous weekly cohort block bootstrap 기준으로 계산한다.

- default confidence level: `95%`
- lower-bound language means one-sided `95%` lower confidence bound

## 13. Hybrid Gates

### 13.1 Phase B readiness floor

아래 조건을 모두 충족해야 한다.

- `native eval rows >= 5000`
- `distinct weekly cohorts >= 8`
- each priority slice has `>= 300` eval rows OR `>= 50` completed episodes

### 13.2 Data gate

아래 조건을 모두 충족해야 한다.

- `unknown/coverage_gap <= 5%`
- point-in-time leakage audit failures `= 0`
- missing point-in-time snapshot `<= 1%`
- inferred-boundary rows are excluded from primary promotion metrics unless separate audit pass is green

### 13.3 Retrieval gate

replay holdout 기준이며, 아래를 모두 충족해야 한다.

- each priority slice has `>= 300` eval rows OR `>= 50` completed episodes
- `delta FuturePathCorr@5` lower bound `>= +0.02` vs both `price-only kNN` and legacy comparator
- `delta PeakHit@5` lower bound `>= +0.03` vs both baselines
- `PeakGap@5` median improvement `>= 5%`
- no priority slice regression worse than `-0.01` on primary retrieval metrics

### 13.4 Forecast ship gate

아래를 모두 충족해야 한다.

- prospective shadow `>= 6 weeks`
- eligible live queries `>= 400`
- each priority family/regime slice has `>= 50` live queries
- `IBS` relative improvement `>= 5%`
- at least `2` of `Brier@5/10/20` improve by `>= 3%` relative
- global `ECE <= 0.05`
- worst priority slice `ECE <= 0.08`
- confident prediction allowed only if:
  - `analog_support >= 5`
  - `candidate concentration Gini <= 0.60`
  - `top-1 analog weight <= 0.35`

## 14. Operating Model

### 14.1 Serving policy

- new forecast stack ships as `shadow` first
- cutover is controlled by `forecast_control_v1`
- fail-open serving is prohibited

### 14.2 Rollback policy

- rollback drill required before any serving cutover
- any fail-open event triggers immediate rollback review
- rollback evidence is stored as a versioned artifact

### 14.3 Change policy

아래 변경은 반드시 version bump가 필요하다.

- episode boundary logic
- label logic
- retrieval metric definition
- calibration method
- abstention threshold

## 15. Phase Roadmap

### Phase 0: Bridge and policy freeze

Deliverables:

- bridge table implementation plan
- label policy spec
- dual-run parity harness
- audit dashboards

Exit:

- all bridge rows pass cutover criteria
- label audit tests green

### Phase A: Episode registry and baseline analog engine

Deliverables:

- `episode_registry_v1`
- `query_snapshot_v1`
- `label_table_v1`
- baseline retrieval pack
- evidence report template

Exit:

- Phase B readiness floor pass
- Data gate pass

### Phase B: Future-aligned retrieval

Deliverables:

- future-aligned retriever
- retrieval evaluation pack
- slice audit report

Exit:

- Retrieval gate pass

### Phase C: Probabilistic forecast and calibration

Deliverables:

- survival / horizon forecast head
- calibration layer
- abstention policy
- shadow serving

Exit:

- Forecast ship gate pass

### Phase D: Analyst-facing production rollout

Deliverables:

- prediction card
- analog evidence card
- uncertainty / abstention UX
- live monitoring

Exit:

- production cutover approved

## 16. RACI

| Area | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| Episode policy | TLI data pipeline | Product owner | Research | Platform |
| Retrieval evaluation | TLI retrieval platform | Product owner | Research | Platform |
| Forecast calibration | Modeling owner | Product owner | Platform | Stakeholders |
| Serving and rollback | Platform owner | Product owner | TLI pipeline | Stakeholders |

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Migration creates dual truth | High | Phase 0 Bridge, dual-run, rollback drill |
| Label drift dominates model gains | High | executable label policy, version bump, audit tests |
| Retrieval wins but ship fails on slices | High | slice-aware gates, worst-slice calibration bound |
| Row gate and episode gate diverge | Medium | hybrid gate with readiness vs ship separation |
| Overconfident predictions | High | abstention policy, evidence-quality thresholds |

## 18. ADR

### Decision

Adopt the new analog-retrieval + probabilistic-forecast PRD as canonical, while retaining the old roadmap's operational gate discipline as a migration-era annex.

### Drivers

- current similarity-first framing is not the real product objective
- current pipeline is row-oriented and cannot be hard-switched safely
- label policy and migration contract must be fixed before model iteration

### Alternatives considered

- keep old roadmap as primary
- switch to new PRD immediately without bridge
- hybrid: new PRD primary, old roadmap as gate annex

### Why chosen

hybrid preserves the correct product direction without sacrificing operational safety.

### Consequences

- documentation becomes more explicit
- Phase 0 work increases
- implementation risk decreases materially

### Follow-ups

- patch canonical PRD with this contract
- prepare bridge execution tickets
- version policy documents separately after approval

## 19. Approval Rule

이 문서는 아래 조건에서 `approved for execution` 상태가 된다.

1. `Phase 0 Bridge` table is accepted without unresolved blanks
2. label policy and audit rules are accepted without discretionary overrides
3. hybrid gate numbers are accepted as versioned contract

