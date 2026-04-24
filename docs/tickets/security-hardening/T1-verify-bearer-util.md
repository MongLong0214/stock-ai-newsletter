# T1: `lib/auth/verify-bearer.ts` 공유 Bearer 검증 유틸

**PRD Ref**: PRD-security-hardening > US-1, US-2
**Priority**: P0 (Blocker)
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective
`send-recommendations` / `admin/mcp-stats` / `admin/tli/comparison-v4/promote` 3개 route에 중복 존재하는 timingSafeEqual 로직을 **단일 함수**로 추출. 신규 `send-newsletter` fail-closed 구현의 기반.

## 2. Acceptance Criteria
- [ ] AC-1: `verifyBearerToken(request: NextRequest, secret: string | undefined): boolean` 1개 함수만 export
- [ ] AC-2: `secret` 이 undefined/빈 문자열이면 **항상 false** (fail-closed)
- [ ] AC-3: `Authorization` 헤더 부재 시 false
- [ ] AC-4: 내부에서 `crypto.timingSafeEqual` 호출 (동일 길이 버퍼로 padding 후 비교)
- [ ] AC-5: 3개 기존 route가 신규 유틸을 import하도록 refactor (동작 동일 유지)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `returns false when secret is undefined` | Unit | fail-closed 보장 | `false` |
| 2 | `returns false when secret is empty string` | Unit | ENV 빈 값 | `false` |
| 3 | `returns false when Authorization header missing` | Unit | 헤더 부재 | `false` |
| 4 | `returns false when Authorization prefix is not Bearer` | Unit | `Basic xxx` 등 | `false` |
| 5 | `returns false with wrong token (same length)` | Unit | 길이 동일 오값 | `false` |
| 6 | `returns false with wrong token (different length)` | Unit | 길이 다른 오값 (timing-safe padding) | `false` |
| 7 | `returns true with correct bearer token` | Unit | 정상 | `true` |
| 8 | `calls crypto.timingSafeEqual exactly once` | Unit | `vi.spyOn(nodeCrypto, 'timingSafeEqual')` — **Green Phase 이후 실행** (Red 단계는 모듈 import 실패로 무의미) | spy called 1회 |

### 3.2 Test File Location
- `lib/auth/__tests__/verify-bearer.test.ts`

### 3.3 Mock/Setup Required
- Vitest: `vi.spyOn(crypto, 'timingSafeEqual')`
- `NextRequest` 생성: `new Request('http://x', { headers: { Authorization: 'Bearer ...' } })`

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/auth/verify-bearer.ts` | Create | 공유 유틸 |
| `lib/auth/__tests__/verify-bearer.test.ts` | Create | 8 테스트 케이스 |
| `app/api/cron/send-recommendations/route.ts` | Modify | 로컬 `verifyBearerToken` 제거, import로 교체 |
| `app/api/admin/mcp-stats/route.ts` | Modify | 로컬 비교 로직 제거, import로 교체 |
| `app/api/admin/tli/comparison-v4/promote/route.ts` | Modify | 로컬 비교 로직 제거, import로 교체 |

### 4.2 Implementation Steps (Green Phase)
1. `lib/auth/verify-bearer.ts` 작성:
   - import `{ timingSafeEqual } from 'node:crypto'`
   - `Authorization` 헤더 파싱 (`Bearer ` prefix)
   - secret/token Buffer 동일 길이 padding 후 timingSafeEqual
   - 길이 불일치도 timing-safe하게 처리 (padding 후 비교 + 길이 체크 AND)
2. 3개 route의 기존 로컬 함수 삭제, import 교체
3. 테스트 실행 → PASSED 확인

### 4.3 Refactor Phase
- JSDoc 1줄 추가 (함수 목적만)
- 매직 스트링 `'Bearer '` 상수화 (같은 파일 내)

## 5. Edge Cases
- EC-1: secret이 매우 긴 경우 (>1KB) → 동일하게 동작
- EC-2: 토큰에 non-ASCII 문자 포함 → Buffer.from 'utf8' 유지
- EC-3: Authorization 헤더가 `Bearer` 만 있고 token 없음 → false

## 6. Review Checklist
- [ ] Red: 8개 테스트 FAILED 확인
- [ ] Green: 8개 테스트 PASSED
- [ ] Refactor: PASSED 유지
- [ ] 기존 3개 route 동작 동일 (기존 테스트 있으면 통과)
- [ ] conventions.md #7 예외 기록 (PRD §4.4 경계 준수)
