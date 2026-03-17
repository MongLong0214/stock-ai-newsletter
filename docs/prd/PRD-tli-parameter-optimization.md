# PRD: TLI Parameter Optimization Pipeline

**Version**: 0.2.1
**Author**: Isaac (AI-assisted)
**Date**: 2026-03-17
**Status**: Draft
**Size**: L

---

## 1. Problem Statement

### 1.1 Background

TLI(Theme Lifecycle Index) 알고리즘은 33개의 수동 튜닝 파라미터(sigmoid center/scale, 가중치, 임계값 등)로 구성되어 있다. 현재 파라미터는 개발 시 직관과 소규모 검증으로 설정되었으며, 데이터 기반 최적화가 수행된 적 없다.

현재 예측 성능:
- 전체 3-Phase 적중률: 51.4%
- Rising: 60.8%, Cooling: 38.0% (baseline 38.6% 미달)

Karpathy autoresearch의 "단일 메트릭 + keep/discard 자동 실험 루프" 패러다임을 TLI 파라미터 최적화에 적용한다.

### 1.2 Problem Definition

TLI 점수 파이프라인의 33개 파라미터가 데이터 기반으로 최적화되지 않아, Stage 분류 정확도가 최적 수준에 미달한다.

### 1.3 Impact of Not Solving

- Growth/Decline stage 방향 적중률이 검증 불가 (현재 baseline 측정도 없음)
- 뉴스레터 신뢰도에 직접 영향: "Growth" 테마가 실제로 성장하지 않으면 구독자 이탈
- 파라미터 변경 시 효과 측정 불가 → 감 기반 튜닝의 악순환

## 2. Goals & Non-Goals

### 2.1 Goals

- [ ] G1: Bayesian Optimization으로 33개 파라미터 자동 최적화. Validation GDDA를 baseline 대비 +5%p 이상 개선
- [ ] G2: Cautious Score Decay 도입으로 데이터 공백/일시적 노이즈에 의한 거짓 Stage 하락 방지. Stage Flip Rate 20% 감소
- [ ] G3: EMA Momentum Scheduling으로 테마 나이별 스무딩 차별화 (신생 테마: 빠른 반응, 성숙 테마: 안정적)

### 2.2 Non-Goals

- NG1: 비교/예측(analog comparison) 파이프라인 변경 — scoring pipeline만 대상
- NG2: 새로운 데이터 소스 추가 (소셜 미디어, 추가 주가 데이터 등)
- NG3: UI/프론트엔드 변경
- NG4: 딥러닝/CUDA 모델 도입

## 3. User Stories & Acceptance Criteria

### US-1: 파라미터 자동 최적화 실행
**As a** 개발자, **I want** 단일 커맨드로 TLI 파라미터 최적화를 실행, **so that** 데이터 기반으로 최적 파라미터를 찾을 수 있다.

**Acceptance Criteria:**
- [ ] AC-1.1: `python scripts/tli-optimizer/optimize.py` 실행 시 Optuna가 2단계 계층적 탐색을 수행하고, 최적 파라미터 세트를 JSON으로 출력
- [ ] AC-1.2: 각 trial에서 `subprocess.run(["npx", "tsx", "scripts/tli-optimizer/evaluate.ts", "--params", json_str, "--split", "train"])`로 GDDA를 측정 (shell=True 금지)
- [ ] AC-1.3: 최적화 완료 후 Train GDDA + Validation GDDA + baseline GDDA를 모두 보고. 과적합 여부 판단 가능
- [ ] AC-1.4: 최적 파라미터를 두 가지 형태로 출력: (1) `optimized-params.json` 파일, (2) `score-config.ts`에 붙여넣기 가능한 TypeScript 코드 스니펫 (stdout)
- [ ] AC-1.5: 최적화 시 train/val split 적용. Train GDDA와 Val GDDA 차이가 10%p 이상이면 과적합 경고 출력

### US-2: GDDA 평가 단독 실행
**As a** 개발자, **I want** 현재 파라미터로 GDDA를 측정, **so that** 변경 전후 효과를 비교할 수 있다.

**Acceptance Criteria:**
- [ ] AC-2.1: `npx tsx scripts/tli-optimizer/evaluate.ts` 실행 시 현재 파라미터로 GDDA를 계산하여 stdout에 출력
- [ ] AC-2.2: `--params` 플래그로 커스텀 파라미터 JSON을 전달할 수 있음
- [ ] AC-2.3: Growth Hit Rate, Decline Hit Rate, Balanced GDDA, Stage Flip Penalty를 개별 출력
- [ ] AC-2.4: Growth 판정 수, Decline 판정 수, Stage Flip Rate를 함께 출력 (최소 제약 검증용)
- [ ] AC-2.5: `--split=train|val|all` 플래그로 평가 범위를 선택할 수 있음

### US-3: Cautious Score Decay
**As a** 시스템, **I want** 점수 하락 시 기저 신호와 방향이 일치하는지 확인, **so that** 데이터 공백이나 일시적 노이즈로 인한 거짓 Decline을 방지한다.

**Acceptance Criteria:**
- [ ] AC-3.1: 점수 하락 시 3개 binary 신호(interest slope < 0, newsThisWeek < newsLastWeek, dvi < 0.4) 중 2개 이상이 하락 방향을 확인해야 정상 하락 반영
- [ ] AC-3.2: 신호 미확인(confirmCount < 2) 시 이전 smoothed score의 cautious_floor_ratio(기본 0.90)를 하한으로 유지
- [ ] AC-3.3: 기존 `score-smoothing.test.ts` 전체 통과 + Cautious Decay 전용 테스트 케이스 추가
- [ ] AC-3.4: Cautious Decay → Bollinger clamp → EMA 순서로 실행 (§4.7 통합 파이프라인 준수)

### US-4: EMA Momentum Scheduling
**As a** 시스템, **I want** 테마 나이에 따라 EMA alpha를 조절, **so that** 신생 테마는 빠르게 반응하고 성숙 테마는 안정적으로 유지된다.

**Acceptance Criteria:**
- [ ] AC-4.1: EMA alpha가 daysSinceSpike에 따라 선형 보간으로 0.6(0일)에서 0.3(30일+)까지 연속 변화. 30일 이후 alpha = 0.3 고정 (clamp)
- [ ] AC-4.2: applyEMASmoothing 함수에 firstSpikeDate + today 파라미터 추가. firstSpikeDate가 null이면 기본 alpha(0.4) 사용
- [ ] AC-4.3: 기존 `score-smoothing.test.ts` 전체 통과 + EMA Scheduling 전용 테스트 케이스 추가

## 4. Technical Design

### 4.1 Architecture Overview

```
autoresearch 패러다임 적용:

┌──────────────────────────────────────────────────────┐
│  optimize.py (Python + Optuna)                       │
│  = autoresearch의 program.md + AI Agent 역할          │
│                                                      │
│  2단계 계층적 최적화:                                   │
│  Stage 1: Core params (weights + stage thresholds)   │
│           80 trials → 상위 10개 파라미터 고정           │
│  Stage 2: Fine-tune (sigmoid scales + smoothing)     │
│           120 trials → 전체 파라미터 최적화             │
│                                                      │
│  각 trial:                                           │
│    subprocess.run(                                   │
│      ["npx","tsx","evaluate.ts","--params",json,     │
│       "--split","train"],                            │
│      timeout=30                                      │
│    )                                                 │
│    → stdout에서 GDDA 파싱                              │
│    → 개선 → Optuna DB 기록 (keep)                     │
│    → 악화 → Optuna pruning (discard)                  │
│                                                      │
│  완료 후: --split=val로 Validation GDDA 측정           │
└──────────────┬───────────────────────────────────────┘
               │ subprocess (list-based, shell=False)
               ▼
┌──────────────────────────────────────────────────────┐
│  evaluate.ts (TypeScript)                            │
│  = autoresearch의 train.py + prepare.py 역할          │
│                                                      │
│  Sequential State Machine (테마별 순차 처리):          │
│                                                      │
│  FOR each theme:                                     │
│    state = { prevSmoothed: null, prevStage: null,    │
│              prevCandidate: null, recentSmoothed: [] }│
│                                                      │
│    FOR each date (ascending):                        │
│      1. calculateLifecycleScore(metrics, params)     │
│         → rawScore, components                       │
│      2. applyEMASmoothing(                           │
│           rawScore, state.prevSmoothed,              │
│           state.recentSmoothed, firstSpikeDate, date)│
│         → smoothedScore                              │
│      3. resolveStageWithHysteresis(                  │
│           rawScore, smoothedScore, components,       │
│           state.prevStage, state.prevCandidate, ...) │
│         → stage                                      │
│      4. IF stage == Growth OR Decline:               │
│           compare future7dAvg vs current7dAvg        │
│           → HIT or MISS                              │
│      5. update state                                 │
│                                                      │
│  OUTPUT: GDDA + Growth HR + Decline HR + Flip Rate  │
└──────────────────────────────────────────────────────┘
               │ 사전 생성 (1회)
               ▼
┌──────────────────────────────────────────────────────┐
│  dump-data.ts                                        │
│  = autoresearch의 데이터 다운로드 역할                  │
│                                                      │
│  전제: .gitignore에 historical-data.json 등록 완료     │
│  (Step 0 선행 조건 — 데이터 덤프 전 반드시 확인)         │
│                                                      │
│  Supabase SELECT-only 쿼리로 과거 데이터 덤프           │
│  → historical-data.json                              │
│  (service_role key 사용하되 SELECT 문만 실행.           │
│   INSERT/UPDATE/DELETE 쿼리 포함 시 즉시 abort)        │
│                                                      │
│  덤프 범위: 최소 60일. 테마별 interest_metrics,         │
│  news_metrics, lifecycle_scores, theme metadata.      │
│  데이터 60일 미만 테마는 자동 제외.                      │
└──────────────────────────────────────────────────────┘
```

### 4.2 Data Model Changes

DB 스키마 변경 없음. 읽기 전용 (historical data dump).

### 4.3 API Design

N/A (CLI 도구, API 엔드포인트 없음)

### 4.4 Key Technical Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| 최적화 도구 | TypeScript 구현 / Python Optuna | Python Optuna | autoresearch 패턴 충실. Optuna의 TPE sampler + pruning이 33차원 탐색에 적합 |
| 평가 메트릭 | SDA(전 Stage) / Score 상관 / Phase 예측 / GDDA | GDDA | Peak 모순 회피, 2단계 직결, Balanced Accuracy로 표본 불균형 보정 |
| 데이터 접근 | 실시간 Supabase / JSON dump | JSON dump | autoresearch 원칙: 고정 인프라(prepare.py). 최적화 중 네트워크 의존 제거 |
| 파라미터 전달 | 환경변수 / CLI args / JSON stdin | CLI --params JSON | subprocess list-based 호출 (shell injection 방지) |
| 파라미터 주입 | Global setter / Function argument | Function argument with defaults | 순수 함수 유지, 테스트 용이, mutable global state 회피. 단일 caller이므로 blast radius 낮음 |
| 가중치 제약 | 정규화 / Dirichlet / 3+1 계산 | 3개 suggest + 4번째 계산 | w_activity = 1.0 - (w_interest + w_newsMomentum + w_volatility). Optuna Bayesian 모델 무결성 유지 |
| 탐색 전략 | 33차원 동시 / 계층적 | 2단계 계층적 | 차원의 저주 완화. Stage 1(core 10개, 80t) → Stage 2(fine-tune 23개, 120t) |
| 과적합 방지 | 없음 / 최근 7일 val / Walk-forward | Walk-forward with 7-day gap | 시계열 누수 방지. train=[0, T], gap=7일, val=[T+8, 끝] |

### 4.5 파라미터 탐색 공간 (33개)

#### 계층적 최적화 전략

```
Stage 1 (80 trials): Core Parameters — 10개
  가중치 3개 (w_interest, w_newsMomentum, w_volatility) + 4번째 계산
  Stage 임계값 4개 (dormant, emerging, growth, peak) + 단조 증가 제약
  trend_threshold 1개
  ema_alpha 1개
  min_raw_interest 1개
  → 상위 10% trial의 Core 파라미터 median 고정

Stage 2 (120 trials): Fine-tune — 나머지 23개
  Stage 1 Core 고정 상태에서 sigmoid/log scale, 내부 비율 등 미세 조정
```

#### Scoring Weights (3개 탐색 + 1개 계산)

| 파라미터 | 현재값 | 탐색 범위 | 비고 |
|---------|--------|----------|------|
| w_interest | 0.40 | [0.25, 0.55] | Stage 1 |
| w_newsMomentum | 0.35 | [0.20, 0.45] | Stage 1 |
| w_volatility | 0.10 | [0.05, 0.20] | Stage 1 |
| w_activity | 0.15 | **계산값** | 1.0 - sum(위 3개). WEIGHT_BOUNDS [0.05, 0.25] 미달 시 trial reject |

#### Stage Thresholds (5개) — Stage 1

| 파라미터 | 현재값 | 탐색 범위 | 제약 |
|---------|--------|----------|------|
| stage_dormant | 15 | [5, 25] | < stage_emerging |
| stage_emerging | 40 | [25, 50] | < stage_growth |
| stage_growth | 58 | [45, 70] | < stage_peak |
| stage_peak | 68 | [55, 85] | — |
| trend_threshold | 0.10 | [0.03, 0.20] | — |

Optuna 제약: `stage_dormant < stage_emerging < stage_growth < stage_peak`. 위반 시 trial reject (NaN 반환).

#### Smoothing Core (2개) — Stage 1

| 파라미터 | 현재값 | 탐색 범위 | 제약 |
|---------|--------|----------|------|
| ema_alpha | 0.4 | [0.2, 0.7] | — |
| min_raw_interest | 5 | [2, 15] | integer |

#### Interest Params (4개) — Stage 2

| 파라미터 | 현재값 | 탐색 범위 |
|---------|--------|----------|
| interest_level_center | 30 | [10, 60] |
| interest_level_scale | 20 | [5, 40] |
| interest_momentum_scale | 1.5 | [0.5, 3.0] |
| interest_level_ratio | 0.6 | [0.4, 0.8] |

#### News Params (4개) — Stage 2

| 파라미터 | 현재값 | 탐색 범위 |
|---------|--------|----------|
| news_log_scale | 50 | [20, 100] |
| news_momentum_scale | 1.0 | [0.3, 2.0] |
| news_volume_ratio | 0.6 | [0.4, 0.8] |
| min_news_last_week | 3 | [1, 7] |

#### Volatility Params (2개) — Stage 2

| 파라미터 | 현재값 | 탐색 범위 |
|---------|--------|----------|
| vol_center | 15 | [5, 30] |
| vol_scale | 10 | [3, 20] |

#### Activity Params (5개) — Stage 2

| 파라미터 | 현재값 | 탐색 범위 | 비고 |
|---------|--------|----------|------|
| price_sigmoid_scale | 5 | [2, 10] | — |
| volume_log_scale | 50000000 | [10M, 200M] | — |
| coverage_days | 14 | [7, 30] | — |
| activity_vs_sentiment_ratio | 0.7 | [0.5, 0.9] | sentiment_proxy weight = 1 - 이 값 |
| level_dampening_threshold | 0.1 | [0.05, 0.3] | — |

> **탐색 공간 제외**: Activity 내부 sub-weights (0.5/0.3/0.2 — calculator.ts:115-117)는 고정. 초기 탐색 공간 축소로 수렴 속도 확보. 필요 시 후속 최적화에서 추가.

#### Sentiment Proxy Params (4개) — Stage 2

| 파라미터 | 현재값 | 탐색 범위 | 비고 |
|---------|--------|----------|------|
| sent_price_weight | 0.50 | [0.3, 0.7] | 합계=1.0 제약 (3+1 계산) |
| sent_news_weight | 0.30 | [0.1, 0.5] | — |
| sent_volume_weight | 0.20 | **계산값** | 1.0 - (price + news) |
| sent_volume_scale | 0.5 | [0.2, 1.0] | — |

> Sentiment Proxy는 price+news+volume proxy로, 삭제된 키워드 기반 sentiment 모듈과 별개.
> sentiment-proxy.ts 내부 signal sigmoid(center=0, scale=5 / center=0, scale=1.5)는
> Activity/News의 동일 파라미터를 공유하므로 별도 탐색하지 않음.

#### Stage Bypass Params (2개) — Stage 2

| 파라미터 | 현재값 | 탐색 범위 | 소스 파일 |
|---------|--------|----------|----------|
| peak_bypass_news | 30 | [15, 50] | stage.ts:75,83 |
| decline_score_ratio | 0.85 | [0.70, 0.95] | stage.ts:82 |

#### Smoothing Fine-tune (1개) — Stage 2

| 파라미터 | 현재값 | 탐색 범위 |
|---------|--------|----------|
| min_daily_change | 10 | [5, 20] |

#### Cautious Decay Params (1개, Step 2 신규)

| 파라미터 | 초기값 | 탐색 범위 | 비고 |
|---------|--------|----------|------|
| cautious_floor_ratio | 0.90 | [0.80, 0.95] | Step 2에서 도입. 최적화 재실행 시 탐색 공간에 포함 |

### 4.6 GDDA 메트릭 정의

```
Growth-Decline Directional Accuracy (GDDA):

  ── 평가 단위 ──
  (theme, date) 쌍.
  quality gate 통과 테마 × 평가 기간 내 각 날짜.
  단, date에서 7일 후 데이터가 존재해야 함 (비교 불가 쌍은 제외).

  ── 방향 판정 (raw_value 기반) ──
  current_avg = mean(theme.interest_metrics[date-6..date].raw_value)
  future_avg  = mean(theme.interest_metrics[date+1..date+7].raw_value)

  raw_value를 사용하는 이유: normalized는 파라미터에 의존하여 순환 참조 발생.
  raw_value는 Naver DataLab 원본값으로 파라미터 독립적.

  direction = future_avg - current_avg
    상승: direction > 0
    하락: direction <= 0

  ── HIT 판정 ──
  Growth stage @ date → direction > 0  → HIT
  Decline stage @ date → direction <= 0 → HIT
  Peak / Dormant / Emerging → 제외

  ── Balanced Accuracy ──
  Growth Hit Rate = Growth HIT / Growth 전체 판정 수
  Decline Hit Rate = Decline HIT / Decline 전체 판정 수
  GDDA_raw = (Growth Hit Rate + Decline Hit Rate) / 2

  ── Stage Stability Penalty ──
  stage_flip_count = 평가 기간 내 연속일 Stage 변경 횟수 (전 Stage 포함)
  stage_flip_rate = stage_flip_count / 전체 평가 일수
  IF stage_flip_rate > 0.30:
    stability_penalty = 0.8
  ELSE:
    stability_penalty = 1.0

  ── 최소 표본 Graduated Penalty ──
  sample_penalty = min(growth_count / 10, 1.0) × min(decline_count / 5, 1.0)

  ── 최종 GDDA ──
  GDDA = GDDA_raw × stability_penalty × sample_penalty

  ── Optuna Objective ──
  IF stage_dormant >= stage_emerging OR stage_emerging >= stage_growth
     OR stage_growth >= stage_peak:
    return NaN  (단조 증가 위반 → trial reject)
  IF w_activity < 0.05 OR w_activity > 0.25:
    return NaN  (가중치 bounds 위반 → trial reject)
  return GDDA
```

### 4.7 Cautious Score Decay (Step 2) — 통합 파이프라인

```
score-smoothing.ts applyEMASmoothing 수정:

  ── 전체 흐름 (순서 고정) ──

  Step A: Cautious Decay Check
    IF rawScore < prevSmoothedScore (하락 감지):
      signals = [
        interest_slope < 0,           // binary: 관심도 기울기 음수
        newsThisWeek < newsLastWeek,  // binary: 뉴스 감소
        dvi < 0.4,                    // binary: 방향성 지수 하락
      ]
      confirmCount = count(true in signals)

      // 다수결 원칙 (Majority Vote):
      // 3개 독립 binary 신호 중 과반(2개+)이 하락을 확인해야 진짜 하락.
      // 1개 이하 확인 = 일시적 노이즈/데이터 공백 가능성 → 보수적 처리.
      // 이 임계값(2)은 Step 1 최적화 후 cautious_floor_ratio와 함께
      // 후속 검증 대상.

      IF confirmCount >= 2:
        effectiveRaw = rawScore  // 정상 하락 반영
      ELSE:
        cautious_floor = prevSmoothedScore × cautious_floor_ratio (기본 0.90)
        effectiveRaw = max(rawScore, cautious_floor)
    ELSE:
      effectiveRaw = rawScore  // 상승/유지는 그대로

  Step B: Bollinger Band Clamp (기존 로직 유지)
    sigma = stddev(recentSmoothed)  // 최소 2개
    maxDailyChange = max(MIN_DAILY_CHANGE, 2 × sigma)
    IF |effectiveRaw - prevSmoothedScore| > maxDailyChange:
      effectiveRaw = prevSmoothedScore + sign × maxDailyChange

  Step C: EMA 적용
    alpha = computeAlpha(firstSpikeDate, today)  // §4.8 참조
    smoothed = round(alpha × effectiveRaw + (1 - alpha) × prevSmoothedScore)
    return clamp(smoothed, 0, 100)
```

### 4.8 EMA Momentum Scheduling (Step 3)

```
score-smoothing.ts 신규 함수:

  function computeAlpha(firstSpikeDate: string | null, today: string): number {
    IF firstSpikeDate === null:
      return 0.4  // 기본값 (기존 EMA_ALPHA와 동일)

    daysSinceSpike = daysBetween(firstSpikeDate, today)
    frac = clamp(daysSinceSpike / 30, 0, 1)

    // 선형 보간: 0일→alpha=0.6 (반응적), 30일+→alpha=0.3 (안정적)
    return (1 - frac) × 0.6 + frac × 0.3
  }

applyEMASmoothing 시그니처 변경:
  기존: applyEMASmoothing(rawScore, prevSmoothedScore, recentSmoothed)
  변경: applyEMASmoothing(rawScore, prevSmoothedScore, recentSmoothed,
                          firstSpikeDate?, today?)

  firstSpikeDate/today 미전달 시 기존 EMA_ALPHA=0.4 사용 (하위 호환).
```

### 4.9 Train/Validation Split 전략

```
시계열 누수(Data Leakage) 방지를 위한 Walk-forward 분할:

  전체 데이터: Day 1 ────────────────────────── Day N

  Train:  Day 1 ─────────── Day T
  Gap:    Day T+1 ── Day T+7  (7일 버퍼, GDDA의 7일 forward 참조와 격리)
  Val:    Day T+8 ────────── Day N

  T 결정 기준:
    Val 기간이 최소 14일 이상이 되도록 설정.
    Train에서 Growth ≥ 50, Decline ≥ 20 판정이 나오는 최소 기간.
    dump-data.ts 실행 후 사전 측정하여 T를 결정.

  evaluate.ts --split 플래그:
    --split=train  → Day 1 ~ Day T 범위만 평가
    --split=val    → State machine은 Day 1부터 실행하되, HIT/MISS 판정(Step 4)만
                     Day T+8 ~ Day N 범위에서 수행. prevSmoothed/prevStage 연속성 보장.
    --split=all    → 전체 범위 평가 (baseline 측정용)

  T fallback:
    제약 조건(Val >= 14일, Growth >= 50, Decline >= 20)을 동시에 만족하는 T가 없을 경우:
    1차 완화: Growth >= 30, Decline >= 10
    2차 완화: dump 기간 90일로 확장 후 재시도
    최종 fallback: 경고 출력 + --split=all로 전체 평가 (val 분리 없이 baseline만 측정)

  과적합 판정:
    |Train GDDA - Val GDDA| > 10%p → 과적합 경고
    Val GDDA < baseline GDDA → 최적화 실패 (파라미터 적용하지 않음)
```

## 5. Edge Cases & Error Handling

| # | Scenario | Expected Behavior | Severity |
|---|----------|-------------------|----------|
| E1 | historical-data.json 미존재 | evaluate.ts: `"Error: historical-data.json not found. Run dump-data.ts first."` + exit(1) | High |
| E2 | 테마 interest 데이터 7일 미만 (미래 비교 불가) | 해당 (theme, date) 쌍 GDDA 계산에서 제외. 제외 건수 로깅 | Medium |
| E3 | Optuna trial에서 가중치 합계 w_activity out of bounds | w_activity = 1.0 - sum(3개). [0.05, 0.25] 미달 시 return NaN (trial reject) | High |
| E4 | Stage 임계값 역전 (dormant >= emerging 등) | Optuna에서 return NaN. 단조 증가 제약 위반 → trial reject | High |
| E5 | evaluate.ts subprocess timeout (> 30초) | optimize.py: `subprocess.TimeoutExpired` catch → trial pruning + 로깅 | Medium |
| E6 | Cautious decay에서 모든 signal neutral (= decline 미확인) | confirmCount = 0 < 2 → cautious floor 적용. 각 signal은 binary (확인=True, 미확인=False). neutral은 미확인으로 취급 | Low |
| E7 | 신생 테마 daysSinceSpike=0 | alpha = 0.6 (최대 반응성). firstSpikeDate null이면 alpha = 0.4 (기본값) | Low |
| E8 | GDDA forward 윈도우가 데이터 범위 초과 | date + 7 > 마지막 데이터 날짜인 쌍은 제외. train split에서 T 근처 7일도 자동 제외 | Medium |
| E9 | dump-data.ts에서 SELECT 외 쿼리 시도 | 쿼리 빌더에서 .select() 이외 메서드 호출 시 throw Error + abort | High |
| E10 | 신생 테마(< 7일) + Cautious Decay + 높은 alpha(0.6) 동시 적용 | 이중 보호(높은 alpha + cautious floor)로 하락이 지연될 수 있음. Cautious Decay는 confirmCount 기반이므로 신호가 명확하면(2/3 확인) 정상 하락됨. 모니터링 대상 | Low |
| E11 | historical-data.json이 .gitignore에 미등록 상태에서 dump 실행 | dump-data.ts 시작 시 .gitignore에 해당 패턴 존재 여부 확인. 미등록이면 abort + 안내 메시지 | High |

## 6. Security & Permissions

### 6.1 Authentication
Supabase 데이터 덤프 시 service_role key 사용 (기존 .env.local).

### 6.2 Authorization
- dump-data.ts는 **SELECT-only** 쿼리만 실행. `.select()` 외 Supabase 메서드(`.insert()`, `.update()`, `.delete()`, `.rpc()`) 호출 시 즉시 abort
- service_role key는 RLS를 우회하므로, 쿼리 범위를 interest_metrics, news_metrics, lifecycle_scores, themes 4개 테이블로 제한
- optimize.py → evaluate.ts 호출 시 `subprocess.run([...], shell=False)` 강제. shell=True 금지

### 6.3 Data Protection
- **선행 조건**: .gitignore에 `scripts/tli-optimizer/historical-data.json` 등록 완료 후에만 dump-data.ts 실행 가능 (E11 참조)
- historical-data.json에는 테마명, 관심도 시계열, 뉴스 건수, 주가 변동 데이터 포함. 상업적으로 민감할 수 있으므로 외부 공유 금지
- 최적화 완료 후 historical-data.json 삭제 권장 (파라미터만 보존)
- Supabase credentials는 기존 .env.local 사용 (이미 .gitignore 등록)

## 7. Performance & Monitoring

| Metric | Target | Measurement |
|--------|--------|-------------|
| 단일 trial 실행 시간 | < 10초 | evaluate.ts 실행 시간 |
| Stage 1 최적화 (80 trials) | < 15분 | optimize.py Stage 1 |
| Stage 2 최적화 (120 trials) | < 25분 | optimize.py Stage 2 |
| 전체 최적화 | < 40분 | optimize.py 총 실행 시간 |
| GDDA 개선폭 (Validation) | baseline 대비 +5%p 이상 | Val GDDA 비교 |

### 7.1 Monitoring & Alerting
- Optuna의 내장 로깅으로 trial별 GDDA 추적
- Stage 1 → Stage 2 전환 시 고정 파라미터 + 중간 GDDA 출력
- 최적화 완료 시: 파라미터 변경 diff + Train/Val GDDA + 과적합 여부 판정
- 과적합 경고: Train-Val GDDA 차이 > 10%p 시 stdout에 `[WARNING] Overfitting detected` 출력

### 7.2 재최적화 정책
- 3개월 주기로 fresh dump → 재최적화 권장
- Val GDDA가 직전 최적화 대비 5%p 이상 하락 시 재최적화 트리거
- 재최적화 시 cautious_floor_ratio를 탐색 공간에 포함 (§4.5)

## 8. Testing Strategy

### 8.1 Unit Tests
- `evaluate.ts`: GDDA 계산 로직 (mock 데이터로 HIT/MISS/flip rate/penalty 검증)
- `cautious-decay`: 신호 0/1/2/3개 확인 시 각각 올바른 분기 검증
- `ema-scheduling`: daysSinceSpike = 0, 15, 30, 60일에서 alpha 정확도 검증
- `computeAlpha`: firstSpikeDate null 시 기본값 0.4 반환 검증

### 8.2 Integration Tests
- evaluate.ts가 소규모 fixture JSON으로 GDDA를 올바르게 계산하는지 검증
- evaluate.ts --split=train/val/all 각각 올바른 범위만 평가하는지 검증
- optimize.py → evaluate.ts subprocess 통신 (1 trial, list-based command)

### 8.3 Edge Case Tests
- Section 5의 E1-E11 전체 커버리지
- 기존 `lib/tli/__tests__/` 33개 테스트 파일 전체 통과 (regression)

### 8.4 Regression Gate
- 최적화 파라미터 적용 후 `vitest run lib/tli` 33/33 통과 확인
- 이 게이트를 통과해야 Isaac 리뷰 요청 가능

## 9. Rollout Plan

### 9.0 Prerequisites (Step 0)
- [ ] .gitignore에 `scripts/tli-optimizer/historical-data.json` 추가
- [ ] Python 3.10+ 및 Optuna 설치 확인
- [ ] dump-data.ts 실행하여 historical-data.json 생성
- [ ] evaluate.ts --split=all --params=current 실행하여 baseline GDDA 측정 → PRD §11 baseline 기록

### 9.1 Migration Strategy
DB 변경 없음. 코드 변경만:
1. Step 0 (Prerequisites) 완료
2. Step 1 최적화 실행 → Train/Val GDDA 확인 → `vitest run lib/tli` 33/33 통과 확인 → Isaac 승인
3. 최적 파라미터를 score-config.ts 기본값에 반영
4. Step 2 (Cautious Decay) 코드 반영 → 테스트 통과 확인
5. Step 3 (EMA Scheduling) 코드 반영 → 테스트 통과 확인
6. Step 3 적용 후 재최적화 권장: Step 1에서 최적화된 ema_alpha는 computeAlpha 도입 후 null-firstSpikeDate 테마 전용 fallback이 됨. alpha_young(0일값)과 alpha_mature(30일+값)을 탐색 공간에 추가하여 재최적화 실행 권장 (필수 아님)

### 9.2 Feature Flag
score-config.ts의 기존 `setScoreWeights()`/`getScoreWeights()` 패턴을 활용.
환경변수 `TLI_PARAMS_VERSION=v1|v2`로 기본값(v1)과 최적화값(v2) 전환 가능.
**미설정(undefined) 시 기본값 = v1 (기존 파라미터)**. 안전한 방향으로 기본 동작 보장.
이상 발견 시 env var 제거 또는 v1 설정으로 즉시 복귀.
TLI scoring은 서버 사이드(API Route/cron)에서 실행되므로 Vercel env var 변경 시 재배포 필요. 재배포 소요 ~3분.

### 9.3 Rollback Plan
- **파라미터 (즉시)**: `TLI_PARAMS_VERSION=v1` env var 설정 → 기본 파라미터 복귀. 재배포 불필요
- **파라미터 (영구)**: git revert로 score-config.ts 복원 → 재배포 (~5분)
- **Cautious Decay / EMA Scheduling**: 각각 독립 커밋. 개별 git revert 가능
- **영향 범위**: 롤백 전 최대 1회 daily scoring cycle이 영향받을 수 있음

## 10. Dependencies & Risks

### 10.1 Dependencies
| Dependency | Owner | Status | Risk if Delayed |
|-----------|-------|--------|-----------------|
| Python 3.10+ | Local env | 확인 필요 | Optuna 실행 불가. 대체: pip install --user |
| Optuna >= 3.0 | PyPI | Stable | 대체: Ax, Hyperopt |
| Supabase historical data (60일+) | DB | Available | 데이터 부족 시 30일로 축소 + 경고 |

### 10.2 Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| GDDA 개선 미미 (< 2%p) | Medium | High | 파라미터 최적화 한계일 경우, 구조 변경(Step 2/3)이 보완. 탐색 공간 확장(Activity sub-weights 포함) 고려 |
| 과적합 | Medium | High | Walk-forward split + 7일 gap. Train-Val 차이 > 10%p 시 경고. Val GDDA < baseline 시 적용 거부 |
| Python 환경 미설치 | Low | Medium | requirements.txt + `pip install -r requirements.txt` 가이드. 또는 `uv pip install optuna` |
| 재최적화 시점 미스 | Medium | Medium | 3개월 주기 재최적화 정책. Val GDDA 5%p 하락 시 트리거 |

## 11. Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|--------------------|
| GDDA Val (Balanced) | Step 0에서 측정 → 24시간 내 PRD backfill | baseline + 5%p | evaluate.ts --split=val |
| Growth Hit Rate | Step 0에서 측정 | > 60% | evaluate.ts |
| Decline Hit Rate | Step 0에서 측정 | > 50% | evaluate.ts |
| Stage Flip Rate | Step 2 전 측정 | Step 2 후 20% 감소 | evaluate.ts |
| Train-Val GDDA 차이 | N/A | < 10%p | 과적합 미발생 확인 |

> Baseline은 Step 0 (dump-data.ts + evaluate.ts --split=all) 실행 직후 기록.
> 24시간 내 이 표의 Baseline 열을 실측값으로 업데이트.

## 12. Open Questions

- [x] OQ-1: 평가 메트릭 → GDDA 확정
- [ ] OQ-2: Python 환경(uv/pip) → Step 0에서 확인
- [x] OQ-3: 백테스트 기간 → 최소 60일. Train에서 Growth ≥ 50, Decline ≥ 20 확보되는 기간으로 설정. dump-data.ts 후 사전 측정으로 결정

---

## File Map (예상 생성/수정 파일)

### 신규 생성
| 파일 | 목적 |
|------|------|
| `scripts/tli-optimizer/optimize.py` | Optuna 2단계 계층적 최적화 루프 |
| `scripts/tli-optimizer/param_space.py` | Optuna 탐색 공간 + 제약 정의 |
| `scripts/tli-optimizer/evaluate.ts` | GDDA Sequential State Machine 평가 |
| `scripts/tli-optimizer/dump-data.ts` | Supabase → JSON 덤프 (SELECT-only) |
| `scripts/tli-optimizer/types.ts` | TLI 파라미터 인터페이스 |
| `scripts/tli-optimizer/requirements.txt` | `optuna>=3.0` |
| `scripts/tli-optimizer/__tests__/evaluate.test.ts` | GDDA 계산 유닛 테스트 |

### 기존 수정
| 파일 | 변경 내용 |
|------|----------|
| `lib/tli/calculator.ts` | 하드코딩 파라미터를 optional config 인자로 추출 (기본값 = 현재값) |
| `lib/tli/score-smoothing.ts` | Cautious Decay 로직 추가 (Step A) + EMA alpha를 computeAlpha()로 교체 (Step C) + applyEMASmoothing 시그니처에 firstSpikeDate?, today? 추가 |
| `lib/tli/sentiment-proxy.ts` | 하드코딩 가중치를 optional config 인자로 추출 |
| `lib/tli/stage.ts` | 하드코딩 임계값 + peak_bypass_news + decline_score_ratio를 optional config 인자로 추출 |
| `lib/tli/constants/score-config.ts` | 통합 파라미터 타입 정의 + TLI_PARAMS_VERSION env var 기반 전환 로직 |
| `scripts/tli/calculate-scores.ts` | applyEMASmoothing 호출 시 firstSpikeDate, today 전달 추가 |
| `.gitignore` | `scripts/tli-optimizer/historical-data.json` 추가 |
| `lib/tli/__tests__/score-smoothing.test.ts` | Cautious Decay + EMA Scheduling 테스트 케이스 추가 |

---

## Changelog

### v0.2 (2026-03-17) — 리뷰 반영
- **P1-1**: §4.9 Train/Val Split 전략 신설. Walk-forward + 7일 gap. evaluate.ts --split 플래그
- **P1-2**: §4.7 Cautious Decay 통합 파이프라인 명시 (Step A → B → C 순서 고정)
- **P1-3**: decline_ratio → cautious_floor_ratio(0.90)로 통일. Stage Bypass의 decline_score_ratio(0.85)와 분리
- **P1-4**: §9.0 Prerequisites에 .gitignore 선행 등록 + E11 edge case 추가
- **P1-5**: §6.2 Authorization에 SELECT-only 제약 + dump-data.ts abort 로직 명시
- **P1-6**: §4.6 GDDA raw_value 기반 명시 + 순환 참조 방지 근거 + 완전한 pseudocode
- **P1-7**: §4.7에 다수결 원칙(2/3) 근거 명시. 후속 검증 대상임을 표기
- **P2-8**: §4.1 Architecture에 Sequential State Machine 상세 흐름 추가
- **P2-9**: File Map에 calculate-scores.ts 추가. applyEMASmoothing 시그니처 변경 명시
- **P2-10**: §4.6 GDDA에 Stage Stability Penalty 추가 (flip_rate > 0.30 시 0.8 패널티)
- **P2-11**: §4.4에 가중치 3+1 계산 전략 명시. Dirichlet 대신 채택한 이유
- **P2-12**: §4.5에 2단계 계층적 최적화 전략 추가 (Stage 1: 80t core, Stage 2: 120t fine-tune)
- **P2-13**: AC-1.4에 JSON 파일 + TypeScript 스니펫 명시

### v0.2.1 (2026-03-17) — Round 2 리뷰 반영
- **N1**: §4.9 --split=val state 누적 명시 ("State machine은 Day 1부터 실행, HIT/MISS만 val 범위")
- **N2**: §9.2 TLI_PARAMS_VERSION 미설정 시 v1 기본값 명시 + Vercel 재배포 소요 명시
- **N3**: §9.1 Step 6 추가 — Step 3 후 ema_alpha 무효화 인정 + 재최적화 권장
- **N4**: §4.9 T fallback 추가 — 제약 완화 → dump 확장 → all fallback 3단계
- **P3**: 카테고리 재분류, Activity sub-weights 제외 명시, baseline backfill 시점, 재최적화 정책 §7.2
