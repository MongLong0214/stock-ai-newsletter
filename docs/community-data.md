# 커뮤니티 데이터 (Community Buzz) — 기술 문서

> 작성일: 2026-02-18 | 브랜치: `search`
> 목표: 네이버 블로그 + 종목토론방 데이터를 수집하여 테마 생명주기 점수에 반영

---

## 1. 아키텍처 개요

```
[수집 레이어]
  naver-blog.ts ──────────┐
  naver-stock-discussion.ts ┤
  search-utils.ts (공용) ──┘
          │
          ▼
[저장 레이어]
  data-ops.ts → upsertCommunityMetrics() → community_metrics 테이블
          │
          ▼
[점수 계산 레이어]
  calculate-scores.ts → calculator.ts (communityBuzz 15%)
          │
          ▼
[API 레이어]
  fetch-theme-data.ts → build-response.ts → ThemeDetail.communityTimeline
          │
          ▼
[프론트엔드 레이어]
  detail-content.tsx
  ├── CommunityBuzz (독립 차트 섹션)
  └── LifecycleCurve (메인 차트 오버레이)
```

---

## 2. 파일 맵

| 파일 | 줄 수 | 역할 | 신규 |
|------|-------|------|------|
| `scripts/tli/collectors/naver-blog.ts` | ~150 | 네이버 블로그 검색 API 수집기 | O |
| `scripts/tli/collectors/naver-stock-discussion.ts` | ~170 | 네이버 종목토론방 스크래퍼 | O |
| `scripts/tli/collectors/search-utils.ts` | ~30 | 공용 유틸 (stripHtml, isRelevantArticle) | O |
| `supabase/migrations/010_create_community_metrics.sql` | 35 | DB 테이블 + 인덱스 + RLS | O |
| `scripts/tli/data-ops.ts` | — | `upsertCommunityMetrics()` 함수 추가 | 수정 |
| `scripts/tli/collect-and-score.ts` | — | 3.5단계 (블로그+토론방) 파이프라인 통합 | 수정 |
| `scripts/tli/calculate-scores.ts` | — | communityMetrics 로딩 + calculator 전달 | 수정 |
| `lib/tli/calculator.ts` | — | communityBuzz 점수 계산 로직 추가 | 수정 |
| `lib/tli/constants/score-config.ts` | — | SCORE_WEIGHTS에 communityBuzz 추가 | 수정 |
| `lib/tli/types/db.ts` | — | CommunityMetric 인터페이스 추가 | 수정 |
| `lib/tli/types/api.ts` | — | ThemeDetail에 communityTimeline 추가 | 수정 |
| `app/api/tli/themes/[id]/fetch-theme-data.ts` | — | community_metrics 쿼리 추가 | 수정 |
| `app/api/tli/themes/[id]/build-response.ts` | — | buildCommunityFields() 추가 | 수정 |
| `app/themes/[id]/_components/community-buzz.tsx` | 104 | 독립 커뮤니티 차트 컴포넌트 | O |
| `app/themes/[id]/_components/detail-content.tsx` | — | CommunityBuzz 섹션 + 차트 오버레이 통합 | 수정 |

---

## 3. DB 스키마

### community_metrics 테이블

```sql
CREATE TABLE community_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  time DATE NOT NULL,
  source VARCHAR(30) NOT NULL,       -- 'blog' | 'discussion'
  mention_count INTEGER DEFAULT 0,
  stock_count INTEGER DEFAULT 0,     -- 토론방: 테마 내 전체 종목 수
  stocks_sampled INTEGER DEFAULT 0,  -- 토론방: 실제 수집한 종목 수
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, time, source)
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `theme_id` | UUID FK | themes(id), CASCADE 삭제 |
| `time` | DATE | 수집 대상 날짜 (YYYY-MM-DD) |
| `source` | VARCHAR | `'blog'` 또는 `'discussion'` |
| `mention_count` | INTEGER | 해당 날짜의 멘션/게시글 수 |
| `stock_count` | INTEGER | 토론방 전용: 테마 내 전체 종목 수 |
| `stocks_sampled` | INTEGER | 토론방 전용: 실제 샘플링한 종목 수 |

**인덱스**: `idx_community_metrics_theme_time ON (theme_id, time DESC)`

**UNIQUE 제약**: `(theme_id, time, source)` — upsert 멱등성 보장

**RLS**: anon=SELECT, service_role=ALL

---

## 4. 데이터 수집기

### 4.1 네이버 블로그 (`naver-blog.ts`)

**데이터 소스**: 네이버 검색 API (`openapi.naver.com/v1/search/blog.json`)

**환경 변수** (필수):
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

**수집 흐름**:
1. 테마별 키워드 최대 5개를 OR 검색 (`"키워드1" | "키워드2"`)
2. 페이지네이션: 100개씩, 최대 1000건까지 수집
3. 날짜 파싱: `postdate` (YYYYMMDD) → `YYYY-MM-DD`
4. **관련도 필터**: `isRelevantArticle()` — 제목에 키워드 최소 1개 포함 필수
5. 날짜별 카운트 집계 → `BlogMetric[]` 반환

**관련도 필터 로직** (`search-utils.ts`):
```typescript
// 3글자 이하 영숫자 키워드 → 단어 경계 매칭 (\b)
// 그 외 → 단순 포함 (includes)
function isRelevantArticle(title: string, keywords: string[]): boolean
```

**수집 기간**: `startDate` ~ `endDate` (파이프라인에서 14일 전 ~ 오늘)

**Rate limiting**: 테마 간 200ms, 페이지 간 100ms sleep

**에러 처리**: `withRetry(fn, 3, label)` — 3회 재시도

**출력 타입**:
```typescript
interface BlogMetric {
  themeId: string
  date: string         // YYYY-MM-DD
  source: 'blog'
  mentionCount: number
}
```

### 4.2 종목토론방 (`naver-stock-discussion.ts`)

**데이터 소스**: 네이버 금융 종목토론방 (`finance.naver.com/item/board.naver`)

**환경 변수**: 불필요 (공개 페이지 스크래핑)

**수집 흐름**:
1. **주말 스킵**: `isWeekday()` — KST 기준 월~금만 수집
2. 테마별 활성 종목 배치 로딩 (`theme_stocks WHERE is_active = true`)
3. **샘플링**: 종목당 최대 `MAX_STOCKS_PER_THEME = 5`개
4. 종목별 토론방 페이지 스크래핑 (최대 `PAGES_PER_STOCK = 3` 페이지)
5. **날짜 필터**: 오늘(`getKSTDate()`) 게시물만 카운트
6. **외삽 보정**: `sampled < total` 이면 비율로 전체 추정
   ```
   mentionCount = (rawCount / sampled) * totalStockCount
   ```

**스크래핑 파싱 (`scrapeDiscussionPage`)**:
- HTML 인코딩: `euc-kr` → `TextDecoder` 변환
- cheerio로 `table.type2 tbody tr` 파싱
- 날짜 형식: `HH:mm` (오늘) 또는 `YYYY.MM.DD HH:mm`
- `HH:mm` 형식이면 오늘 게시물로 카운트

**Rate limiting**: 종목 간 2000ms, 페이지 간 500ms sleep

**조기 중단**: 페이지에서 오늘 게시물 0건 → 이후 페이지 스킵

**출력 타입**:
```typescript
interface DiscussionMetric {
  themeId: string
  date: string           // YYYY-MM-DD (오늘)
  source: 'discussion'
  mentionCount: number
  stockCount: number     // 테마 내 전체 종목 수
  stocksSampled: number  // 실제 수집한 종목 수
}
```

### 4.3 공용 유틸 (`search-utils.ts`)

| 함수 | 역할 |
|------|------|
| `stripHtml(text)` | HTML 태그 + 엔티티 제거 (`&quot;`, `&amp;`, `&#39;` 등) |
| `isRelevantArticle(title, keywords)` | 제목에 키워드 포함 여부 (짧은 영숫자는 단어 경계 매칭) |
| `escapeRegex(str)` | 정규표현식 특수문자 이스케이프 |

---

## 5. 파이프라인 통합

### collect-and-score.ts — 3.5단계

```
3단계: 종목 수집
  ↓
3.5단계: 커뮤니티 데이터 수집 (full 모드에서만)
  ├── 3.5a: 네이버 블로그 수집 (14일치)
  │     └── upsertCommunityMetrics(blogMetrics)
  └── 3.5b: 종목토론방 수집 (평일만, 오늘 1일치)
        └── upsertCommunityMetrics(discMetrics)
  ↓
4단계: 점수 계산
```

**실행 조건**:
- `mode === 'full'` 에서만 실행 (daily 모드 제외)
- 블로그: 항상 (환경 변수 미설정 시 빈 배열 반환)
- 토론방: 평일(`dayOfWeek 1-5`)만

**에러 처리**: `warningFailures++` — 실패해도 파이프라인 계속 진행 (critical이 아님)

### data-ops.ts — upsertCommunityMetrics()

```typescript
async function upsertCommunityMetrics(metrics: Array<{
  themeId: string; date: string; source: 'blog' | 'discussion';
  mentionCount: number; stockCount?: number; stocksSampled?: number;
}>)
```

- `batchUpsert()` 활용 (기존 3-attempt 재시도 + 지수 백오프)
- `onConflict: 'theme_id,time,source'` — 재실행 시 덮어쓰기

### calculate-scores.ts — communityMetrics 전달

```typescript
// 배치 로딩 (graceful fallback — 테이블 미존재 시 빈 배열)
const allCommunity = await batchQuery('community_metrics', '*', themeIds, ...)

// 테마별 그룹핑
const communityByTheme = groupByThemeId(allCommunity)

// calculator에 전달
calculateThemeScore({
  ...기존 파라미터,
  communityMetrics: communityCache.get(theme.id) || [],
})
```

---

## 6. 점수 계산 (calculator.ts)

### 가중치 (SCORE_WEIGHTS)

| 컴포넌트 | 가중치 | 변경 전 | 변경 후 |
|----------|--------|---------|---------|
| interest (관심도) | **35%** | 45% | 35% |
| newsMomentum (뉴스) | **30%** | 30% | 30% |
| communityBuzz (커뮤니티) | **15%** | — | 15% (신규) |
| volatility (변동성) | **10%** | 20% | 10% |
| activity (활동성) | **10%** | — | 10% (신규) |

### 커뮤니티 점수 계산 로직

```
입력: communityMetrics[] (최신순 정렬)

1. blog/discussion 분리
2. 각각 최근 7일 / 지난 7일 합산
   - blogThisWeek, blogLastWeek
   - discThisWeek, discLastWeek

3. 데이터 없음 또는 전부 0 → COMMUNITY_FALLBACK (0.3)

4. 블로그 점수 (0~1):
   blogVolume  = log_normalize(blogThisWeek, 100)
   blogMomentum = blogLastWeek >= 3 ? sigmoid_normalize(변화율, 0, 1.0) : 0.5
   blogScore   = blogVolume × 0.6 + blogMomentum × 0.4

5. 토론방 점수 (0~1):
   discVolume  = log_normalize(discThisWeek, 500)
   discMomentum = discLastWeek >= 3 ? sigmoid_normalize(변화율, 0, 1.0) : 0.5
   discScore   = discVolume × 0.6 + discMomentum × 0.4

6. 최종 커뮤니티 점수:
   communityScore = blogScore × 0.6 + discScore × 0.4
```

### 상수

| 상수 | 값 | 설명 |
|------|----|------|
| `COMMUNITY_FALLBACK` | 0.3 | 데이터 없을 때 중립 점수 (0점 방지) |
| `MIN_COMMUNITY_LAST_WEEK` | 3 | 모멘텀 계산 최소 기준 (지난주 3건 이상) |
| 블로그 `scale` | 100 | `log_normalize` 스케일 (주간 100건이면 만점) |
| 토론방 `scale` | 500 | `log_normalize` 스케일 (주간 500건이면 만점) |

### 정규화 함수

| 함수 | 수식 | 용도 |
|------|------|------|
| `log_normalize(value, scale)` | `min(1, ln(1+value) / ln(1+scale))` | 볼륨 정규화 (큰 값 압축) |
| `sigmoid_normalize(x, center, scale)` | `1 / (1 + e^(-(x-center)/scale))` | 모멘텀 변화율 정규화 (0~1) |

### ScoreComponents 출력

```typescript
{
  community_buzz: communityScore,   // 0~1
  weights: {
    community: 0.15,                // SCORE_WEIGHTS.communityBuzz
  },
  raw: {
    blogMentions7d: blogThisWeek,
    blogMentionsPrev7d: blogLastWeek,
    discussionPosts7d: discThisWeek,
    discussionPostsPrev7d: discLastWeek,
  }
}
```

---

## 7. API 응답

### fetch-theme-data.ts

```typescript
// community_metrics 쿼리 (30일, 시간순)
supabase
  .from('community_metrics')
  .select('time, source, mention_count')
  .eq('theme_id', id)
  .gte('time', thirtyDaysAgo)
  .order('time', { ascending: true })
```

- **Graceful fallback**: `42P01` (테이블 미존재) → 빈 배열

### build-response.ts — buildCommunityFields()

```typescript
function buildCommunityFields(communityList) {
  // 날짜별 blog/discussion 합산
  // → communityTimeline: Array<{ date, blog, discussion }>
  // → communityCount7d: 최근 7일 총 멘션 수
}
```

### ThemeDetail 응답 타입

```typescript
interface ThemeDetail {
  // ...기존 필드...

  /** 커뮤니티 시계열 (블로그+토론방, 보조 차트용) */
  communityTimeline?: Array<{
    date: string       // YYYY-MM-DD
    blog: number       // 블로그 멘션 수
    discussion: number // 토론방 게시글 수
  }>

  /** 최근 7일 커뮤니티 언급 총 수 */
  communityCount7d?: number

  score: {
    components: {
      communityBuzz?: number  // 0~1
    }
    raw: {
      blogMentions7d?: number
      blogMentionsPrev7d?: number
      discussionPosts7d?: number
      discussionPostsPrev7d?: number
    }
  }
}
```

---

## 8. 프론트엔드

### 8.1 독립 차트 — CommunityBuzz 컴포넌트

**파일**: `app/themes/[id]/_components/community-buzz.tsx`

- shadcn `ChartContainer` + recharts `AreaChart`
- 블로그(pink `#EC4899`) + 토론방(purple `#A855F7`) 스택 Area
- 높이: 300px
- 커스텀 툴팁: 블로그/종목토론방 별도 표시
- X축: `MM-DD` 형식 (`tickFormatter: v.slice(5)`)
- 빈 데이터: MessageCircle 아이콘 + "커뮤니티 데이터를 수집하고 있어요"
- 데이터 자동 정렬: `sort((a, b) => a.date.localeCompare(b.date))`

**Props**:
```typescript
interface CommunityBuzzProps {
  timeline: Array<{ date: string; blog: number; discussion: number }>
}
```

### 8.2 메인 차트 오버레이 — LifecycleCurve 통합

**detail-content.tsx에서의 사용**:
```tsx
<LifecycleCurve
  communityTimeline={slicedCommunity}
  visibleLayers={visibleLayers}  // 'community' 포함
  ...
/>
```

**lifecycle-curve.tsx 내부**:
- `communityTimeline` → `mergeChartData()`에서 `communityBlog` / `communityDiscussion` 필드로 병합
- 2개의 `<Area>` 렌더링 (blog pink, discussion purple)
- 레이어 토글에서 `'community'` 키로 on/off
- `layerOpacity('community', hoveredLayer, 0.6)` — 호버 시 하이라이트

**lifecycle-curve-tooltip.tsx 내부**:
- `communityBlog` → "블로그" 라벨 (pink)
- `communityDiscussion` → "토론" 라벨 (purple)

### 8.3 표시 위치 (detail-content.tsx)

```
[차트 GlassCard]         ← 오버레이 (레이어 토글)
  ↓
[관련 뉴스 GlassCard]
  ↓
[커뮤니티 버즈 GlassCard] ← 독립 차트 (hasCommunity일 때만 렌더)
  ↓
[3열 그리드]
```

- `hasCommunity = !!theme.communityTimeline?.length`
- 커뮤니티 데이터 없으면 섹션 자체가 숨김

---

## 9. 색상 체계

| 소스 | 차트 색상 | Tailwind | 용도 |
|------|----------|----------|------|
| 블로그 | `#EC4899` | `text-pink-500` | Area stroke + fill |
| 종목토론방 | `#A855F7` | `text-purple-500` | Area stroke + fill |

메인 차트 + 독립 차트 + 레이어 토글 + 툴팁에서 동일 색상 사용.

---

## 10. 안전장치

### 수집 안전장치
| 항목 | 설명 |
|------|------|
| 환경 변수 미설정 | 블로그: 빈 배열 반환 (warn 로그) |
| 주말 | 토론방: 수집 스킵 (`isWeekday()`) |
| 관련도 필터 | 블로그: 제목에 키워드 없으면 무시 |
| API 실패 | `withRetry(fn, 3)` — 3회 재시도 |
| Rate limiting | 블로그: 100-200ms, 토론방: 500-2000ms |
| 스크래핑 인코딩 | `euc-kr` → `TextDecoder` |
| 샘플링 외삽 | 5개 이하 종목만 수집 → 전체 비율로 추정 |

### 점수 안전장치
| 항목 | 설명 |
|------|------|
| 데이터 0건 | `COMMUNITY_FALLBACK = 0.3` (중립) |
| 모멘텀 기준 미달 | 지난주 < 3건이면 `momentum = 0.5` (중립) |
| `log_normalize` | `isFinite()` 가드, 음수 → 0 |
| `sigmoid_normalize` | `isFinite()` 가드, `scale <= 0` → 0.5 |
| DB 테이블 미존재 | `42P01` → 빈 배열 (API graceful fallback) |
| upsert 멱등성 | `UNIQUE(theme_id, time, source)` |

### 파이프라인 안전장치
| 항목 | 설명 |
|------|------|
| 실패 분류 | `warningFailures` (critical이 아님) |
| 테이블 조회 실패 | `try/catch` + warn 로그 → 빈 배열로 계속 |
| full 모드만 | daily 모드에서는 커뮤니티 수집 스킵 |

---

## 11. 고도화 포인트

### 새로운 커뮤니티 소스 추가 (예: 트위터, 카페)
1. `scripts/tli/collectors/` 에 새 수집기 파일 생성
2. `source` 필드에 새 값 추가 (예: `'twitter'`)
3. `collect-and-score.ts` 3.5단계에 수집 호출 추가
4. `calculator.ts`에서 새 소스 분리 + 가중치 조정
5. `build-response.ts`의 `buildCommunityFields()` — 새 소스 합산 방식 결정
6. 프론트엔드: `CommunityBuzz` + 메인 차트에 새 Area/Line 추가

### 블로그 스케일 조정
- `log_normalize(blogThisWeek, 100)` 의 `100`은 "주간 100건이면 만점"
- 테마별 규모가 다르므로 동적 스케일 도입 가능

### 토론방 샘플링 정밀도 향상
- `MAX_STOCKS_PER_THEME = 5` → 늘리면 정확도 향상, 수집 시간 증가
- `PAGES_PER_STOCK = 3` → 활발한 종목은 더 많은 페이지 필요

### 커뮤니티 Confidence 반영
- 현재 Score Confidence에 커뮤니티 데이터 커버리지 미반영
- `communityDaysWithData / 14` 를 추가 factor로 도입 가능

---

## 12. 환경 변수

| 변수 | 필수 | 용도 |
|------|------|------|
| `NAVER_CLIENT_ID` | 블로그 수집 시 | 네이버 검색 API 클라이언트 ID |
| `NAVER_CLIENT_SECRET` | 블로그 수집 시 | 네이버 검색 API 시크릿 |

- 미설정 시 블로그 수집 스킵 (warn 로그, 에러 아님)
- 토론방은 환경 변수 불필요 (공개 페이지 스크래핑)

---

## 13. 타입 정의

### DB 타입 (`lib/tli/types/db.ts`)

```typescript
interface CommunityMetric {
  id: string
  theme_id: string
  time: string              // YYYY-MM-DD
  source: 'blog' | 'discussion'
  mention_count: number
  stock_count: number       // 토론방 전용
  stocks_sampled: number    // 토론방 전용
  created_at: string
}
```

### 수집기 타입

```typescript
// naver-blog.ts
interface BlogMetric {
  themeId: string
  date: string
  source: 'blog'
  mentionCount: number
}

// naver-stock-discussion.ts
interface DiscussionMetric {
  themeId: string
  date: string
  source: 'discussion'
  mentionCount: number
  stockCount: number
  stocksSampled: number
}
```

### API 응답 타입 (ThemeDetail 일부)

```typescript
communityTimeline?: Array<{
  date: string
  blog: number
  discussion: number
}>
communityCount7d?: number
```

---

## 14. 파이프라인 실행 순서

```
collect-and-score.ts --mode full

1단계: 테마 디스커버리
2단계: 관심도 수집 (DataLab)
3단계: 뉴스 + 종목 수집
3.5a단계: ★ 블로그 수집 (14일치)
3.5b단계: ★ 종목토론방 수집 (오늘, 평일만)
4단계: 점수 계산 (communityBuzz 15% 반영)
5단계: 비교 분석
6단계: 예측
7단계: 평가
8단계: 검증
```
