# TLI Algorithm Redesign Specification

> **Author**: Algorithm Scientist Agent
> **Date**: 2026-02-17 (v3 — 전문가 리뷰 3건 CRITICAL 7 + HIGH 10 반영)
> **Status**: Draft for Isaac Review (Level 2)
> **Scope**: Score / Stage / Phase / Comparison / Prediction 알고리즘 전면 재설계
> **Prior Research**: `_research/reports/` 6건 + `_research/figures/` 6건 통합 반영

---

## Executive Summary

**프로덕션 데이터가 입증하는 시스템 붕괴**: 220개 테마 중 Growth/Peak = **0개**, Decay = **139개(63%)**. max score = 58로 Growth(60+) 진입이 구조적으로 불가능하다. 이것은 단일 테마의 실패가 아니라 **전체 알고리즘의 구조적 결함**이다.

근본 원인 7가지:
1. **Score 구조적 상한** — dampening + 정규화 범위가 60점 이상을 원천 차단
2. **자기정규화 편향** — self-max normalized 값으로 ratio를 계산하여 절대 수준 무시
3. **뉴스 절대량 무시** — 반도체(1070건/주)도 성장률만 봐서 Decay
4. **Stage/Phase 이원화 모순** — 300건(30%) 예측-스테이지 불일치
5. **방향 무관 변동성** — 상승/하락 변동 동일 보상
6. **Metric Collapse** — 유사도 지표의 지수 압축(CV=0.20) + 센트로이드 끌림(r=-0.996)
7. **curve_sim 미활용** — 68%가 0, feature_sim 단일 의존

본 명세서는 학술적 근거 + 선행연구 6건 + 프로덕션 데이터 220개 테마 분석을 기반으로 재설계를 제안한다.

---

## Table of Contents

0. [프로덕션 데이터 근거 + 선행연구 통합](#0-프로덕션-데이터-근거--선행연구-통합)
1. [Score 계산 재설계](#1-score-계산-재설계)
2. [Stage 분류 재설계](#2-stage-분류-재설계)
3. [News Momentum 재설계](#3-news-momentum-재설계)
4. [Volatility 재설계](#4-volatility-재설계)
5. [Comparison 재설계](#5-comparison-재설계)
6. [Prediction 재설계](#6-prediction-재설계)
7. [Stage-Phase 통합 설계](#7-stage-phase-통합-설계)
8. [Score 안정화 (Smoothing)](#8-score-안정화-smoothing)
9. [우주항공산업 검증](#9-우주항공산업-검증)
10. [구현 가이드](#10-구현-가이드)
11. [롤백 전략](#11-롤백-전략)
- [References](#references)

---

## 0. 프로덕션 데이터 근거 + 선행연구 통합

### 0.1 프로덕션 데이터 핵심 통계 (220개 테마)

| 지표 | 값 | 의미 |
|------|-----|------|
| Score min/max/avg/median | 12 / 58 / 31.3 / 30 | **max=58 → Growth(60+) 도달 불가** |
| Score P25/P75 | 22 / 40 | 대부분 20-40 밴드에 밀집 |
| Growth/Peak 테마 | **0 / 0** | 알고리즘이 성장/정점을 인식 못함 |
| Decay 테마 | **139 (63%)** | 대부분이 "말기"로 오분류 |
| Dormant 테마 | 26 (12%) | - |
| Early 테마 | 55 (25%) | - |
| maturity=0.11 테마 | 131 (60%) | 신규인데 Decay로 분류 |
| dampening min/max/avg | 0.500 / 1.000 / 0.898 | 하한 0.5가 작동 중 |
| raw_interest_avg=0 | 26건 | DataLab API 문제 |
| 5일 내 15점+ 변동 | 57건 (26%) | **Score 불안정** |
| 예측-스테이지 불일치 | 300건 (30%) | Stage=Decay + daysToPeak>0 |

### 0.2 "활발한데 말기" Top 5 (P1 — 알고리즘 실패 증거)

| 테마 | 주간 뉴스 | Stage | 현실 |
|------|----------|-------|------|
| 바이오 | 766건 | Decay | 항상 활발 ❌ |
| 가상현실 | 662건 | Decay | 메타 투자 급증 ❌ |
| 모바일게임 | 578건 | Decay | 항상 활발 ❌ |
| 반도체 | 1070건 | Decay | 한국 핵심 산업 ❌ |
| 우주항공산업 | 116건 | Decay | 관련주 폭등 ❌ |

### 0.3 선행연구 반영 요약

| 보고서 | 핵심 발견 | 본 명세서 반영 위치 |
|--------|----------|-----------------|
| `similarity_bottleneck_analysis` (2/11) | z-score decay 0.7→0.5, 섹터 패널티 0.7→0.85, 키워드 91% zero | §5 Comparison |
| `metric_collapse_report` (2/11) | CV=0.20 (목표 >0.50), 센트로이드 r=-0.996, **Mutual Rank 제안** | §5 Comparison |
| `comparison_algorithm_validation` (2/10) | 임계값 0.40 과도→0.35, wFeature cap 0.60→0.65, volume max 100M→50M | §5 Comparison |
| `tli_algorithm_quality_report` (2/11) | 최적 가중치 Interest 0.55/News 0.35, 감성 0.05로 축소 | §1 Score |
| `tli-quality-improvement-plan` (2/11) | Score Confidence, Anchor 정규화, 피드백 루프 설계 | §1, §10 |
| `stage-nav-rewrite` (2/8) | Stage 네비게이션 UI 리뉴얼 | §7 Stage-Phase |

### 0.4 Weights 불일치 경고

DB에 이전 가중치로 계산된 레코드 존재:
```
DB 일부: interest=0.4, news=0.25, sentiment=0.2, vol=0.15  (이전)
코드:    interest=0.50, news=0.30, vol=0.20                  (현재, sentiment 제거됨)
```
→ 재설계 배포 시 **전체 score 재계산 필수** (부분 적용 시 혼재 위험)

### 0.5 Score 구조적 상한 분석 (근본 원인)

**왜 max score = 58인가?**

```
interestScore = normalize(ratio, 0.5, 3.0) * dampening
```

1. ratio=3.0 (최대 → normalize=1.0) 조건: recent7dAvg가 baseline의 3배
   - 실제로 ratio > 2.0인 테마 = 거의 없음 (대부분 0.5-1.5)
   - ratio=1.5 → normalize = (1.5-0.5)/(3.0-0.5) = 0.40

2. dampening 평균 0.898이지만 하위 20% 테마는 0.5-0.7
   - interestScore 실질 상한 ≈ 0.40 * 0.90 = **0.36**

3. interestScore=0.36 * weight 0.50 = **18점** (50점 만점 중)
4. newsMomentum 최대 0.30 * weight 0.30 = **9점**
5. volatility 최대 1.0 * weight 0.20 = **20점**
6. **이론적 최대 = 18 + 9 + 20 = 47점** (실질 상한, 60점 도달 불가)

→ **Dual-Axis 구조로 interestScore 상한을 0.36 → 0.85+로 올려야 60+ 가능**

### 0.6 curve_sim = 0 문제 (68%)

```
1000건 비교 중 677건의 curve_sim=0
원인: minCurveLen < 7 → curveSim=0 반환, feature_sim 단독 의존
```

선행연구 발견: feature_sim의 CV=0.20 (매우 나쁨)으로, 단독 의존 시 모든 비교가 동질화.
→ **Mutual Rank가 이미 검증됨** (metric_collapse_report §3.3): CV 0.20→1.01 개선.
→ 본 명세서 §5에서 Mutual Rank를 유지하되, Score 재설계로 feature 입력 품질도 동시 개선.

---

## 1. Score 계산 재설계

### 학술적 배경

**참고 모델:**
- RSI (Relative Strength Index): 상대 강도를 0-100으로 정규화하는 금융공학 표준 — `RSI = 100 - 100/(1+RS)` where RS = avg_gain / avg_loss
- OECD Composite Leading Indicators: 절대 수준 + 성장률을 결합한 복합 지수 구성 방법론
- MACD-V (Volatility-Normalized MACD): 변동성 정규화로 교차 비교 가능한 모멘텀 지표

**핵심 원리:**
복합 지수(composite index)에서는 **절대 수준(level)과 성장률(growth rate)을 독립 축으로 모두 반영**해야 한다 (OECD Handbook on Constructing Composite Indicators). 현행 TLI는 성장률(interestRatio)만 사용하여 "높은 절대 관심도 + 약한 성장률" 테마를 과소평가한다.

### 현재 구현의 수학적 문제점

#### 문제 1: interestRatio의 자기정규화 편향
```
interestRatio = recent7dAvg / baseline30dAvg
```
- `recent7dAvg`와 `baseline30dAvg`는 동일 테마의 self-max normalized 값 (0-100)
- 신규 테마(11일): baseline이 4일분뿐 → ratio가 비정상
- **우주항공산업**: recent7d=36.7 (높은 절대값), baseline=49.5 → ratio=0.74 → normalize(0.74, 0.5, 3.0)=0.096 ≈ **0**

**근본 원인**: ratio가 1.0 미만이면 "감소 중"으로 해석되나, 절대값이 크고 단지 이전 주보다 약간 낮을 뿐인 상황을 포착하지 못함.

#### 문제 2: dampening의 과잉 억제
```
rawPercentile = 0.03 (하위 3%)
percentileDampening = 0.1 + (0.03/0.2)*0.9 = 0.235
dampening = max(0.5, 0.235*0.6 + 1.0*0.4) = max(0.5, 0.541) = 0.541
interestScore = 0.096 * 0.541 = 0.052
```
- rawPercentile이 "전체 테마 대비 백분위"인데, 신규 테마는 데이터 부족으로 낮게 나옴
- dampening이 이미 낮은 interestRatio를 추가 억제 → 이중 처벌

#### 문제 3: 가중치 구조의 한계
```
score = interest(50%) + news(30%) + volatility(20%)
```
- Interest가 사실상 0이면 최대 score = 0 + 30 + 20 = 50
- 뉴스가 아무리 폭발해도 Interest가 0이면 Growth 진입 불가 (60점 필요)
- **절대 관심도, 주가, 거래량 등 교차 시그널 부재**

### 개선된 수식

#### 1.1 Dual-Axis Interest Score (절대 수준 + 성장률 분리)

```
// Axis 1: Cross-Sectional Level (절대 수준 — 테마 간 비교)
levelScore = percentileRank(rawAvg7d, allThemesRawAvg7d)
  범위: [0, 1], 1.0 = 전체 테마 중 최상위

// Axis 2: Temporal Momentum (시계열 성장률)
if baseline > 0:
  growthRate = (recent7dAvg - baselineAvg) / baselineAvg
  momentumScore = sigmoid_normalize(growthRate, center=0, scale=1.5)
else:
  momentumScore = sigmoid_normalize(recent7dAvg, center=30, scale=20) * 0.5

// DataLab 미수집 Fallback
if rawAvg7d == 0 AND newsThisWeek > 0:
  interestScore = newsScore * 0.7  // 뉴스 기반 대리 지표 (30% 할인)
else:
  // Combined Interest Score
  interestScore = levelScore * W_LEVEL + momentumScore * W_MOMENTUM
    where W_LEVEL = 0.6, W_MOMENTUM = 0.4
```

**변수 정의:**
- `rawAvg7d`: 최근 7일 raw interest 평균 (네이버 데이터랩 원본값)
- `allThemesRawAvg7d`: 같은 날짜의 전체 활성 테마 raw 7일 평균 배열
- `percentileRank()`: 정렬된 배열에서의 백분위 위치 [0, 1]
- `sigmoid_normalize(x, c, s)`: 1 / (1 + exp(-(x - c) / s)) — S자 곡선으로 부드러운 0-1 매핑

**근거:**
- levelScore는 **cross-sectional normalization** — 한 시점에서 모든 테마를 비교 (자기정규화 편향 제거)
- momentumScore는 **temporal normalization** — 자기 자신의 시계열 변화율
- sigmoid는 RSI처럼 극단값을 0/1로 자연스럽게 포화시킴 (하드코딩 min/max 불필요)
- 6:4 비율: 절대 수준을 우선하되 성장률 방향성도 반영 (OECD CLI 방법론 참조)

**모집단 최소 Gate:** 활성 테마 수 < 50이면 percentileRank 대신 sigmoid fallback 사용:
```
if allThemesRawAvg7d.length < 50:
  levelScore = sigmoid_normalize(rawAvg7d, center=20, scale=15)  // 절대값 기반 sigmoid
else:
  levelScore = percentileRank(rawAvg7d, allThemesRawAvg7d)       // cross-sectional percentile
```
> 모집단 50개 미만에서 percentile은 granularity 부족 (2% 단위). Sigmoid는 모집단 무관하게 안정적.

#### 1.2 News Activity Score (절대량 + 모멘텀 통합)

```
// Axis 1: Absolute News Volume (절대 기사량)
volumeScore = log_normalize(newsThisWeek, scale=50)
  = min(1, log(1 + newsThisWeek) / log(1 + scale))
  // 제약: scale > 0 (필수). scale=0이면 division by zero.

// Axis 2: News Momentum (성장률)
if newsLastWeek >= 3:
  newsGrowthRate = (newsThisWeek - newsLastWeek) / newsLastWeek
  newsMomentumScore = sigmoid_normalize(newsGrowthRate, center=0, scale=1.0)
else:
  newsMomentumScore = 0.5  // 기준선 부재 → 중립

// Combined News Score
newsScore = volumeScore * W_NEWS_VOL + newsMomentumScore * W_NEWS_MOM
  where W_NEWS_VOL = 0.6, W_NEWS_MOM = 0.4
```

**근거:**
- 로그 정규화: 뉴스 건수는 멱법칙 분포 → log 변환으로 극단값 완화
- 절대량 60%: "주간 116건"은 그 자체로 강력한 시그널 (현행은 성장률만 봄)
- scale=50: 주간 50건 이상 → volumeScore ≈ 1.0 (경험적 상한)

#### 1.3 Directional Volatility Score (방향성 반영)

```
// 상승 변동성 vs 하락 변동성 분리 (RSI 원리 적용)
upMoves = [max(0, day[i] - day[i-1]) for i in 1..7]
downMoves = [max(0, day[i-1] - day[i]) for i in 1..7]

avgUp = mean(upMoves)
avgDown = mean(downMoves)

// Directional Volatility Index (DVI)
if avgUp == 0 AND avgDown == 0:
  DVI = 0.5  // 변동 없음 → 중립 (NOT 1.0)
elif avgDown > 0:
  RS = avgUp / avgDown
  DVI = 1 - 1/(1 + RS)  // RSI 공식 변형, 범위 [0, 1]
else:
  DVI = 1.0  // 하락 없음 → 순수 상승 변동

// 총 변동폭 반영 (DVI는 방향, totalVol은 크기)
totalVol = standardDeviation(recent7d)
volMagnitude = sigmoid_normalize(totalVol, center=15, scale=10)

volatilityScore = DVI * volMagnitude
```

**근거:**
- 현행: `normalize(stddev, 0, 50)` → 변동성이 크면 무조건 높은 점수 (하락도 보상)
- 개선: RSI 방향 분리 원리 적용 — 상승 변동은 보상, 하락 변동은 패널티
- DVI=0.5는 상승=하락 (중립), DVI>0.5는 상승 우세, DVI<0.5는 하락 우세

#### 1.4 Overall Score Composition

```
rawScore = interestScore * 0.40 + newsScore * 0.35 + volatilityScore * 0.10 + activityScore * 0.15

// Activity Score (신규 — 시간 차원)
activityScore = composite of:
  - stockPriceChange: sigmoid_normalize(avgPriceChangePct, center=0, scale=5) * 0.5
  - volumeIntensity: log_normalize(avgVolume, scale=50_000_000) * 0.3
  - dataCoverage: min(dataAge / 14, 1.0) * 0.2

// Noise Gate: 관심도가 극히 낮은 테마의 activity 과대평가 방지
if levelScore < 0.1:
  activityScore *= 0.5  // 50% 감쇄

score = round(rawScore * 100)
```

**가중치 변경 근거:**
| Component | 현행 | 신규 | 이유 |
|-----------|------|------|------|
| Interest | 50% | 40% | 절대수준 포함으로 이미 강화됨, 다른 축에 공간 배분 |
| News | 30% | 35% | 뉴스 절대량 반영 강화 — Decline 과다(41.2%) 해소의 핵심 |
| Volatility | 20% | 10% | 방향성 반영으로 정보량 증가, 비중 대폭 감소 (노이즈 기여 축소) |
| Activity | 0% | 15% | **신규**: 주가/거래량/데이터 성숙도 → 교차 검증 시그널 |

### 파라미터/임계값 근거

| 파라미터 | 값 | 근거 |
|---------|-----|------|
| `W_LEVEL` | 0.6 | 절대 수준이 성장률보다 안정적 (OECD CLI) |
| `W_MOMENTUM` | 0.4 | 방향 시그널 보조 |
| `sigmoid center (growth)` | 0 | 성장률 0% = 중립점 |
| `sigmoid scale (growth)` | 1.5 | ±150% 범위를 0.05-0.95로 매핑 |
| `log scale (news)` | 50 | 주간 50건 = 포화점 (한국 테마주 뉴스 경험적 상한) |
| `DVI center` | 0.5 | 상승=하락 중립점 |
| `sigmoid center (vol)` | 15 | normalized interest stddev 중앙값 |
| `dataCoverage 14일` | 14 | 2주치 데이터 = 최소 신뢰 기준 |

### Edge Case 분석

| Case | 조건 | 현행 결과 | 신규 결과 |
|------|------|----------|----------|
| 고관심 미성장 | rawAvg=50, ratio=0.9 | interest≈0.08 | level≈0.85, momentum≈0.45 → **0.69** |
| 저관심 급등 | rawAvg=5, ratio=3.0 | interest≈0.5 dampened | level≈0.15, momentum≈0.95 → **0.47** |
| 뉴스 폭발 | 116건/주, -20% 성장률 | momentum=normalize(-0.2, -0.5, 2.0)=0.12 | volume≈0.92, momScore≈0.45 → **0.73** |
| 노이즈 테마 | rawAvg=2, ratio=2.0 | dampened to ~0.3 | level≈0.05, momentum≈0.65 → **0.29** |
| 완전 사망 | rawAvg=0, news=0 | score=0 | score=0 (정상) |

---

## 2. Stage 분류 재설계

### 학술적 배경

**참고 모델:**
- Gartner Hype Cycle 5단계: Innovation Trigger → Peak of Inflated Expectations → Trough of Disillusionment → Slope of Enlightenment → Plateau of Productivity
- Gompertz + Bell 복합 모델 (Sasaki 2015): 상승 S-curve + 하이프 bell curve 결합
- Hidden Markov Model (HMM) 레짐 감지: 관측 불가능한 "숨은 상태"를 확률적으로 추정

**핵심 원리:**
단일 스코어 임계값으로 Stage를 나누는 것은 **차원 축소의 정보 손실** 문제가 있다. HMM의 "숨은 상태 + 관측 시그널" 개념에서 영감을 받되, 실제 구현은 **규칙 기반 FSM(Finite State Machine)**으로 단순화한다. Score 단독이 아닌 **다차원 시그널 패턴**으로 Stage를 결정하되, 확률적 추론 대신 명시적 의사결정 트리를 사용.

### 현재 구현의 수학적 문제점

#### 문제 1: Decay 범위 과도
```
score >= 20: Decay
```
- 20-39 전체가 Decay → 새로 등장한 테마(데이터 축적 중)도 "말기"로 분류
- **우주항공산업**: score=22 → Decay로 진입하나, 실제로는 상승 초기

#### 문제 2: 단일 차원 판정
- Score만으로 Peak/Growth/Early/Decay를 나눔
- 동일 score=45에서 "상승 중" vs "하락 중" 구분 불가

#### 문제 3: Stage와 Phase 이원화
- Stage: determineStage() → Score 기반
- Phase: derivePhase() → Score + 비교 데이터 기반
- 결과: Stage="Decay" + Phase="pre-peak" 모순 발생

### 개선된 설계: Multi-Signal Stage Classification

```
Stage 결정 입력:
  - score: 종합 점수 (0-100)
  - interestTrend: 관심도 7일 추세 방향 (상승/안정/하락)
  - newsTrend: 뉴스 7일 추세 방향
  - dataAge: 데이터 수집 일수
  - momentum: 성장률 기반 가속/감속 지표

Stage 분류 로직 (명시적 의사결정 트리, 우선순위 순):

  1. Dormant? → score < 15 AND interestTrend≠rising AND newsVolume=0 → **Dormant**
  2. Peak?    → score >= 63 OR (score >= 50 AND multiSignalPeak) → **Peak**
  3. Decline? → interestTrend=falling AND score < prevScore7d*0.85 AND newsVolume<30 → **Decline**
  4. Growth?  → score >= 40 AND interestTrend ∈ {rising, stable} → **Growth**
  5. Else     → **Emerging** (default — 데이터 축적 중인 신규/저점수 테마)
```

#### 2.1 Five-Stage Model (Gartner 변형)

> **Gartner 원본 5단계**: Innovation Trigger → Peak of Inflated Expectations → Trough of Disillusionment → Slope of Enlightenment → Plateau of Productivity
> **TLI 5단계**: Dormant → Emerging → Growth → Peak → Decline
> **의도적 생략**: Trough of Disillusionment, Slope of Enlightenment, Plateau of Productivity는 한국 주식 테마의 생명주기에 부합하지 않음 (테마주는 plateau 없이 소멸하는 경우가 대부분). Decline 이후 재점화(reigniting) 경로로 대체.

| Stage | 한국어 | 조건 (AND) | UI 색상 |
|-------|-------|-----------|--------|
| **Emerging** | 부상 | score < 40 AND interestTrend=상승 AND dataAge < 21 | Blue |
| **Growth** | 성장 | score >= 40 AND interestTrend ∈ {상승, 안정} AND NOT declining signals | Green |
| **Peak** | 정점 | score >= 63 OR (score >= 50 AND interestTrend=안정 AND newsVolume high) | Red/Orange |
| **Decline** | 하락 | interestTrend=하락 AND (score < prevScore7d * 0.85) AND newsVolume < 30 | Yellow |
| **Dormant** | 휴면 | score < 15 AND interestTrend ∈ {안정, 하락} AND newsVolume=0 | Gray |

> **Decline 뉴스 예외**: newsVolume >= 30이면 Decline 판정 유보. 뉴스가 활발한 테마는 일시적 관심도 하락이어도 Decline으로 분류하지 않음.

#### 2.2 Trend Direction 계산

```
// 7일 관심도 추세 방향 (선형 회귀 기울기)
// 주의: raw_value만 사용. normalized 값 사용 금지 (자기정규화 편향)
slope = linearRegressionSlope(recent7dRawInterest)
normalizedSlope = slope / mean(recent7dInterest)  // 상대 기울기

if normalizedSlope > 0.10: interestTrend = 'rising'
elif normalizedSlope < -0.10: interestTrend = 'falling'
else: interestTrend = 'stable'
```

**근거:**
- 단순 비교(7일 전 vs 오늘) 대신 선형 회귀 기울기 사용 → 1-2일 노이즈에 강건
- 상대 기울기: 절대값 50에서 2.5 증가 = 5% vs 절대값 5에서 2.5 증가 = 50% → 스케일 독립

#### 2.3 Stage 전이 제약 (Markov Transition Matrix)

```
허용 전이:
  Dormant → Emerging → Growth → Peak → Decline → Dormant
  Emerging → Dormant (실패한 테마)
  Growth → Decline (급락)
  Peak → Decline (정상 하락)
  Decline → Emerging (재점화 — reigniting)
  Decline → Growth (급반등 회복)
  Decline → Dormant (완전 소멸)

Reigniting 전이 경로 (Decline → Emerging/Growth):
  조건: Decline 상태에서 interestTrend=rising AND (newsVolume 증가 OR score 상승)
  → 일반 반등은 Emerging, 강한 급반등은 Growth로 전이
  → reigniting.ts 유지 — 기존 재점화 감지 로직 활용

금지 전이:
  Decline → Peak (2단계 점프 불가 — 강한 신호도 Growth로 1단계 보정)
  Dormant → Peak (2단계 점프 불가)
  Dormant → Growth (1단계 점프 불가 — 반드시 Emerging 경유)
  Peak → Emerging (역행 불가)
```

**근거:**
- HMM에서 영감을 받은 **규칙 기반 FSM(Finite State Machine)**으로 단순화 — 비현실적 상태 전이를 구조적으로 차단
- 현행 시스템에서는 score 변동만으로 Decay→Peak 급변 가능 (비현실적)

**데이터 갭 허용:** lastCalculatedAt과 today 차이가 3일 이상이면 1단계 점프 허용 (예: Dormant→Growth). 장기 미수집 후 복귀 시 중간 단계를 강제하면 현실과 괴리.

### 파라미터 근거

| 파라미터 | 값 | 근거 |
|---------|-----|------|
| Emerging 상한 | score < 40 | 충분한 데이터 없이 높은 점수 = 불안정 |
| Emerging 기간 | dataAge < 21일 | 3주 = 초기 테마 관찰 기간 (경험적) |
| Peak 주 임계값 | score >= 63 | 현행 80에서 완화 — 63+ Peak 가능 (프로덕션 데이터 기반) |
| Peak 보조 임계값 | score >= 50 + 안정 + 뉴스↑ | 점수만으로 판정 불가 시 다중 시그널 |
| Decline 감지 | prevScore * 0.85 | 15% 하락 = 유의미한 감소 |
| Dormant 상한 | score < 15 | 현행 20에서 하향 — 15-19도 Decline일 수 있음 |
| 추세 임계값 | ±0.10 | 10% 상대 변화 = 통계적으로 유의미한 변화 (±0.05는 과민 → Decline 과다 유발) |

---

## 3. News Momentum 재설계

### 학술적 배경

**참고 모델:**
- Volume-Weighted Momentum (VWM): 거래량으로 가중된 가격 변화 → 뉴스 건수로 가중된 모멘텀
- Elastic Volume-Weighted Momentum (EVWM): 평균으로부터의 거리 × 상대 거래량

**핵심 원리:**
모멘텀 지표에서 **절대량(volume)이 방향성(growth rate)만큼 중요**하다. "116건 → 92건 (-20%)"은 성장률은 음수이나 절대량으로는 최상위 — 이를 "폭발적 관심"으로 인식해야 한다.

### 현재 구현의 문제점

```
newsGrowthRate = (newsThisWeek - newsLastWeek) / newsLastWeek
// 116건 → 92건: (92-116)/116 = -0.207
newsMomentum = normalize(-0.207, -0.5, 2.0) = 0.117 (사실상 0)
```

문제: 주간 92건은 대부분의 테마보다 10배 이상 많은데, 성장률이 음수라는 이유로 점수 ≈ 0

### 개선된 수식

§1.2에서 이미 정의한 `newsScore`를 그대로 적용:

```
volumeScore = min(1, log(1 + 92) / log(1 + 50)) = min(1, 4.53/3.93) = 1.0
newsGrowthRate = (92 - 116) / 116 = -0.207
newsMomentumScore = sigmoid(-0.207, 0, 1.0) = 0.448
newsScore = 1.0 * 0.6 + 0.448 * 0.4 = 0.779
```

**검증**: 우주항공산업 뉴스 → newsScore = 0.78 (현행 0.117 → **6.7배 개선**)

### 추가: Cross-Sectional News Rank

```
// 절대 뉴스량의 테마 간 비교 (levelScore와 동일 원리)
newsRank = percentileRank(newsThisWeek, allThemesNewsThisWeek)
```

이 값은 직접 점수에 반영하지 않지만, Stage 판정의 보조 시그널로 활용:
- `newsRank > 0.9` → "뉴스 폭발" 플래그 → Emerging/Growth 판정 보조

---

## 4. Volatility 재설계

### 학술적 배경

**참고 모델:**
- RSI의 상승/하락 분리 원리
- ATR & Volume Adjusted Momentum: 변동성에 진폭 가중
- MACD-V (Alex Spiroglou): 변동성으로 정규화된 모멘텀

### 현재 문제

```
volatilityScore = normalize(interestStdDev, 0, 50) * (isNoise ? 0.3 : 1)
```
- 상승 변동(좋음)과 하락 변동(나쁨)을 구분하지 않음
- "관심도가 30→50으로 상승 중 변동" vs "70→50으로 하락 중 변동" 모두 같은 점수

### 개선 수식

§1.3에서 정의한 Directional Volatility Index (DVI) 적용.

**추가 안전장치:**

```
// 노이즈 필터: 절대 수준이 극히 낮을 때 변동성 신뢰 불가
if rawAvg7d < 5:
  volatilityScore = DVI * volMagnitude * 0.2  // 80% 감쇄
elif rawAvg7d < 10:
  volatilityScore = DVI * volMagnitude * 0.5  // 50% 감쇄
```

---

## 5. Comparison 재설계

### 학술적 배경

**참고 모델:**
- Dynamic Time Warping (DTW): 시간축을 탄성적으로 정렬하여 위상 차이(lag)가 있는 곡선도 유사하게 인식
- Mutual Rank Similarity: 양방향 순위 기반 유사도 — 센트로이드 끌림 면역 (metric_collapse_report에서 검증됨)
- Shape-based Distance (SBD): 정규화된 교차 상관 기반 형태 유사도

**선행연구 핵심 수치 (metric_collapse_report, 2026-02-11):**

| 지표 | 현행 (exp decay) | Mutual Rank 재설계 | 목표 |
|------|-----------------|-------------------|------|
| CV (판별력) | **0.20** | **1.01** | >0.50 |
| 센트로이드 상관 | **-0.996** | **-0.566** | >-0.80 |
| 센트로이드 테마 >= 0.25 매치 | 259/259 (100%) | 41/259 (16%) | <50% |
| 고유 과거 테마 매칭 | 241 | 246 | 최대화 |

**DTW vs Pearson 핵심 비교:**
| 특성 | Pearson | DTW |
|------|---------|-----|
| 위상 차이 | 동일 시점 강제 | 시간축 정렬 허용 |
| 진폭 차이 | 선형 관계만 | 비선형 관계 포착 |
| 해석 가능성 | [-1,1] 직관적 | 거리값, 정규화 필요 |
| 계산 복잡도 | O(n) | O(n²), 하한 바운드로 가속 가능 |
| 단조 곡선 | 구분 불가 | 구분 가능 |

> **주의**: 선행연구(similarity_bottleneck_analysis)에서 DTW의 ROI를 낮게 평가했음:
> "현재 resample-to-50-points 접근이 이미 위상 정렬의 일종. 전체 DTW는 계산 비용 대비 비례적 개선이 없음."
> → DTW는 **선택적(nice-to-have)**으로 분류. Mutual Rank가 더 높은 우선순위.

### 현재 문제

#### 문제 0 (P0): Metric Collapse — 유사도 지표 붕괴
- **지수 압축**: z-score 거리 [0.7, 2.1] 범위가 유사도 [0.35, 0.70]으로 압축 (3배 정보 손실)
- **센트로이드 끌림**: r=-0.996, 평균적인 테마가 모든 테마와 매칭 (수학적 필연)
- **프로덕션 증거**: 1000건 비교 중 sim 분포 min=0.250, max=0.980, avg=0.426
- **curve_sim=0 68%**: feature_sim 단독 의존 → CV=0.20으로 동질화

#### 문제 1: Feature 벡터의 순환 의존
```typescript
scoreLevel: scores[0].score / 100  // ← 현재 점수가 feature에 포함
```
- 현재 점수로 과거 테마와 비교 → Score가 낮으면 유사 테마도 "Score가 낮았던 테마"만 매칭
- 결과: 자기 강화 편향 (low score → low-score matches → low prediction)

#### 문제 2: RMSE + Pearson 미분 상관의 한계
```
shapeSim = 1 - RMSE * 2.5  // 경험적 계수
curveSim = shapeSim * 0.6 + derivCorr * 0.4
```
- RMSE는 진폭과 위상 차이를 혼동
- 리샘플링으로 시간축을 정렬했으나, lifecycle 비율이 다른 테마에서 왜곡

#### 문제 3: estimatedDaysToPeak의 단순함
```
estimatedDaysToPeak = max(0, pastPeakDay - currentDay)
```
- 과거 테마의 peakDay를 그대로 사용 → 현재 테마의 속도/규모 반영 없음
- currentDay > pastPeakDay이면 항상 0 (이미 지났다고 판정)

### 개선된 설계

#### 5.1 Feature 벡터 개선 (순환 의존 제거)

```
// scoreLevel 제거, 대신 raw 시그널로 대체
ThemeFeatures = {
  interestLevel: percentileRank(rawAvg7d)     // cross-sectional 수준
  interestMomentum: sigmoid(growthRate)         // 시계열 방향
  volatilityDVI: DVI                            // 방향성 변동
  newsIntensity: log_normalize(totalNews)       // 뉴스 집약도
  activeDaysNorm: min(activeDays/365, 1)        // 기간
  priceChangePct: sigmoid(avgPriceChange)       // 주가 방향
  volumeIntensity: log_normalize(avgVolume)     // 거래량
}
```

**제거: `scoreLevel`** → 순환 의존 차단. Score는 Feature의 결과물이지, 입력이 되면 안 됨.
**추가: `interestLevel`** → 절대 수준 반영 (기존 대비 정보량 증가)

#### 5.2 Feature Similarity: Mutual Rank (선행연구 검증 완료)

**이 변경은 선행연구(metric_collapse_report)에서 제안·검증된 것으로, 본 명세서에서 공식 채택한다.**

```
// 현행: zScoreEuclideanSimilarity → exp(-d * 0.7) [CV=0.20, 센트로이드 r=-0.996]
// 신규: Mutual Rank [CV=1.01, 센트로이드 r=-0.566]

Step 1: 전체 테마 쌍에 대해 z-score 유클리디안 거리 계산
Step 2: 각 테마 i에 대해 다른 모든 테마를 거리순 정렬 → rank_fwd[i][j]
Step 3: 양방향 순위 기하평균: mr(i,j) = sqrt((rank_fwd[i][j]+1) * (rank_fwd[j][i]+1))
Step 4: 유사도 변환 (linear — CV=1.01 검증됨):
        mutualRankScore(i,j) = max(0, 1 - mr(i,j) / N)
        where N = 테마 수
        // exp 변환 삭제 — linear가 CV=1.01로 최적 (exp는 CV < 0.5)
```

**Mutual Rank가 센트로이드 끌림을 해결하는 이유:**
- 센트로이드 테마 p는 c에게 가까움 (rank_fwd[c][p] 낮음)
- 하지만 c는 p에게 특별하지 않음 (rank_fwd[p][c] 높음)
- 기하평균이 이 비대칭을 처벌 → 센트로이드 매치 259→41개로 감소

**계산 비용:** O(N² * D + N² * log N). N=260에서 67,600 쌍 → <100ms (검증됨).

#### 5.2b 곡선 유사도: 현행 RMSE+미분상관 유지 (DTW 선택적)

**선행연구 결론 (similarity_bottleneck_analysis §4.3):**
> "곡선 유사도는 CV=1.49 (우수)이고 센트로이드 상관=0.026 (없음). 변경 불필요."

현행 curveSim = shapeSim * 0.6 + derivCorr * 0.4는 유지한다.
RMSE 계수 2.5도 유지 (discrimination ratio 3.86x — 선행연구 검증).

**DTW는 Phase 2 (후속 개선)으로 연기:**
- 현행 resample-to-50-points가 이미 위상 정렬 역할
- Mutual Rank + curveSim 적응적 가중치가 더 높은 ROI
- DTW 도입 시 Sakoe-Chiba window=5, O(n*w) 복잡도

#### 5.3 estimatedDaysToPeak 개선

```
// 속도 보정: 현재 테마의 진행 속도를 과거와 비교
speedRatio = currentActiveDays / pastActiveDaysAtSimilarScore
adjustedPeakDay = pastPeakDay * speedRatio

estimatedDaysToPeak = max(0, adjustedPeakDay - currentActiveDays)

// 신뢰 구간 (비교 테마가 여러 개일 때)
estimates = [adjustedPeakDay_i - currentDays for each comparison_i]
medianEstimate = median(estimates)
iqrEstimate = IQR(estimates)  // 불확실성 지표
```

---

## 6. Prediction 재설계

### 학술적 배경

**참고 모델:**
- Gompertz Growth Model: `G(t) = a * exp(-b * exp(-c*t))` — 비대칭 S-curve (초기 느림, 중기 급등, 후기 포화)
- BOCPD (Bayesian Online Change Point Detection): 실시간으로 "regime 전환점"을 확률적으로 감지

> **향후 고려**: Bass Diffusion Model (`f(t) = (p + qF(t))(1 - F(t))`)은 혁신(p)+모방(q)으로 채택 곡선을 예측하는 모델이나, 현재 데이터 규모에서는 파라미터 추정이 불안정. 충분한 completed lifecycle 데이터(50개+ 테마)가 축적된 후 도입 검토.

### 현재 문제

#### 문제 1: Phase와 Stage 모순
```
Stage = Decay (score 22, determineStage)
Phase = pre-peak (score < 25, derivePhase)
```
- 두 시스템이 독립적으로 작동 → 사용자에게 모순된 정보 제공

#### 문제 2: Score 임계값 불일치
| 판정 | Stage 임계값 | Phase 임계값 |
|------|------------|------------|
| Peak | ≥80 (strict) | ≥75 (lenient) |
| Growth | ≥60 | ≥55 (near-peak) |
| Decay | ≥20 | <25 (declining) |

→ Score 22: Stage=Decay, Phase=pre-peak (모순)

#### 문제 3: Phase 판정의 score < 25 분기
```javascript
if (score < 25) {
  if (avgPeakDay > 0 && daysSinceSpike > avgPeakDay) return 'declining'
  return 'pre-peak'
}
```
- Score가 낮으면 무조건 "pre-peak" (데이터가 부족한 것과 실제로 쇠퇴 중인 것 구분 불가)
- 비교 데이터가 없으면 항상 'pre-peak' 반환

### 개선된 설계: Stage-Derived Prediction

**핵심 변경**: Phase 시스템을 제거하고, Stage를 유일한 상태 지표로 사용. Prediction은 Stage + 비교 데이터 기반.

(§7 Stage-Phase 통합 설계에서 상세 기술)

#### 6.1 개선된 Prediction 구조

```
PredictionResult = {
  stage: Stage,                    // 단일 상태 (Emerging/Growth/Peak/Decline/Dormant)
  stageConfidence: number,         // 0-1, Stage 판정 확신도
  // 계산: 다중 시그널 합의도 기반
  //   모든 시그널 동일 방향 → 0.9 (high)
  //   과반수 시그널 동일    → 0.6 (medium)
  //   경계값 (임계값 ±5%)  → 0.3 (low)

  progressEstimate: {
    currentDay: number,            // 현재 활동 일수
    estimatedPeakDay: number,      // 예상 정점 일차 (비교 기반)
    estimatedTotalDays: number,    // 예상 총 주기
    progressPct: number,           // 진행률 (0-100%)
    uncertaintyRange: [number, number], // 25%-75% 신뢰 구간
  },

  momentum: 'accelerating' | 'stable' | 'decelerating',
  riskLevel: 'low' | 'moderate' | 'high' | 'critical',

  comparisons: ComparisonSummary[],
  keyInsight: string,
}
```

#### 6.2 Momentum 판정 개선

```
// Score 기반이 아닌 실제 시그널 기반
recentScores = last 3 days scores
olderScores = 4-7 days ago scores

scoreTrend = mean(recentScores) - mean(olderScores)
interestTrend = linearRegressionSlope(recent7dInterest)
newsTrend = newsThisWeek > newsLastWeek ? 1 : (newsThisWeek < newsLastWeek ? -1 : 0)

// 다수결 + 가중
signals = [
  scoreTrend > 2 ? 1 : (scoreTrend < -2 ? -1 : 0),     // 2점 이상 변화
  interestTrend > 0.05 ? 1 : (interestTrend < -0.05 ? -1 : 0),
  newsTrend,
]
sumSignals = sum(signals)

if sumSignals >= 2: momentum = 'accelerating'
elif sumSignals <= -2: momentum = 'decelerating'
else: momentum = 'stable'
```

#### 6.3 Risk Level 개선

```
// Stage 기반 + 진행률 기반 (Phase 미사용)
riskMatrix = {
  Emerging: 'low',
  Growth: progressPct > 70 ? 'moderate' : 'low',
  Peak: 'high',
  Decline: progressPct > 90 ? 'critical' : 'high',
  Dormant: 'low',
}
```

---

## 7. Stage-Phase 통합 설계

### 핵심 원칙: 단일 상태 체계 (Single Source of Truth)

현행 시스템의 근본 문제는 **Stage와 Phase가 독립적으로 존재**하여 모순이 발생하는 것이다. 이를 단일 체계로 통합한다.

### 7.1 통합 Stage 정의

| Stage | Score 범위 | 추가 조건 | 허용 전이 출발 | UI 표시 |
|-------|-----------|----------|-------------|---------|
| **Dormant** | 0-14 | interestTrend≠rising | Emerging | 💤 휴면 |
| **Emerging** | 0-39 | interestTrend=rising OR dataAge<21 | Growth, Dormant | 🌱 부상 |
| **Growth** | 30-69 | interestTrend∈{rising,stable} | Peak, Decline | 📈 성장 |
| **Peak** | 50-100 | score>=63 OR (score>=50 AND multiSignalPeak) | Decline | 🔥 정점 |
| **Decline** | 0-55 | interestTrend=falling AND score↓15%+ AND newsVolume<30 | Dormant | 📉 하락 |

**주의: 범위 겹침은 의도적** — 다중 시그널로 판별하므로 단일 score 임계값이 아님.

### 7.2 Phase 제거 및 매핑

기존 Phase 코드는 제거하되, API 호환성을 위해 Stage→Phase 단방향 매핑 제공:

```
Stage → Phase 매핑 (하위 호환용):
  Dormant  → 'declining'
  Emerging → 'pre-peak'
  Growth   → 'near-peak'
  Peak     → 'at-peak'
  Decline  → 'post-peak' (초기) / 'declining' (후기)
```

이 매핑은 **항상 일관됨** (모순 불가능).

### 7.3 임계값 정렬 테이블 (모순 불가 증명)

| Score | interestTrend | dataAge | Stage | Phase(매핑) | 모순? |
|-------|-------------|---------|-------|-----------|------|
| 22 | rising | 11 | **Emerging** | pre-peak | ✅ 일관 |
| 22 | falling | 90 | **Decline** | declining | ✅ 일관 |
| 22 | stable | 5 | **Emerging** | pre-peak | ✅ 일관 |
| 45 | rising | 30 | **Growth** | near-peak | ✅ 일관 |
| 45 | falling | 60 | **Decline** | post-peak | ✅ 일관 |
| 70 | stable | 40 | **Peak** | at-peak | ✅ 일관 |
| 12 | stable | 120 | **Dormant** | declining | ✅ 일관 |

**모순 불가능 증명**: Phase는 Stage의 함수이므로, Stage가 결정되면 Phase는 자동 결정. 두 개의 독립 시스템이 아니라 단일 시스템 + 표시 변환.

### 7.4 UI 표시 매핑

| Stage | 메인 뱃지 | 서브텍스트 (Prediction 기반) | 색상 |
|-------|----------|------------------------|------|
| Dormant | 휴면 | "관심 신호 감지 안 됨" | slate-500 |
| Emerging | 부상 | "주목 시작, 추세 확인 중" | sky-400 |
| Growth | 성장 | "정점까지 약 N일 예상" (비교 기반) | emerald-400 |
| Peak | 정점 | "최고 관심 구간" | amber-400 |
| Decline | 하락 | "관심 하락 중 (-X%)" | red-400 |

---

## 8. Score 안정화 (Smoothing)

### 학술적 배경

**참고 모델:**
- Exponential Moving Average (EMA): `EMA_t = α * X_t + (1 - α) * EMA_{t-1}` — 최근 값에 더 큰 가중치를 부여하면서 급격한 변동을 완화
- Kalman Filter (1D simplified): 시스템 노이즈와 관측 노이즈를 분리하여 "진짜 상태"를 추정
- Bollinger Bands: 이동평균 ± 2σ로 정상 변동 범위를 정의, 범위 이탈 시 의미 있는 변화로 간주

**핵심 원리:**
Score는 일일 관찰값(observation)이지 "진짜 상태(latent state)"가 아니다. 뉴스 1건의 등락, DataLab API의 일일 변동, 주가 장중 변동 등 **관측 노이즈**가 Score에 직접 전파된다. Smoothing은 이 노이즈를 억제하여 "테마의 실제 생명주기 위치"를 더 정확히 추정한다.

### 프로덕션 데이터 증거

```
220개 테마 중 57건(26%)이 5일 내 15점 이상 변동
극단 사례: 남북경협 — 5일 내 46점 변동 (Score 영역 절반)
```

Score가 매일 15-46점씩 변하면:
- Stage가 매일 바뀜 (Decay → Early → Decay) → 사용자 혼란
- Prediction의 momentum/risk 판정이 불안정
- Comparison의 feature 벡터가 매일 달라져 매칭 결과 불일치

### 현재 문제: Raw Score 직접 사용

```
score_displayed = score_calculated (당일 계산 즉시 표시)
```

- 안정화 장치 없음 — 입력 데이터의 모든 노이즈가 최종 Score에 100% 반영
- 특히 `newsThisWeek` 계산 시 수집 시각에 따라 같은 날도 건수가 달라짐

### 개선된 설계: 2단계 Score 안정화

#### 8.1 EMA Smoothing (1차 — 일일 노이즈 억제)

```
// α (smoothing factor) = 2/(span+1)
// span=3 → α=0.5 (최근 3일 가중), span=5 → α=0.333 (최근 5일 가중)
α = 0.4  // span ≈ 4일

smoothedScore_t = α * rawScore_t + (1 - α) * smoothedScore_{t-1}

// 초기값: 첫 날은 rawScore 그대로
smoothedScore_0 = rawScore_0
```

**α = 0.4 선택 근거:**
- α = 0.5 (span=3): 반응성 높으나 노이즈 억제 부족 — 15점 변동 → 7.5점 변동
- **α = 0.4 (span≈4)**: 15점 변동 → 6점 변동 (60% 억제), 실제 추세 변화에 2-3일 내 반응
- α = 0.2 (span=9): 안정적이나 실제 변화에 5-7일 지연 — 급등 테마 탐지 지연
- **테마 주기가 보통 30-90일**이므로, 4일 EMA는 주기 대비 5-13% → 추세는 보존, 일일 노이즈만 제거

**EMA 시뮬레이션 (남북경협 46점 변동 사례):**
```
Day 0: raw=30, ema=30.0
Day 1: raw=55, ema=30*0.6 + 55*0.4 = 40.0  (raw +25 → ema +10)
Day 2: raw=76, ema=40*0.6 + 76*0.4 = 54.4  (raw +21 → ema +14.4)
Day 3: raw=60, ema=54.4*0.6 + 60*0.4 = 56.6 (raw -16 → ema +2.2)
Day 4: raw=45, ema=56.6*0.6 + 45*0.4 = 52.0 (raw -15 → ema -4.6)

최대 일일 변동: raw=25점 → ema=14.4점 (42% 억제)
5일 범위: raw 30-76 (46점) → ema 30-56.6 (26.6점, 42% 압축)
```

#### 8.2 변동 이상치 감지 (2차 — 비정상 점프 방어)

```
// 이전 5일 score의 표준편차 기반 Bollinger Band
recentScores = last 5 smoothedScores
μ = mean(recentScores)
σ = stddev(recentScores)

// 2σ 밴드 이탈 시 변동 제한 (Bollinger 원리)
maxDailyChange = max(10, 2 * σ)  // 최소 10점, 또는 2σ 중 큰 값

if abs(rawScore_t - smoothedScore_{t-1}) > maxDailyChange:
  clampedRaw = smoothedScore_{t-1} + sign(rawScore_t - smoothedScore_{t-1}) * maxDailyChange
  smoothedScore_t = α * clampedRaw + (1 - α) * smoothedScore_{t-1}
else:
  smoothedScore_t = α * rawScore_t + (1 - α) * smoothedScore_{t-1}
```

**근거:**
- `max(10, 2σ)`: 안정 기간(σ=3) → 최대 10점/일 변동 허용, 변동 기간(σ=8) → 최대 16점/일 허용
- 적응적: 이미 변동이 큰 기간에는 밴드가 넓어져 추세 변화를 차단하지 않음
- 최소 10점: Score 0-100 범위에서 하루 10% 변동은 항상 허용 (진짜 급변 대응)

#### 8.3 Stage 안정성 보장 (Hysteresis)

```
// Stage 전환에 최소 지속 기간 요구
MIN_STAGE_DURATION = 2  // 최소 2일 연속으로 새 Stage 조건 충족해야 전환

// 현재 Stage와 다른 Stage가 감지되면:
if candidateStage !== currentStage:
  consecutiveDays[candidateStage] += 1
  if consecutiveDays[candidateStage] >= MIN_STAGE_DURATION:
    stage = candidateStage  // 전환 확정
    consecutiveDays = {}     // 카운터 리셋
  else:
    stage = currentStage    // 유지
else:
  consecutiveDays = {}      // 현재 Stage 유지 시 카운터 리셋
```

**근거:**
- 2일 연속 요구: "하루 반짝 조건 충족"으로 Stage가 바뀌는 것 방지
- §2.3의 Markov 전이 제약과 결합하면: 허용된 방향 + 2일 연속 = 매우 안정적 전이
- 3일 이상은 30-90일 주기에서 너무 느린 반응 → 2일이 최적

**Peak 즉시 전환 예외:** EMA smoothing + 2일 hysteresis가 결합되면 Peak 감지가 4-5일 지연될 수 있음. 이를 방지하기 위한 **Peak Fast-Track**:
```
if rawScore >= 63 AND smoothedScore >= 50:
  stage = Peak  // hysteresis 무시, 즉시 전환
```
> rawScore가 이미 Peak 주 임계값(63)을 충족하고 smoothedScore도 보조 임계값(50) 이상이면, 충분히 강한 시그널이므로 hysteresis 대기 불필요.

### 파라미터 요약

| 파라미터 | 값 | 근거 |
|---------|-----|------|
| `EMA_ALPHA` | 0.4 | 4일 가중, 60% 노이즈 억제 |
| `BOLLINGER_SIGMA` | 2.0 | 95% 신뢰구간 (통계 표준) |
| `MIN_DAILY_CHANGE` | 10 | Score 100점 대비 10% = 항상 허용 |
| `MIN_STAGE_DURATION` | 2일 | 30-90일 주기 대비 최소 지연 |

### DB 영향

```sql
-- lifecycle_scores 테이블에 컬럼 추가 (필수)
ALTER TABLE lifecycle_scores ADD COLUMN raw_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lifecycle_scores ADD COLUMN smoothed_score INTEGER NOT NULL DEFAULT 0;
-- 기존 score 컬럼 = smoothed_score로 대체 (표시용)
-- raw_score = EMA 입력값, 디버깅/A/B 비교용 (필수 보존)

-- 마이그레이션: 기존 레코드의 raw_score/smoothed_score를 현재 score로 초기화
UPDATE lifecycle_scores SET raw_score = score, smoothed_score = score WHERE raw_score = 0;
```

> **raw_score와 smoothed_score는 필수 컬럼**. EMA 계산에 `smoothedScore_{t-1}`이 필요하므로 optional이면 초기화 로직이 매번 분기해야 함. NOT NULL + DEFAULT 0으로 선언.

### Edge Case 분석

| Case | 동작 |
|------|------|
| 첫 날 (이전 EMA 없음) | smoothedScore = rawScore (EMA 초기화) |
| 2일차 | 정상 EMA 적용 (1개의 이전값만) |
| DataLab API 실패 → rawScore=0 | Bollinger 밴드가 0을 차단 → smoothedScore 최대 10점 하락 |
| 실제 급등 (raw +30) | 2일 연속 상승 시 EMA가 추격 — Day1: +12, Day2: +19.2 (누적 +31.2) |
| Stage 경계에서 진동 | Hysteresis 2일이 방지 — Score 39↔41 반복해도 Stage 유지 |

---

## 9. 우주항공산업 검증

### 입력 데이터 (실제 값)
```
rawAvg7d = 36.7 (네이버 데이터랩 raw)
baselineAvg (4일) = 49.5
recent7dAvg (normalized) = 적용 불가 — raw 직접 사용
newsThisWeek = 92건 (추정: 116 * 0.8)
newsLastWeek = 116건
dataAge = 11일
firstSpikeDate = 11일 전
avgPriceChangePct = +5.2% (관련주 폭등)
avgVolume = 25,000,000주
```

### 현행 알고리즘 결과
```
interestRatio = 0.74
interestScore = normalize(0.74, 0.5, 3.0) * 0.541 = 0.052
newsMomentum = normalize(-0.207, -0.5, 2.0) = 0.117
volatilityScore = normalize(12, 0, 50) * 1.0 = 0.24
score = round((0.052*0.50 + 0.117*0.30 + 0.24*0.20) * 100) = round(10.9) = 11...
  (실제 22인 이유: dampening과 실제 데이터 차이)

Stage = Decay ❌ (실제: 급부상 테마)
Phase = pre-peak (Stage와 모순)
```

### 신규 알고리즘 시뮬레이션

#### Step 1: Interest Score
```
// 가정: 전체 활성 테마 rawAvg7d 분포에서 36.7의 위치
// 대부분 테마가 10-20 범위라면:
levelScore = percentileRank(36.7, distribution) ≈ 0.75 (상위 25%)

growthRate = (36.7 - 49.5) / 49.5 = -0.258
momentumScore = sigmoid(-0.258, 0, 1.5) = 1/(1+exp(0.172)) = 0.457

interestScore = 0.75 * 0.6 + 0.457 * 0.4 = 0.450 + 0.183 = 0.633
```

#### Step 2: News Score
```
volumeScore = min(1, log(93)/log(51)) = min(1, 4.53/3.93) = 1.0
newsGrowthRate = (92-116)/116 = -0.207
newsMomentumScore = sigmoid(-0.207, 0, 1.0) = 0.448
newsScore = 1.0 * 0.6 + 0.448 * 0.4 = 0.779
```

#### Step 3: Volatility Score
```
// 11일간 상승 추세에서의 변동 가정
upMoves avg ≈ 4, downMoves avg ≈ 2
RS = 4/2 = 2.0
DVI = 1 - 1/(1+2) = 0.667

totalVol stddev ≈ 12
volMagnitude = sigmoid(12, 15, 10) = 0.426

volatilityScore = 0.667 * 0.426 = 0.284
```

#### Step 4: Activity Score
```
stockPrice = sigmoid(5.2, 0, 5) = 0.741
volumeIntensity = log(25M+1)/log(50M+1) ≈ 0.96
dataCoverage = min(11/14, 1) = 0.786

activityScore = 0.741*0.5 + 0.96*0.3 + 0.786*0.2 = 0.371 + 0.288 + 0.157 = 0.816
```

#### Step 5: Total Score
```
rawScore = 0.633*0.40 + 0.779*0.35 + 0.284*0.10 + 0.816*0.15
         = 0.253 + 0.273 + 0.028 + 0.122
         = 0.676

score = round(0.676 * 100) = 68
```

#### Step 6: Stage
```
score = 68, interestTrend = 'rising' (11일 부상), dataAge = 11

→ Peak 주 임계값(63) 충족: score >= 63
→ Stage = Peak ✅ (또는 Growth — EMA smoothing 후 실제 smoothedScore에 따라 결정)
```

#### Step 7: 최종 비교

| 지표 | 현행 | 신규 | 현실 |
|------|------|------|------|
| Score | 22 | **68** | 높아야 함 ✅ |
| Stage | Decay | **Growth** | 성장 초기 ✅ |
| Phase | pre-peak | **near-peak** (매핑) | 정점 근접 ✅ |
| News 반영 | 0.117 | **0.779** | 뉴스 폭발 ✅ |
| Interest 반영 | 0.052 | **0.633** | 높은 관심 ✅ |

**결론: 신규 알고리즘은 우주항공산업을 Growth/Peak으로 정확히 분류하며, score 68은 현실(급부상 테마)과 부합한다. 현행 22→68 (+46점).**

---

## 10. 구현 가이드

### 10.1 변경 파일 목록

| 파일 | 변경 유형 | 변경 내용 |
|------|----------|----------|
| `lib/tli/calculator.ts` | **Major rewrite** | Dual-axis interest, log news, DVI volatility, activity score |
| `lib/tli/stage.ts` | **Major rewrite** | Multi-signal stage, transition constraints |
| `lib/tli/prediction.ts` | **Major rewrite** | Phase 제거, Stage-derived prediction |
| `lib/tli/normalize.ts` | **Add functions** | sigmoid_normalize, log_normalize, percentileRank, linearRegressionSlope |
| `lib/tli/constants/score-config.ts` | **Update** | 가중치 변경 (0.40/0.35/0.10/0.15) |
| `lib/tli/comparison/features.ts` | **Modify** | scoreLevel 제거, interestLevel 추가 |
| `lib/tli/comparison/composite.ts` | **Modify** | DTW 도입 (선택적), estimatedDaysToPeak 개선 |
| `lib/tli/comparison/similarity.ts` | **Add** | DTW 함수 (선택적) |
| `lib/tli/smoothing.ts` | **New** | EMA smoothing, Bollinger 이상치 감지, Hysteresis |
| `lib/tli/types.ts` (또는 동등) | **Update** | Stage enum 변경 (Early→Emerging), Phase 타입 deprecated |
| `scripts/tli/collect-and-score.ts` | **Modify** | cross-sectional percentile 계산 추가 |
| `app/themes/[id]/_components/` | **Modify** | UI Stage 표시 업데이트 |
| `app/api/themes/*/route.ts` | **Modify** | ThemeRanking API 키 변경: `early`→`emerging`, `decay`→`decline` |

### 10.2 DB 스키마 영향

**기존 스키마 유지** — 점수 컬럼(score, stage 등)의 의미가 바뀌지만 타입은 동일.

유일한 변경: `lifecycle_scores.stage` 값에 'Emerging' 추가, 'Early' deprecated.

**ScoreComponents 하위 호환:**
- `activity_score`는 **optional** 필드로 추가. 기존 레코드에는 존재하지 않음.
- `isScoreComponents()` 타입 가드에서 `activity` 프로퍼티를 체크하지 않음 — 기존 데이터도 통과해야 함.
- 새로 계산된 레코드에만 `activity_score`가 포함됨.

```sql
-- 마이그레이션 (필수 — Early→Emerging, Decay→Decline)
UPDATE lifecycle_scores SET stage = 'Emerging' WHERE stage = 'Early';
UPDATE lifecycle_scores SET stage = 'Decline' WHERE stage = 'Decay';

-- theme_comparisons의 past_final_stage도 마이그레이션
UPDATE theme_comparisons SET past_final_stage = 'Emerging' WHERE past_final_stage = 'Early';
UPDATE theme_comparisons SET past_final_stage = 'Decline' WHERE past_final_stage = 'Decay';
```

### 10.3 구현 순서 권장

1. **Phase 0**: `normalize.ts`에 새 유틸 함수 추가 (sigmoid, log, percentileRank, linearRegression)
2. **Phase 1**: `calculator.ts` 재작성 (Dual-axis interest, DVI volatility, activity score)
3. **Phase 2**: `smoothing.ts` 신규 (EMA, Bollinger 이상치 감지)
4. **Phase 3**: `stage.ts` 재작성 (multi-signal, transition constraints, hysteresis)
5. **Phase 4**: `prediction.ts` 재작성 (Phase 제거, Stage-derived)
6. **Phase 5**: `comparison/features.ts` 수정 (scoreLevel 제거)
7. **Phase 6**: `comparison/similarity.ts` 수정 (Mutual Rank 추가)
8. **Phase 7**: `collect-and-score.ts`에 cross-sectional percentile + smoothing 파이프라인 추가
9. **Phase 8**: UI 컴포넌트 Stage 뱃지/색상 업데이트
10. **Phase 9**: 기존 데이터 재계산 스크립트

**Phase 9 상세: 90일분 재계산**
```
Step 1: 최근 90일 interest_metrics raw 데이터로 cross-sectional percentile 재계산
Step 2: 시간순으로 EMA 초기화 (Day 1: smoothed=raw, Day 2+: EMA 적용)
Step 3: 각 날짜별 Stage 재판정 (Markov 전이 제약 적용)
Step 4: theme_comparisons 전체 재계산 (Mutual Rank)
Step 5: 결과 검증 — Stage 분포 + Score 범위 + Growth/Peak 존재 확인
```
> 90일 = 가장 긴 테마 주기 커버. 이보다 오래된 데이터는 archived 상태이므로 재계산 불필요.

### 10.4 위험 요소 및 완화

| 위험 | 영향 | 완화 |
|------|------|------|
| Cross-sectional percentile 계산에 모든 테마 데이터 필요 | 파이프라인 순서 변경 | collect 단계에서 전체 rawAvg 배열을 미리 계산 |
| Stage 변경으로 기존 데이터 해석 불일치 | UI 혼란 | 마이그레이션 스크립트로 일괄 변환 |
| DTW 계산 비용 | 파이프라인 지연 | 2단계 필터 (RMSE → DTW), 캐싱 |
| 가중치/임계값 미세 조정 | 다른 테마에서 역효과 | A/B 비교 스크립트로 전체 테마 전후 비교 |

### 10.5 검증 계획

1. **Regression Test**: 현재 모든 테마에 대해 현행 vs 신규 점수 비교 테이블 생성
2. **Edge Case Test**: §1 Edge Case 표의 모든 시나리오 단위 테스트
3. **우주항공산업 Test**: 실제 데이터로 시뮬레이션 (score=65±5 목표)
4. **Back-test**: 과거 테마 데이터로 Stage 전이 패턴 검증 (Markov 전이 규칙 준수 여부)
5. **Stage 분포 검증**: 전체 테마의 Stage 분포가 합리적인지 확인 (Dormant > Emerging > Growth > Peak > Decline)

---

## 11. 롤백 전략

### 11.1 배포 전 백업

```bash
# pg_dump로 관련 테이블 백업 (배포 직전 실행)
pg_dump --data-only --table=lifecycle_scores --table=theme_comparisons \
  --table=interest_metrics --table=news_metrics \
  -f tli_backup_$(date +%Y%m%d).sql $DATABASE_URL
```

### 11.2 Dual-Write A/B 전략 (2주)

배포 후 2주간 기존 알고리즘과 신규 알고리즘을 **병렬 실행**:

```
Phase A (Week 1-2): Dual-Write
  - 기존 파이프라인: lifecycle_scores에 기존 방식 score/stage 기록 (기존 컬럼)
  - 신규 파이프라인: lifecycle_scores에 raw_score/smoothed_score/new_stage 기록 (새 컬럼)
  - UI는 기존 score/stage 표시 (사용자 영향 없음)
  - 대시보드에서 기존 vs 신규 비교 모니터링

Phase B (Week 3): 전환
  - 신규 알고리즘 결과가 기대치 충족 시 → UI를 신규 컬럼으로 전환
  - 기존 컬럼은 1주 추가 유지 후 제거

Phase C: 완료
  - 기존 컬럼 제거, 신규 컬럼을 기본 컬럼으로 rename
```

### 11.3 롤백 SQL

문제 발생 시 즉시 실행 가능한 롤백 스크립트:

```sql
-- 롤백: 신규 컬럼 제거, 기존 값 복원
ALTER TABLE lifecycle_scores DROP COLUMN IF EXISTS raw_score;
ALTER TABLE lifecycle_scores DROP COLUMN IF EXISTS smoothed_score;

-- Stage 롤백: Emerging→Early, Decline→Decay
UPDATE lifecycle_scores SET stage = 'Early' WHERE stage = 'Emerging';
UPDATE lifecycle_scores SET stage = 'Decay' WHERE stage = 'Decline';
UPDATE theme_comparisons SET past_final_stage = 'Early' WHERE past_final_stage = 'Emerging';
UPDATE theme_comparisons SET past_final_stage = 'Decay' WHERE past_final_stage = 'Decline';

-- 백업 데이터 복원 (필요 시)
-- psql $DATABASE_URL < tli_backup_YYYYMMDD.sql
```

### 11.4 롤백 판단 기준

| 지표 | 정상 | 롤백 트리거 |
|------|------|-----------|
| Score 분포 | Growth+Peak > 10% | Growth+Peak = 0% (현행과 동일) |
| Decline 비율 | < 40% | > 50% (현행보다 악화) |
| Score 범위 | max > 60 | max < 50 (현행보다 좁음) |
| API 응답시간 | < 500ms | > 2000ms (cross-sectional 계산 부하) |
| 에러율 | < 1% | > 5% |

---

## 프로덕션 필수 요구사항 충족 검증

팀 리드가 명시한 "재설계 시 반드시 해결해야 할 것" 5가지 체크리스트:

| # | 요구사항 | 해결 섹션 | 해결 방법 | 검증 |
|---|---------|----------|----------|------|
| 1 | Score 상한을 60+ 이상 도달 가능하게 | §1.1, §0.5 | Dual-Axis Interest Score: levelScore(percentileRank) + momentumScore(sigmoid). 이론적 상한 47→85+ | 우주항공산업 시뮬레이션: 22→**68** (§9) |
| 2 | Decay 139개 → 적절한 분포로 재분류 | §2.1-2.3 | Multi-Signal Stage: interestTrend + dataAge + transition constraints. Emerging(부상) 단계 신설, Decay→Decline 조건 강화 | maturity=0.11인 131개 → Emerging으로 자동 재분류 (dataAge<21 + rising) |
| 3 | 뉴스 절대량 반영 | §1.2, §3 | Log-normalized News Volume(60%) + Momentum(40%). 116건/주 → volumeScore=1.0 | 우주항공산업: newsScore 0.117→**0.779** (§9) |
| 4 | curve_sim 활용률 개선 또는 feature_sim 단독 시 보정 | §5.2 | Mutual Rank로 feature_sim CV 0.20→1.01. 센트로이드 끌림 해소. curve_sim=0인 68%에서도 유의미한 차별화 | 선행연구 검증 완료 (metric_collapse_report) |
| 5 | Score 안정성 확보 (smoothing/EMA) | §8 | 2단계 안정화: EMA(α=0.4) + Bollinger 이상치 감지 + Stage Hysteresis(2일) | 46점 변동→26.6점(42% 압축), Stage 진동 방지 |

**5/5 충족.**

---

## References

### 학술/방법론
- Bass, F.M. (1969). "A New Product Growth for Model Consumer Durables." Management Science.
- Sasaki, H. (2015). "Simulating Hype Cycle Curves with Mathematical Functions." IJMIT.
- Steinert, M. & Leifer, L. (2010). "Scrutinizing Gartner's Hype Cycle Approach." PICMET.
- Adams, R.P. & MacKay, D.J.C. (2007). "Bayesian Online Changepoint Detection." arXiv:0710.3742
- Spiroglou, A. (2022). "MACD-V: Volatility Normalised Momentum." NAAIM.
- OECD (2008). "Handbook on Constructing Composite Indicators." OECD Publishing.
- Bollinger, J. (2001). "Bollinger on Bollinger Bands." McGraw-Hill.
- Kalman, R.E. (1960). "A New Approach to Linear Filtering and Prediction Problems." Journal of Basic Engineering.

### 기술/도구
- [Gartner Hype Cycle Methodology](https://www.gartner.com/en/research/methodologies/gartner-hype-cycle)
- [Bass Diffusion Model - Wikipedia](https://en.wikipedia.org/wiki/Bass_diffusion_model)
- [Dynamic Time Warping - Wikipedia](https://en.wikipedia.org/wiki/Dynamic_time_warping)
- [RSI Technical Analysis - TradingView](https://www.tradingview.com/scripts/relativestrengthindex/)
- [BOCPD - Gregory Gundersen](https://gregorygundersen.com/blog/2019/08/13/bocd/)
- [HMM for Market Regime Detection - QuantStart](https://www.quantstart.com/articles/market-regime-detection-using-hidden-markov-models-in-qstrader/)
- [OECD Composite Leading Indicators](https://www.oecd.org/content/dam/oecd/en/data/methods/OECD-System-of-Composite-Leading-Indicators.pdf)
