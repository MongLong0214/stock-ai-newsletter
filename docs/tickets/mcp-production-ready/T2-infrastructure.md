# T2: MCP 인프라 개선 (TTL 캐시 + Zod 응답 검증 + 패키지 메타)

**PRD Ref**: PRD-mcp-production-ready > US-1 (AC-1.5~1.8), US-2 (AC-2.6)
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T1

---

## 1. Objective
MCP 서버 인프라 3가지: TTL 인메모리 캐시, fetchApi Zod 응답 검증, 패키지 메타데이터(smithery pin, repository).

## 2. Acceptance Criteria
- [ ] AC-1: TTL 캐시 — 동일 URL 1시간 내 재호출 시 캐시 응답 반환, 최대 50개 엔트리
- [ ] AC-2: fetchApi에 선택적 Zod 스키마 파라미터 — 전달 시 파싱, 실패 시 명확한 에러
- [ ] AC-3: 빈 결과([] 또는 undefined)에 가이던스 메시지 포함하는 헬퍼 함수
- [ ] AC-4: smithery.yaml 버전 핀 (`stockmatrix-mcp@0.4.0` — 릴리즈 버전에 맞춤)
- [ ] AC-5: package.json `repository` 필드 추가

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `cache returns cached value within TTL` | Unit | 1시간 내 동일 키 | 캐시 히트 |
| 2 | `cache returns fresh value after TTL expires` | Unit | TTL 만료 후 | 캐시 미스 |
| 3 | `cache evicts oldest entry when max size reached` | Unit | 51번째 엔트리 | 첫 번째 제거 |
| 4 | `fetchApi validates response with Zod schema` | Unit | 유효 응답 | 파싱 성공 |
| 5 | `fetchApi throws on Zod validation failure` | Unit | 필드 누락 | ZodError |
| 6 | `fetchApi works without schema (backward compat)` | Unit | 스키마 미전달 | 기존 동작 |
| 7 | `formatEmptyResult includes guidance message` | Unit | 빈 배열 + context | 가이던스 포함 |

### 3.2 Test File Location
- `mcp/src/__tests__/cache.test.ts`
- `mcp/src/__tests__/fetch-helper.test.ts`

### 3.3 Mock/Setup Required
- Vitest: `vi.useFakeTimers()` (TTL 테스트), `vi.fn()` (fetch mock)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `mcp/src/cache.ts` | Create | TTL 인메모리 캐시 (Map + setTimeout, 50개 상한) |
| `mcp/src/fetch-helper.ts` | Modify | Zod 스키마 파라미터 추가, formatEmptyResult 헬퍼 |
| `mcp/smithery.yaml` | Modify | startCommand에 버전 핀 |
| `mcp/package.json` | Modify | repository 필드 추가 |

### 4.2 Implementation Steps (Green Phase)
1. `cache.ts` 구현: `get(key)`, `set(key, value, ttlMs)`, 자동 만료, 50개 상한 시 oldest 제거
2. `fetch-helper.ts`에 `fetchApi<T>(path, params?, schema?: ZodType<T>)` 시그니처 확장
3. Zod 파싱: `schema.parse(data)` → 실패 시 `Error("API response validation failed: ...")`
4. `formatEmptyResult(context, guidance)` 헬퍼 추가
5. smithery.yaml: `startCommand: npx -y stockmatrix-mcp@0.4.0`
6. package.json: `"repository": { "type": "git", "url": "https://github.com/MongLong0214/stock-ai-newsletter", "directory": "mcp" }`

### 4.3 Refactor Phase
- 없음

## 5. Edge Cases
- E8: 캐시 메모리 누수 → 50개 상한 + 자동 만료
- E9: 동시 tool 호출 → 동일 키 중복 fetch 허용

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
