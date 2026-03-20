# TLI Full Review Report

Date: 2026-03-19
Project: `stock-ai-newsletter`
Scope:
- `lib/tli/**`
- `scripts/tli/**`
- `scripts/tli-optimizer/**`

## Executive Summary

현재 TLI는 "코어 모듈 품질은 괜찮지만, 운영 정합성은 아직 research-grade에 가까운 상태"입니다.

좋은 점:
- `calculator -> smoothing -> stage -> comparison -> prediction` 모듈 분리가 비교적 명확합니다.
- 핵심 TLI Vitest 스위트가 넓게 깔려 있고, 이번 점검 범위에서 `36 files / 560 tests`가 모두 통과했습니다.
- Level-4/bridge 계층은 fail-closed 의도를 코드에 강하게 반영하고 있습니다.

문제의 핵심:
- 튜닝 경로와 실제 운영 scorer가 같은 함수를 보지 않습니다.
- 일부 calibration은 저장/로드되지만 실제 scorer에는 반영되지 않습니다.
- 온라인 비교/예측 후보 정책이 백테스트 정책과 다릅니다.
- 데이터 수집 실패와 누락 표현 방식이 지나치게 brittle합니다.

결론:
- "대체로 동작한다"는 평가는 가능하지만,
- "현재 산출 점수와 예측을 운영 의사결정에 강하게 신뢰해도 된다"는 평가는 아직 이릅니다.

## Evidence Collected

### 1. Static review

중점 검토 파일:
- `lib/tli/calculator.ts`
- `lib/tli/score-smoothing.ts`
- `lib/tli/stage.ts`
- `lib/tli/comparison/*`
- `lib/tli/prediction*`
- `lib/tli/forecast/*`
- `scripts/tli/calculate-scores.ts`
- `scripts/tli/calculate-comparisons.ts`
- `scripts/tli/snapshot-predictions.ts`
- `scripts/tli/evaluate-predictions.ts`
- `scripts/tli/evaluate-comparisons.ts`
- `scripts/tli/pipeline-steps.ts`
- `scripts/tli/collectors/*`
- `scripts/tli/load-calibrations.ts`
- `scripts/tli-optimizer/*`

### 2. Test execution

Executed:

```bash
npx vitest run lib/tli/__tests__ scripts/tli-optimizer/__tests__
```

Result:
- `36` test files passed
- `560` tests passed

Not executed:

```bash
uv run pytest scripts/tli-optimizer/test_optimize.py
```

Reason:
- `pytest` is not installed in this environment

### 3. Data sanity check

Using `scripts/tli-optimizer/historical-data.json`:
- themes: `87`
- flattened rows: `5908`
- rows with both score + interest available: `2188`
- rows with score + interest + news available: `1722`

Observed signal quality from the dump:
- score vs normalized interest correlation: weak positive (`r ≈ 0.095`)
- score vs news count correlation: weak positive (`r ≈ 0.121`)
- evaluator-style hit rate:
  - Growth: `43.5%`
  - Decline: `54.7%`

이 수치는 "점수가 완전히 무의미하다"는 뜻은 아니지만, 현재 체계가 강한 predictive system이라고 보기에는 부족하다는 뜻입니다.

## What Works Well

### 1. Scoring core is structurally understandable

`calculateLifecycleScore()`는 관심도, 뉴스, 변동성, activity를 분리해 계산하고, 하위 raw components를 남깁니다. 디버깅 가능성이 높고 테스트도 붙어 있습니다.

### 2. Smoothing and stage logic are modularized

`applyEMASmoothing()`와 `resolveStageWithHysteresis()`가 분리되어 있어 실험과 회귀 검증이 비교적 쉽습니다.

### 3. Comparison v4 stack has better operational shape than legacy

`run -> candidates -> eval -> prediction snapshot -> level4 artifacts` 흐름이 분리되어 있어, 장기적으로는 legacy보다 훨씬 관리하기 좋은 구조입니다.

### 4. Guardrail intent is strong

`forecast-control`, `forecast-ship-gate`, `promotion-gate`, `retrieval-gate` 등은 최소한 코드 수준에서는 fail-closed 성향이 강합니다.

## Findings

### HIGH-1. `stage_growth`가 실제 분류에 쓰이지 않음

관련 파일:
- `lib/tli/stage.ts`
- `lib/tli/constants/tli-params.ts`
- `scripts/tli-optimizer/optimized-params.json`

문제:
- stage threshold를 읽지만 실제 Growth 판정은 `score >= stage_emerging`로 수행됩니다.
- `stage_growth`는 기본값/튜닝 결과에 저장되지만 실제 분류 경로에서 의미가 없습니다.

영향:
- 옵티마이저가 dead parameter에 탐색 예산을 씁니다.
- 문서와 운영 의미가 어긋납니다.
- threshold 해석이 사용자 기준과 달라집니다.

권고:
- `Emerging: [emerging, growth)` / `Growth: [growth, peak)`로 의미를 복원하거나
- `stage_growth` 파라미터를 제거하고 문서/튜너/테스트를 정리해야 합니다.

### HIGH-2. 옵티마이저가 라이브 scorer를 튜닝하지 않음

관련 파일:
- `scripts/tli/calculate-scores.ts`
- `lib/tli/calculator.ts`
- `scripts/tli-optimizer/evaluate.ts`
- `scripts/tli-optimizer/dump-data.ts`

문제:
- live scoring은 `avgPriceChangePct`, `avgVolume`, `prevAvgVolume`를 사용해 activity와 sentiment를 계산합니다.
- optimizer evaluator는 interest/news/firstSpikeDate만 넣고 평가합니다.
- optimizer dump schema에도 종목/거래량 관련 필드가 없습니다.

영향:
- `optimized-params.json`은 운영 점수함수와 다른 함수에 대해 최적화된 값입니다.
- tuning report를 신뢰하기 어렵습니다.

권고:
- optimizer dataset에 stock/activity 입력을 추가하고
- evaluator가 운영 scorer와 동일한 입력 경로를 사용하게 만들어야 합니다.

### HIGH-3. noise/weight calibration이 scorer에 실제 반영되지 않음

관련 파일:
- `scripts/tli/calibrate-noise.ts`
- `scripts/tli/calibrate-weights.ts`
- `scripts/tli/load-calibrations.ts`
- `lib/tli/constants/score-config.ts`
- `lib/tli/calculator.ts`

문제:
- noise threshold와 entropy weights를 계산해서 DB에 저장하고 메모리에도 적재합니다.
- 그러나 실제 score 계산은 `getTLIParams()`의 `min_raw_interest`, `w_interest`, `w_newsMomentum`, `w_volatility`만 봅니다.
- `score-config.ts`에 저장된 calibrated 값은 confidence 쪽 외에는 scorer에 연결되지 않습니다.

영향:
- "월간 재교정"이 실제 운영 점수에 반영된다는 기대가 틀립니다.
- calibration artifact와 production behavior가 다릅니다.

권고:
- `calculator.ts`가 calibrated threshold/weights를 실제로 읽게 하거나
- 반영되지 않는 calibration 코드를 제거하고 책임 범위를 명확히 해야 합니다.

### HIGH-4. 온라인 비교/예측 후보 정책이 백테스트와 다름

관련 파일:
- `scripts/tli/backtest-comparisons.ts`
- `scripts/tli/calculate-comparisons.ts`
- `scripts/tli/enrich-themes.ts`
- `scripts/tli/snapshot-predictions.ts`
- `lib/tli/comparison/timeline.ts`

문제:
- 백테스트는 시점 기준 archetype candidate만 사용합니다.
- 온라인 비교는 전체 테마를 후보로 넣습니다.
- active peer도 candidate가 되며, 그들의 `peakDay`는 "현재까지 관측된 최대값 day"입니다.
- 아직 끝나지 않은 테마를 완료된 analog처럼 예측에 사용하게 됩니다.

영향:
- offline validation과 online serving이 서로 다른 정책을 씁니다.
- prediction head가 오른쪽 검열된 peer 데이터를 완료 에피소드처럼 해석할 수 있습니다.

권고:
- 온라인도 point-in-time archetype/peer policy를 명시적으로 분리해야 합니다.
- 예측용 analog는 최소한 completion state 또는 censoring-aware weighting이 필요합니다.

### HIGH-5. v4 shadow 비활성 시 비교 결과가 조용히 유실됨

관련 파일:
- `scripts/tli/calculate-comparisons.ts`
- `scripts/tli/comparison-v4-shadow.ts`

문제:
- `TLI_COMPARISON_V4_SHADOW_ENABLED !== true`이면 v4 row preparation이 `null`을 반환합니다.
- 그러나 상위 로직은 별도 legacy write 없이 계속 성공으로 집계합니다.

영향:
- 환경 플래그가 잘못되면 비교 결과가 생성된 것처럼 로그만 남고 실제 persistence가 사라질 수 있습니다.

권고:
- v4 disabled면 명시적으로 실패시키거나
- legacy fallback write를 복구해야 합니다.

### MEDIUM-1. 뉴스/종목 수집 실패가 전체 분석 파이프라인을 중단시킴

관련 파일:
- `scripts/tli/pipeline-steps.ts`
- `lib/tli/calculator.ts`

문제:
- news/stocks failure가 `criticalFailures`로 올라가 후속 분석을 막습니다.
- scorer 자체는 news/stocks 없이 fallback으로 계산 가능하게 설계되어 있습니다.

영향:
- 운영이 불필요하게 brittle합니다.
- 외부 소스의 부분 장애가 전체 score freshness를 끊습니다.

권고:
- DataLab만 blocking으로 두고, news/stocks는 degraded mode로 계속 가는 편이 맞습니다.

### MEDIUM-2. 뉴스 0건과 뉴스 미수집을 구분하지 못함

관련 파일:
- `scripts/tli/collectors/naver-news.ts`
- `lib/tli/score-confidence.ts`
- `lib/tli/calculator.ts`

문제:
- 기사 있는 날짜만 row를 저장합니다.
- confidence는 `article_count > 0` 날짜만 coverage로 봅니다.
- scorer는 gap-filled daily series가 아니라 존재하는 row만 합산합니다.

영향:
- 조용한 테마가 데이터 누락 테마처럼 취급됩니다.
- news coverage와 news scarcity가 섞입니다.

권고:
- 14일 full daily series를 zero-fill 저장하고
- "missing"과 "observed zero"를 구분해야 합니다.

### MEDIUM-3. 종목 market 분류가 잘못됨

관련 파일:
- `scripts/tli/collectors/naver-finance-themes.ts`

문제:
- 종목코드 첫 글자가 `0`이면 `KOSPI`, 아니면 `KOSDAQ`로 분류합니다.

영향:
- 거래소 메타데이터가 부정확해질 수 있습니다.
- 이후 필터링/집계/리포팅에 오염원이 됩니다.

권고:
- 거래소 정보는 실제 페이지 필드나 신뢰 가능한 symbol mapping으로 분리해 가져와야 합니다.

### MEDIUM-4. 예측/비교 평가가 exact point-in-time가 아니라 nearest-date 기반임

관련 파일:
- `scripts/tli/comparison-v4-evaluator.ts`
- `scripts/tli/evaluate-predictions.ts`

문제:
- 비교 평가는 target date 주변 ±3일에서 closest stage를 씁니다.
- prediction eval도 snapshot 기준 +7일 근처 score를 closest 방식으로 가져옵니다.

영향:
- 평가가 다소 낙관적으로 나올 수 있습니다.
- point-in-time purity가 떨어집니다.

권고:
- exact snapshot 우선, 없으면 censored 처리하는 쪽이 더 보수적이고 맞습니다.

### MEDIUM-5. DataLab raw 값을 저장 단계에서 반올림함

관련 파일:
- `scripts/tli/data-ops.ts`

문제:
- DataLab 수집 raw ratio를 DB 저장 시 `Math.round()` 처리합니다.

영향:
- low-signal 구간에서 해상도가 줄어듭니다.
- optimizer/evaluator가 raw 기반 7일 평균 방향성을 볼 때 민감도가 감소합니다.

권고:
- 원본 분해능을 유지하는 것이 낫습니다.

### LOW-1. level-4 산출물 일부가 placeholder 수준임

관련 파일:
- `scripts/tli/run-level4-weight-tuning.ts`
- `scripts/tli/run-level4-drift.ts`

문제:
- weight tuning figure가 placeholder SVG입니다.
- drift artifact에서 `firstSpikeInferred`가 전부 `false`로 고정됩니다.

영향:
- artifact 품질이 실제 운영 메트릭보다 좋아 보일 수 있습니다.

권고:
- 보고서용 placeholder를 실제 figure 생성으로 대체하고
- inference rate는 실제 데이터에서 계산해야 합니다.

## Subsystem Assessment

### A. Data Collection

평가: `보통`

장점:
- 재시도와 polite delay가 있습니다.
- 데이터 소스별 함수 분리가 명확합니다.

한계:
- missing vs zero 표현이 약합니다.
- 종목 거래소 분류가 부정확합니다.
- 외부 소스 장애에 대한 degraded mode가 약합니다.

### B. Lifecycle Scoring

평가: `좋음`

장점:
- 계산식이 분해 가능하고 디버깅 친화적입니다.
- smoothing/stage 분리가 잘 되어 있습니다.

한계:
- dead parameter 존재
- calibration wiring 미완성
- optimizer/live scorer mismatch

### C. Comparison Engine

평가: `구조는 좋지만 정책 정합성 부족`

장점:
- mutual-rank, curve, feature, keyword가 모듈화되어 있습니다.
- v4 run/candidate/eval 분리가 좋습니다.

한계:
- online candidate pool이 backtest와 다릅니다.
- active peer와 completed archetype이 섞입니다.
- legacy/v4 coexistence가 복잡하고 일부 환경에서 silent drop 가능성이 있습니다.

### D. Prediction Layer

평가: `참고용으로는 가능, 강한 예측 엔진으로 보기엔 아직 부족`

장점:
- 최소 비교군 수, 평균 similarity gate, bootstrap interval 등 기본 guard가 있습니다.
- narrative도 비교 기반으로 일관되게 나옵니다.

한계:
- 후보 풀 오염 시 prediction도 그대로 오염됩니다.
- exact point-in-time 평가가 아닙니다.

### E. Calibration / Level-4 / Bridge

평가: `의도는 좋고 일부 구현도 좋지만, 아직 운영 artifact 과장 위험 있음`

장점:
- fail-closed 의도가 강함
- certification/promotion/drift gate가 분리되어 있음

한계:
- 일부 artifact는 placeholder
- 일부 메트릭은 실제 런타임과 완전히 연결되지 않음

## Priority Actions

### P0. Scoring 정합성 복구

1. `stage_growth`를 실제 판정에 반영하거나 제거
2. optimizer evaluator를 live scorer와 동일한 입력 함수로 맞추기
3. calibrated noise/weights를 scorer에 실제 연결

### P1. Online / Offline 정책 통일

1. backtest와 online comparison candidate policy 통일
2. active peer와 completed archetype을 분리
3. censoring-aware prediction 입력 설계

### P2. Input 품질 복구

1. news zero-fill과 missing 분리
2. stock market classification 수정
3. DataLab raw rounding 제거

### P3. 운영 안정성 개선

1. news/stocks failure를 warning/degraded mode로 변경
2. v4 disabled 시 silent success 금지
3. exact point-in-time 우선 평가로 강화

### P4. Tooling 신뢰도 복구

1. Python optimizer 테스트를 현재 구현과 맞게 갱신
2. `pytest` 또는 동등한 실행 경로를 CI에 포함
3. level-4 placeholder artifact 제거

## Overall Verdict

현재 TLI는 다음처럼 보는 것이 정확합니다.

- 코어 scorer/compare/predict 코드 품질: `중상`
- 운영 정합성: `중`
- calibration/optimizer 신뢰도: `중하`
- production decision support readiness: `조건부`

즉, "완전히 잘못된 시스템"은 아닙니다.
하지만 지금 상태에서 가장 위험한 부분은 모델 품질이 아니라 "서로 다른 경로가 서로 다른 정의를 쓰고 있다"는 점입니다.

이 정합성 문제를 먼저 정리하면, 현재 코드베이스는 꽤 빠르게 상용 수준으로 올라갈 수 있습니다.

## Verification Appendix

Executed successfully:

```bash
npx vitest run lib/tli/__tests__ scripts/tli-optimizer/__tests__
```

Result:
- `36` files passed
- `560` tests passed

Could not execute:

```bash
uv run pytest scripts/tli-optimizer/test_optimize.py
```

Reason:
- `pytest` missing in environment
