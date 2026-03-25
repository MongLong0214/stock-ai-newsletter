# PRD: StockMatrix MCP Server Production Ready

**Version**: 0.2
**Author**: Isaac (Elite Dev TF)
**Date**: 2026-03-25
**Status**: Done
**Size**: L

---

## 1. Problem Statement

### 1.1 Background
StockMatrix MCP Server (v0.3.0)는 한국 주식 테마 분석을 AI 에이전트에 제공하는 npm 패키지. 8개 도구로 250+ 테마의 TLI 점수, 랭킹, 상세 분석, 뉴스, 종목 정보를 제공. 팀 리뷰(Guardian + Strategist + Boomer) 결과 P0 2건, P1 11건, P2 11건 발견.

### 1.2 Problem Definition
1. **정확성**: methodology 도구가 하드코딩 데이터를 반환하여 실제 알고리즘과 드리프트 발생 가능 + limitations 섹션 배열 spread 출력 버그
2. **사용성**: 일간 변동/비교/예측 도구 부재로 핵심 사용자 질문에 답변 불가
3. **견고성**: ESM guard 미비, 응답 무검증, 캐싱 없음, 테스트 0건
4. **효율성**: 무제한 쿼리, limit/sort 미지원, 50KB+ 페이로드

### 1.3 Impact of Not Solving
- AI 에이전트가 잘못된 알고리즘 정보 전달 → 사용자 신뢰 하락
- "어제 대비 뭐가 올랐어?" 등 가장 빈번한 질문에 답변 불가 → 일일 사용 유도 실패
- 대량 페이로드로 컨텍스트 윈도우 낭비 → 후속 대화 품질 저하
- sandbox 환경에서 import 시 stdio 충돌 → Smithery 배포 불가

## 2. Goals & Non-Goals

### 2.1 Goals
- [ ] G1: P0/P1 버그 전량 수정 (limitations spread, ESM guard, unbounded query)
- [ ] G2: 일간 변동 도구(`get_theme_changes`) 추가 — 일일 사용 유도의 핵심
- [ ] G3: 테마 비교 도구(`compare_themes`) 추가 — 기존 comparison 인프라 활용
- [ ] G4: 예측 필터 도구(`get_predictions`) 추가 — Rising/Cooling 직접 접근
- [ ] G5: `get_theme_ranking`에 limit/sort 파라미터 추가 — 페이로드 70% 감소
- [ ] G6: `get_market_summary` 응답에 themeId 추가 — 요약→상세 체이닝
- [ ] G7: methodology를 API 엔드포인트로 이전 — source of truth 단일화
- [ ] G8: TTL 인메모리 캐시 도입 — 반복 호출 시 API 부하 제거
- [ ] G9: 빈 결과 가이던스 메시지 추가 — AI 에이전트 행동 유도
- [ ] G10: Zod 응답 스키마 검증 도입 — API 드리프트 방어
- [ ] G11: search_stocks + get_stock_theme 통합 — 도구 혼란 제거
- [ ] G12: 핵심 테스트 작성 — tool registration + fetch-helper + response format
- [ ] G13: README 리디자인 — 가치 제안 선두 + 데모 예시 강화
- [ ] G14: P2 항목 전량 수정 (smithery pin, repository, context header 등)

### 2.2 Non-Goals
- NG1: API 버전관리(`/api/v1/`) — 별도 PR로 분리 (Isaac 결정)
- NG2: DB 스키마 변경 — 기존 테이블 쿼리만 사용
- NG3: Zod v3→v4 마이그레이션 — MCP 패키지는 독립 의존성 유지
- NG4: 웹 UI 변경 — MCP + API 라우트만 대상
- NG5: npm publish 자동화 — 수동 배포 유지
- NG6: API Rate Limiting — Vercel 인프라 레벨에서 처리. MCP/API 코드 레벨 rate limit은 이번 범위 외 (별도 이슈로 추적)

## 3. User Stories & Acceptance Criteria

### US-1: 버그 수정 및 견고성 개선
**As a** MCP 사용 AI 에이전트, **I want** 정확하고 안정적인 응답, **so that** 사용자에게 신뢰할 수 있는 정보를 전달할 수 있다.

**Acceptance Criteria:**
- [ ] AC-1.1: `get_methodology` section=limitations 요청 시 `{ section: "limitations", items: [...] }` 형태로 반환 (배열 spread 버그 수정)
- [ ] AC-1.2: `createSandboxServer` import 시 `main()` 자동 실행 안 됨 — `cli.ts` 엔트리포인트 분리 방식 (package.json `bin` → `dist/cli.js`, `main` → `dist/index.js`)
- [ ] AC-1.3: `stocks/search/route.ts` 쿼리에 7일 날짜 필터 + limit 적용. ilike 쿼리의 SQL 와일드카드(`%`, `_`) 이스케이프 처리 포함 (themes/route.ts 동일 패턴 일괄 수정)
- [ ] AC-1.4: `themes/route.ts` lifecycle_scores 쿼리 limit(1000) 절단 문제 해결
- [ ] AC-1.5: 각 도구의 빈 결과([] 또는 undefined)에 가이던스 메시지 포함
- [ ] AC-1.6: fetchApi 응답에 Zod 스키마 검증 적용 (파싱 실패 시 명확한 에러)
- [ ] AC-1.7: smithery.yaml에 버전 핀 (`@0.3.0` → 빌드 시 동기화)
- [ ] AC-1.8: package.json에 `repository` 필드 추가

### US-2: 도구 효율성 개선
**As a** MCP 사용 AI 에이전트, **I want** 필요한 만큼만 데이터를 받고 자연스럽게 다음 도구로 연결, **so that** 컨텍스트 윈도우를 절약하고 정확한 후속 요청을 할 수 있다.

**Acceptance Criteria:**
- [ ] AC-2.1: `get_theme_ranking`에 `limit` (기본 10, 최대 50) 파라미터 동작
- [ ] AC-2.2: `get_theme_ranking`에 `sort` (score/change7d/newsCount) 파라미터 동작
- [ ] AC-2.3: `get_market_summary` 응답의 각 테마에 `themeId` 포함
- [ ] AC-2.4: `get_theme_ranking` context 헤더에 signals/hottestTheme/surging 필드 안내 포함
- [ ] AC-2.5: `get_methodology` 기본 섹션은 `all` 유지 (하위 호환). README에 `section=scoring` 예시로 토큰 절약 안내
- [ ] AC-2.6: TTL 캐시 동작 — 동일 도구 1시간 내 재호출 시 캐시 응답

### US-3: 일간 변동 도구
**As a** 한국 주식 투자자, **I want** "어제 대비 뭐가 올랐어?" 질문에 직접 답변, **so that** 매일 MCP를 사용하는 습관이 생긴다.

**Acceptance Criteria:**
- [ ] AC-3.1: `get_theme_changes` 도구가 최근 24h 점수 변동 상위/하위 테마 반환
- [ ] AC-3.2: stage 전환(예: Emerging→Growth) 테마 별도 표시
- [ ] AC-3.3: 신규 Emerging 테마 별도 표시
- [ ] AC-3.4: 선택적 `period` 파라미터 (`1d`/`7d`, 기본 `1d`). 파이프라인이 일 1회이므로 `1d` = 전일 대비, `7d` = 7일 전 대비
- [ ] AC-3.5: 변동 데이터 없을 시 빈 배열 + `"No score changes detected for this period."` 가이던스
- [ ] AC-3.6: 무효한 period 값 시 Zod 검증 에러 (MCP SDK 기본 에러 반환)

### US-4: 테마 비교 도구
**As a** 한국 주식 투자자, **I want** 두 테마를 나란히 비교, **so that** 어디에 관심을 둘지 판단할 수 있다.

**Acceptance Criteria:**
- [ ] AC-4.1: `compare_themes` 도구가 2~5개 theme_id 받아 점수/stage/stocks/sparkline 병렬 비교
- [ ] AC-4.2: 유사도 데이터 포함 — `theme_comparison_candidates_v2`에서 상호 참조 (A의 후보에 B가 있거나 B의 후보에 A가 있는 경우 similarity_score 표시). 상호 참조 없으면 `similarity: null` (직접 실시간 계산하지 않음)
- [ ] AC-4.3: 겹치는 종목 목록 표시
- [ ] AC-4.4: 존재하지 않는 themeId 포함 시 해당 테마만 제외 + 경고 메시지 (부분 결과 반환)
- [ ] AC-4.5: 1개 미만 또는 6개 이상 입력 시 Zod 검증 에러

### US-5: 예측 필터 도구
**As a** 한국 주식 투자자, **I want** Rising/Cooling 예측 테마를 직접 조회, **so that** 관심 테마를 빠르게 선별할 수 있다.

**Acceptance Criteria:**
- [ ] AC-5.1: `get_predictions` 도구가 Rising/Hot/Cooling 필터로 예측 테마 반환
- [ ] AC-5.2: 각 테마의 예측 근거 포함 — v4 forecast 체계 활용: `analog_candidates_v1` (유사 과거 테마 rank/similarity), `analog_evidence_v1` (analog_future_path_summary), `query_snapshot_v1` (days_since_episode_start)
- [ ] AC-5.3: 데이터 소스 우선순위: (1) v4 forecast 경로 (`forecast_control_v1` fail-closed 게이트 통과 시) → `query_snapshot_v1` + `analog_candidates_v1` + `analog_evidence_v1`, (2) fallback → `v_prediction_v4_serving` 뷰 (v2 레거시, published run 기반)
- [ ] AC-5.4: v4 forecast 미서빙 + v2 fallback 데이터도 없을 시 빈 배열 + `"Prediction data not yet available. Forecast system is in shadow mode."` 가이던스
- [ ] AC-5.5: 응답에 `dataSource: "v4-forecast" | "v2-legacy"` 필드로 출처 명시

### US-6: 도구 통합 (search_stocks + get_stock_theme)
**As a** MCP 사용 AI 에이전트, **I want** 종목 관련 도구가 하나로 통합, **so that** 도구 선택 혼란 없이 종목→테마 조회가 된다.

**Acceptance Criteria:**
- [ ] AC-6.1: `search_stocks`가 6자리 코드 입력 시 자동으로 stock-to-theme 상세 조회
- [ ] AC-6.2: `get_stock_theme` 제거, `search_stocks` description에 기능 통합 안내
- [ ] AC-6.3: 기존 `get_stock_theme` 사용자를 위한 하위 호환 (도구명 유지, 내부적으로 search_stocks 위임) — 1 릴리즈 후 제거

### US-7: methodology API 엔드포인트
**As a** MCP 개발자, **I want** methodology 데이터가 API에서 제공, **so that** 알고리즘 변경 시 MCP 재배포 없이 반영된다.

**Acceptance Criteria:**
- [ ] AC-7.1: `GET /api/tli/methodology` 엔드포인트가 정적 methodology 데이터 반환
- [ ] AC-7.2: `section` 쿼리 파라미터로 섹션별 필터링
- [ ] AC-7.3: MCP `get_methodology`가 API fetch로 전환
- [ ] AC-7.4: 캐시 preset `long` (1시간) 적용

### US-8: 테스트 및 README
**As a** MCP 패키지 사용자/기여자, **I want** 테스트와 명확한 문서, **so that** 패키지 품질을 신뢰하고 빠르게 시작할 수 있다.

**Acceptance Criteria:**
- [ ] AC-8.1: tool registration 테스트 — 8개 도구 등록 확인
- [ ] AC-8.2: fetch-helper 테스트 — retry, timeout, error format, response unwrapping
- [ ] AC-8.3: response format 테스트 — formatResult, formatError
- [ ] AC-8.4: README 리디자인 — 첫 문단을 사용자 가치로, 알고리즘은 하단으로

## 4. Technical Design

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   AI Agent (Claude, Cursor, etc.)    │
└────────────────────────┬────────────────────────────┘
                         │ MCP Protocol (stdio)
┌────────────────────────▼────────────────────────────┐
│              StockMatrix MCP Server (npm)            │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ TTL Cache │  │ Zod      │  │ Tools (10개)       │  │
│  │ (1h rank/ │  │ Response │  │ + get_theme_changes│  │
│  │  summary) │  │ Schemas  │  │ + compare_themes   │  │
│  └──────────┘  └──────────┘  │ + get_predictions  │  │
│                               │ - get_stock_theme  │  │
│                               │   (→search_stocks) │  │
│                               └───────────────────┘  │
└────────────────────────┬────────────────────────────┘
                         │ HTTP (fetchApi)
┌────────────────────────▼────────────────────────────┐
│              Next.js API Routes                      │
│  기존: /api/tli/scores/ranking (+ limit/sort)        │
│  기존: /api/ai/summary (+ themeId)                   │
│  기존: /api/tli/stocks/search (+ limit fix)          │
│  신규: /api/tli/methodology                          │
│  신규: /api/tli/changes                              │
│  신규: /api/tli/predictions                          │
└────────────────────────┬────────────────────────────┘
                         │ Supabase
┌────────────────────────▼────────────────────────────┐
│  lifecycle_scores | theme_comparison_candidates_v2   │
│  forecast_control_v1 | query_snapshot_v1             │
│  analog_candidates_v1 | analog_evidence_v1           │
│  v_prediction_v4_serving (fallback)                  │
│  themes | theme_stocks                               │
└─────────────────────────────────────────────────────┘
```

### 4.2 Data Model Changes
없음. 기존 테이블만 쿼리.

### 4.3 API Design

#### 신규 엔드포인트

| Method | Endpoint | Description | Auth | Cache |
|--------|----------|-------------|------|-------|
| GET | `/api/tli/methodology?section=` | TLI 알고리즘 문서 | None | long |
| GET | `/api/tli/changes?period=1d\|7d` | 일간/주간 테마 변동 | None | medium |
| GET | `/api/tli/predictions?phase=rising\|hot\|cooling` | 예측 테마 조회 | None | medium |

#### 기존 엔드포인트 수정

| Endpoint | 변경 | 상세 |
|----------|------|------|
| `/api/tli/scores/ranking` | `limit`, `sort` 쿼리 파라미터 추가 | limit: 1-50(기본10), sort: score\|change7d\|newsCount |
| `/api/ai/summary` | 응답 topThemes에 `themeId` 추가 | 기존 detailUrl 유지 + themeId 병렬 |
| `/api/tli/stocks/search` | scores 쿼리에 날짜 필터 + limit | `.gte('calculated_at', sevenDaysAgo).limit(themeIds.length * 2)` |
| `/api/tli/themes` (list) | scores 쿼리 limit 개선 | `.limit(chunk.length * 7)` (7일분) |

#### 신규 API 상세

**GET /api/tli/changes**

계산 로직: `lifecycle_scores`에서 최근 2일(period=1d) 또는 8일(period=7d) 조회 → 테마별 MAX(calculated_at) 기준 최신 점수와 비교 시점 점수의 diff → 절대값 변동분 반환. stageTransitions: 최신 row의 stage ≠ 비교 시점 row의 stage인 경우. newlyEmerging: 비교 시점에 score 없거나 stage='Dormant'이고 최신이 'Emerging'인 경우.

```json
{
  "success": true,
  "data": {
    "period": "1d",
    "generatedAt": "2026-03-25T09:00:00+09:00",
    "movers": {
      "rising": [{ "id": "uuid", "name": "테마명", "score": 75, "change": 8.5, "stage": "Growth" }],
      "falling": [{ "id": "uuid", "name": "테마명", "score": 42, "change": -6.2, "stage": "Decline" }]
    },
    "stageTransitions": [
      { "id": "uuid", "name": "테마명", "from": "Emerging", "to": "Growth", "score": 45 }
    ],
    "newlyEmerging": [
      { "id": "uuid", "name": "테마명", "score": 28 }
    ]
  }
}
```

**GET /api/tli/predictions**

데이터 소스 우선순위: (1) v4 forecast 경로 — `forecast_control_v1`에서 fail-closed 게이트 확인 → 통과 시 `query_snapshot_v1` + `analog_candidates_v1` + `analog_evidence_v1`에서 전체 테마 예측 조회. (2) fallback — `v_prediction_v4_serving` 뷰 (v2 레거시). phase 매핑: Rising = lifecycle_scores에서 Emerging+Growth 중 상승 추세, Hot = Peak, Cooling = Decline+Dormant.

```json
{
  "success": true,
  "data": {
    "phase": "rising",
    "dataSource": "v4-forecast",
    "themes": [
      {
        "id": "uuid",
        "name": "테마명",
        "score": 55,
        "stage": "Emerging",
        "prediction": {
          "phase": "rising",
          "confidence": "medium",
          "daysSinceEpisodeStart": 12,
          "expectedPeakDay": 28,
          "topAnalog": { "name": "2차전지", "similarity": 0.72, "peakDay": 31 },
          "evidenceQuality": "medium"
        }
      }
    ]
  }
}
```

### 4.4 Key Technical Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| TTL 캐시 구현 | (a) Map + setTimeout (b) lru-cache npm | (a) 간단 Map | 의존성 0. MCP 프로세스 수명이 짧아 LRU 불필요 |
| Methodology 이전 | (a) API 엔드포인트 (b) MCP resource | (a) API | MCP resource는 SDK 버전 의존성 불확실. API는 캐시 + 버전관리 가능 |
| 도구 통합 방식 | (a) search_stocks 흡수 (b) 별도 유지 | (a) 흡수 | 6자리 입력 → 자동 분기. get_stock_theme은 1릴리즈 하위호환 후 제거 |
| Zod 응답 검증 | (a) 전체 strict (b) 핵심 필드만 partial | (b) partial | 전체 strict는 API 확장 시 깨짐. 핵심 필드(id, name, score, stage)만 검증 |
| 비교 도구 데이터 | (a) 실시간 계산 (b) 기존 candidates 상호참조 | (b) 상호참조 | candidates는 단일 테마의 유사 후보이므로, A↔B 쌍을 상호 참조하여 기존 유사도 표시. 없으면 null (실시간 계산 비용 과다) |
| ESM guard | (a) process.argv 체크 (b) cli.ts 분리 (c) --stdio flag | (b) cli.ts 분리 | 가장 명확한 관심사 분리. bin→cli.js(stdio+main), main→index.js(createServer/createSandboxServer 만 export) |
| 예측 데이터 소스 | (a) v2 prediction_snapshots만 (b) v4 forecast + v2 fallback | (b) v4 + fallback | v4가 active serving path. fail-closed 미통과 시 v2 뷰로 graceful degradation |
| Zod partial + 신규 필드 | 신규 필드(themeId 등) 추가 시 호환 | partial 검증이므로 추가 필드는 자동 통과 | strict면 API 확장마다 MCP 재배포 필요. partial은 핵심 필드만 보장하고 나머지 passthrough |
| methodology 기본 섹션 | (a) all→scoring 변경 (b) all 유지 + README 권장 | (b) all 유지 | breaking change 방지. README에 `section=scoring` 예시로 토큰 절약 안내 |

## 5. Edge Cases & Error Handling

| # | Scenario | Expected Behavior | Severity |
|---|----------|-------------------|----------|
| E1 | API 다운 (503) | 2회 재시도 후 명확한 에러 메시지 + AI 에이전트 안내 "잠시 후 다시 시도해주세요" | P1 |
| E2 | 빈 검색 결과 | `"No themes found for '{query}'. Try broader keywords."` + 추천 키워드 | P2 |
| E3 | stage 필터에 해당 테마 0건 | 빈 배열 + `"No {stage} themes currently. Try other stages."` | P2 |
| E4 | compare_themes에 잘못된 UUID | Zod 검증 실패 → MCP SDK 기본 에러 | P2 |
| E5 | predictions 데이터 없음 (파이프라인 미실행) | 빈 배열 + `"Prediction data not yet available."` | P2 |
| E6 | ranking limit > 50 | Zod `.max(50)` 클램프 | P3 |
| E7 | methodology API 다운 시 fallback | 최소 구조만 반환: `{ error: "Methodology API unavailable", fallback: true, scoring: { range: "0-100", components: [...] } }` + "상세는 잠시 후 재시도" 안내. 전체 하드코딩 유지하지 않음 (드리프트 방지) | P2 |
| E8 | TTL 캐시 메모리 누수 | 캐시 엔트리 수 상한 (50개) + 자동 만료 | P3 |
| E9 | 동시 tool 호출 시 캐시 race | 동일 키 중복 fetch 허용 (단순성 우선, stampede 보호 불필요) | P3 |
| E10 | compare_themes에서 요청 테마 쌍의 비교 데이터 없음 | candidates 상호참조 결과 없으면 `similarity: null`. 기본 점수/stage/stocks 비교만 반환 + `"No historical similarity data between these themes."` 안내 | P2 |
| E11 | v4 forecast fail-closed + v2 fallback도 빈 경우 | 빈 배열 + `"Prediction data not yet available. Forecast system is in shadow mode."` | P2 |
| E12 | ilike 쿼리에 SQL 와일드카드(%, _) 포함 | 입력 값의 `%` → `\%`, `_` → `\_` 이스케이프 후 ilike 전달 | P2 |

## 6. Security & Permissions

### 6.1 Authentication
없음. 모든 API 엔드포인트는 public read-only.

### 6.2 Authorization
N/A — 읽기 전용 서비스.

### 6.3 Data Protection
- 주가 데이터는 모두 공개 정보 (Naver Finance 기반)
- API 키/시크릿 노출 없음 (MCP 서버는 공개 API만 호출)
- Zod 검증으로 서버 응답 내 예상치 못한 필드 노출 방지

## 7. Performance & Monitoring

| Metric | Target | Measurement |
|--------|--------|-------------|
| 도구 응답 시간 (p95) | < 3s (캐시 미스), < 50ms (캐시 히트) | fetchApi 타이밍 로그 |
| 캐시 히트율 | > 60% (반복 사용 시) | 캐시 통계 로그 |
| 페이로드 크기 (ranking) | < 15KB (limit=10 기본값) | 응답 JSON 길이 |
| API 에러율 | < 1% | stderr 에러 로그 |

### 7.1 Monitoring & Alerting
- **MCP 측**: stderr 기반이 유일한 출력 채널 (MCP 프로세스 특성). fetchApi 에러/타이밍 로그 + 캐시 통계
- **API 라우트 측**: Vercel Analytics/Functions 로그에 위임. 별도 alerting 인프라 구축은 이번 범위 외
- **배포 후 수동 검증**: 각 신규 엔드포인트 10회 호출 p95 측정 (benchmark 스크립트 별도 작성 불필요, curl 기반)

## 8. Testing Strategy

### 8.1 Unit Tests
- `fetch-helper.ts`: retry 로직, timeout, JSON 파싱, 에러 포맷, ApiResponse unwrapping
- `cache.ts`: TTL 만료, 캐시 히트/미스, 최대 엔트리 제한
- `formatResult`, `formatError`: 출력 형식 검증
- Zod 응답 스키마: 유효/무효 데이터 파싱

### 8.2 Integration Tests
- Tool registration: 10개 도구 등록 확인 (createSandboxServer 사용)
- Tool 호출 E2E: mock API 서버 + 실제 도구 호출 → 응답 형식 검증

### 8.3 Edge Case Tests
- 빈 API 응답 → 가이던스 메시지 포함 확인
- 잘못된 API 응답 형태 → Zod 에러 핸들링 확인
- API 타임아웃 → 에러 메시지 확인

## 9. Rollout Plan

### 9.1 Migration Strategy
없음. DB 변경 없음.

### 9.2 배포 순서

단일 릴리즈(v0.4.0)이나 구현은 의존성 순서대로:

```
Phase A (버그 수정): G1(limitations, ESM guard, query limit) → 빌드 검증 ✓
Phase B (인프라):    G8(캐시) + G10(Zod) + G14(smithery, repository, context) → 빌드 검증 ✓
Phase C (API 수정):  G5(limit/sort) + G6(themeId) + G7(methodology API) → 빌드 검증 ✓
Phase D (신규 도구): G2(changes) + G3(compare) + G4(predictions) + G9(가이던스) → 빌드 검증 ✓
Phase E (통합):      G11(도구 통합) + G12(테스트) + G13(README) → 빌드 검증 ✓
```

각 Phase 완료 시 빌드 3종(`tsc --noEmit` + `eslint .` + `next build`) + 테스트 통과 게이트.

### 9.3 Rollback Plan
- `npm deprecate stockmatrix-mcp@0.4.0 "Known issues, use 0.3.x"` + v0.4.1 핫픽스 배포 (npm unpublish는 72시간 제한 + 기존 lockfile 파괴 위험)
- API 라우트는 기존 파라미터 하위 호환 유지 → rollback 불필요
- `get_stock_theme` 하위 호환 도구는 v0.5.0까지 유지

## 10. Dependencies & Risks

### 10.1 Dependencies
| Dependency | Owner | Status | Risk if Delayed |
|-----------|-------|--------|-----------------|
| lifecycle_scores 테이블 | 기존 | Active | 없음 |
| forecast_control_v1 + query_snapshot_v1 + analog_* | 기존 (v4 Phase 0) | Active | get_predictions v4 경로 불가 → v2 fallback |
| v_prediction_v4_serving 뷰 | 기존 (v2 레거시) | Active | v4 + v2 모두 실패 시 predictions 불가 |
| theme_comparison_candidates_v2 | 기존 | Active | compare_themes 유사도 null 반환 |
| @modelcontextprotocol/sdk | MCP org | ^1.0.0 | breaking change 가능 |

### 10.2 Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| v4 forecast fail-closed + v2 데이터 부족 | Medium | Medium | 2단계 fallback (v4→v2→빈 결과+가이던스) |
| 신규 API 엔드포인트 성능 | Low | Medium | 기존 batch 쿼리 패턴 재사용 + 캐시 |
| 도구 통합 시 기존 사용자 혼란 | Medium | Low | get_stock_theme 1릴리즈 하위 호환 |
| MCP SDK ^1.0.0 breaking change | Low | High | lockfile + 업데이트 전 테스트 |

## 11. Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|--------------------|
| 일일 도구 호출 수 | 측정 안됨 | +30% (신규 도구 기여) | User-Agent 기반 API 로그 |
| 도구당 평균 페이로드 | ~50KB (ranking) | < 15KB | 응답 크기 측정 |
| 첫 호출→후속 호출 체이닝 | 수동 (AI 판단) | 자동 (themeId 포함) | summary→detail 호출 패턴 |
| 테스트 커버리지 | 0% | > 80% (핵심 모듈) | vitest coverage |

## 12. Open Questions

- [x] OQ-1: API 버전관리 포함 여부 → **제외** (Isaac 결정 2026-03-25)
- [ ] OQ-2: get_stock_theme 하위 호환 기간 — 1릴리즈(v0.5.0)에서 제거 적절한지?
- [ ] OQ-3: compare_themes 최대 비교 수 — 2~5개 중 상한 결정

---