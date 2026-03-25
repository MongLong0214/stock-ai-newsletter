# T1: MCP 버그 수정 (limitations spread + ESM guard + query limits)

**PRD Ref**: PRD-mcp-production-ready > US-1 (AC-1.1~1.4)
**Priority**: P0 (Blocker)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective
P0/P1 버그 4건 수정: methodology limitations 배열 spread, ESM guard(cli.ts 분리), stocks/search 무제한 쿼리, themes/route limit(1000) 절단.

## 2. Acceptance Criteria
- [ ] AC-1: `get_methodology` section=limitations 요청 시 `{ section: "limitations", items: [...] }` 형태 반환
- [ ] AC-2: `index.ts`에서 `createServer`/`createSandboxServer`만 export. `main()` 호출은 `cli.ts`에서만
- [ ] AC-3: `package.json` bin → `dist/cli.js`, main → `dist/index.js`
- [ ] AC-4: `stocks/search/route.ts`의 lifecycle_scores 쿼리에 `.gte('calculated_at', sevenDaysAgo).limit(themeIds.length * 2)` 적용
- [ ] AC-5: `themes/route.ts`의 lifecycle_scores 쿼리 `.limit(chunk.length * 7)` (7일분 충분)
- [ ] AC-6: ilike 쿼리의 SQL 와일드카드(`%`, `_`) 이스케이프 (stocks/search + themes/route 일괄)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `methodology returns items array for limitations section` | Unit | section=limitations 요청 시 응답 형태 검증 | `{ section: "limitations", items: Array }` |
| 2 | `methodology returns object for scoring section` | Unit | section=scoring 요청 시 기존 동작 유지 | `{ section: "scoring", range: "0-100", ... }` |
| 3 | `index.ts does not export main` | Unit | index.ts에서 main이 노출되지 않음 | `main` not in exports |
| 4 | `createSandboxServer returns McpServer` | Unit | createSandboxServer 호출 성공 | McpServer instance |
| 5 | `cli.ts calls main on import` | Integration | cli.ts 모듈 평가 시 main 실행 (StdioServerTransport + McpServer.connect mock 후) | main() called |
| 6 | `escapeIlike escapes % and _` | Unit | 와일드카드 이스케이프 함수 | `"100\%"`, `"a\_b"` |
| 7 | `stocks/search scores query has date filter and limit` | Unit | Supabase query builder mock 검증 | `.gte('calculated_at', ...)` + `.limit(...)` 호출 |
| 8 | `themes/route scores query limit is chunk-proportional` | Unit | Supabase query builder mock 검증 | `.limit(chunk.length * 7)` 호출 |

### 3.2 Test File Location
- `mcp/src/__tests__/methodology.test.ts`
- `mcp/src/__tests__/index.test.ts`
- `lib/tli/api-utils.test.ts` (co-located with utility)

### 3.3 Mock/Setup Required
- Vitest: `vi.mock()` for fetchApi (methodology 테스트)
- `createSandboxServer` 직접 import (ESM guard 테스트)
- cli.ts 테스트: `vi.mock('@modelcontextprotocol/sdk/server/stdio.js')` + `vi.mock('@modelcontextprotocol/sdk/server/mcp.js')` — StdioServerTransport와 McpServer.connect mock 후 import
- Supabase query builder mock: `vi.mock('@/lib/supabase')` → 체이닝 메서드 spy 검증

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `mcp/src/tools/get-methodology.ts` | Modify | 배열 케이스 핸들링 추가 |
| `mcp/src/index.ts` | Modify | main() 호출 제거, export만 유지 |
| `mcp/src/cli.ts` | Create | main() 실행 엔트리포인트 |
| `mcp/package.json` | Modify | bin → dist/cli.js |
| `app/api/tli/stocks/search/route.ts` | Modify | scores 쿼리 limit + 날짜 필터 |
| `app/api/tli/themes/route.ts` | Modify | scores 쿼리 limit 개선 |
| `lib/tli/api-utils.ts` | Modify | `escapeIlike` 유틸 함수 추가 |

### 4.2 Implementation Steps (Green Phase)
1. `get-methodology.ts`: `Array.isArray(sectionData)` 분기 추가 → `{ items: sectionData }`
2. `cli.ts` 생성: `#!/usr/bin/env node` + `import { createServer }` + `main()` 호출
3. `index.ts` 수정: `main()` 호출 + `const server` 제거, `createServer`/`createSandboxServer` export만 유지
4. `package.json` bin → `dist/cli.js`
5. `escapeIlike` 유틸 추가: `str.replace(/%/g, '\\%').replace(/_/g, '\\_')`
6. stocks/search/route.ts: scores 쿼리에 날짜 필터 + limit 추가
7. themes/route.ts: limit(1000) → limit(chunk.length * 7)

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- E12: ilike 와일드카드 이스케이프
- methodology section=all 은 기존 동작 유지 (전체 객체 반환)

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
