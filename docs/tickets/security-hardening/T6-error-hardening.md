# T6: 에러 응답 하드닝

**PRD Ref**: PRD-security-hardening > US-5
**Priority**: P2
**Size**: S (< 1h)
**Status**: Todo
**Depends On**: T1 (send-recommendations 파일 공유)

---

## 1. Objective
3개 위치에서 내부 에러 정보 외부 노출 제거:
1. `send-recommendations/route.ts:129-137` — 500 응답 `details` 필드 제거
2. `stock/price/route.ts:112-132` — 비-production 조건부 error name/message 노출 제거
3. `lib/supabase/server-client.ts:46-48` — service_role 사용 여부 console.log 제거

## 2. Acceptance Criteria
- [ ] AC-1: `send-recommendations` 500 응답 body는 `{ error: "Internal server error" }` 만 (details 필드 삭제)
- [ ] AC-2: `stock/price` 500 응답 body는 `{ success: false, error: "Failed to fetch price" }` 만. `NODE_ENV` 분기 제거
- [ ] AC-3: `server-client.ts` "service_role 키 사용" 계열 console.log 제거
- [ ] AC-4: 서버 로그(`console.error`)에는 기존 상세 정보 유지 (디버깅 가능)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `send-recommendations 500 body has no details field` | Integration | force throw in handler | body keys = ['error'] |
| 2 | `stock/price 500 body has no stack/name` | Integration | force throw | body keys ⊆ ['success', 'error'] |
| 3 | `stock/price 500 body identical in production and preview` | Integration | NODE_ENV 변화 | body 동일 |
| 4 | `server-client creates without service_role log` | Unit | `vi.spyOn(console, 'log')` | not called with 'service_role' |

### 3.2 Test File Location
- `app/api/cron/send-recommendations/__tests__/route.test.ts` (추가)
- `app/api/stock/price/__tests__/route.test.ts`
- `lib/supabase/__tests__/server-client.test.ts`

### 3.3 Mock/Setup Required
- `vi.mock('@/lib/supabase/server-client')` 로 에러 강제 유발
- `process.env.NODE_ENV` 테스트별 override

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/cron/send-recommendations/route.ts` | Modify | `details` 필드 제거 |
| `app/api/stock/price/route.ts` | Modify | NODE_ENV 분기 제거, 단일 응답 |
| `lib/supabase/server-client.ts` | Modify | console.log 제거 |
| 3개 테스트 파일 | Create/Modify | 위 4 케이스 |

### 4.2 Implementation Steps (Green Phase)
1. `send-recommendations/route.ts:129-137`에서 `details` 필드 삭제 (서버 로그 `console.error(error)` 유지)
2. `stock/price/route.ts:112-132`의 `isProduction` 분기 제거 → `{ success: false, error: 'Failed to fetch price' }` 반환
3. `server-client.ts:46-48` `console.log('[Supabase] 클라이언트 초기화: service_role 키 사용')` 제거

### 4.3 Refactor Phase
- 없음 (최소 변경)

## 5. Edge Cases
- EC-1: 내부 에러 로깅은 `console.error(err)` 유지 → Vercel Logs에서 디버깅 가능
- EC-2: Sentry/DataDog 같은 중앙 로깅 통합은 scope out (별도 작업)

## 6. Review Checklist
- [ ] Red: 4 테스트 FAILED
- [ ] Green: 4 테스트 PASSED
- [ ] 서버 로그에는 원본 에러 보존
- [ ] 클라이언트 응답에 stack trace 없음 (수동 확인: 일부러 throw 유발 후 응답 JSON 구조 확인)
