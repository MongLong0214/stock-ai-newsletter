# TLI v2 변경사항 — `time` 브랜치

> 브랜치: `time` (base: `main`)
> 작성일: 2026-02-17
> 변경 파일: 35개 (TLI 관련), +861 / -572 lines

---

## 목차

1. [핵심 요약](#1-핵심-요약)
2. [감성 분석 제거 → 신뢰도 + 활동성 대체](#2-감성-분석-제거--신뢰도--활동성-대체)
3. [점수 계산 알고리즘 재설계](#3-점수-계산-알고리즘-재설계)
4. [단계(Stage) 판정 재설계](#4-단계stage-판정-재설계)
5. [예측 모듈 Phase 통합](#5-예측-모듈-phase-통합)
6. [비교 분석 고도화](#6-비교-분석-고도화)
7. [파이프라인 안정성 강화](#7-파이프라인-안정성-강화)
8. [UI 변경사항](#8-ui-변경사항)
9. [타입 시스템 변경](#9-타입-시스템-변경)
10. [수학 유틸리티 추가](#10-수학-유틸리티-추가)
11. [파일별 변경 매트릭스](#11-파일별-변경-매트릭스)
12. [배포 체크리스트](#12-배포-체크리스트)
13. [향후 고도화 포인트](#13-향후-고도화-포인트)

---

## 1. 핵심 요약

### 동기

- 기존 키워드 기반 감성 분석(`lib/tli/sentiment.ts`)이 정확도 불충분 — 제거
- 점수 가중치에 sentiment 20%가 무의미한 노이즈 → 3요소로 재편
- 데이터 신뢰도를 수치화하여 UI에 노출하는 것이 더 유의미

### Before → After

| 항목 | v1 (기존) | v2 (변경) |
|------|----------|----------|
| 점수 요소 | Interest 40%, News 25%, Sentiment 20%, Volatility 15% | Interest 40%, News 35%, Volatility 10%, Activity 15% |
| 감성 분석 | 키워드 매칭 기반 `analyzeSentiment()` | **제거** |
| 신뢰도 | 없음 | `ScoreConfidence` (high/medium/low) |
| Stage 판정 | 점수 기반 단순 threshold | Multi-Signal + Markov 전이 제약 |
| Phase 도출 | 독립 `derivePhase()` 로직 | Stage에서 직접 매핑 (Single Source of Truth) |
| 변동성 | 표준편차 기반 | DVI (Directional Volatility Index, RSI 기반) |
| 비교 임계값 | 하드코딩 0.25 | F1 최적화 자동 튜닝 (기본 0.35) |
| Supabase 배치 | 재시도 없음 | 3회 지수 백오프 재시도 |

---

## 2. 감성 분석 제거 → 신뢰도 + 활동성 대체

### 삭제된 파일

| 파일 | 라인수 | 역할 |
|------|--------|------|
| `lib/tli/sentiment.ts` | 153줄 | `analyzeSentiment()`, `aggregateSentiment()`, `getSentimentConfig()`, `isRelevantArticle()` |
| `lib/tli/__tests__/sentiment.test.ts` | 78줄 | sentiment 유닛 테스트 |

### `isRelevantArticle()` 이동

`sentiment.ts`에 있던 `isRelevantArticle()`은 뉴스 수집기에서 사용하므로 `scripts/tli/collectors/naver-news.ts`로 인라인 이동. `escapeRegex()` 헬퍼도 함께 이동.

```
sentiment.ts::isRelevantArticle() → naver-news.ts::isRelevantArticle() (로직 동일)
sentiment.ts::escapeRegex()       → naver-news.ts::escapeRegex() (로직 동일)
```

### 대체: Score Confidence 시스템

새 타입 `ScoreConfidence` (lib/tli/types/db.ts:72-78):

```typescript
export interface ScoreConfidence {
  level: ConfidenceLevel       // 'high' | 'medium' | 'low'
  dataAge: number              // interest 데이터 일수
  interestCoverage: number     // 0-1 (interest 일수/30)
  newsCoverage: number         // 0-1 (뉴스 있는 일수/14)
  reason: string               // 한국어 사유
}
```

판정 기준 (calculator.ts:170-184):

| Level | 조건 |
|-------|------|
| `high` | `coverageScore ≥ 0.7` AND `interest ≥ 14일` |
| `medium` | `coverageScore ≥ 0.4` AND `interest ≥ 7일` |
| `low` | 그 외 |

`coverageScore = interestCoverage × 0.6 + newsCoverage × 0.4`

### 대체: Activity Score (신규 4번째 요소)

calculator.ts:135-149에서 계산:

```
activityScore = stockPriceChange(50%) + volumeIntensity(30%) + dataCoverage(20%)
```

- `stockPriceChange`: `sigmoid_normalize(avgPriceChangePct, 0, 5) × 0.5`
- `volumeIntensity`: `log_normalize(avgVolume, 50,000,000) × 0.3`
- `dataCoverage`: `min(activeDays / 14, 1) × 0.2`
- **노이즈 게이트**: `levelScore < 0.1` → `activityScore × 0.5`

---

## 3. 점수 계산 알고리즘 재설계

> 파일: `lib/tli/calculator.ts` (전면 재작성)

### 3.1 Interest Score — Dual-Axis (OECD CLI 참고)

```
interestScore = levelScore × 0.6 + momentumScore × 0.4
```

**Level (상대적 위치)**:
1. `allThemesRawAvg` 있으면 → `percentileRank(rawAvg, allThemesRawAvg)`
2. `rawPercentile` 있으면 → 그대로 사용
3. 둘 다 없으면 → `sigmoid_normalize(rawAvg, 30, 20)` (fallback)

**Momentum (7일 추세)**:
- `linearRegressionSlope(recent7d)` → `sigmoid_normalize(slope, 0, 1.5)`
- 기준선 없으면 절대값 half-strength: `sigmoid(rawAvg, 30, 20) × 0.5`

**DataLab 미수집 fallback**: `rawAvg === 0 && newsThisWeek > 0` → `interestScore = newsScore × 0.7`

### 3.2 News Score — Log + Sigmoid

```
newsScore = volumeScore × 0.6 + newsMomentumScore × 0.4
```

- `volumeScore`: `log_normalize(newsThisWeek, 50)`
- `newsMomentumScore`:
  - `newsLastWeek >= 3` → `sigmoid_normalize((this - last) / max(last, 1), 0, 1.0)`
  - `newsLastWeek < 3` → 중립 `0.5`

### 3.3 Volatility — DVI (Directional Volatility Index)

RSI와 유사한 방향성 변동 지표:

```
deltas = recent7d[i] - recent7d[i-1] (시간순)
avgUp = avg(positive deltas)
avgDown = avg(|negative deltas|)

DVI = 1 - 1/(1 + avgUp/avgDown)   // avgDown > 0
DVI = 0.5                          // avgUp = avgDown = 0
DVI = 1.0                          // avgDown = 0, avgUp > 0

volatilityScore = DVI × sigmoid_normalize(stddev, 15, 10)
```

### 3.4 가중치

```typescript
// lib/tli/constants/score-config.ts
export const SCORE_WEIGHTS = {
  interest: 0.40,      // 관심도 (was 0.40)
  newsMomentum: 0.35,  // 뉴스 (was 0.25)
  volatility: 0.10,    // 변동성 (was 0.15)
  activity: 0.15,      // 활동성 (신규)
} as const
```

런타임 합계 검증: `Math.abs(sum - 1.0) > 0.001` → `throw Error`

### 3.5 Raw Components (관측용)

`ScoreComponents.raw`에 v2 전용 필드 추가 (모두 optional, 하위 호환):

```typescript
level_score?: number;         // Dual-Axis level 요소
momentum_score?: number;      // Dual-Axis momentum 요소
interest_slope?: number;      // linearRegressionSlope 원값
dvi?: number;                 // Directional Volatility Index
volume_intensity?: number;    // 거래량 정규화
data_coverage?: number;       // 데이터 성숙도
raw_score?: number;           // 가중합 원값 (0-1)
```

---

## 4. 단계(Stage) 판정 재설계

> 파일: `lib/tli/stage.ts` (전면 재작성)

### 4.1 Multi-Signal 우선순위

```
1. Dormant:  score < 15 AND trend ≠ rising
2. Peak:     score ≥ 63 OR (score ≥ 50 AND stable/rising AND news > 30)
3. Decline:  falling AND rawScore < 85% × levelScore AND news < 30
4. Growth:   score ≥ 40 AND stable/rising
5. Emerging: 나머지 전부
```

### 4.2 추세(Trend) 판별

```typescript
normalizedSlope = interest_slope / max(recent_7d_avg, 1)
// > +0.10 → 'rising'
// < -0.10 → 'falling'
// 그 외   → 'stable'
```

임계값 `±0.10` (데이터 검증 결과 `±0.05`에서 62%가 falling 판정 → 완화)

### 4.3 Markov 전이 제약

```
Dormant  → Emerging (만)
Emerging → Growth | Dormant
Growth   → Peak | Decline
Peak     → Decline | Growth
Decline  → Dormant | Emerging
```

- 허용되지 않은 전이 → 이전 단계 유지
- **데이터 갭 ≥ 3일** → 제약 완화 (1단계 점프 허용)
- `prevStage` 미제공 시 → 제약 없음

### 4.4 재점화(Reigniting) 감지

`lib/tli/reigniting.ts` 변경:
- `Decline→Emerging` 전이 감지 시 즉시 재점화 판정
- 기존 관심도 반등 로직(`growthRate >= 0.30`) 유지 (하위 호환)

---

## 5. 예측 모듈 Phase 통합

> 파일: `lib/tli/prediction.ts`

### Stage → Phase 직접 매핑

```typescript
const STAGE_TO_PHASE: Record<Stage, Phase> = {
  Dormant:  'declining',
  Emerging: 'pre-peak',
  Growth:   'near-peak',
  Peak:     'at-peak',
  Decline:  'post-peak',
}
```

- 독립적 `derivePhase()` 로직 제거 → Stage가 Phase의 Single Source of Truth
- `calculatePrediction()`에 optional `stage?: Stage` 5번째 인자 추가
- Stage 없으면 `derivePhaseFallback()` 사용 (하위 호환)

### Stage 기반 리스크 매핑

```typescript
const STAGE_TO_RISK: Record<Stage, RiskLevel> = {
  Dormant: 'low', Emerging: 'low', Growth: 'moderate',
  Peak: 'high', Decline: 'critical',
}
```

---

## 6. 비교 분석 고도화

### 6.1 자동 임계값 튜닝 (신규)

> 파일: `scripts/tli/auto-tune.ts` (109줄, 신규 파일)

```
검증된 비교(outcome_verified=true, 최근 30일)에서 F1 최적화 임계값 산출
```

- **후보**: `[0.25, 0.30, 0.35, 0.40, 0.45, 0.50]`
- **정확 기준**: `trajectory_correlation ≥ 0.5` (evaluate-comparisons의 0.3보다 보수적)
- **F1 계산**: `precision = 정확 above / 전체 above`, `recall = 정확 above / 전체 정확`
- **Bayesian shrinkage**: 샘플 적을수록 `DEFAULT(0.35)`로 수렴
  - `shrinkWeight = min(n, 100) / 100`
  - `shrunk = DEFAULT × (1 - sw) + best × sw`
- **Confidence**: n ≥ 100 → high, n ≥ 50 → medium, else → low
- 최소 30개 샘플 미만 시 → null 반환 (기본값 사용)
- 211줄 테스트: `scripts/tli/__tests__/auto-tune.test.ts`

### 6.2 파이프라인 통합

`collect-and-score.ts` 4.5단계로 삽입:
```
4단계: 점수 계산 → 4.5단계: auto-tune → 5단계: 비교 분석(tunedThreshold 전달)
```

- `calculateThemeComparisons(themes, thresholdOverride?)` — 2번째 인자 추가
- `evaluateComparisonOutcomes(tunedThreshold?)` — 튜닝 결과 재사용
- `run-comparisons.ts` 단독 실행도 auto-tune 적용

### 6.3 비교 결과 보존 정책 변경

```
Before: 7일 이전 비교 결과 전부 삭제
After:  21일 이전 + 미검증(outcome_verified=null/false)만 삭제
        → 검증 완료 레코드는 영구 보존 (auto-tune 학습 데이터)
```

### 6.4 인덱스 범위 초과 방어

`evaluate-comparisons.ts`에 `current_day >= alignedPastInterest.length` 체크 추가 → 범위 초과 시 건너뜀

---

## 7. 파이프라인 안정성 강화

### 7.1 Volume Validation Gate

`collect-and-score.ts`에 DataLab 수집 직후 품질 검증 게이트:

```
커버리지 < 70%      → criticalFailure + datalabFailed
제로값 비율 ≥ 90%   → criticalFailure + datalabFailed
datalabFailed=true  → 4~8단계 전부 생략
```

### 7.2 실패 분류 분리

```
criticalFailures: DataLab + News + Stocks + Scores + Comparisons → exit(1)
warningFailures:  Predictions + Evaluations + Verifications → log only, exit(0)
```

### 7.3 Supabase 배치 재시도

`scripts/tli/supabase-batch.ts`:

```
batchQuery:  3회 재시도, 지수 백오프 (1s, 2s, 4s)
batchUpsert: 3회 재시도, 지수 백오프 (1s, 2s, 4s)
```

### 7.4 점수 배치 저장

`calculate-scores.ts`: 개별 upsert → 전체 모아서 단일 `upsert(scoreRows)` + `first_spike_date` 배치 백필

### 7.5 Cross-theme Percentile 최적화

```
Before: sortedRawAvgs.filter(v => v <= value).length  // O(n) 선형 스캔
After:  Binary search (upper bound)                     // O(log n)
```

---

## 8. UI 변경사항

### 8.1 감성 관련 UI 제거

| 파일 | 제거 내용 |
|------|----------|
| `app/themes/[id]/_components/detail-header/metric-grid.tsx` | 기사 논조 카드 (`sentiment` useMemo + MessageSquare 아이콘) |
| `app/themes/[id]/_components/detail-header/score-components.tsx` | sentiment 바 + MessageSquare 아이콘 |
| `app/themes/[id]/_components/news-headlines.tsx` | 전체 기사 논조 요약 배너 + 개별 기사 감성 뱃지 + `sentimentMap`/`sentimentSummary` 로직 |
| `components/tli/score-breakdown.tsx` | sentiment 행 + `getSentimentConfig` import |

### 8.2 신뢰도 UI 추가

| 파일 | 추가 내용 |
|------|----------|
| `app/themes/[id]/_components/score-card.tsx` | 신뢰도 알림 배너 (medium: 슬레이트, low: 앰버) |
| `components/tli/lifecycle-score.tsx` | `confidenceLevel` prop + "데이터 부족" 뱃지 |

### 8.3 차트 색상 수정

`components/tli/lifecycle-curve.tsx`:
```
Before: peak/news → sentiment 색상(amber), interest → volatility 색상
After:  peak → amber(장식), news → newsMomentum 색상(sky), interest → volatility 색상(purple)
```

### 8.4 점수 바 크기 조정

`score-components.tsx`:
```
space-y-3 → space-y-6  (바 간격)
h-3 → h-4              (바 높이)
```

### 8.5 OG/Twitter 이미지 Stage 이름

`app/themes/(list)/opengraph-image.tsx` + `twitter-image.tsx`:
```
Early(#10b981/초기)  → Emerging(#3b82f6/부상)
Decay(#ef4444/쇠퇴)  → Decline(#f59e0b/하락)
```

---

## 9. 타입 시스템 변경

### 9.1 제거된 필드

| 타입 | 필드 | 위치 |
|------|------|------|
| `ScoreComponents` | `sentiment_score` | lib/tli/types/db.ts |
| `ScoreComponents.weights` | `sentiment` | lib/tli/types/db.ts |
| `ScoreComponents.raw` | `sentiment_avg`, `sentiment_article_count` | lib/tli/types/db.ts |
| `NewsArticle` | `sentimentScore` | lib/tli/types/db.ts |
| `ThemeListItem` | `sentimentScore` | lib/tli/types/api.ts |
| `ThemeDetail.score.components` | `sentiment` | lib/tli/types/api.ts |
| `ThemeDetail.score.raw` | `sentimentAvg`, `sentimentArticleCount` | lib/tli/types/api.ts |
| `ScoreRawData` | `sentimentAvg`, `sentimentArticleCount` | lib/tli/types/api.ts |

### 9.2 추가된 필드

| 타입 | 필드 | 위치 |
|------|------|------|
| `ConfidenceLevel` | `'high' \| 'medium' \| 'low'` | lib/tli/types/db.ts:69 |
| `ScoreConfidence` | `level, dataAge, interestCoverage, newsCoverage, reason` | lib/tli/types/db.ts:72-78 |
| `ScoreComponents` | `activity_score?: number` | lib/tli/types/db.ts:86 |
| `ScoreComponents.weights` | `activity?: number` | lib/tli/types/db.ts:91 |
| `ScoreComponents.raw` | `level_score?, momentum_score?, interest_slope?, dvi?, volume_intensity?, data_coverage?, raw_score?` | lib/tli/types/db.ts:103-122 |
| `ScoreComponents` | `confidence?: ScoreConfidence` | lib/tli/types/db.ts |
| `ThemeListItem` | `confidenceLevel?: ConfidenceLevel` | lib/tli/types/api.ts |
| `ThemeDetail.score` | `confidence: { level, dataAge, interestCoverage, newsCoverage, reason }` | lib/tli/types/api.ts |

### 9.3 type guard 수정

`isScoreComponents()` (lib/tli/types/stage.ts):
- `sentiment_score` 체크 제거
- `activity_score` 체크하지 않음 (optional, 하위 호환)

---

## 10. 수학 유틸리티 추가

> 파일: `lib/tli/normalize.ts`

### 신규 함수

| 함수 | 시그니처 | 용도 |
|------|---------|------|
| `sigmoid_normalize` | `(x, center, scale) → (0, 1)` | 모멘텀, 주가 변화율 정규화 |
| `log_normalize` | `(value, scale) → [0, 1]` | 뉴스량, 거래량 정규화 |
| `percentileRank` | `(value, sortedArray) → [0, 1]` | 전체 테마 대비 상대 순위 |
| `linearRegressionSlope` | `(values) → slope` | 7일 관심도 추세 기울기 (OLS) |

### 신규 상수

| 상수 | 값 | 용도 |
|------|---|------|
| `MIN_PERCENTILE_POPULATION` | `50` | percentileRank 모집단 최소 크기 (미달 시 sigmoid fallback) |

### 안전 장치

- `sigmoid_normalize`: `scale ≤ 0` → 0.5, `!isFinite(x)` → 0.5
- `log_normalize`: `scale ≤ 0` → 0, `value < 0` → 0, `!isFinite` → 0
- `percentileRank`: 빈 배열 → 0.5, 모집단 부족 → sigmoid fallback
- `linearRegressionSlope`: `n < 2` → 0, `denominator = 0` → 0, `!isFinite` → 0

---

## 11. 파일별 변경 매트릭스

### Core Algorithm (lib/tli/)

| 파일 | 변경 | 비고 |
|------|------|------|
| `calculator.ts` | **전면 재작성** | Dual-Axis + DVI + Activity + Confidence |
| `stage.ts` | **전면 재작성** | Multi-Signal + Markov + Trend |
| `prediction.ts` | 수정 | Stage→Phase 매핑, ConfidenceLevel re-export |
| `normalize.ts` | 추가 | 4 함수 + 1 상수 |
| `reigniting.ts` | 수정 | Decline→Emerging 판별 추가 |
| `sentiment.ts` | **삭제** | 전체 제거 |
| `constants/score-config.ts` | 수정 | 가중치 변경, sentiment 제거, activity 추가, 합계 검증 |
| `types/db.ts` | 수정 | sentiment 제거, confidence/activity 추가 |
| `types/api.ts` | 수정 | sentiment 제거, confidence 추가, ThemeStockItem 참조 |
| `types/stage.ts` | 수정 | `isScoreComponents` sentiment 체크 제거 |

### Pipeline (scripts/tli/)

| 파일 | 변경 | 비고 |
|------|------|------|
| `auto-tune.ts` | **신규** | F1 최적화 + Bayesian shrinkage |
| `__tests__/auto-tune.test.ts` | **신규** | 211줄 테스트 |
| `calculate-scores.ts` | 수정 | sentiment 제거, 배치 저장, 바이너리 서치 |
| `calculate-comparisons.ts` | 수정 | threshold 인자화, 보존 정책 변경 |
| `collect-and-score.ts` | 수정 | Volume Gate, auto-tune 4.5단계, 실패 분류 |
| `evaluate-comparisons.ts` | 수정 | tuned threshold 수신, 인덱스 방어 |
| `run-comparisons.ts` | 수정 | auto-tune 통합 |
| `supabase-batch.ts` | 수정 | 3회 지수 백오프 재시도 |
| `collectors/naver-news.ts` | 수정 | sentiment 제거, isRelevantArticle 이동 |
| `data-ops.ts` | 수정 | sentimentScore 필드 제거 |

### API (app/api/tli/)

| 파일 | 변경 | 비고 |
|------|------|------|
| `scores/ranking/route.ts` | 수정 | sentimentScore → confidenceLevel |
| `scores/ranking/ranking-helpers.ts` | 수정 | surging 조건에서 sentimentScore 제거 |
| `themes/[id]/build-response.ts` | 수정 | sentiment 제거, confidence 추가 |
| `themes/[id]/fetch-theme-data.ts` | 수정 | sentiment_score 컬럼 제거 |

### UI (app/themes/, components/tli/)

| 파일 | 변경 | 비고 |
|------|------|------|
| `[id]/_components/detail-header/metric-grid.tsx` | 수정 | 기사 논조 카드 제거 |
| `[id]/_components/detail-header/score-components.tsx` | 수정 | sentiment 바 제거, 바 크기 조정 |
| `[id]/_components/news-headlines.tsx` | 수정 | 논조 배너/뱃지 제거 |
| `[id]/_components/score-card.tsx` | 수정 | 신뢰도 배너 추가 |
| `[id]/_components/comparison-list/pillar-bars.tsx` | 수정 | 색상 참조 수정 |
| `_services/get-ranking-server.ts` | 수정 | sentimentScore 제거 |
| `(list)/opengraph-image.tsx` | 수정 | Emerging/Decline 이름+색상 |
| `(list)/twitter-image.tsx` | 수정 | Emerging/Decline 이름+색상 |
| `components/tli/lifecycle-curve.tsx` | 수정 | 차트 색상 참조 수정 |
| `components/tli/lifecycle-score.tsx` | 수정 | confidenceLevel prop 추가 |
| `components/tli/score-breakdown.tsx` | 수정 | sentiment 행 제거 |

### Tests

| 파일 | 변경 | 비고 |
|------|------|------|
| `lib/tli/__tests__/calculator.test.ts` | 수정 | sentiment 테스트 제거, confidence 테스트 7개 추가 |
| `lib/tli/__tests__/stage.test.ts` | 수정 | sentiment 관련 assertion 제거 |
| `lib/tli/__tests__/sentiment.test.ts` | **삭제** | 전체 제거 |
| `scripts/tli/__tests__/auto-tune.test.ts` | **신규** | 16개 테스트 케이스 |

---

## 12. 배포 체크리스트

### 사전 작업

- [ ] DB migration 실행 불필요 — `sentiment_score` 컬럼은 DB에 유지 (코드에서만 사용 안 함)
- [ ] `theme_news_articles.sentiment_score` 컬럼: 향후 정리 시 별도 migration
- [ ] GitHub Actions: `.github/workflows/tli-collect-data.yml` 변경사항 확인

### 검증

- [x] `tsc --noEmit` — 에러 0
- [x] `eslint` — 에러 0
- [x] `next build` — 성공

### 배포 후 모니터링

- [ ] 첫 파이프라인 실행 후 Confidence 분포 확인 (high:medium:low 비율)
- [ ] Activity Score 0인 테마 비율 확인 (avgPriceChangePct/avgVolume 미수집 시)
- [ ] auto-tune 최초 30건 이상 축적까지 기본 임계값(0.35) 유지 확인
- [ ] Stage 분포 확인: Decline 비율 모니터링

---

## 13. 향후 고도화 포인트

### 단기 (다음 스프린트)

| 항목 | 설명 | 관련 파일 |
|------|------|----------|
| EMA 스무딩 | `calculator.ts`에 `prevSmoothedScore` 인자 이미 선언됨 (현재 미사용). 파이프라인에서 EMA(α=0.4) 적용 필요 | `calculate-scores.ts` |
| Bollinger 아웃라이어 | 연속 10일+ 점수 축적 후 2σ 밴드 이탈 탐지 | `calculate-scores.ts` |
| Stage Hysteresis | 2일 연속 같은 stage 유지 시에만 전환. Peak fast-track(rawScore≥63 AND smoothed≥50) | `calculate-scores.ts` → `stage.ts` |
| `sentiment_score` 컬럼 정리 | `theme_news_articles` 테이블에서 컬럼 DROP (migration 필요) | `supabase/migrations/` |

### 중기

| 항목 | 설명 | 관련 파일 |
|------|------|----------|
| NLP 감성 분석 | 외부 API (GPT, Claude) 기반 진짜 감성 분석 재도입 | 신규 모듈 |
| auto-tune 고도화 | Grid search → Bayesian Optimization, 시계열 교차 검증 | `auto-tune.ts` |
| Stage 이름 DB migration | `Early→Emerging`, `Decay→Decline` 기존 레코드 rename | `supabase/migrations/` |
| 비교 feature 벡터 확장 | `scoreLevel` 제거 후 `interestLevel`, `interestMomentum` 교체 | `lib/tli/comparison/features.ts` |

### 장기

| 항목 | 설명 |
|------|------|
| 실시간 뉴스 감성 | Streaming pipeline + 실시간 sentiment 반영 |
| 거래량 이상 탐지 | Volume spike → 자동 alert |
| 백테스팅 프레임워크 | 과거 데이터 기반 알고리즘 성능 측정 |

### 참고 문서

- `docs/tli-algorithm-redesign-spec.md` — v3 전체 재설계 스펙 (1100줄, CRITICAL 7 + HIGH 10 반영)
- `_research/plans/tli-quality-improvement-plan.md` — 초기 품질 개선 계획
- `_research/reports/20260211_1810_tli_algorithm_quality_report.md` — 알고리즘 품질 보고서

---

## 부록: 주요 상수 변경 요약

| 상수 | 파일 | Before | After |
|------|------|--------|-------|
| `SCORE_WEIGHTS.interest` | score-config.ts | 0.40 | 0.40 |
| `SCORE_WEIGHTS.newsMomentum` | score-config.ts | 0.25 | 0.35 |
| `SCORE_WEIGHTS.sentiment` | score-config.ts | 0.20 | **(삭제)** |
| `SCORE_WEIGHTS.volatility` | score-config.ts | 0.15 | 0.10 |
| `SCORE_WEIGHTS.activity` | score-config.ts | — | **0.15 (신규)** |
| `SIMILARITY_THRESHOLD` | calculate-comparisons.ts | 0.25 (하드코딩) | 0.35 (DEFAULT_THRESHOLD, auto-tune) |
| `MIN_NEWS_LAST_WEEK` | calculator.ts | — | 3 (신규) |
| `TREND_THRESHOLD` | stage.ts | — | ±0.10 (신규) |
| `DATA_GAP_THRESHOLD` | stage.ts | — | 3일 (신규) |
| `TUNING_ACCURACY_THRESHOLD` | auto-tune.ts | — | 0.5 (신규) |
| `SHRINKAGE_CAP` | auto-tune.ts | — | 100 (신규) |
| stale 비교 보존 | calculate-comparisons.ts | 7일 | 21일 (검증 완료 영구 보존) |
