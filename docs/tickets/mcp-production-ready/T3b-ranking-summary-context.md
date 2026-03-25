# T3b: ranking limit/sort + summary themeId + context 헤더

**PRD Ref**: PRD-mcp-production-ready > US-2 (AC-2.1~2.5)
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T1, T2

---

## 1. Objective
ranking API에 limit/sort 파라미터 추가, summary에 themeId 추가, MCP context 헤더 개선.

## 2. Acceptance Criteria
- [ ] AC-1: `/api/tli/scores/ranking?limit=N&sort=X` — limit (1-50, 기본 10), sort (score/change7d/newsCount)
- [ ] AC-2: 파라미터 없는 호출은 기본값(limit=10, sort=score) 적용 (하위 호환)
- [ ] AC-3: `/api/ai/summary` 응답 topThemes에 `themeId` 필드 포함
- [ ] AC-4: MCP `get_theme_ranking` 도구에 `limit`/`sort` Zod 파라미터 추가
- [ ] AC-5: MCP `get_theme_ranking` context 헤더에 signals/hottestTheme/surging 안내: "The `summary` object includes `signals` (market mood indicators), `hottestTheme` (single highest scorer with 3+ stocks), and `surging` (rapidly rising themes) — use these for quick market reads."
- [ ] AC-6: MCP `get_market_summary` context 헤더에 "Each theme includes themeId for chaining to get_theme_detail" 안내
- [ ] AC-7: PRD AC-2.5 — README에 `section=scoring` 토큰 절약 예시 (T8에서도 반영)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `ranking API returns default limit=10 per stage` | Integration | 파라미터 없음 | 각 stage 최대 10개 |
| 2 | `ranking API respects limit=5` | Integration | limit=5 | 각 stage 최대 5개 |
| 3 | `ranking API sorts by change7d` | Integration | sort=change7d | 변동폭 순 정렬 |
| 4 | `ranking API rejects limit > 50` | Integration | limit=100 | 기본값 적용 또는 클램프 |
| 5 | `summary API includes themeId in topThemes` | Integration | 호출 | topThemes[].themeId 존재 |
| 6 | `MCP get_theme_ranking passes limit/sort to API` | Unit | limit=5, sort=change7d | fetchApi 쿼리 파라미터 포함 |
| 7 | `MCP get_theme_ranking context contains signals guidance` | Unit | 호출 | context에 "signals", "hottestTheme", "surging" 포함 |
| 8 | `MCP get_market_summary context contains themeId guidance` | Unit | 호출 | context에 "themeId" 포함 |

### 3.2 Test File Location
- `app/api/tli/scores/ranking/route.test.ts` (co-located)
- `mcp/src/__tests__/tools-ranking.test.ts`
- `mcp/src/__tests__/tools-summary.test.ts`

### 3.3 Mock/Setup Required
- Vitest: Supabase mock (ranking), `vi.mock('../fetch-helper.js')` (MCP)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/tli/scores/ranking/route.ts` | Modify | `GET(request: Request)` → searchParams 추출 |
| `app/api/tli/scores/ranking/ranking-helpers.ts` | Modify | limit/sort 후처리 함수 추가 또는 buildThemeRanking 결과 슬라이싱 |
| `app/api/ai/summary/route.ts` | Modify | topThemes map에 `themeId: t.id` 추가 |
| `mcp/src/tools/get-theme-ranking.ts` | Modify | limit/sort Zod 파라미터 + context 헤더 |
| `mcp/src/tools/get-market-summary.ts` | Modify | context에 themeId 안내 |

### 4.2 Implementation Steps (Green Phase)
1. `ranking/route.ts`: `GET(request: Request)` 시그니처 변경, searchParams에서 limit/sort 추출 + 클램프
2. `ranking-helpers.ts`: buildThemeRanking 결과에 후처리 — 각 stage 배열을 sort 기준으로 정렬 후 limit 만큼 slice
3. `summary/route.ts`: topThemes.map에 `themeId: t.id` 추가
4. `get-theme-ranking.ts`: Zod에 limit/sort 추가, fetchApi에 쿼리 전달, CONTEXT 문자열 보강
5. `get-market-summary.ts`: CONTEXT에 themeId 안내 추가

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- E6: limit > 50 → 클램프
- 기존 호출 하위 호환 (파라미터 없으면 기본값)

## 6. Review Checklist
- [ ] Red/Green/Refactor 사이클 준수
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
