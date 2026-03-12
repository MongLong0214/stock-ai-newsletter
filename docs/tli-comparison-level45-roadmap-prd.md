# PRD: TLI Comparison Level-4 Stabilization, Level-4.5 Experimentation, and Level-5 Transition

- Status: Proposed for execution
- Date: 2026-03-12
- Owner: Codex
- Depends on:
  - [comparison-v4-rc-level4-certification-report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/comparison-v4-rc-level4-certification-report.md)
  - [tli-comparison-level4-execution-prd.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/tli-comparison-level4-execution-prd.md)
  - [20260312_180210_level4_to_level5_roadmap_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_180210_level4_to_level5_roadmap_report.md)

## 1. Executive Summary

현재 TLI comparison system은 `Level 4 certification pass` 상태이지만, 모델 성능 측면에서는 아직 `baseline`이 certified champion으로 고정되어 있다.

Scientist 검증 기준 핵심 사실은 아래와 같다.

1. explicit weight tuning selection `11/11`에서 `baseline`이 선택되었다.
2. calibration positive rate는 `14.27%`로 낮아 challenger promotion 실험력이 충분하지 않다.
3. drift surface의 censoring rate는 `39.75%`로 높다.
4. certification verdict는 `PASS`지만, 현재 증거 창은 `2026-03-12` 하루 내 약 `5.6`시간으로 짧다.

따라서 현재 우선순위는 다음으로 고정한다.

1. `Level 4 stabilization`
2. `Level 4.5 validated experimentation system`
3. `Level 5 model-native probabilistic system transition`

이 PRD의 목적은 위 3단계를 실제 운영 가능한 수준의 workstream, gate, sample size, KPI, governance로 구체화하는 것이다.

## 2. Evidence Base

### 2.1 Current empirical state

Source: [20260312_180210_level4_to_level5_roadmap_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_180210_level4_to_level5_roadmap_report.md)

- explicit weight tuning reports: `11`
- baseline selected: `11/11`
- baseline selection rate: `1.000`
- 95% Wilson CI: `[0.741, 1.000]`
- one-sided exact binomial p-value: `0.00049`

Interpretation:

- 현 feature/weight surface 기준으로는 baseline champion 고착이 매우 강하다.
- 다음 단계의 핵심은 “조금 더 weight를 흔드는 것”이 아니라 “baseline을 깰 수 있는 실험 표면을 구축하는 것”이다.

### 2.2 Calibration surface

- calibration rows: `1514`
- positive rate: `0.1427`
- 95% Wilson CI: `[0.1260, 0.1612]`

Interpretation:

- positive class가 충분히 희소해 challenger promotion을 빠르게 검증하기 어렵다.
- level-4.5 진입 전 native eval 누적 정책을 KPI로 관리해야 한다.

### 2.3 Drift surface

- drift rows: `3844`
- relevance base rate: `0.0679`
- 95% Wilson CI: `[0.0604, 0.0763]`
- censoring rate: `0.3975`
- 95% Wilson CI: `[0.3821, 0.4131]`
- ECE: `0.0648`

Interpretation:

- drift 체계는 동작하지만 censoring이 높다.
- stage 4.5에서는 모델 성능보다 먼저 evaluation surface quality를 낮추는 작업이 중요하다.

### 2.4 Certification surface

Source: [comparison-v4-rc-level4-certification-report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/comparison-v4-rc-level4-certification-report.md)

- verdict: `PASS`
- checklist pass: `7/7`

Interpretation:

- 운영/인증 체계는 level-4 수준까지 도달했다.
- 그러나 장기 운영 안정성은 아직 실증되지 않았다.

## 3. Problem Statement

현재 시스템의 문제는 두 층이다.

### 3.1 System layer

이 층은 상당 부분 해결되었다.

- calibration artifact pinning
- weight artifact enforcement
- fail-closed promotion gate
- drift artifact generation
- certification checklist

### 3.2 Model layer

이 층은 아직 해결되지 않았다.

- challenger surface가 baseline을 이기지 못한다.
- native eval density가 충분하지 않다.
- censoring 부담이 높다.
- segment-aware calibration과 segment-aware ranking gain이 아직 부족하다.

즉, 앞으로의 로드맵은 “운영 체계를 고치는 일”보다 “실험 가능한 과학 시스템을 만드는 일”이 중심이다.

## 4. Product Goals

### Goal A: Level 4 stabilization

`PASS`를 one-off event가 아니라, trailing 30-day 기준으로 재현 가능한 운영 상태로 만든다.

### Goal B: Level 4.5 validated experimentation

baseline champion을 공정하게 깨뜨릴 수 있는 challenger evaluation platform을 만든다.

### Goal C: Level 5 transition

heuristic comparison engine을 model-native probabilistic decision system으로 점진 전환한다.

## 5. Non-Goals

이번 PRD에서 비목표는 아래와 같다.

1. 즉시 full Bayesian production replacement
2. 즉시 online learning 도입
3. 전체 TLI stack 재작성
4. UI 전면 개편
5. 유료 외부 데이터 도입

## 6. Program Principles

1. `No promotion without evidence`
2. `No fail-open on serving-critical paths`
3. `No challenger evaluation without frozen dataset lineage`
4. `No metric wins without segment-level review`
5. `No model transition before experimentation infrastructure`

## 7. Phase A: Level 4 Stabilization

### 7.1 Objective

현재 확보한 certification PASS를 안정 운영으로 전환한다.

### 7.2 Duration

- Target: `2~4 weeks`
- Exit is evidence-driven, not calendar-driven.

### 7.3 Required deliverables

1. daily calibration/drift/weight/certification runbook
2. queue terminal-state policy
3. artifact lineage dashboard
4. rollback drill schedule and evidence template
5. control-row provenance audit script
6. native-vs-bridge evaluation ratio dashboard

### 7.4 Operational KPIs

- daily artifact-chain success rate `>= 99.0%` over trailing 30 days
- promotion success rate `>= 99.5%`
- control-row/payload pin mismatch `= 0`
- critical degraded-success response rate `= 0`
- rollback drill success rate `= 100%`
- drift false-positive hold rate `< 10%` after weekly adjudication
- native eval share `>= 70%` of newly added eval rows for 2 consecutive weeks

### 7.5 Required work

#### A1. Reliability hardening

- explicit failed terminal status for every queueable path
- stale row cleanup metrics
- run-level audit trail
- artifact trace id propagation

#### A2. Observability

- daily artifact report summary
- weekly drift summary
- serving pin audit
- promotion audit

#### A3. Governance

- weekly rollback drill
- weekly promotion review
- weekly drift hold review

### 7.6 Exit criteria

1. `30` consecutive days with Sev1/Sev2 = `0`
2. all KPIs above satisfied
3. no serving artifact mismatch
4. bridge dependence reduced below `30%` of newly added eval rows

## 8. Phase B: Level 4.5 Validated Experimentation

### 8.1 Objective

weight-only tuning이 아니라 `feature-family + evaluation-surface + champion/challenger governance`를 갖춘 실험 체계를 만든다.

### 8.2 Duration

- Target: `4~8 weeks`
- Starts only after Phase A exit criteria pass.

### 8.3 Core rule

Do not ask “which weight wins?” first.

Ask:

1. which feature family improves ranking signal?
2. which segments benefit?
3. does the gain survive replay and native eval together?
4. is the gain robust under censoring and drift constraints?

### 8.4 Experimental units

All challengers must be versioned by surface.

- `lifecycle-family`
- `sector-family`
- `keyword-family`
- `censoring-family`
- `market-regime-family`

Each challenger must have:

- `surface_version`
- `dataset_version`
- `feature_family_version`
- `label_policy_version`
- `calibration_version`
- `weight_version`

### 8.5 Data requirements

No promotion evaluation before:

- native eval rows `>= 5000`
- distinct weekly run cohorts `>= 8`
- segment minimum sample:
  - each priority sector `>= 300`
  - each priority stage `>= 300`
- effective censoring rate `<= 0.30`
  or censoring-corrected evaluation policy validated

### 8.6 Required metrics

Global metrics:

- `MRR`
- `NDCG`
- `Precision@3`
- `Brier`
- `ECE`
- `censoring ratio`
- `candidate concentration Gini`

Segment metrics:

- by sector
- by lifecycle stage
- by short/long horizon
- by confidence tier
- by data density bucket

### 8.7 Promotion gates

Challenger may be promoted only if all of the following hold on both replay and native eval surfaces:

- `delta MRR lower > 0`
- `delta NDCG lower > 0`
- `delta Precision@3 lower >= -0.01`
- no major segment regression:
  - priority sector delta MRR lower `> -0.01`
  - priority stage delta NDCG lower `> -0.01`
- no worse drift/hold profile than champion
- no increase in degraded or failed operational paths

### 8.8 Priority experiment order

1. segment-aware lifecycle features
2. censoring-aware labels/scoring
3. sector exposure features
4. keyword support/rarity and market regime context
5. model-based ranker PoC

### 8.9 Exit criteria

1. at least one non-baseline challenger wins against baseline on replay and native eval simultaneously
2. same challenger passes promotion gates in `2` consecutive evaluation cycles
3. segment regressions absent in priority cohorts
4. experimentation system becomes the main change-management path

## 9. Phase C: Level 5 Model-Native Probabilistic System

### 9.1 Objective

heuristic comparison engine을 calibrated probabilistic model system으로 전환한다.

### 9.2 Duration

- Target: `2~4 months+`
- Starts only after a stable Phase B winner exists.

### 9.3 Candidate model families

1. learning-to-rank
2. survival/event-time model
3. hierarchical Bayesian or partial-pooling model

### 9.4 Required system capabilities

- feature store
- frozen training dataset registry
- model registry
- retraining cadence
- shadow deploy and rollback registry
- segment calibration dashboard
- online/offline model evaluation split

### 9.5 Required serving outputs

The new primary output must be model-native probability, not heuristic similarity.

Required serving probabilities:

- `P(relevant)`
- `P(peak <= 14d)`
- `P(post-peak <= 30d)`
- uncertainty interval or posterior summary

### 9.6 Required online evaluation

Offline metrics alone are insufficient.

Online metrics to add:

- analyst acceptance rate
- downstream editorial usefulness
- recommendation consumption rate
- model override rate

### 9.7 Exit criteria

1. stage-5 model beats stage-4.5 champion offline and online
2. retrain, rollback, registry, calibration monitoring are automated
3. heuristic baseline is demoted to fallback-only

## 10. Milestones

### Milestone M1

Phase A entry:

- current certification PASS
- artifact chain working

### Milestone M2

Phase A exit:

- 30-day stable operations

### Milestone M3

Phase B mid-point:

- native eval >= `5000`
- frozen challenger dataset versioning operational

### Milestone M4

Phase B exit:

- first non-baseline challenger promoted under CI gates

### Milestone M5

Phase C entry:

- stage-4.5 challenger stable
- model registry and training surface ready

## 11. Risks and Mitigations

### Risk 1: baseline inertia continues

Mitigation:

- prioritize feature-family experiments over weight-only retuning
- reject weight-only loops after two non-improving cycles

### Risk 2: censoring stays too high

Mitigation:

- improve label policy
- increase native eval density
- segment censoring-aware evaluation

### Risk 3: certification PASS is mistaken for long-run stability

Mitigation:

- require 30-day Phase A exit gate
- no stage-4.5 entry before operational KPIs are green

### Risk 4: segment regressions hidden by aggregate wins

Mitigation:

- segment-level promotion gates
- challenger review template must include cohort breakdown

## 12. Decision

The immediate program decision is:

1. execute `Phase A` now
2. do not spend more time on pure weight tuning loops before Phase B prerequisites
3. treat `baseline persistence` as evidence that experimentation infrastructure is the next product, not a nuisance

## 13. Success Definition

This roadmap succeeds if:

1. level-4 PASS becomes stable operating reality
2. a non-baseline challenger can be promoted under rigorous evidence
3. the organization can transition to model-native probabilistic serving without rebuilding the platform from scratch
