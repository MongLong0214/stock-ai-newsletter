# TLI 알고리즘 품질 분석 리포트

**생성일**: 2026-02-11 18:10
**분석 대상**: `lib/tli/`, `scripts/tli/`
**분석 방법**: 코드 정적 분석 + 시뮬레이션 기반 통계 검증

---

## [OBJECTIVE] 5개 영역의 알고리즘 품질 평가 및 구체적 개선안 도출

1. 감성 분석 구현 방안
2. 가중치 최적화 방법론
3. 비교 임계값 적정성
4. DataLab 정규화 개선
5. 예측 정확도 개선

---

## 1. 감성 분석 구현 방안

### [DATA] 현재 구현 분석

현재 `lib/tli/sentiment.ts`는 사전 기반(dictionary-based) 감성 분석을 사용:
- 긍정 키워드 30개, 부정 키워드 28개 (총 58개)
- 뉴스 **제목만** 분석 (본문 미사용)
- 점수: `(positive - negative) / max(positive + negative, 1)`, 범위 [-1, +1]
- 중복 방지를 위한 위치 기반 매칭 (긴 키워드 우선)

### [FINDING] 사전 기반 접근의 정확도는 약 55%로 추정

[STAT:n] n = 8개 테스트 헤드라인 시뮬레이션
[STAT:effect_size] 점수 분포 StdDev = 0.724 (고분산 -- 극단값 편중)

**근본적 한계점 6가지:**
1. 문맥 무시: "급등 **우려**" (긍정 키워드가 부정 문맥에서 사용)
2. 부정 처리 불가: "상승**하지 않다**" -> 긍정으로 오분류
3. 고정 어휘: 신조어/테마별 용어 미반영 (e.g., "AI 수혜주")
4. 강도 미구분: "소폭 상승"과 "급등"이 동일 가중
5. 제목 한정: 제목 ≠ 기사 전체 감성
6. 도메인 미적응: 범용 금융 vs 테마별 감성 차이

### [FINDING] 비용/정확도 트레이드오프에서 하이브리드 접근이 최적

[STAT:n] 월간 약 75,000건 기사 기준

| 방법 | 월 비용 | 정확도 | 지연 |
|------|---------|--------|------|
| 사전 기반 (현재) | $0.00 | ~55% | 0.1ms |
| GPT-4o-mini | $2.87 | ~82% | 300ms |
| Claude Haiku | $4.97 | ~85% | 300ms |
| **하이브리드 (사전+LLM)** | **$1.15** | **~75%** | **120ms avg** |
| Fine-tuned KcBERT | $30/mo+setup | ~78% | 5ms |

감성 가중치(20%)에서 최대 기여는 20점. 정확도 27% 향상 시 점수 개선 효과는 약 5.4점.

### 구현 제안

**즉시 (코드 변경만):**
```typescript
// sentiment.ts에 부정 처리 추가
const NEGATION_PATTERNS = ['않', '못', '없', '아니', '안 '];
// 키워드 앞 2글자 이내에 부정어가 있으면 극성 반전
```

**단기 (1-2주):**
- `analyzeSentiment()`에 confidence 점수 추가
- confidence < 0.5인 기사만 GPT-4o-mini로 재분석 (월 ~$1.15)
- 기존 `naver-news.ts` collector에 batch LLM 호출 통합

**중기 (1-2달):**
- 하이브리드로 축적된 라벨 데이터로 KcBERT fine-tuning
- ~2,000개 라벨링 필요 (LLM 분석 결과를 학습 데이터로 활용)

### [LIMITATION]
- 정확도 수치는 학술 문헌 기반 추정치이며, 실제 한국 금융 뉴스 코퍼스에서의 검증 필요
- 감성 분석 정확도 향상이 TLI 점수 품질에 미치는 실제 영향은 A/B 테스트 필요

---

## 2. 가중치 최적화

### [DATA] 현재 고정 가중치

```
interest: 0.40, newsMomentum: 0.25, sentiment: 0.20, volatility: 0.15
```

### [FINDING] Interest가 점수 분산의 58.9%를 지배하며, Sentiment는 8.5%에 불과

[STAT:n] n = 1,000개 시뮬레이션 테마
[STAT:effect_size] Interest variance contribution = 58.9%, Sentiment = 8.5%

| 컴포넌트 | 가중치 | 분산 기여도 | 유효 범위 |
|----------|--------|-----------|----------|
| Interest | 0.40 | 58.9% | 40pts |
| News Momentum | 0.25 | 23.3% | 25pts |
| Sentiment | 0.20 | 8.5% | 20pts |
| Volatility | 0.15 | 6.5% | 15pts |

Sentiment의 분산 기여도(8.5%)가 가중치(20%)에 비해 매우 낮은 이유:
현재 대부분의 테마에 감성 데이터가 없어 기본값 0.5(중립)이 사용됨.

### [FINDING] 그리드 서치 결과, 최적 가중치는 Interest 0.55 / News 0.35 / Sentiment 0.05 / Volatility 0.05

[STAT:n] 212개 가중치 조합 탐색 (step=0.05, sum=1.0)
[STAT:effect_size] Cohen's d: 현재 4.896 -> 최적 6.551 (33.8% 개선)
[STAT:ci] 상위 5개 조합 모두 Interest >= 0.50, News >= 0.30

| Interest | News | Sent | Vol | Cohen's d | Healthy avg | Decline avg |
|----------|------|------|-----|-----------|-------------|-------------|
| **0.55** | **0.35** | **0.05** | **0.05** | **6.551** | **56.3** | **18.3** |
| 0.60 | 0.30 | 0.05 | 0.05 | 6.550 | 57.0 | 18.7 |
| 0.50 | 0.40 | 0.05 | 0.05 | 6.470 | 55.5 | 17.9 |
| 0.55 | 0.30 | 0.05 | 0.10 | 6.377 | 55.4 | 19.3 |
| 0.55 | 0.30 | 0.10 | 0.05 | 6.356 | 56.4 | 20.2 |

### 구현 제안

**현실적 접근: 단계적 조정**

현재 감성 분석의 정확도가 낮은 상태에서 감성 가중치를 높이는 것은 무의미.
대신 감성 엔진 품질에 연동하여 가중치를 동적 조정:

```typescript
// score-config.ts 수정
export function getScoreWeights(sentimentQuality: 'none' | 'dict' | 'llm' | 'finetuned') {
  switch (sentimentQuality) {
    case 'none':     return { interest: 0.50, newsMomentum: 0.35, sentiment: 0.05, volatility: 0.10 };
    case 'dict':     return { interest: 0.45, newsMomentum: 0.30, sentiment: 0.10, volatility: 0.15 }; // current+
    case 'llm':      return { interest: 0.40, newsMomentum: 0.25, sentiment: 0.20, volatility: 0.15 }; // current
    case 'finetuned': return { interest: 0.35, newsMomentum: 0.25, sentiment: 0.25, volatility: 0.15 };
  }
}
```

**그리드 서치 vs 그라디언트 기반:**
- 4개 파라미터 + sum=1 제약 -> 실질 자유도 3. 그리드 서치(step=0.05)로 212개 조합이면 충분.
- 그라디언트 기반은 과적합 위험이 높고, 검증 데이터가 충분히 축적된 후에만 의미 있음.
- **추천: 그리드 서치 + evaluate-predictions 결과를 objective function으로 사용**

### [LIMITATION]
- 시뮬레이션은 합성 데이터 기반이며, 실제 테마 데이터의 분포와 다를 수 있음
- 최적 가중치는 "healthy vs declining" 분리를 기준으로 하며, 다른 목적함수(예: 사용자 만족도)에서는 다를 수 있음

---

## 3. 비교 임계값 분석

### [DATA] 현재 설정

- 생산 임계값: **0.25** (`comparison/composite.ts` 사용처)
- 백테스트 기본값: **0.40** (`backtest-comparisons.ts`)
- 최대 매치 수: **3개** (상위 similarity 순)
- 정확도 기준: 피어슨 상관 >= 0.3 (미래 궤적 비교)

### [FINDING] 현재 임계값 0.25는 정밀도 30.3%로, 매치의 70%가 노이즈

[STAT:n] n = 5,000 시뮬레이션 비교 쌍 (true match ratio = 20%)
[STAT:p_value] F1 최적 임계값 = 0.40 (F1 = 0.607)

| 임계값 | Precision | Recall | F1 | 매치 수 |
|--------|-----------|--------|-----|--------|
| **0.25 (현재)** | **0.303** | **0.902** | **0.453** | **2,979** |
| 0.40 (최적) | 0.593 | 0.621 | 0.607 | 1,047 |

임계값 0.25 -> 0.40 변경 시:
- 정밀도: 30.3% -> 59.3% (+96% 개선)
- 1,651개의 노이즈 매치 제거
- Recall 손실: 90.2% -> 62.1% (일부 true match 놓침)

### [FINDING] Max-3 제약이 실질적 임계값을 상향 조정하는 효과가 있음

[STAT:n] n = 100 테마 시뮬레이션
- 임계값 0.25에서 평균 매치/테마: 3.0 (사실상 모든 테마가 상한에 도달)
- 임계값 0.40에서 평균 매치/테마: 2.7 (여전히 대부분 매치 확보)
- 0 매치 테마: 0.25에서 0개, 0.40에서 0개

### 구현 제안

`backtest-comparisons.ts`를 실행하여 실제 데이터 기반 최적 임계값을 확인한 후,
`constants/score-config.ts`에 임계값을 올리는 것을 권장.

```typescript
// 현재
const SIMILARITY_THRESHOLD = 0.25;

// 제안: 단계적 상향
const SIMILARITY_THRESHOLD = 0.35; // 1차: 보수적 상향
// 백테스트 결과 확인 후
const SIMILARITY_THRESHOLD = 0.40; // 2차: 최적점 적용
```

**주의**: `evaluate-comparisons.ts`의 캘리브레이션 데이터가 충분히 축적된 후에
`comparison_calibration` 테이블의 `suggested_threshold`를 동적으로 사용하는 것이 이상적.

### [LIMITATION]
- 시뮬레이션은 similarity 분포를 정규분포로 가정했으며, 실제 분포는 다를 수 있음
- Max-3 제약 효과는 실제 테마당 후보 수에 따라 달라짐

---

## 4. DataLab 정규화 개선

### [DATA] 현재 정규화 방식

Naver DataLab API 제약:
- 배치당 최대 5개 키워드 그룹
- 반환값은 배치 내 상대 비율 (배치 최대값 = 100)
- 배치 간 비교 불가능

현재 해결 방법 (`naver-datalab.ts`):
1. **자기 정규화**: `theme_ratio / theme_max * 100` (테마 자체 최대값 기준)
2. **Cross-theme percentile**: `calculate-scores.ts`에서 raw_value 7일 평균의 테마간 백분위 계산
3. 하위 20% 테마에 감쇠 적용 (0.1~1.0)

### [FINDING] 자기 정규화는 테마 간 상대적 인기도를 완전히 제거함

[STAT:n] n = 20 시뮬레이션 테마, 30일 데이터
[STAT:effect_size] 진짜 인기도와의 상관: 자기 정규화 r=0.672, Anchor r=1.000

| 정규화 방법 | 진짜 인기도 상관 | 테마 간 비교 |
|------------|----------------|-------------|
| 자기 정규화 (현재) | r = 0.672 | 불가 |
| 배치 정규화 (raw) | r = 0.501 | 배치 내만 |
| **Anchor 정규화** | **r = 1.000** | **가능** |
| **EMA Relative Index** | **r = 1.000** | **가능** |

### 구현 제안

**방법 A: Anchor 정규화 (정확도 최고, API 변경 필요)**

```typescript
// naver-datalab.ts 수정
const ANCHOR_KEYWORD = '삼성전자'; // 안정적 고볼륨 키워드

// 배치 구성: 4 테마 + 1 앵커
for (let i = 0; i < themes.length; i += 4) {
  const batch = themes.slice(i, i + 4);
  const keywordGroups = [
    ...batch.map(t => ({ groupName: t.name, keywords: preprocessKeywords(t.naverKeywords) })),
    { groupName: '__anchor__', keywords: [ANCHOR_KEYWORD] },
  ];
  // ... API 호출 후 anchor ratio로 보정
}
```

단점: 배치 처리량 20% 감소 (5 -> 4 테마/배치), 250 테마 기준 50 -> 63 배치.

**방법 B: EMA Relative Index (API 변경 없음, 즉시 적용 가능)**

```typescript
// calculate-scores.ts 수정
// 기존 computePercentile() 대체
function computeRelativeIndex(themeRawAvg: number, populationEMA: number): number {
  if (populationEMA <= 0) return 0.5;
  return Math.min(themeRawAvg / populationEMA, 3.0) / 3.0; // [0, 1] 정규화
}
```

단점: raw_value가 이미 배치 상대값이므로 한계가 있음. 그러나 현재 percentile보다 안정적.

**추천**: 방법 B를 즉시 적용하고, 방법 A를 중기 과제로 진행.

### [LIMITATION]
- Anchor 정규화의 r=1.000은 시뮬레이션 조건에서의 이상적 결과
- 실제로는 앵커 키워드의 계절적 변동이 보정 정확도에 영향
- EMA는 raw_value의 배치 의존성을 완전히 해결하지 못함

---

## 5. 예측 정확도 개선

### [DATA] 현재 예측 시스템

- 비교 기반 예측: 유사 과거 테마의 라이프사이클을 템플릿으로 사용
- Phase 판정: 점수 기반 1차 신호 + 비교 데이터 폴백
- 시나리오: best/median/worst (과거 테마 총 일수 기준 정렬)
- 평가: 14일 후 실제 stage와 비교 (`evaluate-predictions.ts`)

### [FINDING] 비교 기반 예측의 Peak MAE는 22.2일이며, 단순 추세 모델보다 MAE는 낮지만 median error는 높음

[STAT:n] n = 200 시뮬레이션 라이프사이클
[STAT:effect_size] Comparison MAE=22.2d, SMA MAE=25.2d, Linear MAE=34.1d

| 모델 | Peak MAE | Median Error | <7일 정확도 |
|------|----------|-------------|------------|
| 비교 기반 (현재) | 22.2일 | 20.8일 | 16.5% |
| SMA 외삽 | 25.2일 | 12.0일 | 44.0% |
| 선형 추세 (ARIMA 대리) | 34.1일 | 7.0일 | 49.7% |

비교 기반의 강점은 안정적인 MAE이지만, 높은 median error는 대부분의 예측이 부정확함을 의미.
선형 추세의 median 7.0일은 "이미 관찰된 추세의 연장"에서 나온 것으로, 반전 시점을 예측하는 것이 아님.

### [FINDING] ARIMA/Prophet 도입은 이 도메인에서 비효율적

테마 라이프사이클 특성:
- **짧은 시계열**: 평균 30-90일, ARIMA 최소 30개 데이터 포인트 필요
- **비정상성**: 성장-정점-쇠퇴 패턴은 비정상 과정 (ARIMA 가정 위반)
- **비선형**: 지수 성장 + 감쇠 곡선은 선형 모델로 포착 불가
- **외부 충격**: 정책/뉴스 이벤트로 갑작스런 방향 전환

### 구현 제안

**현재 시스템 강화 (비교 품질 향상):**

1. **비교 품질이 곧 예측 품질**: 임계값 0.25->0.35 상향 + feature vector 개선이 예측에 직접 영향
2. **가중 평균 개선**: 현재 similarity 가중 평균 대신, 궤적 상관이 검증된 비교만 사용

```typescript
// prediction.ts 수정 -- 검증된 비교에 추가 가중
const verifiedBonus = comparison.trajectoryVerified ? 1.5 : 1.0;
const weight = comparison.similarity * verifiedBonus;
```

3. **앙상블 접근**: 비교 기반 + SMA 추세를 결합

```typescript
// 현재 관찰된 추세 방향과 비교 예측이 일치하면 confidence 상향
const trendDirection = observedSMA7d > observedSMA14d ? 'up' : 'down';
const comparisonDirection = estimatedDaysToPeak > 0 ? 'up' : 'down';
if (trendDirection === comparisonDirection) confidence = upgradeConfidence(confidence);
```

4. **Phase 판정의 score 의존성 축소**: 현재 score >= 75면 무조건 at-peak인데,
   비교 데이터가 pre-peak를 시사하면 score만으로 phase를 결정하지 않도록 수정.

### [LIMITATION]
- 시뮬레이션은 합성 라이프사이클(대칭 bell curve)을 사용했으며, 실제 테마는 비대칭적
- 비교 기반 예측의 품질은 과거 테마 DB의 크기/다양성에 크게 의존
- 현재 과거 테마 수가 적으면 통계적 의미가 없음

---

## 종합 우선순위 로드맵

| 순서 | 영역 | 작업 | 예상 효과 | 난이도 |
|------|------|------|----------|--------|
| 1 | 가중치 | Sentiment 감소 (0.20->0.10), Interest/News 상향 | 즉시 점수 분리도 개선 | 낮음 |
| 2 | 임계값 | 0.25 -> 0.35 상향 + backtest 실행 | 노이즈 매치 ~50% 감소 | 낮음 |
| 3 | 감성 | 부정 처리 + confidence 기반 하이브리드 LLM | 감성 정확도 55%->75% | 중간 |
| 4 | DataLab | EMA Relative Index 적용 | 테마 간 비교 안정성 향상 | 중간 |
| 5 | 예측 | SMA 추세 앙상블 + 검증 기반 가중 | Phase 정확도 향상 | 중간 |
| 6 | DataLab | Anchor 정규화 도입 | 절대적 인기도 비교 가능 | 높음 |
| 7 | 감성 | KcBERT fine-tuning | 감성 정확도 ~78%, 비용 제거 | 높음 |
| 8 | 가중치 | evaluate-predictions 기반 동적 가중치 | 데이터 기반 최적화 | 높음 |

**핵심 메시지**: 현재 아키텍처(비교 기반 예측, 4요소 점수)는 건전하다.
ARIMA/Prophet 등 새 패러다임 도입보다, **기존 파이프라인의 데이터 품질**(감성, 정규화)과
**파라미터 튜닝**(가중치, 임계값)을 개선하는 것이 ROI가 높다.

---

## Figures

- `01_weight_sensitivity.png`: 가중치 감도 분석 및 그리드 서치 결과
- `02_threshold_analysis.png`: 비교 임계값 Precision-Recall 트레이드오프
- `03_datalab_normalization.png`: DataLab 정규화 방법 비교
- `04_prediction_comparison.png`: 예측 모델 오차 분포 비교
