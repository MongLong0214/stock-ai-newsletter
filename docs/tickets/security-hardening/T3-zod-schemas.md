# T3: Zod 스키마 (admin/promote + stocks/search)

**PRD Ref**: PRD-security-hardening > US-2
**Priority**: P1
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: T1 (promote 파일 공유 수정, T1 머지 이후 진행)

---

## 1. Objective
2개 route에 Zod body/query 검증 추가. 악성 입력이 RPC/DB까지 도달하지 못하도록 차단 + log injection 방어.

## 2. Acceptance Criteria
- [ ] AC-1 (`admin/promote`):
  - `runIds`: `z.array(z.string().uuid()).min(1).max(50)`
  - `productionVersion`, `calibrationVersion`, `driftVersion`, `weightVersion`: `z.string().min(1).max(64)`
  - 검증 실패 시 422 + `{ error: "invalid request" }` (상세 내부 메시지 비노출)
- [ ] AC-2 (`stocks/search`):
  - `q`: `z.string().min(1).max(100).regex(/^[^\r\n\t\0]+$/)`
  - 검증 실패 시 422 + `{ error: "invalid query" }`
- [ ] AC-3: 기존 정상 호출 동작 변경 없음

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `promote 422 when runIds is empty` | Integration | `runIds: []` | 422 |
| 2 | `promote 422 when runIds exceeds 50` | Integration | `runIds: Array(51)` | 422 |
| 3 | `promote 422 when runIds contains non-UUID` | Integration | `runIds: ['abc']` | 422 |
| 4 | `promote 422 when version exceeds 64 chars` | Integration | `productionVersion: 'x'.repeat(65)` | 422 |
| 5 | `promote 200 with valid payload` | Integration | 정상 | 200 |
| 6 | `search 422 when q exceeds 100 chars` | Integration | `q='x'.repeat(101)` | 422 |
| 7 | `search 422 when q contains CRLF` | Integration | `q='foo\r\nbar'` | 422 |
| 8 | `search 422 when q contains tab/null` | Integration | `q='foo\tbar'` | 422 |
| 9 | `search 200 with valid q` | Integration | `q='삼성'` | 200 |
| 10 | `search 200 with SQL wildcard (escapeIlike spy 호출 확인)` | Integration | `q='%test_'` + `vi.spyOn(escapeIlike)` | 200, spy called |
| 11 | `Zod version compatible (v3/v4)` | Unit | `z.string().uuid()` 또는 `z.uuid()` 둘 중 현재 버전 동작 | 스키마 parse 성공 |

### 3.2 Test File Location
- `app/api/admin/tli/comparison-v4/promote/__tests__/route.test.ts`
- `app/api/tli/stocks/search/__tests__/route.test.ts`

### 3.3 Mock/Setup Required
- `vi.mock('@/lib/supabase/server-client')` — RPC/쿼리 mock
- ADMIN_SECRET 환경변수 set

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/admin/tli/comparison-v4/promote/route.ts` | Modify | Zod 스키마 + safeParse 추가 |
| `app/api/tli/stocks/search/route.ts` | Modify | q Zod 검증 |
| `app/api/admin/tli/comparison-v4/promote/__tests__/route.test.ts` | Create | 5 테스트 |
| `app/api/tli/stocks/search/__tests__/route.test.ts` | Create | 5 테스트 |

### 4.2 Implementation Steps (Green Phase)
0. `pnpm list zod` → v3.x vs v4.x 확인. v4면 `z.uuid()`, v3면 `z.string().uuid()` 선택
1. `promote/route.ts`: 인라인 Zod 스키마 정의 → `safeParse(await request.json())` → `!success` 시 422
2. `stocks/search/route.ts`: `QuerySchema.safeParse({ q: searchParams.get('q') })` → 422 on fail
3. 422 응답 body는 `{ error: "invalid request" }` 또는 `{ error: "invalid query" }` 만 반환

### 4.3 Refactor Phase
- Zod v4 syntax (`z.uuid()`, `z.email()` 등 직접 helper) 활용 가능 시 채택

## 5. Edge Cases
- EC-1: `q` 에 유니코드 이모지 → regex `[^\r\n\t\0]` 통과 ✅
- EC-2: `runIds`에 중복 UUID → 허용 (RPC 내부에서 dedupe 가정)
- EC-3: ADMIN_SECRET 없이 호출 → 기존 401 로직 먼저 (Zod는 인증 후)

## 6. Review Checklist
- [ ] Red: 10 테스트 FAILED
- [ ] Green: 10 테스트 PASSED
- [ ] 422 응답 body에 Zod issue 디테일 비노출 (내부 스키마 누출 방지)
- [ ] 기존 인증 로직 순서 유지 (auth → validation)
