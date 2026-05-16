# T5: Rate-limit 공개 API 전수 적용

**PRD Ref**: PRD-security-hardening > US-3
**Priority**: P1
**Size**: **L (4-8h)** — 14 파일 수정, route별 regression 리스크 누적
**Status**: Todo
**Depends On**: T3, T4

---

## 1. Objective
T4 유틸을 PRD manifest대로 공개 API에 적용. `/api/cron/**`, `/api/admin/**` 는 제외 (자기 차단 방지). LLM/메일 경로는 엄격 정책.

## 2. Acceptance Criteria
- [ ] AC-1 (엄격 경로): `/api/ai/summary` — `checkRateLimit(req, 'strict')`
- [ ] AC-2 (표준 경로): `/api/tli/**` (모든 sub-route), `/api/stock/**`, `/api/openapi.json` — `checkRateLimit(req, 'standard')`
- [ ] AC-3: 초과 시 429 + `Retry-After: N` 헤더 + `{ error: "rate limit exceeded" }`
- [ ] AC-4 (제외): `/api/cron/**`, `/api/admin/**` 에서 `checkRateLimit` import되지 않음 (grep 단언)
- [ ] AC-5: 적용 route는 요청 시작 시점 (auth/validation 이전) rate-limit 체크

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `ai/summary 429 when rate-limit exceeds strict` | Integration | mock `checkRateLimit` false | 429 + Retry-After |
| 2 | `ai/summary 200 when rate-limit ok` | Integration | mock true | 200 |
| 3 | `tli/themes 429 when rate-limit exceeds standard` | Integration | mock false | 429 |
| 4 | `tli/themes 200 when rate-limit ok` | Integration | mock true | 200 |
| 5 | `stock/price 429 when limited` | Integration | mock false | 429 |
| 6 | `cron/send-newsletter does not call checkRateLimit` | Integration | spy | spy not called |
| 7 | `admin/mcp-stats does not call checkRateLimit` | Integration | spy | spy not called |
| 8 | `Retry-After header in 429 response` | Integration | mock `{ ok: false, retryAfter: 42 }` | header = `'42'` |
| 9 | `all public routes have checkRateLimit (grep 반전 검증)` | Unit (grep) | `app/api/{tli,stock,ai,openapi.json}` 하위 `.ts` 스캔 | 모두 포함 |
| 10 | `cron/admin routes do not use cookies() or request.cookies (CSRF invariant)` | Unit (grep) | `app/api/{cron,admin}` 스캔 | 미사용 |

### 3.2 Test File Location
- 각 route의 `__tests__/route.test.ts` (route마다 1~2 케이스 추가)
- 통합: `lib/rate-limit/__tests__/apply-audit.test.ts` — grep 기반 단언

### 3.3 Mock/Setup Required
- `vi.mock('@/lib/rate-limit/check-rate-limit')` — 전역
- 각 테스트별 return value override

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `app/api/ai/summary/route.ts` | Modify | strict rate-limit |
| `app/api/tli/themes/route.ts` | Modify | standard |
| `app/api/tli/themes/[id]/route.ts` | Modify | standard |
| `app/api/tli/themes/[id]/history/route.ts` | Modify | standard |
| `app/api/tli/changes/route.ts` | Modify | standard |
| `app/api/tli/compare/route.ts` | Modify | standard |
| `app/api/tli/methodology/route.ts` | Modify | standard |
| `app/api/tli/predictions/route.ts` | Modify | standard |
| `app/api/tli/scores/ranking/route.ts` | Modify | standard |
| `app/api/tli/stocks/search/route.ts` | Modify | standard |
| `app/api/tli/stocks/[symbol]/theme/route.ts` | Modify | standard |
| `app/api/stock/price/route.ts` | Modify | standard |
| `app/api/stock/daily-close/route.ts` | Modify | standard |
| `app/api/openapi.json/route.ts` | Modify | standard |
| `lib/rate-limit/__tests__/apply-audit.test.ts` | Create | grep-based audit |

### 4.2 Implementation Steps (Green Phase)
1. 각 public route 상단에:
   ```
   const result = await checkRateLimit(request, 'strict' | 'standard');
   if (!result.ok) return NextResponse.json({error:'rate limit exceeded'}, {status: 429, headers: {'Retry-After': String(result.retryAfter ?? 60)}});
   ```
2. `/api/cron/**`, `/api/admin/**` 에는 추가하지 않음
3. `apply-audit.test.ts`: `fs.readdirSync` + `fs.readFileSync`로 `app/api/cron` 과 `app/api/admin` 하위 .ts 파일에 `checkRateLimit` 문자열이 없음을 단언

### 4.3 Refactor Phase
- **`withRateLimit(handler, policy)` 래퍼 도입 권고** (BOOMER-M 지적): 13곳 3줄 복붙은 유지보수성 저하
- conventions.md #7 "API Route 공유 auth 추상화 금지" 인접하나 "rate-limit은 auth가 아님" 경계로 예외 정당
- DECISION_LOG 기록: 경계는 "rate-limit 유틸 호출 + 429 응답 생성"까지. 비즈니스 로직/인증은 래퍼 밖
- spy/mock 용이성 유지 (`vi.mock('@/lib/rate-limit/with-rate-limit')`)

## 5. Edge Cases
- EC-1: `/api/tli/themes/[id]/history` 같은 dynamic route — 동일 policy 적용 OK
- EC-2: `next build` 시 Edge Runtime compat — `check-rate-limit` 이 node.js crypto 사용하므로 Node.js runtime 강제 (`export const runtime = 'nodejs'` 기본값)
- EC-3: 새 route 추가 시 audit 테스트가 탐지 안 함 → PR 체크리스트에 명시

## 6. Review Checklist
- [ ] Red: 8 테스트 FAILED
- [ ] Green: 8 테스트 PASSED + 기존 route 테스트 regression 없음
- [ ] grep audit test 제외 경로 정확히 검출
- [ ] Retry-After 헤더 값이 정수 string
- [ ] middleware.ts의 MCP analytics와 중복 실행 없음 (middleware는 analytics만, route는 rate-limit만)
