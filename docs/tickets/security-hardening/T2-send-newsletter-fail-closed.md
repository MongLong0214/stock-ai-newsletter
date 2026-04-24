# T2: `send-newsletter` fail-closed + timingSafeEqual

**PRD Ref**: PRD-security-hardening > US-1
**Priority**: P0 (Blocker)
**Size**: S (< 1h)
**Status**: Todo
**Depends On**: T1

---

## 1. Objective
`app/api/cron/send-newsletter/route.ts:17-21` 의 fail-open 인증 버그를 fail-closed + timingSafeEqual로 교체. PUBLIC repo + 유출된 CRON_SECRET 상태에서 누구나 뉴스레터 발송 트리거 가능한 리스크 해소.

## 2. Acceptance Criteria
- [ ] AC-1: `CRON_SECRET` 미설정 시 401 반환 (fail-closed)
- [ ] AC-2: 틀린 bearer 시 401
- [ ] AC-3: 정상 bearer 시 200 (기존 로직 유지)
- [ ] AC-4: T1의 `verifyBearerToken` 임포트 사용 (중복 코드 제거)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `returns 401 when CRON_SECRET is undefined` | Integration | fail-closed | status 401 |
| 2 | `returns 401 when Authorization header missing` | Integration | | 401 |
| 3 | `returns 401 with wrong bearer` | Integration | | 401 |
| 4 | `returns 200 with correct bearer` | Integration | mock downstream | 200 |
| 5 | `returns 401 when CRON_SECRET is whitespace only` | Integration | `"  "` | 401 |

### 3.2 Test File Location
- `app/api/cron/send-newsletter/__tests__/route.test.ts`

### 3.3 Mock/Setup Required
- `vi.mock('@/lib/supabase/server-client')` — Supabase 클라이언트 mock
- downstream Gemini / SendGrid mock (아예 ENV 비워두고 early branch)
- `process.env.CRON_SECRET` 각 테스트별 set/unset

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/cron/send-newsletter/route.ts` | Modify | 인증 블록 교체 |
| `app/api/cron/send-newsletter/__tests__/route.test.ts` | Create | 4 테스트 |

### 4.2 Implementation Steps (Green Phase)
1. `app/api/cron/send-newsletter/route.ts:17-21` 제거
2. `import { verifyBearerToken } from '@/lib/auth/verify-bearer'` 추가
3. `if (!verifyBearerToken(request, process.env.CRON_SECRET)) return NextResponse.json({error: 'Unauthorized'}, {status: 401})`
4. 기존 분기 로직 유지

### 4.3 Refactor Phase
- 에러 응답 메시지 표준화 (T6과 중복 회피 — T6 범위에서 처리)

## 5. Edge Cases
- EC-1: `CRON_SECRET` 이 whitespace만 (`"  "`) — `verifyBearerToken`에서 빈 문자열로 간주 → 401
- EC-2: 현재 `/api/cron/send-newsletter`가 dead code일 가능성 (OQ-3 분석) → 동작 변경해도 프로덕션 영향 없음을 Phase 7에서 최종 확인

## 6. Review Checklist
- [ ] Red: 4 테스트 FAILED
- [ ] Green: 4 테스트 PASSED
- [ ] Refactor: PASSED 유지
- [ ] `send-recommendations`와 동일 인증 패턴 유지 (일관성)
- [ ] curl manual test: 구 CRON_SECRET으로 401 확인 (Phase 7에서 수행)
