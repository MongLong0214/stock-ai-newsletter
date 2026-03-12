# PRD: TLI Comparison Level-4 Validation and Calibration

- Status: Proposed
- Date: 2026-03-12
- Owner: Codex
- Goal: 현재 TLI comparison system을 `3단계 후반 ~ 4단계 초입`에서 `4단계: 통계적으로 교정된 운영 시스템`으로 끌어올리기 위한 검증/교정/서빙 요구사항을 정의한다.

## 1. Problem

현재 comparison engine은 운영 가능한 empirical system이지만, 아래 한계 때문에 아직 level 4라고 부르기 어렵다.

1. `similarity_score`가 calibrated probability가 아니다.
2. feature/curve 가중치와 sector penalty가 운영적으로 고정된 휴리스틱 값이다.
3. uncertainty가 사용자-facing 출력에 직접 통합되지 않는다.
4. 승격 조건이 statistical confidence lower bound 기반으로 고정되어 있지 않다.
5. drift 감시와 auto-hold 체계가 없다.

## 2. Product Decision

level 4의 의미를 아래와 같이 고정한다.

1. `similarity_score` 또는 그 후속 점수는 `P(relevant)` 형태로 교정되어야 한다.
2. 운영 가중치는 temporal CV + embargo + bootstrap evidence를 통과한 버전이어야 한다.
3. 모든 사용자-facing comparison/prediction output은 uncertainty metadata를 포함해야 한다.
4. production 승격은 단순 평균 개선이 아니라 confidence lower bound 기반 gate를 통과해야 한다.
5. drift 모니터링이 임계값을 넘으면 serving hold 또는 recalibration이 자동으로 걸려야 한다.

## 3. Target State Definition

Level 4 완료 조건:

1. `theme_comparison_eval_v2`와 `theme_comparison_candidates_v2`를 이용해 calibration dataset을 구축한다.
2. calibrated relevance probability와 calibration quality metric을 산출한다.
3. 운영 similarity/serving payload에 `probability + uncertainty + support metadata`가 추가된다.
4. weight tuning 결과가 versioned artifact로 저장된다.
5. release gate가 bootstrap CI lower bound 기준으로 동작한다.
6. monthly drift report가 생성되고 hold condition이 정의된다.

## 4. Scientific Questions

### SQ-1. Similarity calibration

질문:
- raw similarity 또는 composite features가 실제 relevance probability를 얼마나 잘 설명하는가?

성공 기준:
- calibration 후 `Brier score` 개선
- `ECE` 감소
- calibration curve가 diagonal에 더 근접

### SQ-2. Weight validity

질문:
- 현재 feature/curve weighting과 sector penalty가 temporal holdout 기준 최적인가?

성공 기준:
- baseline 대비 `Phase-Aligned Precision@3` non-inferiority 이상
- secondary metric `MRR@3`, `NDCG@3` 악화 없음
- cluster bootstrap lower bound가 margin 이상

### SQ-3. Uncertainty value

질문:
- low-information comparisons를 shrink 하거나 confidence tag를 붙였을 때 운영 품질이 개선되는가?

성공 기준:
- low-confidence bucket에서 overclaim 감소
- censored/weak-support comparisons의 false positive 감소

### SQ-4. Drift resilience

질문:
- 월별 데이터 분포 변화가 similarity quality와 calibration을 얼마나 흔드는가?

성공 기준:
- drift metric이 허용 범위 내
- drift 초과 시 serving hold 규칙 정의 완료

## 5. Required Datasets

### 5.1 Calibration dataset

Source:
- `theme_comparison_candidates_v2`
- `theme_comparison_eval_v2`
- `theme_comparison_runs_v2`

필수 컬럼:
- `run_id`
- `current_theme_id`
- `candidate_theme_id`
- `similarity_score`
- `feature_sim`
- `curve_sim`
- `keyword_sim`
- `current_day`
- `past_peak_day`
- `past_total_days`
- `trajectory_corr_h14`
- `position_stage_match_h14`
- `binary_relevant`
- `graded_gain`
- `censored_reason`
- `candidate_pool`
- `algorithm_version`
- `run_date`

### 5.2 Drift dataset

Source:
- `prediction_snapshots_v2`
- `lifecycle_scores`
- `theme_state_history_v2`

추적 지표:
- feature distribution shift
- candidate pool size distribution
- censoring ratio
- inferred `first_spike_date` 비율
- calibration residual

## 6. Metrics

### Primary

- `Phase-Aligned Precision@3`

### Secondary

- `MRR@3`
- `NDCG@3`
- `Brier score`
- `ECE`
- `Calibration intercept/slope`
- `Coverage`
- `Censoring ratio`
- `Support bucket precision`

### Operational

- `top-3 fill rate`
- `mean support_n`
- `low-confidence serving rate`
- monthly drift score

## 7. Model and Calibration Candidates

### Candidate A: Isotonic calibration

- input: `similarity_score`
- output: `P(relevant)`
- 장점: non-parametric, monotonic
- 리스크: sample size 부족 시 stepwise overfit

### Candidate B: Logistic calibration

- input:
  - `similarity_score`
  - `feature_sim`
  - `curve_sim`
  - `keyword_sim`
  - `current_day / past_total_days`
- output: `P(relevant)`
- 장점: 해석 가능, coefficient 기반 설명 가능
- 리스크: misspecification 가능

### Candidate C: Reliability shrinkage layer

- input:
  - calibrated probability
  - curve length bucket
  - missing stage snapshot flag
  - support count
- output:
  - shrunken probability
  - confidence tier

## 8. Weight Tuning Protocol

1. temporal split with embargo 유지
2. train fold에서 weight grid 또는 constrained optimization
3. validation fold에서 후보 선별
4. test fold에서 only-once 평가
5. cluster bootstrap으로 delta CI 계산

튜닝 대상:
- `wFeature`
- `wCurve`
- `wKeyword`
- sector penalty
- curve-length bucket별 가중치

금지:
- full-history fit 후 test에 동일 가중치 재평가
- censored candidate silent drop
- production candidate pool과 다른 튜닝 surface 사용

## 9. Uncertainty-Aware Serving Contract

Level 4 serving payload에 아래 필드를 추가한다.

- `relevanceProbability`
- `probabilityCiLower`
- `probabilityCiUpper`
- `supportCount`
- `confidenceTier`
- `censoredReason`
- `curveLengthBucket`
- `calibrationVersion`
- `weightVersion`

표시 규칙:

1. low-confidence candidate는 probability를 그대로 보여도 badge를 붙인다.
2. severe censoring 또는 weak-support candidate는 UI에서 노출 축소 또는 설명 텍스트 강화
3. prediction summary는 probability 없이 deterministic language를 쓰지 않는다.

## 10. Release Gate

승격 조건:

1. primary metric lower bound가 baseline 대비 margin 이상
2. `Brier score` non-inferior
3. `ECE` 개선 또는 비악화
4. censoring ratio 비정상 급등 없음
5. drift score 허용 범위 내

예시 gate:

- `delta_precision_mean > 0` 가 아니라
- `delta_precision_ci_lower > -0.01`

그리고 아래 guardrail 실패 시 승격 금지:

- low-confidence serving rate 과도 증가
- candidate concentration 급등
- calibration drift 초과

## 11. Drift Monitoring

월별 보고서에 포함:

1. feature distribution PSI 또는 동등 drift measure
2. calibration curve shift
3. `relevanceProbability` bucket별 empirical hit rate
4. censoring reason breakdown
5. inferred `first_spike_date` ratio
6. top-3 concentration / Gini

자동 hold 조건 예시:

- `ECE` > threshold
- drift > threshold
- censoring ratio 급등
- support bucket precision 급락

## 12. Scientist Session Requirements

이 PRD의 실제 검증은 `python_repl` 가능한 Scientist session에서 수행한다.

필수 조건:

1. `python_repl` 사용 가능
2. `.omx/scientist/reports/`에 markdown report 저장
3. `.omx/scientist/figures/`에 calibration curve, drift plots, bootstrap interval charts 저장
4. 출력 형식:
   - `[OBJECTIVE]`
   - `[DATA]`
   - `[FINDING]`
   - `[STAT:*]`
   - `[LIMITATION]`

## 13. Deliverables

1. `scientist` validation report
2. calibration artifact spec
3. weight tuning artifact spec
4. serving payload schema patch
5. release gate definition
6. drift monitoring runbook

## 14. Acceptance Criteria

이 PRD가 완료로 간주되려면:

1. actual calibration report가 존재
2. actual weight tuning report가 존재
3. serving contract patch가 구현됨
4. release gate가 코드와 runbook에 반영됨
5. drift monitoring 문서와 지표가 운영에 연결됨

## 15. Non-Goals

1. 완전한 학술 모델(survival/Bayesian) 즉시 도입
2. comparison engine 전체 재작성
3. UI 대규모 리디자인
4. 외부 유료 데이터 추가
