# T3a: methodology API 엔드포인트 + MCP 전환

**PRD Ref**: PRD-mcp-production-ready > US-7
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T1, T2

---

## 1. Objective
methodology 데이터를 API 엔드포인트로 이전. MCP 도구는 API fetch + 최소 fallback.

## 2. Acceptance Criteria
- [ ] AC-1: `GET /api/tli/methodology` — 전체 methodology 반환 (기본)
- [ ] AC-2: `?section=scoring` — 섹션별 필터링 동작
- [ ] AC-3: 캐시 preset `long` (1시간)
- [ ] AC-4: MCP `get_methodology`가 `fetchApi('/api/tli/methodology')` 호출로 전환
- [ ] AC-5: API 다운 시 최소 fallback 반환: `{ fallback: true, scoring: { range: "0-100", components: [4개 이름+가중치] } }` + "상세는 잠시 후 재시도" 안내
- [ ] AC-6: `get-methodology.ts`에서 전체 METHODOLOGY 객체 제거, `METHODOLOGY_FALLBACK` 최소 상수만 유지

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `methodology API returns full data by default` | Integration | 파라미터 없음 | 전체 methodology |
| 2 | `methodology API returns scoring section` | Integration | ?section=scoring | scoring 객체 |
| 3 | `methodology API returns limitations as items array` | Integration | ?section=limitations | `{ items: [...] }` |
| 4 | `MCP get_methodology fetches from API` | Unit | 정상 호출 | fetchApi('/api/tli/methodology') |
| 5 | `MCP get_methodology returns fallback on API error` | Unit | fetchApi 실패 | METHODOLOGY_FALLBACK + 안내 |
| 6 | `MCP get_methodology passes section param` | Unit | section=scoring | fetchApi 쿼리에 section 포함 |

### 3.2 Test File Location
- `app/api/tli/methodology/route.test.ts` (co-located)
- `mcp/src/__tests__/tools-methodology.test.ts`

### 3.3 Mock/Setup Required
- Vitest: `vi.mock('../fetch-helper.js')` (MCP 도구 테스트)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/tli/methodology/route.ts` | Create | METHODOLOGY 객체 이동 + section 필터링 + apiSuccess(long) |
| `mcp/src/tools/get-methodology.ts` | Modify | API fetch 전환, METHODOLOGY → METHODOLOGY_FALLBACK 최소 상수 |

### 4.2 Implementation Steps (Green Phase)
1. `app/api/tli/methodology/route.ts`: METHODOLOGY 객체를 MCP에서 복사 → GET handler + section 파라미터 + 배열 케이스 핸들링 + `apiSuccess(data, undefined, 'long')`
2. `get-methodology.ts`: fetchApi 호출 + try/catch → 실패 시 METHODOLOGY_FALLBACK 반환. 전체 METHODOLOGY 객체 제거. METHODOLOGY_FALLBACK = `{ name: "TLI", scoring: { range: "0-100", components: [{name,weight} x4] }, disclaimer: "..." }`

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- E7: API 다운 → 최소 fallback (드리프트 최소화)

## 6. Review Checklist
- [ ] Red/Green/Refactor 사이클 준수
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
