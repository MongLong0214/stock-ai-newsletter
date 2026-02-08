# TLI (Theme Lifecycle Intelligence) 개선 작업 기록

> 작업일: 2026-02-08
> 브랜치: `feat/theme`

---

## 목차

1. [키워드 태그 제거 + 종목 태그 교체](#1-키워드-태그-제거--종목-태그-교체)
2. [상세 헤더 엔터프라이즈급 리라이트](#2-상세-헤더-엔터프라이즈급-리라이트)
3. [Most Improved → 급상승 로직 수정](#3-most-improved--급상승-로직-수정)
4. [유사패턴 파이프라인 심층 리뷰 + 구현](#4-유사패턴-파이프라인-심층-리뷰--구현)
5. [NFT 급상승 문제 - 점수 계산 파이프라인 심층 점검](#5-nft-급상승-문제---점수-계산-파이프라인-심층-점검)

---

## 1. 키워드 태그 제거 + 종목 태그 교체

### 문제

- ThemeCard에 키워드 태그가 일부 테마에만 표시되고 나머지는 빈 상태
- 근본 원인: Supabase 서버 최대 1000행 제한으로 `theme_keywords` 쿼리가 일부만 반환

### 해결 방식

키워드 태그를 완전 제거하고, 대신 **관련 종목명 태그**로 교체

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `components/tli/theme-card.tsx` | 키워드 태그 섹션 제거, `topStocks` 종목명 태그 추가 (최대 4개 + "+N" 오버플로) |
| `lib/tli/types/api.ts` | `ThemeListItem`에서 `keywords` 제거, `topStocks: string[]` 추가 |
| `app/api/tli/scores/ranking/route.ts` | 키워드 쿼리 제거, `topStocks`/`stockNamesMap` 데이터 조립 추가 |
| `app/api/tli/scores/ranking/ranking-helpers.ts` | `batchLoadStockCounts` → `batchLoadStockData` (종목명 포함), `buildKeywordMap` 제거 |
| `app/themes/_components/themes-content.tsx` | 검색 필터에서 키워드 검색 제거 |
| `app/themes/[id]/_components/detail-header.tsx` | `KeywordTags` 컴포넌트 import/사용 제거 |
| `app/api/tli/themes/[id]/query-helpers.ts` | `fetchThemeData`에서 키워드 쿼리 제거 |
| `app/themes/[id]/_components/keyword-tags.tsx` | 파일 삭제 |

---

## 2. 상세 헤더 엔터프라이즈급 리라이트

### 문제

- 테마 상세 페이지 헤더가 거의 비어있고 의미없는 정보만 표시

### 해결 방식

`detail-header.tsx`를 완전 재작성하여 풍부한 정보 대시보드로 전환

### 주요 구성 요소

```
┌──────────────────────────────────────────────────────────────┐
│ Row 1: 타이틀 영역                                            │
│ ├─ 테마명 + StageBadge + 재점화 배지                           │
│ ├─ 영문명, 설명                                               │
│ ├─ StatChip: D+N일, 24H 변동, 7D 변동, 종목 수, 뉴스 수,      │
│ │           유사 패턴 수, 감성 분석 결과                        │
│ └─ LifecycleScore 게이지 (우측)                               │
├──────────────────────────────────────────────────────────────┤
│ Row 2: 점수 구성 + 주요 종목                                   │
│ ├─ Score Components: 관심도/뉴스/감성/변동성 미니 프로그레스 바    │
│ └─ Top Movers: 등락률 기준 상위 3개 종목 (가격, 변동%, 시장)     │
└──────────────────────────────────────────────────────────────┘
```

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/themes/[id]/_components/detail-header.tsx` | 완전 재작성 (248줄) |

### 서브 컴포넌트

- `COMPONENT_CONFIG`: 점수 구성 4개 항목 (관심도/뉴스/감성/변동성) 설정
- `daysSince()`: first_spike_date 기반 테마 나이 계산
- `formatPrice()`: 한국식 가격 포맷
- `StatChip`: 지표 칩 (아이콘 + 라벨 + 색상)

---

## 3. Most Improved → 급상승 로직 수정

### 문제

- "Most Improved" 항목에 NFT가 표시됨 (NFT는 2024년부터 사실상 죽은 테마)
- 기존 기준이 너무 느슨: `change7d > 0, score >= 20, stockCount >= 3`

### 해결 방식

이름을 "급상승"으로 변경하고 기준을 대폭 강화

### 변경 전후 비교

| 항목 | 변경 전 (Most Improved) | 변경 후 (급상승) |
|------|----------------------|----------------|
| 단계 제한 | 없음 | Early/Growth만 |
| 최소 점수 | >= 20 | >= 35 |
| 변동폭 | > 0 | > 5 |
| 뉴스 수 | 없음 | >= 3 (7일 이내) |
| 종목 수 | >= 3 | >= 5 |
| 스파크라인 | 없음 | >= 3일 데이터 |

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/api/tli/scores/ranking/ranking-helpers.ts` | `calculateRankingSummary` 내 `mostImproved` → `surging` 로직 재작성 |
| `lib/tli/types/api.ts` | `ThemeRanking.summary.mostImproved` → `surging` 타입 변경 |
| `app/themes/_components/stats-overview.tsx` | "Most Improved" → "급상승", Rocket 아이콘 적용 |
| `app/api/tli/scores/ranking/route.ts` | `EMPTY_RANKING`에서 `mostImproved` → `surging` 변경 |

---

## 4. 유사패턴 파이프라인 심층 리뷰 + 구현

### 리뷰 프로세스

1차 전문가 리뷰 (architect 에이전트) → 2차 비판적 리뷰 (critic 에이전트) → 최종 수정

### 발견된 문제점 및 수정

#### 핵심 로직 (`lib/tli/comparison.ts`)

| 문제 | 수정 내용 |
|------|----------|
| 키워드 유사도 0일 때 가중치 낭비 (30% dead weight) | 가중치 재분배: feature/curve에 비례 배분 |
| 유사도 메시지 품질 저하 ("55% 유사" 한 줄) | 3개 pillar별 구체적 유사 이유 + 위치 분석 메시지 생성 |
| `findPeakDay` 모든 값 0일 때 edge case | 안전 처리 추가 |
| `compareThemes` dead wrapper | 제거 |
| `compositeCompare` 반환값 부족 | `featureSim`, `curveSim`, `keywordSim` pillar 점수 추가 |

#### 파이프라인 (`scripts/tli/calculate-comparisons.ts`)

| 문제 | 수정 내용 |
|------|----------|
| interest_metrics 전체 이력 로딩 | `batchLoadInterest()`에 180일 필터 추가 |
| 유사도 임계값 0.15 (너무 낮음) | 0.25로 상향 |
| Stale comparison 누적 | 7일 이상 된 comparison 자동 cleanup |

#### API + UI

| 파일 | 수정 내용 |
|------|----------|
| `app/api/tli/themes/[id]/query-helpers.ts` | comparison 쿼리에 3일 날짜 필터 + `calculated_at DESC` 정렬 추가 |
| `app/themes/[id]/_components/comparison-list.tsx` | 배지 임계값 조정 (0.7/0.5/0.35), 메시지 파싱 개선, peak 예측 UI 개선, 사이클 초과 감지 |

### 3-Pillar 유사도 구조

```
총 유사도 = Feature Vector Cosine (35-50%)
          + Curve Correlation Pearson (35-50%)
          + Keyword Jaccard (0-30%)

* 키워드 유사도 0이면 → feature/curve에 가중치 재분배
* 임계값 0.25 이상만 매칭으로 인정
```

---

## 5. NFT 급상승 문제 - 점수 계산 파이프라인 심층 점검

### 문제

급상승 기준을 강화했음에도 NFT가 여전히 "급상승 NFT +30.0"으로 표시

### 근본 원인 분석 (전문 에이전트 2팀 투입)

**7가지 취약점이 복합적으로 작용하여 죽은 테마가 높은 점수를 받는 구조적 결함:**

#### 취약점 1: Self-Max 정규화 노이즈 증폭 (핵심 원인)
- **위치**: `naver-datalab.ts:148-159`
- Naver DataLab raw ratio가 `[0, 0, 0, 2, 0, 0, 1]`이면
- themeMax = 2 → normalized = `[0, 0, 0, 100, 0, 0, 50]`
- 절대적으로 무의미한 관심도가 100으로 부풀려짐

#### 취약점 2: 감성 기본값 0.5 = 무조건 10점
- **위치**: `sentiment.ts:112`
- `aggregateSentiment([])` → `normalized: 0.5`
- 뉴스 0건이어도 sentiment 기여 = 0.5 × 0.20 × 100 = **10점 무료**

#### 취약점 3: 변동성이 노이즈를 보상
- **위치**: `calculator.ts:65-66`
- 노이즈 데이터 `[0, 0, 0, 100, 0, 0, 50]`의 stddev ≈ 37
- `normalize(37, 0, 30)` = 1.0 → 변동성 기여 = **15점**

#### 취약점 4: newsCount7d에 날짜 필터 없음
- **위치**: `ranking-helpers.ts:63-67`
- 전체 기간 기사를 카운트 → 과거 기사가 급상승 게이트 통과에 기여

#### 취약점 5: change7d 최소 기준 없음
- score 5(노이즈) → score 35(노이즈) = change7d +30
- 둘 다 무의미한 점수인데 급상승으로 분류

#### 취약점 6: isRelevantArticle 너무 관대
- "NFT" 3글자 → 무관한 기사도 매칭 (예: "AI 시대, NFT 버블 붕괴")

#### 취약점 7: 절대 관심도 임계값 부재
- 상대 지표만 사용, 절대량 검증 없음

### NFT가 급상승에 도달하는 수학적 경로

```
Interest:   noise ratio 1.65 × dampening 1.0 × 40% = 18.4점
News:       0점 (MIN_NEWS_FOR_MOMENTUM 방어 작동)
Sentiment:  기본값 0.5 × 20% = 10.0점 (무료)
Volatility: noise stddev × 15% = 14.2점
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: ~43점 (Early 단계)
7일 전: ~10점 → change7d = +33 → 급상승 조건 통과
```

### 수정 사항 (5가지)

#### Fix 1: 절대 관심도 바닥값 (calculator.ts:52-58)
```typescript
const recent7dRaw = interestMetrics.slice(0, 7).map(m => m.raw_value);
const rawAvg = avg(recent7dRaw);
const MIN_RAW_INTEREST = 5;
const dampening = rawAvg >= MIN_RAW_INTEREST ? 1 : rawAvg / MIN_RAW_INTEREST;
const interestScore = normalize(interestRatio, 0.5, 3.0) * dampening;
```
- raw_value 평균 < 5이면 비례 감쇄 (예: rawAvg=2 → dampening=0.4)

#### Fix 2: 변동성 노이즈 페널티 (calculator.ts:72-76)
```typescript
const coefficientOfVariation = recent7dAvg > 0 ? interestStdDev / recent7dAvg : 0;
const isNoise = coefficientOfVariation > 0.8 && dampening < 1;
const volatilityScore = normalize(interestStdDev, 0, 30) * (isNoise ? 0.3 : 1);
```
- 변동계수(CV) > 0.8이고 절대 관심도 낮으면 변동성 점수 70% 패널티

#### Fix 3: 감성 기본값 0.5 → 0 (sentiment.ts:112)
```typescript
if (scores.length === 0) {
  return { average: 0, normalized: 0, label: '중립' }
}
```
- 뉴스 0건 = 감성 기여 0점 (기존 10점 무료 제거)

#### Fix 4: newsCount7d 날짜 필터 (ranking-helpers.ts:33-56)
```typescript
export async function batchLoadNewsCounts(
  themeIds: string[],
  since: string  // 7일 전 날짜
): Promise<Array<{ theme_id: string }>> {
  // ... .gte('pub_date', since) 필터 추가
}
```
- 7일 이내 기사만 카운트 (전체 기간 → 7일 윈도우)

#### Fix 5: 급상승 기준 강화 (ranking-helpers.ts:154-162)
```typescript
t.newsCount7d >= 3 &&      // 1 → 3
t.sparkline.length >= 3    // 신규 조건
```

### 수정 후 NFT 예상 점수

```
변경 전: Interest 18.4 + News 0 + Sentiment 10.0 + Volatility 14.2 = 43점 (Early)
변경 후: Interest 18.4×0.4 + News 0 + Sentiment 0 + Volatility 14.2×0.3 = ~12점 (Dormant)
```

### 관찰 가능성 (Observability)

`ScoreComponents.raw`에 새 필드 추가:
- `raw_interest_avg`: 원본 관심도 평균 (노이즈 판별용)
- `dampening_factor`: 적용된 감쇄 계수 (1.0 = 정상, <1.0 = 노이즈 감쇄)

### 변경 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `lib/tli/calculator.ts` | 절대 관심도 바닥값, 변동성 노이즈 페널티, 주석 업데이트 |
| `lib/tli/sentiment.ts` | `aggregateSentiment([])` 기본값 0.5→0 |
| `lib/tli/types/db.ts` | `ScoreComponents.raw`에 `raw_interest_avg`, `dampening_factor` 추가 |
| `app/api/tli/scores/ranking/ranking-helpers.ts` | `batchLoadNewsCounts` 날짜 필터, `paginatedBatchLoad` 제거, 급상승 기준 강화 |
| `app/api/tli/scores/ranking/route.ts` | `batchLoadNewsCounts(ids, sevenDaysAgo)` 호출 |

---

## 전체 변경 파일 목록

### 신규 생성
| 파일 | 용도 |
|------|------|
| `app/api/tli/scores/ranking/ranking-helpers.ts` | 랭킹 API 헬퍼 (배치 로더, 점수 메타맵, 카운트맵, 요약 통계) |
| `app/themes/[id]/_components/detail-header.tsx` | 테마 상세 헤더 (엔터프라이즈급) |
| `app/themes/[id]/_components/stock-list-row.tsx` | 종목 목록 행 컴포넌트 |
| `app/themes/[id]/_components/stock-list-utils.ts` | 종목 목록 유틸리티 |
| `components/tli/lifecycle-curve-data.ts` | 라이프사이클 커브 데이터 처리 |
| `components/tli/lifecycle-curve-tooltip.tsx` | 라이프사이클 커브 툴팁 |
| `lib/tli/date-utils.ts` | 날짜 유틸리티 |
| `lib/tli/types/` | 타입 디렉토리 (db.ts, api.ts, index.ts) |
| `scripts/tli/run-comparisons.ts` | 비교 파이프라인 실행기 |
| `scripts/tli/theme-keywords.ts` | 테마 키워드 관리 |
| `scripts/tli/theme-lifecycle.ts` | 테마 라이프사이클 관리 |

### 수정
| 파일 | 주요 변경 |
|------|----------|
| `lib/tli/calculator.ts` | 노이즈 댐프닝 (절대 관심도 바닥값 + 변동성 페널티) |
| `lib/tli/sentiment.ts` | 기본 감성값 0.5→0 |
| `lib/tli/comparison.ts` | 키워드 dead weight 수정, 리치 메시지 생성, pillar 점수 반환 |
| `lib/tli/types/db.ts` | ScoreComponents에 관찰 필드 추가 |
| `lib/tli/types/api.ts` | keywords→topStocks, mostImproved→surging |
| `app/api/tli/scores/ranking/route.ts` | 종목 데이터 조립, surging 타입, newsCount 날짜 필터 |
| `app/api/tli/scores/ranking/ranking-helpers.ts` | newsCount7d 날짜 필터, 급상승 기준 강화 |
| `app/api/tli/themes/[id]/query-helpers.ts` | comparison 3일 필터, 키워드 쿼리 제거 |
| `app/themes/_components/stats-overview.tsx` | Most Improved→급상승 UI |
| `app/themes/_components/themes-content.tsx` | 키워드 검색 제거 |
| `app/themes/[id]/_components/comparison-list.tsx` | 배지 임계값, 메시지 파싱, peak UI 개선 |
| `app/themes/[id]/_components/detail-content.tsx` | 레이아웃 개선 |
| `app/themes/[id]/_components/news-headlines.tsx` | 뉴스 헤드라인 개선 |
| `app/themes/[id]/_components/score-card.tsx` | 점수 카드 개선 |
| `app/themes/[id]/_components/stock-list.tsx` | 종목 목록 개선 |
| `app/themes/[id]/_components/theme-prediction.tsx` | 예측 컴포넌트 개선 |
| `components/tli/theme-card.tsx` | 키워드→종목 태그 |
| `components/tli/lifecycle-curve.tsx` | 라이프사이클 커브 개선 |
| `components/tli/error-boundary.tsx` | 에러 바운더리 개선 |
| `scripts/tli/calculate-comparisons.ts` | 180일 필터, 임계값 0.25, stale cleanup |
| `scripts/tli/calculate-scores.ts` | 점수 계산 파이프라인 |
| `scripts/tli/collect-and-score.ts` | 수집+점수 오케스트레이터 |
| `scripts/tli/collectors/naver-*.ts` | 데이터 수집기 4개 |
| `scripts/tli/data-ops.ts` | 데이터 연산 |
| `scripts/tli/discover-themes.ts` | 테마 발견 |
| `scripts/tli/migrate-enrich-keywords.ts` | 키워드 마이그레이션 |

### 삭제
| 파일 | 이유 |
|------|------|
| `app/themes/[id]/_components/keyword-tags.tsx` | 키워드 태그 기능 제거 |
| `lib/tli/types.ts` | `lib/tli/types/` 디렉토리로 분리 |

---

## 빌드 상태

모든 변경 후 `next build` 통과 확인 (TypeScript 에러 없음)
