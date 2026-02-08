# Theme Lifecycle Intelligence (TLI) - 최종 PRD

> StockMatrix 테마 생애주기 분석 모듈

| 항목 | 내용 |
|------|------|
| Version | 2.0 (실현 가능 버전) |
| Date | 2025-02-05 |
| Status | Ready for Development |
| 기반 스택 | Next.js 15, Supabase, Vercel, GitHub Actions |
| MVP 기간 | 3주 (21일) |
| 추가 비용 | $0 |

---

## PART 1: Executive Summary

### 1.1 한 문장 정의

TLI는 주식 '테마'를 **관심과 행동의 시계열 데이터**로 분석하여, 지금 이 테마가 초입/과열/말기 중 어디에 있는지를 정량적으로 제공하는 기능이다.

### 1.2 핵심 기능 4가지

| # | 기능 | 설명 |
|---|------|------|
| 1 | **Theme Lifecycle Score (0-100)** | 테마의 현재 생애 단계를 단일 수치로 요약 |
| 2 | **Lifecycle Curve** | 시간 축 기준 테마 관심 지수 시각화 |
| 3 | **과거 테마 비교 분석** | 현재 테마를 과거 유사 테마 곡선과 오버레이 비교 |
| 4 | **테마-종목 자동 매핑** | 테마 키워드 → 관련 종목 자동 감지 |

### 1.3 기술 스택 (현재 프로젝트 기반)

| Layer | Technology | 비고 |
|-------|-----------|------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 | 기존 유지 |
| Backend | Next.js API Routes | 기존 패턴 |
| Database | Supabase (PostgreSQL 15) | 기존 유지, 테이블 추가 |
| Cache | Vercel Edge Cache + Supabase | Redis 대체 |
| Batch | GitHub Actions + tsx 스크립트 | 기존 패턴 동일 |
| Chart | Recharts | 신규 추가 |
| 외부 데이터 | 네이버 데이터랩, BigKinds, DART, 네이버 금융 | 전부 무료 |

---

## PART 2: 문제 정의

### 2.1 사용자 Pain Point

국내 개인 투자자의 반복 실패 패턴:

```
뉴스/커뮤니티에서 테마 인지 → 관련 종목 검색 → 기술적 지표 확인 → 진입
→ 테마 자체가 이미 말기 → 손실
```

**핵심 원인:** 종목 선택이 아니라 **테마의 국면(생애주기)을 판단하지 못했기 때문**

### 2.2 기존 StockMatrix의 한계

현재 StockMatrix는 **종목 단위 기술적 분석**(RSI, MACD, 볼린저밴드 등 7개 카테고리 스코어)에 강점이 있지만, 그 종목이 속한 **테마 전체의 생사 여부**는 판단하지 못한다.

### 2.3 해결 가설

> 테마는 '가격'이 아니라 '관심'으로 움직인다.

- 관심은 항상 시계열 패턴을 가짐
- 과거 테마들은 유사한 생애주기를 반복
- 이 패턴을 정량화하면 "지금 거래해도 되는 판인가?" 판단 가능

---

## PART 3: 데이터 설계

### 3.1 설계 원칙

- 공개 데이터만 사용 (법적 리스크 최소화)
- 원문 저장 안 함 → 집계 수치만 저장
- 의미 해석보다 **시계열 변화량** 중심

### 3.2 외부 데이터 소스

| 소스 | 용도 | 호출 제한 | 비용 | 안정성 |
|------|------|----------|------|--------|
| **네이버 데이터랩 API** | 검색 관심 지수 (주력) | 일 1,000건 | 무료 | 높음 (공식 API) |
| **BigKinds API** | 뉴스 언급량 | 일 10,000건 | 무료 | 높음 (공식 API) |
| **DART OpenAPI** | 공시 키워드 매칭 | 일 10,000건 | 무료 | 높음 (공식 API) |
| **네이버 금융 테마** | 테마-종목 매핑 | 적정 사용 | 무료 | 보통 (스크래핑) |

> Google Trends(pytrends)는 비공식 라이브러리로 IP 차단 리스크가 높아 **제외**.
> 한국 투자자 대상이므로 네이버 데이터랩이 더 대표성 있음.

### 3.3 테마-키워드 정의

테마 = 키워드 집합. 초기 10개 테마 수동 큐레이션:

```json
{
  "AI 반도체": {
    "keywords": ["AI", "인공지능", "HBM", "엔비디아", "GPU", "AI반도체"],
    "naver_keywords": ["AI반도체", "HBM", "인공지능반도체"]
  },
  "로봇": {
    "keywords": ["로봇", "휴머노이드", "자동화", "보스턴다이나믹스", "테슬라봇"],
    "naver_keywords": ["로봇주", "휴머노이드로봇"]
  },
  "2차전지": {
    "keywords": ["2차전지", "배터리", "리튬", "LFP", "전고체"],
    "naver_keywords": ["2차전지", "전고체배터리"]
  },
  "방산": {
    "keywords": ["방산", "방위산업", "K방산", "무기수출", "한화에어로스페이스"],
    "naver_keywords": ["방산주", "K방산"]
  },
  "바이오": {
    "keywords": ["바이오", "신약", "임상", "제약", "바이오시밀러"],
    "naver_keywords": ["바이오주", "신약개발"]
  },
  "원전": {
    "keywords": ["원전", "원자력", "SMR", "소형모듈원자로", "핵발전"],
    "naver_keywords": ["원전주", "SMR"]
  },
  "UAM": {
    "keywords": ["UAM", "도심항공", "에어택시", "플라잉카"],
    "naver_keywords": ["UAM", "도심항공모빌리티"]
  },
  "양자컴퓨팅": {
    "keywords": ["양자컴퓨팅", "양자", "큐비트", "양자암호"],
    "naver_keywords": ["양자컴퓨터", "양자컴퓨팅"]
  },
  "메타버스": {
    "keywords": ["메타버스", "VR", "AR", "가상현실", "XR"],
    "naver_keywords": ["메타버스", "가상현실"]
  },
  "NFT": {
    "keywords": ["NFT", "대체불가토큰", "디지털자산"],
    "naver_keywords": ["NFT", "대체불가토큰"]
  }
}
```

> `naver_keywords`: 네이버 데이터랩 API용 키워드 (최대 5개 그룹, 각 20개 키워드)

### 3.4 테마-종목 자동 매핑

#### 수집 전략: 하이브리드 (자동 80% + 수동 보정 20%)

**1차 - 네이버 금융 테마 스크래핑 (핵심)**

```
https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=XXX
→ 테마별 소속 종목 리스트 추출
→ 종목코드, 종목명, 현재가, 등락률
```

- 네이버 금융은 한국 시장에서 가장 포괄적인 테마 분류 보유
- Cheerio로 파싱 (프로젝트에 이미 의존성 있음)
- 테마명 매칭: 우리 테마명 → 네이버 테마 ID 수동 매핑 (1회)

**2차 - DART 사업보고서 키워드 매칭 (보조)**

```
DART 기업개황 API → 사업 내용에서 테마 키워드 검색
예: "인공지능" 언급 기업 → AI 테마 후보 추가
```

**3차 - 수동 큐레이션 보정**

- PM이 주 1회 검토
- 오탐(관련 없는 종목) 제거, 미탐(누락 종목) 추가
- `is_curated` 플래그로 수동 추가 종목 구분

#### 매핑 결과 예시

```
"AI 반도체" 테마:
├── [자동] SK하이닉스 (000660) - 네이버 금융 테마
├── [자동] 삼성전자 (005930) - 네이버 금융 테마
├── [자동] 한미반도체 (042700) - 네이버 금융 테마
├── [자동] 리노공업 (058470) - 네이버 금융 테마
├── [자동] 솔브레인 (357780) - DART 키워드 매칭
└── [수동] DB하이텍 (000990) - PM 추가
```

---

## PART 4: 데이터베이스 스키마

> Supabase PostgreSQL. TimescaleDB 미사용. 일반 인덱스로 충분.
> (연간 데이터: 테마 10개 x 365일 = 3,650행 수준)

### 4.1 테이블 설계

#### themes

```sql
-- 003_create_tli_tables.sql

-- 테마 마스터
CREATE TABLE themes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL UNIQUE,
  name_en       VARCHAR(100),
  description   TEXT,
  naver_theme_id VARCHAR(20),           -- 네이버 금융 테마 ID (매핑용)
  is_active     BOOLEAN DEFAULT true,
  first_spike_date DATE,                -- 최초 관심 급등일 (성숙도 계산용)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_themes_active ON themes(is_active);
```

#### theme_keywords

```sql
CREATE TABLE theme_keywords (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id    UUID REFERENCES themes(id) ON DELETE CASCADE,
  keyword     VARCHAR(100) NOT NULL,
  source      VARCHAR(20) DEFAULT 'general',  -- 'general', 'naver', 'bigkinds'
  weight      DECIMAL(3,2) DEFAULT 1.0,
  is_primary  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(theme_id, keyword, source)
);

CREATE INDEX idx_theme_keywords_theme ON theme_keywords(theme_id);
```

#### theme_stocks (테마-종목 매핑)

```sql
CREATE TABLE theme_stocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id    UUID REFERENCES themes(id) ON DELETE CASCADE,
  symbol      VARCHAR(20) NOT NULL,       -- 종목코드 (예: "005930")
  name        VARCHAR(100) NOT NULL,      -- 종목명 (예: "SK하이닉스")
  market      VARCHAR(10) DEFAULT 'KOSPI', -- 'KOSPI' | 'KOSDAQ'
  source      VARCHAR(20) DEFAULT 'naver', -- 'naver' | 'dart' | 'manual'
  is_curated  BOOLEAN DEFAULT false,       -- 수동 큐레이션 여부
  relevance   DECIMAL(3,2) DEFAULT 1.0,    -- 연관도 (0~1)
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(theme_id, symbol)
);

CREATE INDEX idx_theme_stocks_theme ON theme_stocks(theme_id);
CREATE INDEX idx_theme_stocks_symbol ON theme_stocks(symbol);
```

#### interest_metrics

```sql
CREATE TABLE interest_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id      UUID NOT NULL REFERENCES themes(id),
  time          DATE NOT NULL,
  source        VARCHAR(20) NOT NULL,     -- 'naver'
  raw_value     INTEGER,                  -- 원본 값 (0-100)
  normalized    DECIMAL(5,2),             -- 정규화 값

  UNIQUE(theme_id, time, source)
);

CREATE INDEX idx_interest_theme_time ON interest_metrics(theme_id, time DESC);
```

#### news_metrics

```sql
CREATE TABLE news_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id      UUID NOT NULL REFERENCES themes(id),
  time          DATE NOT NULL,
  article_count INTEGER DEFAULT 0,
  growth_rate   DECIMAL(6,2),

  UNIQUE(theme_id, time)
);

CREATE INDEX idx_news_theme_time ON news_metrics(theme_id, time DESC);
```

#### lifecycle_scores

```sql
CREATE TABLE lifecycle_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id        UUID NOT NULL REFERENCES themes(id),
  calculated_at   DATE NOT NULL,
  score           INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  stage           VARCHAR(20) NOT NULL,   -- 'Dormant'|'Early'|'Growth'|'Peak'|'Decay'
  is_reigniting   BOOLEAN DEFAULT false,
  stage_changed   BOOLEAN DEFAULT false,  -- 전일 대비 Stage 변경 여부
  prev_stage      VARCHAR(20),            -- 이전 Stage (변경 시)
  components      JSONB,                  -- 점수 구성 요소 상세
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(theme_id, calculated_at)
);

CREATE INDEX idx_scores_theme_date ON lifecycle_scores(theme_id, calculated_at DESC);
CREATE INDEX idx_scores_stage ON lifecycle_scores(stage);
```

#### theme_comparisons (과거 테마 비교 데이터)

```sql
CREATE TABLE theme_comparisons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  current_theme_id  UUID NOT NULL REFERENCES themes(id),
  past_theme_id     UUID NOT NULL REFERENCES themes(id),
  similarity_score  DECIMAL(4,3),         -- 피어슨 상관계수 (-1 ~ 1)
  current_day       INTEGER,              -- 현재 테마의 라이프사이클 Day
  past_peak_day     INTEGER,              -- 과거 테마 Peak 도달 Day
  past_total_days   INTEGER,              -- 과거 테마 총 라이프사이클 기간
  message           TEXT,                 -- 사용자 표시 메시지
  calculated_at     DATE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(current_theme_id, past_theme_id, calculated_at)
);

CREATE INDEX idx_comparisons_current ON theme_comparisons(current_theme_id, calculated_at DESC);
```

### 4.2 RLS 정책

```sql
-- 모든 TLI 테이블: Public Read, Service Role Write
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_comparisons ENABLE ROW LEVEL SECURITY;

-- Read (anon)
CREATE POLICY "Public read" ON themes FOR SELECT USING (true);
CREATE POLICY "Public read" ON theme_keywords FOR SELECT USING (true);
CREATE POLICY "Public read" ON theme_stocks FOR SELECT USING (true);
CREATE POLICY "Public read" ON interest_metrics FOR SELECT USING (true);
CREATE POLICY "Public read" ON news_metrics FOR SELECT USING (true);
CREATE POLICY "Public read" ON lifecycle_scores FOR SELECT USING (true);
CREATE POLICY "Public read" ON theme_comparisons FOR SELECT USING (true);

-- Write (service_role only)
CREATE POLICY "Service write" ON themes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON theme_keywords FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON theme_stocks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON interest_metrics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON news_metrics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON lifecycle_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write" ON theme_comparisons FOR ALL USING (auth.role() = 'service_role');
```

### 4.3 components JSONB 구조

```json
{
  "interest_score": 0.65,
  "news_momentum": 0.42,
  "volatility_score": 0.38,
  "maturity_ratio": 0.55,
  "weights": {
    "interest": 0.40,
    "news": 0.30,
    "volatility": 0.15,
    "maturity": 0.15
  },
  "raw": {
    "recent_7d_avg": 72.3,
    "baseline_30d_avg": 55.1,
    "news_this_week": 142,
    "news_last_week": 98,
    "interest_stddev": 12.4,
    "active_days": 45
  }
}
```

---

## PART 5: Lifecycle Score 알고리즘

### 5.1 계산 공식

```
LifecycleScore = (
  InterestScore   × 0.40 +
  NewsMomentum    × 0.30 +
  VolatilityScore × 0.15 +
  MaturityRatio   × 0.15
) × 100
```

### 5.2 컴포넌트별 산출

#### InterestScore (검색 관심 지수) - 가중치 40%

```typescript
// 최근 7일 평균 vs 30일 평균 비율
const recent7d = avg(interestMetrics.last7Days);
const baseline30d = avg(interestMetrics.last30Days);
const interestScore = normalize(recent7d / baseline30d, 0.5, 3.0);
```

#### NewsMomentum (뉴스 증가율) - 가중치 30%

```typescript
// 주간 뉴스 증가율
const thisWeek = sum(newsMetrics.last7Days);
const lastWeek = sum(newsMetrics.prev7Days);
const growthRate = (thisWeek - lastWeek) / Math.max(lastWeek, 1);
const newsMomentum = normalize(growthRate, -0.5, 2.0);
```

#### VolatilityScore (관심 변동성) - 가중치 15%

```typescript
// 7일 관심 지수의 표준편차
const values = interestMetrics.last7Days.map(m => m.normalized);
const stdDev = standardDeviation(values);
const volatilityScore = normalize(stdDev, 0, 30);
```

#### MaturityRatio (성숙도) - 가중치 15%

```typescript
// 현재 활성 기간 / 평균 테마 수명
const activeDays = daysSince(theme.firstSpikeDate);
const avgLifespan = 90; // 초기 상수, 추후 동적 계산
const maturityRatio = Math.min(activeDays / avgLifespan, 1.5);
```

### 5.3 정규화 함수

```typescript
function normalize(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
```

### 5.4 Stage 판정

| Score | Stage | 의미 | UI 색상 |
|-------|-------|------|---------|
| 0-20 | Dormant | 시장 관심 거의 없음 | `#64748B` (Gray) |
| 20-40 | Early | 초기 확산 (선행 진입 구간) | `#10B981` (Green) |
| 40-60 | Growth | 대중화 진행 | `#0EA5E9` (Blue) |
| 60-80 | Peak | 과열, 변동성 극대 | `#F59E0B` (Orange) |
| 80-100 | Decay | 피로 누적, 테마 말기 | `#EF4444` (Red) |

```typescript
function determineStage(score: number, components: Components): Stage {
  const { interestScore, newsMomentum, volatility, maturity } = components;

  // Decay 우선 판정
  if (score >= 80 || (maturity > 0.8 && interestScore < 0.3)) {
    return 'Decay';
  }

  // Peak 판정
  if (score >= 60 || (volatility > 0.6 && newsMomentum > 0.7)) {
    return 'Peak';
  }

  // Growth
  if (score >= 40) {
    return 'Growth';
  }

  // Early
  if (score >= 20 && interestScore > 0.3 && maturity < 0.3) {
    return 'Early';
  }

  return 'Dormant';
}
```

### 5.5 Reigniting 감지

```typescript
function checkReigniting(themeId: string, currentStage: Stage): boolean {
  if (currentStage !== 'Decay') return false;

  const twoWeekData = getInterestMetrics(themeId, 14);
  const firstWeekAvg = avg(twoWeekData.slice(0, 7));
  const secondWeekAvg = avg(twoWeekData.slice(7, 14));

  const growthRate = (secondWeekAvg - firstWeekAvg) / Math.max(firstWeekAvg, 1);
  return growthRate >= 0.30; // 30% 이상 반등
}
```

---

## PART 6: 과거 테마 비교 분석

### 6.1 개요

현재 활성 테마의 관심 지수 곡선을, 과거 완료된 테마들의 곡선과 비교하여 유사도를 제공한다.

**예시:** "현재 AI 반도체 테마는 과거 방산 테마(2022)의 Growth→Peak 전환 시점과 78% 유사합니다. 방산 테마는 이 시점 이후 32일 뒤 Peak에 도달했습니다."

### 6.2 데이터 수집

과거 테마 데이터는 **네이버 데이터랩 API**로 수집 가능:

```typescript
// 네이버 데이터랩: 최대 5년치 검색 트렌드 조회 가능
const pastData = await naverDatalab.getSearchTrend({
  startDate: '2020-01-01',
  endDate: '2023-12-31',
  keywords: ['방산', 'K방산'],
  timeUnit: 'week',  // 'date' | 'week' | 'month'
});
```

초기 시딩 시 과거 테마 10개의 **전체 생애주기 데이터를 1회 수집**하여 DB에 저장.

### 6.3 비교 알고리즘

#### Step 1: 시간축 정규화

```typescript
// 각 테마의 first_spike_date를 Day 0으로 설정
// Day 0 ~ Day N 으로 변환
function normalizeTimeline(
  data: { date: string; value: number }[],
  firstSpikeDate: string
): { day: number; value: number }[] {
  return data.map(d => ({
    day: daysBetween(firstSpikeDate, d.date),
    value: d.value,
  }));
}
```

#### Step 2: 값 정규화

```typescript
// 각 테마의 peak 값을 1.0으로 정규화
function normalizeValues(data: { day: number; value: number }[]): typeof data {
  const peak = Math.max(...data.map(d => d.value));
  return data.map(d => ({ day: d.day, value: d.value / peak }));
}
```

#### Step 3: 유사도 계산 (피어슨 상관계수)

```typescript
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const avgX = xSlice.reduce((a, b) => a + b, 0) / n;
  const avgY = ySlice.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - avgX;
    const dy = ySlice[i] - avgY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  return num / Math.sqrt(denX * denY);
}
```

#### Step 4: 결과 생성

```typescript
// 유사도 상위 3개 과거 테마를 선택
// 각각에 대해:
// - 현재 테마가 몇 Day째인지
// - 과거 테마의 Peak Day는 언제였는지
// - 과거 테마의 Peak 이후 하락률
// → 이를 조합해 사용자 메시지 생성
```

### 6.4 비교 결과 예시

```json
{
  "currentTheme": "AI 반도체",
  "currentDay": 45,
  "comparisons": [
    {
      "pastTheme": "방산 (2022)",
      "similarity": 0.78,
      "pastPeakDay": 62,
      "pastTotalDays": 95,
      "postPeakDecline": -27.3,
      "message": "방산 테마와 78% 유사. Peak까지 약 17일 예상."
    },
    {
      "pastTheme": "메타버스 (2021)",
      "similarity": 0.65,
      "pastPeakDay": 85,
      "pastTotalDays": 140,
      "postPeakDecline": -45.8,
      "message": "메타버스 테마와 65% 유사. Peak까지 약 40일 예상."
    }
  ],
  "avgPostPeakDecline": -36.5,
  "disclaimer": "과거 데이터 기반 추정치이며, 미래 수익을 보장하지 않습니다."
}
```

---

## PART 7: 시스템 아키텍처

### 7.1 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│                 StockMatrix Frontend                     │
│              (Next.js 15 App Router)                     │
│     /themes (대시보드)    /themes/[id] (상세)             │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    API Routes                            │
│    /api/tli/themes    /api/tli/scores    etc.            │
│    (Vercel Edge Cache: s-maxage=3600)                    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 Supabase (PostgreSQL)                     │
│  themes | theme_keywords | theme_stocks                  │
│  interest_metrics | news_metrics | lifecycle_scores      │
│  theme_comparisons                                       │
└──────────────────────┬──────────────────────────────────┘
                       ▲
                       │ 매일 02:00 KST
┌──────────────────────┴──────────────────────────────────┐
│              GitHub Actions (Batch)                       │
│         npx tsx scripts/tli/collect-and-score.ts          │
└──────────────────────┬──────────────────────────────────┘
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
   ┌────────────┐ ┌─────────┐ ┌────────┐
   │  네이버     │ │BigKinds │ │  DART  │
   │ 데이터랩   │ │  API    │ │  API   │
   └────────────┘ └─────────┘ └────────┘
```

### 7.2 데이터 흐름

```
1. GitHub Actions 스케줄러 (매일 02:00 KST)
   ↓
2. scripts/tli/collect-and-score.ts 실행
   ↓
3. [수집] 네이버 데이터랩 → interest_metrics 저장
   ↓
4. [수집] BigKinds → news_metrics 저장
   ↓
5. [수집] 네이버 금융 → theme_stocks 갱신 (주 1회)
   ↓
6. [계산] Lifecycle Score 산출 → lifecycle_scores 저장
   ↓
7. [비교] 과거 테마 유사도 계산 → theme_comparisons 저장
   ↓
8. API 요청 시 Supabase 조회 (Vercel Edge Cache 1시간)
```

---

## PART 8: API 명세

### 8.1 엔드포인트 목록

| Method | Endpoint | 설명 | Cache |
|--------|----------|------|-------|
| GET | `/api/tli/themes` | 전체 테마 목록 + 현재 Stage | 1시간 |
| GET | `/api/tli/themes/[id]` | 테마 상세 + 점수 + 종목 + 비교 | 1시간 |
| GET | `/api/tli/themes/[id]/history` | 점수 히스토리 (30일) | 1시간 |
| GET | `/api/tli/scores/ranking` | Stage별 테마 랭킹 | 1시간 |
| GET | `/api/tli/stocks/[symbol]/theme` | 종목의 테마 정보 | 1시간 |

### 8.2 Response Schema

#### GET /api/tli/themes

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "AI 반도체",
      "nameEn": "AI Semiconductor",
      "score": 72,
      "stage": "Peak",
      "stageKo": "과열",
      "change7d": 8,
      "stockCount": 15,
      "isReigniting": false,
      "updatedAt": "2025-02-04T02:00:00Z"
    }
  ],
  "updatedAt": "2025-02-04T02:00:00Z"
}
```

#### GET /api/tli/themes/[id]

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "AI 반도체",
    "nameEn": "AI Semiconductor",
    "description": "인공지능 반도체 관련 테마",
    "score": {
      "value": 72,
      "stage": "Peak",
      "stageKo": "과열",
      "updatedAt": "2025-02-04T02:00:00Z",
      "change24h": 3,
      "change7d": 8,
      "components": {
        "interest": 78,
        "newsMomentum": 65,
        "volatility": 82,
        "maturity": 58
      }
    },
    "stocks": [
      {
        "symbol": "000660",
        "name": "SK하이닉스",
        "market": "KOSPI",
        "source": "naver",
        "relevance": 1.0
      }
    ],
    "comparisons": [
      {
        "pastTheme": "방산 (2022)",
        "similarity": 0.78,
        "currentDay": 45,
        "pastPeakDay": 62,
        "estimatedDaysToPeak": 17,
        "postPeakDecline": -27.3,
        "message": "방산 테마와 78% 유사. Peak까지 약 17일 예상."
      }
    ],
    "lifecycleCurve": [
      { "date": "2025-01-05", "score": 35 },
      { "date": "2025-01-06", "score": 38 }
    ]
  }
}
```

#### GET /api/tli/scores/ranking

```json
{
  "success": true,
  "data": {
    "early": [
      { "id": "uuid", "name": "양자컴퓨팅", "score": 28, "change7d": 12 }
    ],
    "growth": [
      { "id": "uuid", "name": "UAM", "score": 52, "change7d": 5 }
    ],
    "peak": [
      { "id": "uuid", "name": "AI 반도체", "score": 72, "change7d": 8 }
    ],
    "decay": [
      { "id": "uuid", "name": "메타버스", "score": 85, "change7d": -3 }
    ],
    "reigniting": []
  },
  "updatedAt": "2025-02-04T02:00:00Z"
}
```

#### Error Response

```json
{
  "success": false,
  "error": {
    "code": "THEME_NOT_FOUND",
    "message": "요청한 테마를 찾을 수 없습니다.",
    "statusCode": 404
  }
}
```

---

## PART 9: 배치 처리

### 9.1 GitHub Actions Workflow

```yaml
# .github/workflows/tli-collect-data.yml
name: TLI Data Collection

on:
  schedule:
    # 매일 02:00 KST = 17:00 UTC (전날)
    - cron: '0 17 * * *'
  workflow_dispatch:

jobs:
  collect-and-score:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run TLI Data Collection & Scoring
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          NAVER_CLIENT_ID: ${{ secrets.NAVER_CLIENT_ID }}
          NAVER_CLIENT_SECRET: ${{ secrets.NAVER_CLIENT_SECRET }}
          BIGKINDS_API_KEY: ${{ secrets.BIGKINDS_API_KEY }}
          DART_API_KEY: ${{ secrets.DART_API_KEY }}
        run: npx tsx scripts/tli/collect-and-score.ts

      - name: Notify on failure
        if: failure()
        run: echo "::error::TLI 데이터 수집 실패!"
```

### 9.2 스크립트 실행 순서

```
scripts/tli/collect-and-score.ts (메인 오케스트레이터)
├── 1. collectNaverDatalab()     → interest_metrics  (5분)
├── 2. collectBigKinds()         → news_metrics      (3분)
├── 3. updateThemeStocks()       → theme_stocks       (주 1회만, 5분)
├── 4. calculateScores()         → lifecycle_scores   (1분)
└── 5. calculateComparisons()    → theme_comparisons  (2분)
총 예상 시간: ~16분
```

### 9.3 실패 처리

- 개별 테마 실패 시 → 해당 테마 건너뛰기 + 로그, 나머지 계속 처리
- 외부 API 실패 시 → 3회 재시도 (exponential backoff: 2s → 4s → 8s)
- 전체 실패 시 → 이전 Score 유지 (stale 상태, 최대 3일)
- GitHub Actions 알림으로 실패 감지

### 9.4 환경변수

```env
# Supabase (기존)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...         # 신규: 배치 write용

# 네이버 데이터랩
NAVER_CLIENT_ID=...                   # 신규
NAVER_CLIENT_SECRET=...               # 신규

# BigKinds
BIGKINDS_API_KEY=...                  # 신규

# DART
DART_API_KEY=...                      # 신규

# Feature Flag
TLI_ENABLED=true
```

---

## PART 10: 프론트엔드 구현

### 10.1 디렉토리 구조

```
app/
├── (main)/
│   └── themes/
│       ├── page.tsx                       # 테마 대시보드
│       ├── layout.tsx                     # 테마 레이아웃
│       ├── _components/
│       │   ├── theme-dashboard.tsx        # 대시보드 메인
│       │   ├── stage-section.tsx          # Stage별 섹션
│       │   └── theme-search.tsx           # 테마 검색
│       ├── _hooks/
│       │   ├── use-themes.ts             # 테마 목록 fetch
│       │   └── use-theme-ranking.ts      # 랭킹 fetch
│       └── [id]/
│           ├── page.tsx                   # 테마 상세
│           └── _components/
│               ├── theme-detail.tsx       # 상세 메인
│               ├── score-overview.tsx     # 점수 개요
│               ├── lifecycle-chart.tsx    # 생애주기 차트
│               ├── comparison-section.tsx # 과거 테마 비교
│               └── stock-list.tsx        # 관련 종목 리스트

components/
└── tli/
    ├── lifecycle-score.tsx                # 점수 표시 (원형 게이지)
    ├── stage-badge.tsx                    # Stage 뱃지
    ├── lifecycle-curve.tsx                # Recharts 차트 (재사용)
    ├── theme-card.tsx                     # 테마 카드
    └── signal-badge.tsx                   # Strong/Weak/Warning
```

### 10.2 네비게이션 추가

기존 `NAVIGATION_LINKS` 에 테마 항목 추가:

```typescript
export const NAVIGATION_LINKS = [
  { href: '/', label: '홈', highlighted: false },
  { href: '/themes', label: '테마', highlighted: true },   // 신규
  { href: '/archive', label: '아카이브', highlighted: false },
  { href: '/blog', label: '블로그', highlighted: false },
  { href: '/about', label: '서비스', highlighted: false },
  { href: '/technical-indicators', label: '가이드', highlighted: false },
  { href: '/faq', label: 'FAQ', highlighted: false },
] as const;
```

### 10.3 주요 컴포넌트 스펙

#### LifecycleScore (원형 게이지)

```typescript
interface LifecycleScoreProps {
  score: number;          // 0-100
  stage: Stage;
  change24h?: number;
  size?: 'sm' | 'md' | 'lg';
}

const stageConfig = {
  Dormant: { color: '#64748B', label: '관심 없음', bg: 'bg-slate-100' },
  Early:   { color: '#10B981', label: '초기',     bg: 'bg-emerald-100' },
  Growth:  { color: '#0EA5E9', label: '성장',     bg: 'bg-sky-100' },
  Peak:    { color: '#F59E0B', label: '과열',     bg: 'bg-amber-100' },
  Decay:   { color: '#EF4444', label: '말기',     bg: 'bg-red-100' },
} as const;
```

#### LifecycleCurve (Recharts 차트)

```typescript
interface LifecycleCurveProps {
  currentData: Array<{ date: string; score: number }>;
  comparisonData?: Array<{
    themeName: string;
    data: Array<{ day: number; value: number }>;
    similarity: number;
  }>;
  showPeakMarker?: boolean;
}

// Recharts LineChart 기반
// - 실선: 현재 테마
// - 점선: 과거 유사 테마들 (최대 2개)
// - 마커: Peak, Decay 시작점
// - 툴팁: 날짜, 점수, Stage
```

### 10.4 페이지 레이아웃

#### 테마 대시보드 (/themes)

```
┌─────────────────────────────────────────────────┐
│ 🔥 테마 생애주기 분석                              │
│ "지금 이 시장에서 거래해도 되는지 판단합니다"         │
├─────────────────────────────────────────────────┤
│                                                 │
│ 🟢 Early (초기 진입 기회)                         │
│ ┌──────┐ ┌──────┐ ┌──────┐                      │
│ │양자   │ │UAM   │ │원전   │                      │
│ │28점   │ │35점   │ │22점   │                      │
│ └──────┘ └──────┘ └──────┘                      │
│                                                 │
│ 🟠 Peak (과열 주의)                               │
│ ┌──────┐ ┌──────┐                               │
│ │AI반도체│ │로봇   │                               │
│ │72점   │ │68점   │                               │
│ └──────┘ └──────┘                               │
│                                                 │
│ 🔴 Decay (테마 말기)                              │
│ ┌──────┐ ┌──────┐                               │
│ │메타버스│ │NFT    │                               │
│ │85점   │ │91점   │                               │
│ └──────┘ └──────┘                               │
│                                                 │
│ 🔄 Reigniting (재점화)                            │
│ (해당 테마 없음)                                   │
├─────────────────────────────────────────────────┤
│ 마지막 업데이트: 2025-02-04 02:00 KST             │
│ ⚠️ 투자 판단의 참고 자료로만 활용하세요              │
└─────────────────────────────────────────────────┘
```

#### 테마 상세 (/themes/[id])

```
┌─────────────────────────────────────────────────┐
│ AI 반도체                                        │
│ Score: 72  Stage: 🟠 과열  ▲8 (7일)              │
├─────────────────────────────────────────────────┤
│                                                 │
│ [점수 구성]                                      │
│ 검색 관심: ████████░░ 78                          │
│ 뉴스 모멘텀: ██████░░░░ 65                        │
│ 변동성: ████████░░ 82                             │
│ 성숙도: █████░░░░░ 58                             │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ [생애주기 차트]                                    │
│         ╱╲                                      │
│   ───  ╱  ╲   AI 반도체 (현재)                    │
│   ---  ╱    ╲  방산 2022 (유사도 78%)              │
│  ···  ╱      ╲ 메타버스 2021 (유사도 65%)          │
│      ╱   ●    ╲                                  │
│     ╱   현재    ╲                                 │
│    ╱             ╲                               │
│ ──────────────────────── 시간 →                   │
│                                                 │
│ 💡 방산 테마(2022)와 78% 유사                      │
│    Peak까지 약 17일 예상                           │
│    과거 유사 테마 Peak 이후 평균 -27% 하락           │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ [관련 종목] (15개)                                 │
│ SK하이닉스 (000660)  KOSPI  연관도 1.0             │
│ 삼성전자 (005930)    KOSPI  연관도 0.9             │
│ 한미반도체 (042700)  KOSPI  연관도 0.9             │
│ ...                                             │
│                                                 │
├─────────────────────────────────────────────────┤
│ ⚠️ 본 점수는 상승/하락 예측이 아닌 위험도·국면 판단  │
│ 지표입니다. 투자 판단의 참고 자료로만 활용하세요.      │
└─────────────────────────────────────────────────┘
```

### 10.5 신규 의존성

```json
{
  "recharts": "^2.12.0"
}
```

Recharts만 추가. 나머지는 기존 의존성(Tailwind, Framer Motion, Lucide 등) 활용.

---

## PART 11: 개발 일정

### 11.1 Phase 구성 (총 3주)

```
Week 1: 인프라 + 데이터
Week 2: 엔진 + API + 프론트 시작
Week 3: 프론트 완성 + 통합 + QA
```

### 11.2 Phase별 상세

#### Phase 1: 인프라 + 데이터 수집 (Day 1~5)

```
☐ Supabase 마이그레이션 (7개 테이블)
☐ 네이버 데이터랩 API 연동 (collect-naver-datalab.ts)
☐ BigKinds API 연동 (collect-bigkinds.ts)
☐ DART API 연동 (collect-dart.ts)
☐ 네이버 금융 테마-종목 스크래핑 (collect-naver-themes.ts)
☐ 초기 테마/키워드 시딩 스크립트 (seed-themes.ts)
☐ 과거 테마 히스토리 데이터 1회 수집 (seed-history.ts)
☐ GitHub Actions workflow 작성
```

#### Phase 2: Score 엔진 + API (Day 4~8)

```
☐ lib/tli/types.ts (타입 정의)
☐ lib/tli/normalize.ts (정규화 유틸)
☐ lib/tli/calculator.ts (Score 계산)
☐ lib/tli/stage.ts (Stage 판정)
☐ lib/tli/reigniting.ts (재점화 감지)
☐ lib/tli/comparison.ts (과거 테마 비교 - 피어슨 상관계수)
☐ scripts/tli/collect-and-score.ts (배치 오케스트레이터)
☐ API: /api/tli/themes (GET)
☐ API: /api/tli/themes/[id] (GET)
☐ API: /api/tli/themes/[id]/history (GET)
☐ API: /api/tli/scores/ranking (GET)
☐ API: /api/tli/stocks/[symbol]/theme (GET)
```

#### Phase 3: 프론트엔드 (Day 7~14)

```
☐ recharts 설치
☐ components/tli/lifecycle-score.tsx
☐ components/tli/stage-badge.tsx
☐ components/tli/lifecycle-curve.tsx (Recharts)
☐ components/tli/theme-card.tsx
☐ app/(main)/themes/page.tsx (대시보드)
☐ app/(main)/themes/[id]/page.tsx (상세)
☐ 과거 테마 비교 차트 (오버레이)
☐ 관련 종목 리스트 컴포넌트
☐ 네비게이션 "테마" 메뉴 추가
☐ 모바일 반응형
```

#### Phase 4: 통합 + QA (Day 13~16)

```
☐ 배치 → DB → API → UI 전체 흐름 테스트
☐ Score 계산 엣지 케이스 검증
☐ 과거 테마 비교 결과 검증
☐ API 응답 시간 확인 (목표: < 500ms)
☐ 모바일/데스크톱 크로스 브라우저
☐ 면책 문구 확인
☐ 프로덕션 배포
```

---

## PART 12: 기술 리스크 & 대응

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| 네이버 데이터랩 API 변경 | High | Low | 공식 API라 변경 시 사전 공지. BigKinds로 fallback |
| 네이버 금융 스크래핑 차단 | Medium | Medium | 호출 간격 5초+, User-Agent 설정. 수동 매핑 fallback |
| BigKinds API 중단 | Medium | Low | 뉴스 데이터 없이 Score 계산 (가중치 재분배) |
| GitHub Actions 타임아웃 | Medium | Low | 30분 제한, 테마별 병렬 수집 |
| Score 정확도 논란 | Low | Medium | 면책 문구 + "예측 아닌 국면 판단" 명시 |
| 과거 데이터 부족 | Low | Low | 네이버 데이터랩 5년치 충분 |

---

## PART 13: 향후 확장 (Phase 2, MVP 이후)

데이터 축적 2~3개월 후 진행:

| 기능 | 설명 | 예상 기간 |
|------|------|----------|
| Theme-Adjusted Signal | 기존 뉴스레터 추천에 테마 가중치 적용 | 1주 |
| 자동 키워드 확장 | Gemini로 테마 연관 키워드 자동 추출 | 1주 |
| Pro 구독 분리 | Score 수치/히스토리/비교 잠금 | 1주 |
| Stage 변경 알림 | 이메일/푸시 알림 | 1주 |
| 자동 신규 테마 감지 | 뉴스 급증 키워드 → 신규 테마 후보 추천 | 2주 |
| ML 기반 Score 보정 | 가중치 자동 최적화 | 2주 |

---

## PART 14: 면책 조항

모든 TLI 관련 페이지에 표시:

> ⚠️ **투자 주의사항**
>
> Theme Lifecycle Score는 상승/하락 예측이 아닌 **테마의 국면(생애주기) 판단 지표**입니다.
> 과거 테마 비교 분석은 과거 데이터 기반 추정치이며, 미래 수익을 보장하지 않습니다.
> 본 서비스는 투자 조언이 아니며, 투자 판단의 참고 자료로만 활용하시기 바랍니다.
> 투자에 대한 최종 결정과 책임은 투자자 본인에게 있습니다.

---

## PART 15: 개발 착수 체크리스트

### 환경 설정

```
☐ 네이버 개발자센터 애플리케이션 등록 (데이터랩 API용)
☐ BigKinds API 키 발급 (한국언론진흥재단)
☐ DART OpenAPI 인증키 발급
☐ Supabase Service Role Key 확인 (배치 write용)
☐ GitHub Secrets 추가: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, BIGKINDS_API_KEY, DART_API_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 코드 준비

```
☐ Feature branch: feature/tli-module
☐ recharts 설치: npm install recharts
☐ Supabase migration 파일 생성
☐ .env.local에 환경변수 추가
```

### 데이터 준비

```
☐ 초기 테마 10개 정의 (JSON)
☐ 테마별 키워드 매핑
☐ 네이버 금융 테마 ID 매핑 (수동 1회)
☐ 과거 테마 히스토리 데이터 수집 (seed 스크립트)
```

---

## 비용 요약

| 항목 | 비용 |
|------|------|
| 네이버 데이터랩 API | 무료 |
| BigKinds API | 무료 |
| DART OpenAPI | 무료 |
| Supabase (기존 인스턴스) | $0 추가 |
| Vercel (기존 배포) | $0 추가 |
| GitHub Actions | Free tier 내 |
| Recharts | 무료 (MIT) |
| **합계** | **$0** |

---

> "StockMatrix는 이제 종목의 타이밍을 넘어서, 지금 이 시장에서 거래해도 되는지를 판단합니다."

**✅ 본 문서 기반으로 즉시 개발 착수 가능.**
