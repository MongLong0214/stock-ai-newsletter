# T7: 도구 통합 (search_stocks ← get_stock_theme) + 빈 결과 가이던스

**PRD Ref**: PRD-mcp-production-ready > US-6, US-1 (AC-1.5)
**Priority**: P2 (Medium)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T2, T4, T5, T6

---

## 1. Objective
search_stocks에 get_stock_theme 기능 흡수. 6자리 코드 입력 시 자동 stock-to-theme 상세 조회. 모든 기존 도구에 빈 결과 가이던스 적용.

## 2. Acceptance Criteria
- [ ] AC-1: `search_stocks` 6자리 코드 입력 → stock-to-theme 상세 조회 (기존 get_stock_theme 동작 포함)
- [ ] AC-2: `get_stock_theme` 도구 유지 (하위 호환) — 내부적으로 search_stocks 위임
- [ ] AC-3: `search_stocks` description에 통합 기능 안내 ("종목 검색 + 코드로 테마 조회")
- [ ] AC-4: 모든 도구의 빈 결과(검색 0건, stage 0건, 종목 미발견)에 가이던스 메시지
- [ ] AC-5: `get_stock_theme` deprecated 로그 (stderr에 1회)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `search_stocks with 6-digit code returns theme detail` | Unit | query="005930" | stock-to-theme 결과 |
| 2 | `search_stocks with name returns search results` | Unit | query="삼성전자" | 검색 결과 |
| 3 | `get_stock_theme delegates to search_stocks` | Unit | symbol="005930" | 동일 결과 |
| 4 | `empty search results include guidance` | Unit | query="xyznonexist" | 가이던스 포함 |
| 5 | `empty ranking stage includes guidance` | Unit | stage="reigniting" (0건) | 가이던스 포함 |
| 6 | `empty stock theme includes guidance` | Unit | symbol="999999" | 가이던스 포함 |

### 3.2 Test File Location
- `mcp/src/__tests__/tools-search-stocks.test.ts`
- `mcp/src/__tests__/tools-guidance.test.ts`

### 3.3 Mock/Setup Required
- Vitest: fetchApi mock

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `mcp/src/tools/search-stocks.ts` | Modify | 6자리 분기 로직 + 빈 결과 가이던스 |
| `mcp/src/tools/get-stock-theme.ts` | Modify | search_stocks 위임 + deprecated 로그 |
| `mcp/src/tools/get-theme-ranking.ts` | Modify | 빈 결과 가이던스 |
| `mcp/src/tools/search-themes.ts` | Modify | 빈 결과 가이던스 |
| `mcp/src/tools/get-theme-detail.ts` | Modify | 빈 결과 가이던스 |
| `mcp/src/tools/get-theme-history.ts` | Modify | 빈 결과 가이던스 |

### 4.2 Implementation Steps (Green Phase)
1. `search-stocks.ts`: query 정규식 `/^\d{6}$/` 매치 시 fetchApi(`/api/tli/stocks/${query}/theme`) + fetchApi(`/api/tli/stocks/search`, { q: query }) 병렬 → 통합 결과
2. `get-stock-theme.ts`: handler 내부에서 search_stocks의 fetchApi 로직 재사용, stderr에 deprecated 경고 1회
3. 모든 도구: fetchApi 결과 검사 → 빈 배열/null 시 formatEmptyResult(context, guidance) 사용 (T2에서 구현한 헬퍼)

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- E2: 빈 검색 결과 + 가이던스
- E3: stage 0건 + 가이던스

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
