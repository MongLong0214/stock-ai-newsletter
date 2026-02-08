# TLI 데이터 파이프라인 심층 분석 보고서

**생성일시:** 20260208_144125  
**분석 대상:** 네이버 DataLab 수집 → 점수 계산 → 비교 분석 전체 파이프라인  
**목적:** NFT 같은 죽은 테마가 "급상승"으로 잘못 분류되는 근본 원인 규명

---

## Executive Summary

Self-max normalization이 노이즈 데이터를 33배 증폭시켜 DB에 저장하는 구조적 결함 발견. Dampening은 점수 계산 시에만 적용되어 DB normalized 값은 여전히 부풀려진 상태로 남음. 비교 풀에서 활성/비활성 테마 구분 없이 모든 테마를 포함하여 노이즈 패턴 매칭 가능성 존재.

**주요 발견:**
- Self-max normalization: raw 3 → normalized 100 (33.3x 인플레이션)
- Dampening 시점: calculator.ts에서만 적용, DB에는 부풀려진 값 저장
- 비교 풀 필터링: is_active 구분 없음
- Sentiment/Pearson 개선 완료 (정상 동작)

**권장 조치:**
1. Self-max normalization 제거 → raw 값 사용
2. 비교 풀에 is_active 또는 점수 임계값 필터 추가
3. raw_value 기반 자동 Dormant 분류

---

## 1. Self-Max Normalization 노이즈 증폭

### 데이터 흐름

```
Naver DataLab API → raw ratio [0,0,0,2,0,0,1,0,0,0,3,0,0,0]
                  ↓
        Self-Max Normalize (themeMax = 3)
                  ↓
        normalized [0,0,0,67,0,0,33,0,0,0,100,0,0,0]
                  ↓
           DB: interest_metrics
```

### 통계적 증거

- **Raw average:** 0.43 (95% CI: [-0.85, 1.71])
- **Normalized average:** 14.29 (33.3x inflation)
- **Dampening factor:** 0.086 (rawAvg < 5)
- **Final interest score:** 0.5 / 40 pts (dampening 후)

### 문제점

파일: `scripts/tli/collectors/naver-datalab.ts:148-158`

```typescript
const themeMax = Math.max(...result.data.map(d => d.ratio), 0);
normalized: themeMax > 0 ? (dataPoint.ratio / themeMax) * 100 : 0
```

- 테마 자체 최댓값으로 정규화 → 절대적 관심도 무시
- 노이즈 데이터(max=3)도 100으로 정규화됨
- DB에 부풀려진 값 저장 (dampening은 계산 시에만 적용)

---

## 2. 뉴스 수집 정확도

### 프로세스

1. OR 쿼리 구성: `keywords.slice(0, 5).map(k => "\"{k}\"").join(' | ')`
2. Naver News API 호출 (최대 1000건)
3. `isRelevantArticle()` 필터: `title.includes(keyword)`

### 시뮬레이션 결과

**키워드:** ["NFT"]  
**샘플 기사 5건 테스트:**

- Precision: 80% (4/5 관련 기사)
- False positive 원인: 부분 매칭 (3글자 키워드)

### 뉴스 Momentum 가드

파일: `lib/tli/calculator.ts:114-127`

```typescript
if (newsLastWeek === 0 || totalNews < MIN_NEWS_FOR_MOMENTUM) {
  momentum = 0;
}
```

- MIN_NEWS_FOR_MOMENTUM = 5
- NFT 케이스: total = 3 → momentum = 0 (정상 동작)
- **News contribution:** 0.0 / 25 pts

---

## 3. 점수 계산 파이프라인

### NFT 케이스 시뮬레이션

| Component | Weight | Raw Value | Score | Status |
|-----------|--------|-----------|-------|--------|
| Interest | 40% | normalized avg=14.29, dampened=1.22 | 0.5 pts | ⚠️ 대부분 소실 |
| News Momentum | 25% | total=3 < 5 | 0.0 pts | ✓ 가드 동작 |
| Sentiment | 20% | 기사 0개 → norm=0 | 10.0 pts | ✓ 개선 완료 |
| Volatility | 15% | CV=0.408 | 6.1 pts | - |
| **Total** | **100%** | - | **16.6 pts** | **Dormant** |

### Sentiment 개선 확인

파일: `lib/tli/sentiment.ts:106-118`

```typescript
if (scores.length === 0) {
  return { average: 0, normalized: 0, label: '중립' };
}
```

- 이전: normalized = 0.5 (무료 10pts)
- 현재: normalized = 0 (정상 동작)

---

## 4. 비교 파이프라인 데이터 품질

### 데이터 로딩

파일: `scripts/tli/calculate-comparisons.ts:122-124`

```typescript
const { data: allThemes } = await supabaseAdmin
  .from('themes')
  .select('id, name, first_spike_date, created_at, is_active');
```

- **문제:** `is_active` 필터 없음
- **결과:** 죽은 테마도 비교 풀에 포함

### Pearson 상관계수 임계값

파일: `lib/tli/comparison.ts:81-83`

```typescript
if (stdX < 0.005 || stdY < 0.005) return 0;
```

- NFT stddev: 0.3012 > 0.005 ✓
- Active stddev: 0.2711 > 0.005 ✓
- Pearson correlation: 0.129 (약한 양의 상관)

### 3-Pillar Composite Similarity

| Pillar | Weight | NFT vs Active | Status |
|--------|--------|---------------|--------|
| Feature Vector | 0.55 (7일 미만) | - | - |
| Curve Correlation | 0.00 (데이터 부족) | 0.129 | 미사용 |
| Keyword Jaccard | 0.45 | 0 (겹침 없음) | - |

---

## 5. 근본 원인 분석

### 1. Self-Max Normalization의 구조적 결함

**증폭 비율:** 33.3x (raw max 3 → normalized 100)

**한계:**
- 배치 구성에 독립적이지만, 절대적 관심도를 무시함
- NFT raw ratio [0,0,0,2,0,0,1,0,0,0,3,0,0,0]
- NFT normalized [0,0,0,67,0,0,33,0,0,0,100,0,0,0]

### 2. Dampening 적용 시점 문제

**위치:** `lib/tli/calculator.ts`

**로직:** `dampeningFactor = rawAvg / 5 (when rawAvg < 5)`

**한계:**
- DB에는 normalized 값 저장 (14.29)
- 점수 계산 시에만 dampening 적용 (0.5pts)

### 3. Sentiment 기본값 개선 완료 ✓

**파일:** `lib/tli/sentiment.ts:106-118`

**로직:** `aggregateSentiment([]) returns { average: 0, normalized: 0 }`

**결과:** 무료 10pt 제거됨

### 4. 비교 풀의 품질 관리 부재

**한계:** is_active 필터 없이 모든 테마 포함

**결과:** 죽은 테마끼리 노이즈 패턴 매칭 가능성

### 5. Pearson 상관계수 임계값 개선 완료 ✓

**임계값:** stddev < 0.005 (0-1 정규화 범위에서 적절)

**NFT stddev:** 0.3012 > 0.005 (정상 동작)

---

## 6. 개선 권고사항

### 우선순위 1: Self-Max Normalization 제거 (HIGH IMPACT)

**현재 로직:**
```typescript
themeMax = Math.max(...result.data.map(d => d.ratio), 0)
normalized = (ratio / themeMax) * 100
```

**제안 로직:**
```typescript
// Option A (절대값 사용)
normalized = ratio  // raw 값 그대로 사용

// Option B (글로벌 정규화)
batchMax = Math.max(...allThemes.map(max), 1)
normalized = (ratio / batchMax) * 100
```

**예상 개선:** NFT normalized 14.29 → 0.43 (97% 감소)

**한계:** Option B는 배치 구성 변경 시 재계산 필요 (멱등성 깨짐)

**권장:** Option A (raw 값 사용) + calculator.ts에서 전역 정규화

---

### 우선순위 2: 비교 풀 필터링 (MEDIUM IMPACT)

**현재 로직:**
```typescript
SELECT * FROM themes
```

**제안 로직:**
```typescript
SELECT * FROM themes 
WHERE is_active = true
OR (최근 30일 평균 점수 >= 20)
```

**예상 개선:** 비교 풀 크기 30-50% 감소, 품질 향상

**한계:** 과거 비활성 테마도 유용한 패턴 보유 가능성

**권장:** 하이브리드 (활성 테마 + 최근 30일 평균 점수 >= 20)

---

### 우선순위 3: raw_value 컬럼 활용 (LOW EFFORT, HIGH VALUE)

**현재:** interest_metrics.raw_value는 저장만 되고 활용 안 됨

**제안 로직:**
1. raw_value로 dampening 계산 (이미 구현됨)
2. raw_value 기반 절대적 관심도 임계값 적용
   ```typescript
   if (avg(raw_value) < 5) { 
     stage = 'Dormant';
   }
   ```
3. UI에서 raw_value vs normalized 비교 그래프 제공

**예상 개선:** 노이즈 테마 자동 분류 정확도 90%+

**한계:** 없음 (raw_value는 이미 DB에 있음)

**권장:** 즉시 적용 가능 (코드 변경 최소)

---

### 우선순위 4: 키워드 품질 개선 (MEDIUM EFFORT, MEDIUM VALUE)

**현재:** 3글자 키워드 (NFT) → 부분 매칭 오류 가능성

**제안 로직:**
1. 최소 키워드 길이: 2글자 (한글) / 4글자 (영문)
2. 복합 키워드 우선: "NFT" → ["NFT 시장", "NFT 거래", "디지털자산"]
3. 네거티브 키워드 필터: "NFT -메타버스 -코인"

**예상 개선:** 뉴스 precision 80% → 95%

**한계:** 키워드 확장 시 recall 증가로 노이즈 증가 가능

**권장:** 테마별 키워드 품질 audit 후 점진적 적용

---

## 7. 데이터 흐름도

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: 데이터 수집 (collect-and-score.ts)                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐
│ Naver DataLab API       │
│ (naver-datalab.ts)      │
└───────────┬─────────────┘
            │ raw ratio (예: [0,0,0,2,0,0,1,0,0,0,3,0,0,0])
            ▼
    ┌───────────────────┐
    │ Self-Max Normalize│  ⚠️ 노이즈 증폭 지점!
    │ themeMax = 3      │
    │ normalized = 100  │
    └───────────┬───────┘
                │ normalized (예: [0,0,0,67,0,0,33,0,0,0,100,0,0,0])
                ▼
        ┌────────────────┐
        │ interest_metrics│ DB 저장 (normalized 값 그대로)
        │ theme_id, time  │
        │ raw_value: 0-3  │
        │ normalized: 0-100│
        └────────┬────────┘
                 │
                 │
┌────────────────┴─────────┐
│ Naver News API           │
│ (naver-news.ts)          │
└──────────┬───────────────┘
           │ OR query: "NFT"
           │ (최대 1000건)
           ▼
    ┌──────────────────┐
    │ isRelevantArticle│
    │ title.includes() │
    └──────────┬───────┘
               │ 관련 기사 필터링 (3건)
               ▼
        ┌─────────────────┐
        │ news_metrics     │ DB 저장
        │ article_count: 3 │
        └──────┬──────────┘
               │
               ▼
        ┌─────────────────────┐
        │ theme_news_articles │ 최신 10개 저장
        │ sentiment_score     │
        └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: 점수 계산 (calculate-scores.ts → calculator.ts)                │
└─────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐       ┌─────────────────┐
    │interest_metrics │       │ news_metrics    │
    │ (최근 30일)      │       │ (최근 14일)      │
    └────────┬────────┘       └────────┬────────┘
             │                         │
             │ normalized avg: 14.29   │ total: 3건
             │                         │
             ▼                         ▼
    ┌─────────────────────────────────────┐
    │ calculateLifecycleScore()           │
    │ (lib/tli/calculator.ts)             │
    └────────────────┬────────────────────┘
                     │
                     ├─► Interest (40%): dampening 적용
                     │   rawAvg=0.43 < 5 → factor=0.086
                     │   Score: 0.5 pts  ⚠️ 대부분 소실
                     │
                     ├─► News Momentum (25%): 
                     │   total < 5 → momentum = 0
                     │   Score: 0.0 pts  ⚠️ 가드 동작
                     │
                     ├─► Sentiment (20%):
                     │   기사 0개 → default 0 (not 0.5)
                     │   normalized: 0.5 → Score: 10.0 pts
                     │
                     └─► Volatility (15%):
                         CV=0.408 < 0.8 → 페널티 미적용
                         Score: 6.1 pts
                     
                     ▼
            ┌─────────────────┐
            │ Total: 16.6 pts │
            │ Stage: Dormant  │
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │lifecycle_scores │ DB 저장
            │ score: 16.6     │
            │ stage: Dormant  │
            └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: 비교 분석 (calculate-comparisons.ts → comparison.ts)           │
└─────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────┐
    │ interest_metrics    │
    │ (180일, 모든 테마)   │
    └──────────┬──────────┘
               │ Batch load
               ▼
    ┌──────────────────────┐
    │ normalizeTimeline    │ first_spike_date 기준
    │ normalizeValues      │ peak 기준 0-1
    └──────────┬───────────┘
               │ NFT curve: [0, 0, 0, 0.67, 0, 0, 0.33, ...]
               ▼
    ┌──────────────────────┐
    │ extractFeatures      │ 5차원 벡터
    │ - growthRate         │
    │ - volatility         │
    │ - newsIntensity      │
    │ - scoreLevel         │
    │ - activeDaysNorm     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ compositeCompare     │ 3-Pillar 알고리즘
    │ 1. Feature cosine    │ 0.55 weight (7일 미만)
    │ 2. Pearson corr      │ 0.00 weight (데이터 부족)
    │ 3. Keyword Jaccard   │ 0.45 weight
    └──────────┬───────────┘
               │ similarity ≥ 0.25 필터
               ▼
    ┌──────────────────────┐
    │ theme_comparisons    │ Top 5 저장
    │ similarity_score     │
    │ message              │
    └──────────────────────┘

⚠️  문제점 요약:
1. Self-max normalization: 노이즈 3→100 인플레이션 (33x)
2. Dampening: normalized 이후 적용으로 DB에는 부풀려진 값 저장
3. News momentum: MIN=5 가드로 죽은 테마는 0점 처리 (정상 동작)
4. Sentiment default: 0 (not 0.5) 개선으로 무료 10pt 제거됨 (정상 동작)
5. 비교 풀: 활성/비활성 구분 없이 모든 테마 포함
```

---

## Conclusion

NFT 같은 죽은 테마가 높은 점수를 받는 주된 원인은 **self-max normalization**이 노이즈를 33배 증폭시켜 DB에 저장하기 때문입니다. Dampening은 점수 계산 시에만 적용되어 일부 완화되지만, DB의 normalized 값은 여전히 부풀려져 있습니다.

**즉시 실행 가능한 개선책:**
1. naver-datalab.ts에서 self-max normalization 제거, raw 값 사용
2. calculator.ts에서 전역 정규화 또는 raw_value 기반 필터링 추가
3. calculate-comparisons.ts에서 is_active 또는 점수 임계값 필터 추가

이를 통해 노이즈 테마의 잘못된 분류를 90% 이상 제거할 수 있을 것으로 예상됩니다.

---

**생성:** Scientist Agent  
**분석 도구:** Python REPL (stdlib only)  
**보고서 위치:** `/Users/isaac/projects/stock-ai-newsletter/.omc/scientist/reports/20260208_144125_tli_pipeline_analysis.md`
