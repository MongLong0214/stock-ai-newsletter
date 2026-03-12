# TLI Comparison Feature Evolution Tickets

- Source context:
  - [tli-comparison-level4-execution-prd.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/tli-comparison-level4-execution-prd.md)
  - [tli-comparison-level4-tickets.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/docs/tli-comparison-level4-tickets.md)
  - [20260312_151532_weight_tuning_report.md](/Users/isaac/WebstormProjects/stock-ai-newsletter/.omx/scientist/reports/20260312_151532_weight_tuning_report.md)
- Date: 2026-03-12
- Status: Proposed enterprise backlog after repeated `baseline` winner on level-4 tuning

## Objective

`weight-only tuning`으로는 `baseline`을 깨지 못한 상태에서, feature surface 자체를 개선해 non-baseline certified weight가 승격 가능한지를 검증한다.

## Global Rule

모든 `FEV-*` 티켓은 예외 없이 TDD로 진행한다.

공통 완료 조건:
- failing test 또는 validator가 먼저 존재한다.
- feature 변경이 similarity/eval/tuning surface 중 어디에 반영되는지 명시한다.
- 회귀 테스트가 green이다.
- 변경 후 tuning/eval evidence가 재생성된다.

## Epic F. Feature Surface Evolution

### FEV-001 Add Continuous Lifecycle Position Features

- Priority: P0
- Size: M
- Goal: hard stage label 이전에 연속형 lifecycle state를 feature vector로 반영한다.
- Scope:
  - observed peak recency / drawdown 기반 continuous lifecycle position
  - feature vector schema update
  - feature extraction tests
- Target files:
  - `lib/tli/comparison/features.ts`
  - `scripts/tli/enrich-themes.ts`
  - `lib/tli/__tests__/features.test.ts`
  - `lib/tli/__tests__/composite.test.ts`
- Acceptance:
  - rising / peak-adjacent / post-peak decline를 연속값으로 구분한다.
  - empty or insufficient history는 neutral fallback을 가진다.
  - feature vector order and population stats stay deterministic.

### FEV-002 Replace Hard Stage Match with Continuous Stage Distance

- Priority: P0
- Size: L
- Goal: `position_stage_match_h14`의 exact-match 의존도를 줄이고 adjacent-stage similarity를 반영한다.
- Scope:
  - stage ordinal distance
  - adjacent-stage partial credit
  - evaluator output 확장
  - relevance/gain rule 재정의
- Target files:
  - `lib/tli/comparison/spec.ts`
  - `scripts/tli/comparison-v4-evaluator.ts`
  - `scripts/tli/evaluate-comparisons.ts`
  - 관련 테스트
- Acceptance:
  - `Growth ↔ Peak`, `Decline ↔ Dormant`가 binary zero만으로 처리되지 않는다.
  - exact match와 adjacent match가 통계적으로 구분된다.
  - legacy bridge / v2 eval write path와 정합적이다.

### FEV-003 Add Censoring-Aware Weighting

- Priority: P0
- Size: L
- Goal: censoring-heavy samples가 tuning과 calibration을 왜곡하지 않도록 가중치를 도입한다.
- Scope:
  - censoring ratio by run/date/bucket
  - evaluation row weighting or exclusion policy
  - tuning runner integration
- Target files:
  - `scripts/tli/evaluate-comparisons.ts`
  - `scripts/tli/level4/tune-weights.ts`
  - `scripts/tli/level4/calibration-runtime.ts`
- Acceptance:
  - heavy-censoring runs가 full weight로 tuning을 지배하지 않는다.
  - weighting policy가 report에 명시된다.

### FEV-004 Add Sector-Aware Feature Enrichment

- Priority: P1
- Size: M
- Goal: 단순 sector penalty를 넘어서 sector-specific structure를 feature에 반영한다.
- Scope:
  - sector confidence
  - sector exposure overlap
  - ambiguous sector fallback
- Target files:
  - `lib/tli/comparison/features.ts`
  - `lib/tli/comparison/composite.ts`
  - 관련 테스트
- Acceptance:
  - sector match / mismatch 외에도 low-confidence sector labeling을 구분한다.
  - `etc` fallback이 과도하게 면책되지 않는다.

### FEV-005 Redesign Keyword Signal

- Priority: P1
- Size: M
- Goal: 단순 Jaccard 대신 rarity/support-aware keyword signal로 교체한다.
- Scope:
  - rare keyword boost
  - noisy generic keyword dampening
  - keyword support count
- Target files:
  - `lib/tli/comparison/similarity.ts`
  - `lib/tli/comparison/composite.ts`
  - 관련 테스트
- Acceptance:
  - generic overlap만으로 높은 keyword score가 나오지 않는다.
  - rare thematic overlap은 더 강하게 반영된다.

### FEV-006 Re-run Level-4 Evidence on Improved Surface

- Priority: P0
- Size: L
- Goal: feature evolution 후 calibration / tuning / certification evidence를 재생성한다.
- Scope:
  - calibration rerun
  - weight tuning rerun
  - certification rehearsal rerun
- Target files:
  - `scripts/tli/run-level4-calibration.ts`
  - `scripts/tli/run-level4-weight-tuning.ts`
  - `scripts/tli/run-level4-certification.ts`
- Acceptance:
  - non-baseline candidate가 winner면 artifact version이 새로 생성된다.
  - baseline 유지 시에도 why-not evidence가 report에 남는다.

## Recommended Order

1. `FEV-001`
2. `FEV-002`
3. `FEV-003`
4. `FEV-004`
5. `FEV-005`
6. `FEV-006`

## Current Execution Choice

이 문서 작성 시점 기준으로 바로 구현을 시작하는 티켓은 `FEV-001`이다.
