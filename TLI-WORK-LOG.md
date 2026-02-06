# TLI (테마 라이프사이클 인텔리전스) 운영 가이드

> 이 문서 하나로 TLI가 뭔지, 어떻게 돌아가는지, 문제 생기면 어디를 봐야 하는지 전부 알 수 있습니다.

---

## 한눈에 보는 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                        사용자가 보는 것                        │
│                                                             │
│   /themes (테마 목록)          /themes/[id] (테마 상세)       │
│   - 단계별 랭킹               - 생명주기 곡선                  │
│   - 검색/필터/정렬             - 점수 구성 분석                 │
│   - 스파크라인 미니차트         - 관련 종목 리스트               │
│   - 키워드 태그               - 유사 패턴 비교                  │
│                               - 키워드 태그                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ API 호출
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      Next.js API Routes                      │
│                                                             │
│   /api/tli/scores/ranking  → 전체 테마 랭킹 + 요약 통계      │
│   /api/tli/themes/[id]     → 특정 테마 상세 정보             │
└──────────────────────┬──────────────────────────────────────┘
                       │ Supabase 쿼리
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Supabase (PostgreSQL)                     │
│                                                             │
│   themes              - 테마 마스터 (이름, 활성여부)          │
│   theme_keywords      - 테마별 키워드                        │
│   theme_stocks        - 테마별 관련 종목                      │
│   interest_metrics    - 검색 관심도 시계열                    │
│   news_metrics        - 뉴스량 시계열                        │
│   lifecycle_scores    - 계산된 생명주기 점수                  │
│   theme_comparisons   - 과거 테마 유사도 비교                │
└──────────────────────┬──────────────────────────────────────┘
                       ▲ 데이터 넣는 쪽
                       │
┌─────────────────────────────────────────────────────────────┐
│                     데이터 수집 스크립트                       │
│                     (cron으로 매일 실행)                      │
│                                                             │
│   일요일: discover-themes.ts    → 새 테마 발견 + 키워드 생성  │
│   매일:   collect-and-score.ts  → 데이터 수집 + 점수 계산     │
│   월요일: 종목 수집 (collect-and-score 안에 포함)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 데이터가 어떻게 채워지는가

### 매일 실행되는 것: `collect-and-score.ts`

```bash
npx tsx scripts/tli/collect-and-score.ts
```

이 스크립트가 하는 일 (순서대로):

| 단계 | 무엇을 | 어디서 가져와서 | 어디에 저장 |
|------|--------|---------------|------------|
| 0 | 새 테마 발견 (일요일만) | 네이버 금융 테마 목록 | `themes` + `theme_keywords` + `theme_stocks` |
| 1 | 검색 관심도 수집 | 네이버 DataLab API | `interest_metrics` |
| 2 | 뉴스 기사 수 수집 | 네이버 뉴스 검색 API | `news_metrics` |
| 3 | 관련 종목 수집 (월요일만) | 네이버 금융 스크래핑 | `theme_stocks` |
| 4 | 생명주기 점수 계산 | 위 3개 데이터 조합 | `lifecycle_scores` |
| 5 | 유사 패턴 분석 | 과거 점수 곡선 비교 | `theme_comparisons` |

### 일요일에만 추가로 실행되는 것: 테마 발견

0단계에서 자동으로 실행됩니다. 별도로 실행하고 싶으면:

```bash
npx tsx scripts/tli/discover-themes.ts
```

이 스크립트가 하는 일:

1. **네이버 금융 테마 목록** (finance.naver.com/sise/theme.naver) 전체 페이지 스크래핑
2. DB에 없는 새 테마 → 자동 등록
3. 새 테마마다 **키워드 자동 생성** (테마명 + 종목명 + 네이버 자동완성)
4. 네이버에 있는 테마 → **자동 활성화**
5. 30일 이상 미출현 + 점수 15 미만 → **자동 비활성화**

---

## 2. 점수는 어떻게 계산되는가

**TLI Score** (0~100점) = 4가지 요소의 가중 합산:

| 요소 | 가중치 | 의미 | 데이터 소스 |
|------|--------|------|------------|
| 관심도 (Interest) | 35% | 네이버 검색량 변화 | `interest_metrics` |
| 뉴스 모멘텀 (News) | 30% | 뉴스 기사 수 증감 | `news_metrics` |
| 변동성 (Volatility) | 20% | 관심도의 표준편차 | `interest_metrics` |
| 성숙도 (Maturity) | 15% | 테마 활동 기간 | `interest_metrics` |

### 생명주기 단계 판정

점수에 따라 5단계로 분류:

| 단계 | 점수 범위 | 의미 |
|------|----------|------|
| Dormant (관심없음) | 0~20 | 시장 관심 거의 없음 |
| Early (초기) | 20~40 | 관심 시작, 초기 진입 기회 |
| Growth (성장) | 40~65 | 관심 급증, 본격 상승 |
| Peak (과열) | 65~85 | 과열 구간, 주의 필요 |
| Decay (말기) | 85~100 후 하락 | 관심 하락, 탈출 시점 |
| Reigniting (재점화) | - | 하락 후 다시 상승 감지 |

---

## 3. 파일 구조 한눈에 보기

### 프론트엔드 (사용자가 보는 화면)

```
app/themes/
├── page.tsx                     # 테마 목록 페이지 (서버 컴포넌트)
├── _components/
│   ├── themes-content.tsx       # 목록 메인 (검색, 필터, 정렬)
│   ├── themes-header.tsx        # 페이지 헤더 + 요약 통계
│   ├── stats-overview.tsx       # 단계별 카운트 바
│   └── theme-filter.tsx         # 검색 + 필터 UI
├── _services/
│   └── use-get-ranking.ts       # React Query 훅 (랭킹 API 호출)
├── _constants/
│   └── stage-order.ts           # 단계 순서 정의
│
└── [id]/                        # 테마 상세 페이지
    ├── page.tsx
    ├── _components/
    │   ├── detail-content.tsx   # 상세 메인 레이아웃
    │   ├── stock-list.tsx       # 관련 종목 리스트 (KOSPI/KOSDAQ 탭)
    │   ├── comparison-list.tsx  # 유사 패턴 비교
    │   ├── keyword-tags.tsx     # 키워드 pill 태그
    │   └── theme-prediction.tsx # 생명주기 예측 카드
    └── _services/
        └── use-get-theme-detail.ts  # React Query 훅 (상세 API 호출)
```

### 공통 컴포넌트

```
components/tli/
├── lifecycle-score.tsx          # 점수 게이지 (원형)
├── lifecycle-curve.tsx          # 생명주기 차트 (Recharts, 듀얼 Y축)
├── score-breakdown.tsx          # 점수 구성 분석 바
├── stage-badge.tsx              # 단계 뱃지
├── theme-card.tsx               # 테마 카드 (목록용, 스파크라인 포함)
└── disclaimer.tsx               # 면책 조항
```

### API Routes

```
app/api/tli/
├── scores/ranking/route.ts      # GET: 전체 테마 랭킹 + 요약 통계
└── themes/[id]/route.ts         # GET: 특정 테마 상세 정보
```

### 데이터 수집 스크립트

```
scripts/tli/
├── collect-and-score.ts         # 메인 파이프라인 (cron 진입점)
├── discover-themes.ts           # 테마 발견 파이프라인
├── calculate-scores.ts          # 점수 계산 로직
├── calculate-comparisons.ts     # 유사 패턴 비교 로직
├── data-ops.ts                  # DB 읽기/쓰기 (배치 upsert)
├── supabase-admin.ts            # Supabase 서비스롤 클라이언트
├── utils.ts                     # sleep, withRetry, 날짜 유틸
│
└── collectors/                  # 외부 데이터 수집기
    ├── naver-datalab.ts         # 네이버 DataLab 검색 트렌드
    ├── naver-news.ts            # 네이버 뉴스 기사 수
    ├── naver-finance-themes.ts  # 네이버 금융 종목 스크래핑
    ├── naver-finance-theme-list.ts  # 네이버 금융 테마 목록 스크래핑 (NEW)
    └── naver-autocomplete.ts    # 네이버 자동완성 키워드 확장 (NEW)
```

### 타입/유틸

```
lib/tli/
├── types.ts                     # 모든 타입 정의 + STAGE_CONFIG
├── api-utils.ts                 # API 응답 헬퍼
├── calculator.ts                # TLI 점수 계산 공식
├── stage.ts                     # 단계 판정 로직
├── reigniting.ts                # 재점화 감지 로직
└── comparison.ts                # 피어슨 상관계수 비교 로직
```

### DB 마이그레이션

```
supabase/migrations/
├── 003_create_tli_tables.sql    # 7개 TLI 테이블 생성
└── 004_add_discovery_columns.sql # 동적 발견용 컬럼 추가
```

---

## 4. 환경변수

`.env.local`에 필요한 값:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...       # 프론트 읽기용
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # 스크립트 쓰기용
NAVER_CLIENT_ID=xxx                        # 네이버 API
NAVER_CLIENT_SECRET=xxx                    # 네이버 API
```

---

## 5. 처음 세팅할 때 (순서대로)

```bash
# 1. Supabase에 테이블 생성
#    → supabase/migrations/003_create_tli_tables.sql 실행 (SQL Editor)

# 2. 동적 발견 컬럼 추가
#    → supabase/migrations/004_add_discovery_columns.sql 실행 (SQL Editor)

# 3. 테마 발견 실행 (네이버에서 200~400개 테마 자동 등록)
npx tsx scripts/tli/discover-themes.ts

# 4. 데이터 수집 + 점수 계산 (최초 1회 수동)
npx tsx scripts/tli/collect-and-score.ts

# 5. cron 설정 (매일 오전 6시)
# 0 6 * * * cd /path/to/project && npx tsx scripts/tli/collect-and-score.ts
```

---

## 6. 문제 생기면 확인할 것

| 증상 | 원인 | 해결 |
|------|------|------|
| 테마 목록이 비어있음 | `themes` 테이블에 `is_active=true`인 행이 없음 | `discover-themes.ts` 실행 |
| 점수가 전부 0 | `lifecycle_scores`에 데이터 없음 | `collect-and-score.ts` 실행 |
| 키워드가 적음 | 수동 시딩만 된 상태 | `discover-themes.ts` 실행하면 자동 확장 |
| 종목이 안 보임 | `theme_stocks` 비어있음 | 월요일에 자동 수집 or 수동으로 `collect-and-score.ts` |
| API 500 에러 | 환경변수 누락 또는 Supabase 테이블 미생성 | `.env.local` 확인 + 마이그레이션 실행 |
| 차트가 빈 화면 | `interest_metrics`/`news_metrics` 없음 | 네이버 API 키 확인 + 수집 실행 |
| 네이버 API 오류 | Rate limit or 키 만료 | `NAVER_CLIENT_ID/SECRET` 재확인 |

---

## 7. PR #57 변경 이력

### API 최적화
- **N+1 쿼리 제거**: 모든 API에서 Promise.all 배치 쿼리 적용
- **시간복잡도 O(n) 최적화**: Map 기반 단일 패스 데이터 처리
- **90일 윈도우**: 배치 지연 시에도 테마 소실 방지 (기존 8일→90일)
- **최신 점수 별도 쿼리**: 상세 API에서 날짜 제한 없이 최신 점수 확보
- **placeholder 처리**: 상세 API에도 Supabase 미설정 환경 대응 추가

### 동적 테마 수집 시스템 (NEW)
- `naver-finance-theme-list.ts`: 네이버 금융 테마 목록 스크래퍼 (200~400개)
- `naver-autocomplete.ts`: 자동완성 키워드 확장 (테마당 10~15개)
- `discover-themes.ts`: 발견→키워드 생성→활성화→비활성화 오케스트레이터
- `004_add_discovery_columns.sql`: themes 테이블에 discovery_source 등 추가
- `data-ops.ts`: 1건씩 루프→500건 배치 upsert 최적화

### UI 고도화
- **테마 목록**: 요약 통계 바, 검색/필터/정렬, 스켈레톤 로딩, 스파크라인
- **테마 상세**: 듀얼 Y축 차트 (점수+뉴스), 유사 패턴 타임라인, 생명주기 예측 카드
- **관련 종목**: KOSPI/KOSDAQ 탭, 커스텀 스크롤바, 테이블 레이아웃
- **키워드 태그**: pill 스타일 + 애니메이션
- **STAGE_CONFIG**: Reigniting 단계 추가 (오렌지 색상)

### 타입 정리
- `ThemeRankingArrayKey`: summary 제외한 배열 키 타입
- `ScoreComponents`: 점수 구성 요소 타입 강화
- 중복 key 에러 수정: keyword → `${keyword}-${idx}`

### 버그 수정
- 이자 메트릭 INTEGER 타입 수정
- 뉴스 OR 쿼리 버그 수정
- 종목 인코딩 + 셀렉터 수정
- 네이버 테마 ID 매핑 수정

---

## 8. 2026-02-06 데이터 파이프라인 전면 개선 작업 로그

> **상태: Phase 1~6 코드 수정 완료, `npx tsx scripts/tli/collect-and-score.ts` 재실행 필요**

### 사용자 보고 문제

1. NFT가 "Most Improved" +26.0으로 표시 (품질 필터 부재)
2. 관련 종목 0개 테마가 목록에 노출
3. 평균 주기 ~3000일 (생명주기 모델 오류)
4. 점수 52점인데 Peak 단계 (구 공식 데이터 + 스테이지 불일치)
5. "초기단계로 다 잡힌다" — 구 데이터 상태
6. 생명주기 예측 UI 데이터 미표시
7. 점수/유사도/통계 전반 신뢰 불가

근본 원인: **6가지 구조적 결함** 확인.

### 변경 파일 총 12개

| # | 파일 | Phase | 변경 내용 |
|---|------|-------|-----------|
| 1 | `app/api/tli/scores/ranking/route.ts` | 1 | 품질 게이트 + hottestTheme/mostImproved 선정 강화 + totalThemes 필터 후 수치 |
| 2 | `lib/tli/calculator.ts` | 2 | **전면 재작성**: 윈도우 분리, 3요소 가중치, null 반환, 뉴스 안정화 |
| 3 | `lib/tli/types.ts` | 2 | ScoreComponents.weights maturity 제거, ThemeDetail.components maturity 제거 |
| 4 | `components/tli/score-breakdown.tsx` | 2 | 성숙도 바 제거, 가중치 50/35/15 |
| 5 | `app/api/tli/themes/[id]/route.ts` | 2,4 | maturity 매핑 제거 + pastTotalDays 365일 cap |
| 6 | `scripts/tli/calculate-scores.ts` | 2 | null 반환 처리 |
| 7 | `scripts/tli/collectors/naver-datalab.ts` | 3 | 테마별 자기 최댓값 정규화 |
| 8 | `lib/tli/comparison.ts` | 4,5 | pastTotalDays 365일 상한, 피어슨 14일, 공통 길이 정규화 |
| 9 | `scripts/tli/calculate-comparisons.ts` | 4,5 | 365일 초과 제외, 유사도 0.5→0.7 |
| 10 | `app/themes/[id]/_utils/calculate-prediction.ts` | 4 | avgTotalDays 365일 상한 |
| 11 | `scripts/tli/collect-and-score.ts` | 6 | 종목 수집 월→월+목 |
| 12 | `scripts/tli/collectors/naver-news.ts` | 6 | 키워드 3개→5개 |

---

### Phase 1: 품질 게이트 (`ranking/route.ts`)

**변경 전:**
- `stage === 'Dormant'`만 필터
- hottestTheme: 단순 max(score)
- mostImproved: 단순 max(change7d)
- totalThemes: 필터 전 전체 수

**변경 후:**
```
리스팅 필터:
- Dormant 제거
- score <= 0 제거
(stockCount, sparkline 필터는 너무 엄격해서 제거)

hottestTheme: score >= 40 AND stockCount >= 3
mostImproved: change7d > 5 AND score >= 20 AND stockCount >= 3

totalThemes = 필터 통과 테마 수 (실제 표시 수와 일치)
activeThemes = [...early, ...growth, ...peak, ...decay, ...reigniting]
```

**삽질 히스토리:**
- 처음: stockCount>=3 + sparkline>=7 → 125개 중 1개만 통과
- 2차: sparkline>=2 → 여전히 부족
- 최종: score>0 + not Dormant만 (리스팅), 엄격 기준은 summary에만

---

### Phase 2: 점수 계산 정상화 (`calculator.ts` 외 5개)

**calculator.ts 핵심 변경:**

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 가중치 | interest 40%, news 30%, volatility 15%, **maturity 15%** | interest **50%**, news **35%**, volatility **15%** |
| baseline | `slice(0, 30)` (7일과 겹침) | `slice(7, 30)` (겹침 제거) |
| 최소 데이터 | 없음 (1개도 OK) | 관심도 3일 + 뉴스 1일 미만 → null |
| 뉴스 안정화 | 3건이어도 momentum 계산 | 합계 5건 미만 → momentum = 0 |
| 반환 타입 | `{ score, components }` | `{ score, components } \| null` |

**삽질 히스토리:**
- 처음: MIN_INTEREST=7, MIN_NEWS=3 → 대부분 null → 10개만 표시
- 최종: MIN_INTEREST=3, MIN_NEWS=1

**연쇄 수정:**
- `types.ts`: weights에서 maturity 제거, ThemeDetail.components에서 maturity 제거
- `score-breakdown.tsx`: 성숙도 바 삭제, 가중치 표시 업데이트
- `themes/[id]/route.ts`: `maturity: components?.maturity_ratio ?? 0` 제거
- `calculate-scores.ts`: null 반환 처리 (`if (!result) continue`)

**주의:** maturity_ratio는 ScoreComponents에 여전히 존재 → `stage.ts`에서 Decay 판정에 사용

---

### Phase 3: DataLab 정규화 (`naver-datalab.ts`)

**변경 전:**
```ts
normalized: dataPoint.ratio  // 배치 5개 테마 상대값 그대로
```

**변경 후:**
```ts
const themeMax = Math.max(...result.data.map(d => d.ratio), 0);
normalized: themeMax > 0 ? (dataPoint.ratio / themeMax) * 100 : 0
```

배치 구성 변경에 무관하게 테마 자체 피크 대비 0~100 스케일.

---

### Phase 4: 생명주기 모델 수정 (3개 파일)

**comparison.ts:**
- `MAX_LIFECYCLE_DAYS = 365` 상수 추가
- `pastTotalDays = Math.min(pastData[last].day, 365)`
- 공통 길이 정규화: `commonLength = Math.min(current.length, past.length)`
- commonLength < 14 → `{ similarity: 0, ... }` 반환

**calculate-comparisons.ts:**
- pastDaySpan > 365 → skip (비정상 장기 테마 제외)

**calculate-prediction.ts:**
- `avgTotalDays = Math.min(계산값, 365)`

**themes/[id]/route.ts (API 레벨 방어):**
- `pastTotalDays = Math.min(comp.past_total_days, 365)`
- `estimatedDaysToPeak = Math.max(0, ...)`

---

### Phase 5: 유사도 로직 개선 (2개 파일)

**comparison.ts:**
- 피어슨 최소 데이터: `n < 7` → `n < 14`

**calculate-comparisons.ts:**
- 유사도 임계값: `0.5` → `0.7`

> ⚠️ **0.7이 너무 엄격할 수 있음.** 스크립트 재실행 후 비교 결과가 대부분 없으면 0.6으로 하향 필요.
> 파일: `scripts/tli/calculate-comparisons.ts` 라인 `bestMatch.similarity > 0.7`

---

### Phase 6: 수집 빈도 & 뉴스 (2개 파일)

- `collect-and-score.ts`: 종목 수집 `dayOfWeek === 1` → `dayOfWeek === 1 || dayOfWeek === 4`
- `naver-news.ts`: `keywords.slice(0, 3)` → `slice(0, 5)`

---

### 스테이지 판정 로직 (`stage.ts` — 변경 없음, 참고)

```ts
score >= 80 || (score >= 60 && interest > 0.8 && news > 0.7) → Peak
score >= 60 → Growth
score >= 40 → Early
score >= 20 || (maturity > 0.8 && interest < 0.3) → Decay
else → Dormant
```

---

### 내일 이어서 할 작업 (우선순위 순)

#### 1. 스크립트 재실행 (필수)
```bash
npx tsx scripts/tli/collect-and-score.ts
```
이걸 안 하면 DB에 구 공식 데이터가 남아서:
- 점수 52점 + Peak (구 공식에서 maturity가 올려줘서 Peak이었던 것)
- 초기단계로 다 잡힘 (구 스테이지 데이터)
- 비교 데이터 부정확

#### 2. 스크립트 실행 후 검증
- [ ] 테마 목록에 적절한 수의 테마 표시되는지
- [ ] 각 테마 점수 ↔ 스테이지 일치 확인 (52점=Early, 80+=Peak)
- [ ] 비교 데이터 존재 여부 확인 (없으면 유사도 0.7 → 0.6 하향)
- [ ] pastTotalDays ≤ 365 확인
- [ ] hottestTheme/mostImproved 합리적인지
- [ ] 생명주기 예측 UI 정상 표시

#### 3. "초기단계로 다 잡힌다" 문제 점검
새 공식으로 재계산 후에도 대부분 Early(40~59)라면:
- **가중치 조정** 검토 (현재 interest 50%, news 35%, volatility 15%)
- **스테이지 임계값 조정** 검토 (현재 Peak≥80, Growth≥60, Early≥40)
- 대부분의 테마 점수가 40~59 사이에 몰릴 수 있음 → 임계값을 낮춰야 할 수도

#### 4. 유사도 임계값 검토
- 0.7이 너무 엄격하면 `calculate-comparisons.ts`에서 `0.7` → `0.6` 변경
- 대부분 테마에 비교 데이터 없으면 생명주기 예측이 "비교 데이터가 충분하지 않아..." 메시지만 표시

#### 5. 뉴스 모멘텀 임계값 검토
- `MIN_NEWS_FOR_MOMENTUM = 5` (calculator.ts)
- 뉴스가 적은 테마는 interest(50%) + volatility(15%) = 65%만으로 점수 산출
- 대부분 테마의 뉴스가 5건 미만이면 뉴스 모멘텀이 전부 0 → 점수가 전반적으로 낮아짐

---

### 알려진 이슈

| 이슈 | 파일 | 조치 |
|------|------|------|
| 유사도 0.7 너무 엄격? | `calculate-comparisons.ts` | 0.6으로 하향 가능 |
| 뉴스 5건 임계값 | `calculator.ts` MIN_NEWS_FOR_MOMENTUM | 3으로 하향 가능 |
| 구 DB 데이터 | `lifecycle_scores.components` | 스크립트 재실행으로 덮어쓰기 |
| 빌드 간헐 실패 | Next.js turbopack | `/_document` 에러는 재빌드하면 해결 |

---

### 이 세션에서 파이프라인 외 추가 작업

- **SEO 최적화**: themes 페이지 metadata, sitemap, keywords, breadcrumbs (7개 파일)
- **테마 카드 호버**: scale transform → border+shadow only (텍스트 blur 해결)
- **상세 헤더**: 카드 컨테이너 + 요약 지표(24H/종목/유사패턴) + 키워드 통합
- **LifecycleScore**: glow filter 제거 (빛 번짐 해결), 얇은 스트로크
- **ThemesHeader**: 스테이지 분포 + hottest/mostImproved 표시

### 계획 파일 위치
`/Users/isaac/.claude/plans/eager-munching-sunset.md`
