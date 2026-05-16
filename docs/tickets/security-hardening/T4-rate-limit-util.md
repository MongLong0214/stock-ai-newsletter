# T4: `lib/rate-limit/` 유틸 (Upstash + in-memory fallback)

**PRD Ref**: PRD-security-hardening > US-3
**Priority**: P1
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective
Next.js serverless 환경에서 공개 API rate-limit 유틸 제공. Upstash Redis 기반 + in-memory LRU 보조 + fail-closed(엄격) / fail-open+LRU(표준) 정책 구현.

## 2. Acceptance Criteria
- [ ] AC-1: `checkRateLimit(req: NextRequest, policy: 'strict' | 'standard'): Promise<{ ok: boolean; retryAfter?: number }>` API 제공
- [ ] AC-2: Upstash ENV (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) 미설정 시 개발 모드로 간주, rate-limit 비활성화 + warn 로그 1회
- [ ] AC-3: `IP_HASH_SALT` 미설정 시 rate-limit 비활성화 (dev 전용)
- [ ] AC-4: `strict` policy: 10 req/min/IP. Upstash 장애 시 503 (fail-closed)
- [ ] AC-5: `standard` policy: 60 req/min/IP. Upstash 장애 시 in-memory LRU 100/min 하드캡으로 fail-soft
- [ ] AC-6: IP 추출: `x-forwarded-for` 첫 토큰 (Vercel 신뢰 프록시). 없으면 `unknown` 문자열 + SHA-256 hash
- [ ] AC-7: 레이트 한도는 ENV override 가능 (`RATE_LIMIT_STRICT_PER_MIN`, `RATE_LIMIT_STANDARD_PER_MIN`)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `returns ok=true when Upstash ENV is missing (dev)` | Unit | 비활성 | `{ ok: true }` |
| 2 | `returns ok=true when IP_HASH_SALT is missing` | Unit | 비활성 | `{ ok: true }` |
| 3 | `strict: ok=true under 10 req/min` | Unit | Upstash mock | `{ ok: true }` |
| 4 | `strict: ok=false at 11th request` | Unit | mock Ratelimit.limit() | `{ ok: false, retryAfter }` |
| 5 | `strict: fail-closed when Upstash throws` | Unit | mock throw | `{ ok: false, retryAfter }` |
| 6 | `standard: ok=true under 60 req/min` | Unit | mock | `{ ok: true }` |
| 7 | `standard: fail-soft to LRU when Upstash throws` | Unit | mock throw | LRU 카운터로 판정 |
| 8 | `standard: LRU hard cap 100/min` | Unit | `vi.useFakeTimers()` + 101회 증가 (시계 고정) | `{ ok: false }` |
| 8b | `LRU memory bound: map.size <= 1000 after 2000 unique IPs` | Unit | 2000 IP 주입 후 Map size | `<= 1000` |
| 9 | `IP is hashed with SHA-256 and salt` | Unit | hash 예측값 비교 | 예측 hex |
| 10 | `ENV override: RATE_LIMIT_STRICT_PER_MIN=5` | Unit | 5 req 이후 실패 | `{ ok: false }` |

### 3.2 Test File Location
- `lib/rate-limit/__tests__/check-rate-limit.test.ts`

### 3.3 Mock/Setup Required
- `vi.mock('@upstash/ratelimit')` — `Ratelimit` 클래스 factory mock
- `vi.mock('@upstash/redis')` — `Redis.fromEnv()` stub
- 의존성 주입 패턴: `checkRateLimit(req, policy, deps?)` 에서 `deps.ratelimit` 테스트 주입 가능

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/rate-limit/check-rate-limit.ts` | Create | 핵심 유틸 |
| `lib/rate-limit/lru.ts` | Create | 단순 sliding window LRU |
| `lib/rate-limit/__tests__/check-rate-limit.test.ts` | Create | 10 테스트 |
| `package.json` | Modify | `@upstash/ratelimit` + `@upstash/redis` 추가 |

### 4.2 Implementation Steps (Green Phase)
1. `pnpm add @upstash/ratelimit @upstash/redis`
2. `lib/rate-limit/lru.ts`: 60s sliding window, 최대 1000 키 (메모리 상한)
3. `lib/rate-limit/check-rate-limit.ts`:
   - Upstash `Ratelimit` 인스턴스 lazy init
   - `policy === 'strict'` → Upstash만, throw 시 fail-closed
   - `policy === 'standard'` → Upstash 성공 → 허용, Upstash throw → LRU 판정
   - IP 추출 + hash: `crypto.createHash('sha256').update(ip + salt).digest('hex').slice(0, 32)`
4. `Retry-After` 계산: Upstash `reset - Date.now()` 초 변환

### 4.3 Refactor Phase
- Upstash init을 싱글톤으로 캐시 (cold start 비용 감소)
- LRU expiry 정리 interval 대신 lazy cleanup (메모리 관리)

## 5. Edge Cases
- EC-1: `x-forwarded-for` 가 `a, b, c` 형태 (다중 프록시) → 첫 토큰만 신뢰 (Vercel 표준)
- EC-2: `x-forwarded-for` 누락 → `'unknown'` 사용 (IP 공유 취급)
- EC-3: Upstash 응답 형식 변경 → 안전한 optional chaining
- EC-4: 동일 IP 대량 요청 (10 req/s) 시 Upstash rate-limit 자체가 계산 — retry 루프 없음

## 6. Review Checklist
- [ ] Red: 10 테스트 FAILED
- [ ] Green: 10 테스트 PASSED
- [ ] Upstash SDK 버전은 package.json 확인 (latest stable)
- [ ] IP hash 결정론적 (같은 입력 → 같은 출력)
- [ ] fail-closed/fail-soft 분기가 명확 (정책별 다른 동작)
