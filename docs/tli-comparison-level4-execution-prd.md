# PRD: TLI Comparison Level-4 Execution

- Status: Proposed for implementation
- Date: 2026-03-12
- Owner: Codex
- Depends on:
  - [level4-validation-prd.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/tli-comparison-level4-validation-prd.md)
  - [calibration_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_120108_calibration_report.md)
  - [weight_tuning_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_120108_weight_tuning_report.md)

## 1. Executive Summary

현재 TLI comparison system은 운영 가능한 empirical matcher이지만, 아직 `Level 4: 통계적으로 교정된 운영 시스템`으로 부르기에는 부족하다.

Scientist 검증 결과는 아래를 보여준다.

1. 현재 `similarity_score`는 relevance probability를 잘 설명하지 못한다.
2. 현재 score는 과신되어 있으며 calibration이 필요하다.
3. 단순 reweighting만으로는 통계적으로 설득력 있는 개선을 만들기 어렵다.
4. 짧은 기간 안에서도 relevance base rate drift가 크다.

따라서 implementation 우선순위는 다음과 같이 고정한다.

1. `similarity calibration`
2. `uncertainty-aware serving`
3. `CI lower-bound based release gate`
4. `drift monitoring`
5. `weight tuning artifacts`

이 PRD의 목표는 위 5개를 실제 코드와 운영 계약으로 연결하는 것이다.

## 2. Validation Findings Summary

### 2.1 Calibration evidence

Source: [calibration_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_120108_calibration_report.md)

- verified comparisons: `2,600`
- unique runs: `1,096`
- positives: `124`
- base rate: `4.77%`

Observed metrics:

- AUROC of raw similarity: `0.429`
- 95% bootstrap CI: `[0.377, 0.482]`
- Raw Brier score: `0.2666`
- Raw ECE: `0.4344`

Interpretation:

- 현재 similarity는 calibrated probability가 아니며, raw 점수를 그대로 serving하면 overclaim이 발생한다.
- isotonic calibration은 error를 크게 줄일 수 있으나, 현재 accessible surface에서는 probability가 base rate 근처로 collapse되는 형태다.
- 따라서 level 4는 “raw similarity를 probability처럼 보이게 하는 것”이 아니라 “calibrated probability + confidence metadata”를 같이 내려야 한다.
- 위 결과는 `legacy verified surface` 기반의 진단 결과이며, production certification artifact의 직접 근거로 사용해서는 안 된다.

### 2.2 Weight tuning evidence

Source: [weight_tuning_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_120108_weight_tuning_report.md)

Observed baseline:

- P@1 = `0.0392`
- MRR = `0.0636`
- NDCG = `0.0717`

Best simple within-top3 reranking:

- orientation: `inverse_fc`
- weights: `feature=0.1, curve=0.5, keyword=0.4`
- MRR = `0.0709`
- NDCG = `0.0773`

But:

- MRR delta 95% CI: `[-0.0006, 0.0154]`
- NDCG delta 95% CI: `[-0.0002, 0.0115]`

Interpretation:

- 단순 reweighting만으로 production promotion을 정당화할 만큼 강한 증거는 아직 없다.
- calibration과 uncertainty-aware serving이 reweighting보다 우선이다.
- full candidate-pool `v2` dataset이 있어야 meaningful weight tuning promotion이 가능하다.

### 2.3 Drift evidence

Observed:

- early-window relevance rate: `7.67%`
- late-window relevance rate: `2.22%`
- delta: `5.46%`
- 95% bootstrap CI: `[3.75%, 7.17%]`
- p-value: `0.0002`

Interpretation:

- drift monitoring 없는 serving은 위험하다.
- release gate와 monthly recalibration path가 함께 있어야 한다.

## 3. Product Goal

Level 4의 product goal은 다음 문장으로 고정한다.

> 사용자-facing comparison/prediction은 calibrated relevance probability와 uncertainty metadata를 포함하고, production 승격은 temporal validation + bootstrap lower bound gate를 통과한 version만 허용한다.

## 4. Non-Goals

이번 phase의 비목표:

1. survival model 도입
2. Bayesian hierarchical model 도입
3. comparison engine 전체 재작성
4. UI 전면 개편
5. 외부 유료 데이터 도입

## 5. Scope

### In scope

1. calibration dataset reader
2. calibration artifact generation
3. probability serving schema
4. confidence/shrinkage layer
5. release gate implementation
6. drift monitoring report and hold thresholds
7. weight tuning artifact storage contract
8. diagnostic-only legacy reader와 certification-grade v2/replay reader의 경계 명시

### Out of scope

1. 완전한 학술 모델 교체
2. 전 구간 real-time recalibration
3. legacy table 제거

## 6. Required Artifacts

### 6.1 Calibration artifact

Versioned artifact fields:

- `source_surface` (`legacy_diagnostic` | `v2_certification` | `replay_equivalent`)
- `calibration_version`
- `source_run_date_from`
- `source_run_date_to`
- `source_row_count`
- `positive_count`
- `calibration_method`
- `ci_method`
- `bootstrap_iterations`
- `bin_summary`
- `brier_score_before`
- `brier_score_after`
- `ece_before`
- `ece_after`
- `created_at`

Rules:

1. `source_surface = legacy_diagnostic` artifact는 분석/디버깅에는 사용할 수 있으나 production promotion gate 입력으로 사용할 수 없다.
2. production promotion gate 입력으로 허용되는 calibration artifact는 아래 둘 중 하나다.
   - `source_surface = v2_certification`
   - `source_surface = replay_equivalent`
3. serving layer는 calibration artifact를 읽을 때 `source_surface`를 검증하고, certification-grade artifact가 없으면 fail-closed 한다.

### 6.2 Weight artifact

Versioned artifact fields:

- `weight_version`
- `w_feature`
- `w_curve`
- `w_keyword`
- `sector_penalty`
- `curve_bucket_policy`
- `validation_metric_summary`
- `ci_lower`
- `ci_upper`
- `ci_method`
- `bootstrap_iterations`
- `created_at`

### 6.3 Drift report artifact

- `report_date`
- `base_rate`
- `ece`
- `brier`
- `candidate_concentration`
- `censoring_ratio`
- `first_spike_inference_rate`
- `drift_status`
- `baseline_window_months`
- `baseline_row_count`
- `auto_hold_enabled`

## 7. Serving Contract Changes

User-facing comparison payload must add:

- `relevanceProbability`
- `probabilityCiLower`
- `probabilityCiUpper`
- `confidenceTier`
- `supportCount`
- `curveLengthBucket`
- `censoredReason`
- `calibrationVersion`
- `weightVersion`

Rules:

1. raw `similarity_score`는 내부 디버깅용으로 남겨도 되지만 primary serving number가 되면 안 된다.
2. UI copy는 probability/uncertainty와 충돌하지 않게 수정한다.
3. low-confidence item은 badge 또는 disclaimer를 강제한다.
4. `relevanceProbability`는 approved calibration artifact가 산출한 point estimate다.
5. `probabilityCiLower` / `probabilityCiUpper`는 `run_id` cluster bootstrap으로 calibration model을 재적합한 뒤 얻은 95% percentile interval이다.
6. bootstrap iteration 기본값은 `1000`, 최소 허용값은 `500`이다.
7. `supportCount`는 calibration model이 해당 prediction에 대해 참조한 effective support sample size다.
8. `confidenceTier` 산출 규칙은 아래로 고정한다.
   - `high`: `supportCount >= 200` and `CI width <= 0.10`
   - `medium`: `supportCount >= 75` and `CI width <= 0.20`
   - `low`: 그 외
9. calibrated probability가 primary serving score가 되기 위해서는 ranking-utility guardrail을 동시에 만족해야 한다.
   - `delta_mrr_ci_lower > -0.005`
   - `delta_ndcg_ci_lower > -0.005`
   - `delta_auc_ci_lower > -0.01`

## 8. Release Gate

Production promotion 조건:

1. primary metric: `Phase-Aligned Precision@3`
2. bootstrap lower bound 기반 non-inferiority 통과
3. `Brier score` 비열등 또는 개선
4. `ECE` 비열등 또는 개선
5. censoring ratio 비정상 상승 없음
6. candidate concentration/Gini 악화 제한
7. drift score threshold 미만

Canonical gate expression:

- `delta_precision_ci_lower > -0.01`

Required numeric guardrails:

- `delta_brier_ci_upper <= 0.005`
- `delta_ece_ci_upper <= 0.02`
- `delta_mrr_ci_lower > -0.005`
- `delta_ndcg_ci_lower > -0.005`
- `candidate_concentration_gini <= baseline_gini + 0.03`
- `censoring_ratio <= baseline_censoring_ratio + 0.05`
- `low_confidence_serving_rate <= 0.40`

Optional stronger gates:

- `delta_mrr_ci_lower >= 0`
- `delta_ndcg_ci_lower >= 0`
- `ece_after <= ece_before`

Promotion blockers:

- calibration drift threshold 초과
- certification-grade calibration artifact 부재
- certification-grade weight artifact 부재 (weight 변경 promotion 시)
- drift baseline 미성숙 상태에서 auto-hold 결과를 promotion 근거로 사용

Interpretation rules:

1. metric 방향은 아래처럼 고정한다.
   - precision/MRR/NDCG/AUC: higher is better
   - Brier/ECE/censoring/Gini/low-confidence-rate: lower is better
2. non-inferiority 판정은 confidence interval의 worst-side bound 기준으로만 한다.
3. mean improvement가 양수여도 bound가 gate를 넘지 못하면 promotion 실패다.

## 9. Drift Monitoring and Auto-Hold

Monthly report metrics:

1. relevance base rate
2. calibration curve error
3. Brier score
4. ECE
5. candidate concentration / Gini
6. censoring ratio
7. `first_spike_date` inference rate
8. support bucket precision (`high`, `medium`, `low`)

Baseline maturity requirement:

1. auto-hold는 아래 조건을 모두 만족하기 전까지 `observation-only` 모드다.
   - distinct calendar months >= 3
   - verified rows in baseline window >= 3000
   - distinct evaluated run dates >= 30
2. baseline window는 trailing 3 mature months로 고정한다.
3. baseline maturity 전에는 보고서는 생성하지만 `auto_hold_enabled = false`로 기록한다.

Auto-hold triggers:

1. `ECE > baseline_ece + 0.03`
2. `|relevance_base_rate - baseline_base_rate| > 0.02` and relative change > 50%
3. `censoring_ratio > baseline_censoring_ratio + 0.10`
4. `candidate_concentration_gini > baseline_gini + 0.05`
5. `low` support bucket precision drops by more than `0.05`
6. missing calibration artifact

If any trigger fires:

- do not promote new version
- keep serving previous stable version
- emit alert/report row

## 10. Execution Plan

### Phase A. Calibration foundation

Deliverables:

1. `theme_comparison_eval_v2` / legacy diagnostic reader
2. calibration report builder
3. calibration artifact storage

Acceptance:

- Brier/ECE before/after are computed and versioned
- artifact is readable by serving layer
- diagnostic reader와 certification reader가 구분되어 있다
- production gate는 `legacy_diagnostic` artifact를 거부한다

### Phase B. Uncertainty-aware serving

Deliverables:

1. serving schema patch
2. probability + CI + confidence tier mapper
3. UI badge/copy integration

Acceptance:

- all comparison responses include level-4 metadata
- no raw similarity-only serving path remains primary

### Phase C. Promotion gate

Deliverables:

1. release gate evaluator
2. CI lower-bound check
3. promotion control row update

Acceptance:

- promotion fails closed when artifacts are missing
- promotion requires statistical gate pass

### Phase D. Drift monitoring

Deliverables:

1. monthly drift report
2. threshold config
3. auto-hold integration

Acceptance:

- drift report generated on schedule
- hold decision traceable from report to control row

### Phase E. Weight tuning

Deliverables:

1. full candidate-pool tuning experiment on `v2`
2. weight artifact writer
3. serving version switch by weight version

Acceptance:

- no weight promotion without CI-backed evidence

## 11. Dependencies

Hard dependencies:

1. accessible `*_v2` evaluation tables or equivalent full replay surface
2. calibration artifact read path from serving code
3. drift report persistence
4. cluster bootstrap capable evaluation surface

Soft dependencies:

1. richer visualization stack
2. additional months of verified data

## 12. Risks

1. Current verified surface is legacy and single-month heavy, so calibration may overfit short-term regime.
2. `v2` tables may be private/non-public, requiring internal reader path rather than REST path.
3. probability collapse toward base rate is possible if raw similarity remains weak.
4. uncertainty-aware serving may lower apparent confidence and require product copy changes.
5. immature drift baseline may generate false hold signals if auto-hold is enabled too early.

## 13. Acceptance Criteria

This PRD is complete when:

1. calibration artifact exists and is consumed in serving
2. comparison payload serves probability + uncertainty fields
3. promotion gate enforces CI lower bound
4. drift monitoring report exists and can trigger hold
5. weight versioning path exists
6. at least one end-to-end validation report demonstrates level-4 compliance on `v2` or equivalent replay data
7. no document or code path allows `legacy_diagnostic` artifacts to satisfy level-4 certification on their own
