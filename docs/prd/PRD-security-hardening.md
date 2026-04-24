# PRD: Security Hardening — Zero Vulnerability

**Version**: 0.2
**Author**: Claude (Orchestrator)
**Date**: 2026-04-24
**Status**: Approved
**Size**: XL

**Changelog**
- v0.2 (Phase 2 리뷰 반영): §9.1 배포 시퀀스 재정의, §10.1 service_role 감사 결과 추가, §3 US-3 rate-limit 범위 확장 + fail-closed 세분화, §4.4 공유 유틸 경계 + IP_HASH_SALT ENV 명시, §4.2 migration 트랜잭션, §8 테스트 전략 강화 (timingSafeEqual spy + RLS 자동화 + Upstash mock + pnpm audit CI), §6.1 쿠키 인증 배제 불변 조항, AC 측정 기준 수치화

---

## 1. Problem Statement

### 1.1 Background
GitHub Secret Scanning이 `MongLong0214/stock-ai-newsletter` (PUBLIC repo)에 대해 2건의 open alert를 보고. 직접 스캔 결과 git 히스토리에 평문 시크릿 다수 유출 확인:

- `GEMINI_API_KEY` — 2025-10-10부터 (`ffe2977`, `PRODUCTION_SETUP.md`)
- `RESEND_API_KEY` — 2025-10-10부터
- `CRON_SECRET` — 2025-10-10부터
- GitHub OAuth user-to-server token `ghu_...` — 2026-02-28부터 (`b807afc`, `.mcpregistry_github_token`)

추가로 API route 보안 버그, 의존성 취약점(1 critical + 10 high), rate limiting 부재, RLS 누락 4개 테이블, Zod 검증 누락 확인.

### 1.2 Problem Definition
PUBLIC 저장소에 평문 시크릿이 히스토리 영구 노출된 상태이며 여러 API route와 의존성에 악용 가능한 취약점이 동시에 존재한다. 키 로테이션만으로는 부족하며 인증 우회, 입력 검증 누락, DoS/SSRF 가능 의존성, Row-Level Security 미적용까지 통합 해결이 필요하다.

### 1.3 Impact of Not Solving
- 유출된 Gemini 키: 청구 abuse (타인이 Gemini API를 우리 비용으로 호출)
- 유출된 CRON_SECRET: 누구나 뉴스레터 무제한 발송 → 도메인 평판 붕괴 + SendGrid 비용 abuse
- 유출된 GitHub OAuth token: MongLong0214 권한 탈취
- CVE: 원격 코드 실행 (protobufjs), SSRF (axios), DoS (next, undici)
- RLS 미적용: public anon key로 서비스 내부 데이터 조회 가능성
- `send-newsletter` 인증 우회: ENV 미설정 시 누구나 발송 트리거 가능

---

## 2. Goals & Non-Goals

### 2.1 Goals
- [ ] G1: `pnpm audit --prod`에서 critical/high 취약점 0건
- [ ] G2: 모든 CRON/admin 엔드포인트가 fail-closed + `timingSafeEqual` 적용
- [ ] G3: 모든 공개 API가 Zod 검증 + rate limiting 적용
- [ ] G4: `public` 스키마 모든 테이블에 RLS enabled
- [ ] G5: GitHub Secret Scanning alerts #1, #2 close
- [ ] G6: 클라이언트 에러 응답에 내부 에러 메시지 비노출
- [ ] G7: 빌드 검증 3종 (tsc/eslint/next build) + 전체 테스트 PASS

### 2.2 Non-Goals
- NG1: Git 히스토리 purge (force push) — 키 revoke로 충분, fork/clone 회수 불가능
- NG2: 신규 기능 추가 — 보안 하드닝에만 집중
- NG3: 페이지/UI 변경 — API/인프라/의존성 레이어 한정
- NG4: 키 로테이션 자체 — AI 불가 (Isaac이 revoke + 재발급 직접 수행)

---

## 3. User Stories & Acceptance Criteria

### US-1: 발송 cron 인증 강화
**As a** 서비스 운영자, **I want** 누구도 뉴스레터 cron endpoint를 인증 없이 트리거할 수 없게 하기, **so that** 스팸/비용 abuse를 차단한다.

**Acceptance Criteria:**
- [ ] AC-1.1: `CRON_SECRET` 미설정 시 `send-newsletter`가 401 반환 (fail-closed)
- [ ] AC-1.2: 인증 비교가 `timingSafeEqual` 기반이며 buffer 길이 달라도 안전
- [ ] AC-1.3: 비교 로직이 `send-recommendations`의 `verifyBearerToken`와 동일 유틸로 통합

### US-2: 관리자/공개 API 입력 검증
**As a** 개발자, **I want** 외부 입력이 항상 Zod로 검증되게 하기, **so that** 악성 페이로드가 DB/RPC까지 도달하지 않는다.

**Acceptance Criteria:**
- [ ] AC-2.1: `admin/tli/comparison-v4/promote` body가 Zod로 검증. `runIds`: `z.array(z.string().uuid()).min(1).max(50)`. version 필드 전부 `z.string().min(1).max(64)`
- [ ] AC-2.2: `tli/stocks/search` q: `z.string().min(1).max(100).regex(/^[^\r\n\t\0]+$/)` (log injection 방어)
- [ ] AC-2.3: 검증 실패 시 422 + `{ error: string }` 형식만 반환 (내부 에러 메시지 비노출)

### US-3: 공개 API Rate Limiting
**As a** 서비스, **I want** 공개 엔드포인트에 분당 요청 제한을 적용, **so that** 스크래핑/DoS + 비용 abuse를 방어한다.

**대상 route manifest (공개 + 외부 비용 유발 우선)**:
- LLM/메일 호출 있음 (엄격): `/api/ai/summary`
- DB 조회만 (표준): `/api/tli/**`, `/api/stock/**`, `/api/openapi.json`
- **제외 경로 (rate-limit 미적용)**: `/api/cron/**`, `/api/admin/**` — 자기 차단 방지

**Acceptance Criteria:**
- [ ] AC-3.1: 표준 경로 **60 req/min/IP**, 엄격 경로 **10 req/min/IP** 기본값 + ENV override
- [ ] AC-3.2: 제한 초과 시 429 + `Retry-After: N` 헤더 반환
- [ ] AC-3.3: Rate limit 키는 `x-forwarded-for` 앞부분 + `IP_HASH_SALT` ENV 기반 SHA-256 (raw IP 비저장)
- [ ] AC-3.4: Upstash 장애 시 **엄격 경로는 fail-closed (503)**, 표준 경로는 fail-open + in-memory LRU 보조(인스턴스당 100 req/min/IP 하드캡)
- [ ] AC-3.5: `/api/cron/**`, `/api/admin/**` 은 rate-limit 유틸 호출 금지 (테스트로 단언)

### US-4: RLS 전면 적용
**As a** DBA, **I want** 모든 public 테이블이 RLS enabled, **so that** anon key로 내부 데이터를 조회할 수 없다.

**Acceptance Criteria:**
- [ ] AC-4.1: `newsletter_content`, `prediction_snapshots`, `comparison_calibration`, `calibration_artifact` RLS enabled
- [ ] AC-4.2: 각 테이블에 service_role 전용 정책 + anon/authenticated 명시적 REVOKE
- [ ] AC-4.3: migration은 idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`)

### US-5: 에러 응답 하드닝
**As a** 보안 담당자, **I want** 클라이언트가 받는 에러가 내부 정보를 누설하지 않게 하기, **so that** 공격 표면을 줄인다.

**Acceptance Criteria:**
- [ ] AC-5.1: `send-recommendations` 500 응답에 `details` 필드 제거
- [ ] AC-5.2: `stock/price` 500 응답에 error name/message 비노출
- [ ] AC-5.3: `lib/supabase/server-client.ts` service_role 관련 console 로그 제거

### US-6: 의존성 CVE 해소
**As a** 운영자, **I want** 모든 critical/high CVE가 패치되게 하기, **so that** RCE/SSRF/DoS를 선제 방어한다.

**Acceptance Criteria:**
- [ ] AC-6.1: `next` 15.5.15+, `undici` 7.24.0+, `@google/genai` protobufjs 7.5.5+, `@sendgrid/mail` axios 1.15.0+, `recharts` lodash 4.18.0+
- [ ] AC-6.2: `pnpm audit --prod` critical/high 0건
- [ ] AC-6.3: 빌드/테스트 회귀 없음

---

## 4. Technical Design

### 4.1 Architecture Overview
모든 수정은 기존 레이어 유지한 채 보안 층만 강화:
- **API route layer**: Zod 스키마 + 인증 헬퍼 (`verifyBearerToken`) 재사용 + rate limit 미들웨어
- **Middleware layer**: 공개 API용 rate limit 확장 (MCP analytics 로직 병행)
- **DB layer**: RLS 마이그레이션 추가
- **Infra layer**: 의존성 업그레이드 + `pnpm dedupe`

### 4.2 Data Model Changes
신규 마이그레이션 1개: `supabase/migrations/029_enable_rls_missing_tables.sql`
- 영향 테이블: `newsletter_content`, `prediction_snapshots`, `comparison_calibration`, `calibration_artifact`
- 기존 데이터 변경 없음. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + 정책 생성만.
- **트랜잭션 래핑**: 전체 SQL을 `BEGIN; ... COMMIT;`. `DO $$ ... ASSERT ... $$` 블록으로 RLS enabled 여부 단언.
- **Idempotent**: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (기본 idempotent), `DROP POLICY IF EXISTS ... / CREATE POLICY ...`
- **Rollback**: `docs/security/rollback/029_rollback.sql` 실제 작성 (DISABLE RLS + DROP POLICY). Rollback은 Isaac 승인 전용 (운영 중단 상황 한정).

### 4.3 API Design

| Method | Endpoint | Change | Auth |
|--------|----------|--------|------|
| POST | `/api/cron/send-newsletter` | fail-closed + timingSafeEqual | CRON_SECRET |
| POST | `/api/admin/tli/comparison-v4/promote` | Zod body schema 추가 | ADMIN_SECRET |
| GET | `/api/tli/stocks/search` | q Zod 검증 + 길이 상한 | public + rate limit |
| GET | `/api/tli/**`, `/api/stock/**`, `/api/ai/summary` | rate limit 적용 | public + rate limit |
| POST | `/api/cron/send-recommendations` | 500 응답 details 제거 | CRON_SECRET |

### 4.4 Key Technical Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Rate limit 백엔드 | Upstash Redis, Vercel KV, in-memory | **Upstash Redis (`@upstash/ratelimit`)** | Edge 호환, 서버리스 적합, 무료 티어. Vercel KV는 추가 상품 필요. in-memory는 서버리스에서 무효. |
| Rate limit 적용 레이어 | middleware, 각 route, wrapper | **공통 유틸 + 각 route에서 호출** | middleware는 이미 MCP analytics 로직 점유. 복잡도 분산. |
| CRON 인증 공통화 | 각 route 자체 구현, 공유 유틸 | **`lib/auth/verify-bearer.ts`로 `verifyBearerToken(req, secret)` 1개 함수만 추출** | conventions.md #7 예외. **경계**: 공유 유틸은 timing-safe 비교 1개 함수. auth 흐름/401 응답/로깅은 각 route 담당. DECISION_LOG에 기록. |
| Zod 스키마 위치 | route 내 인라인, schemas 디렉토리 | **route 내 인라인** (작은 스키마) | 재사용 없음. 응집도 우선. |
| Next.js 업그레이드 | 15.5.7 → 15.5.15 (patch), → 16 (major) | **15.5.15** | CVE 패치 최소 변경. 메이저는 별건. |
| RLS 정책 strategy | anon SELECT 허용, service_role only | **service_role only** | 이 4개 테이블은 API route를 통해서만 접근. 직접 anon 조회 불필요. |
| 에러 응답 정책 | NODE_ENV 분기, 항상 일반 메시지 | **항상 일반 메시지** | Vercel preview에서 NODE_ENV=production인 엣지 케이스 회피. |

---

## 5. Edge Cases & Error Handling

| # | Scenario | Expected Behavior | Severity |
|---|----------|-------------------|----------|
| E1 | Upstash Redis 장애 | fail-open (요청 허용) + 로그 기록 | High |
| E2 | Upstash ENV 미설정 (로컬 개발) | rate limit 비활성화 + 개발 로그 | Medium |
| E3 | CRON_SECRET 비어있음 (신규 배포) | 401 반환 (기존 "통과" 동작 변경 — breaking) | High |
| E4 | 기존 프로덕션 Vercel ENV에 CRON_SECRET 설정됨 | 정상 동작 (확인 필요) | High |
| E5 | Next.js 15.5.15 업그레이드 후 Turbopack 회귀 | 롤백 플랜: package.json 버전 고정 | Medium |
| E6 | RLS 적용 후 기존 Cron 쓰기 실패 | service_role 키 사용 확인. 실패 시 정책 수정 | High |
| E7 | `@google/genai` 1.30.0 → 최신의 breaking API 변경 | lockfile diff 확인. API 호출부 회귀 테스트 | Medium |
| E8 | Rate limit이 Cron/Admin에도 적용되어 자기 차단 | 공개 엔드포인트 한정. 인증된 경로 화이트리스트 | High |

---

## 6. Security & Permissions

### 6.1 Authentication
- **CRON**: `Authorization: Bearer <CRON_SECRET>` + `timingSafeEqual` (fail-closed)
- **ADMIN**: `Authorization: Bearer <ADMIN_SECRET>` + `timingSafeEqual` (이미 구현됨)
- **공개 API**: 인증 없음. Rate limit만.
- **불변 조항 (Invariant)**: admin/cron endpoint는 `Authorization` 헤더 전용. 쿠키/세션 인증과 **절대** 혼용 금지 (CSRF 표면 제거). 향후 쿠키 기반 기능 추가 시 별도 route로 분리.
- **보안 헤더**: `next.config.ts` 이미 적용됨 (X-Frame-Options: DENY, CSP, Permissions-Policy 등) — 유지.

### 6.2 Authorization

**Per-table (4개 RLS 신규 테이블)**:

| Table | anon | authenticated | service_role |
|-------|------|---------------|--------------|
| newsletter_content | ❌ (REVOKE) | ❌ (REVOKE) | ✅ ALL |
| prediction_snapshots | ❌ | ❌ | ✅ ALL |
| comparison_calibration | ❌ | ❌ | ✅ ALL |
| calibration_artifact | ❌ | ❌ | ✅ ALL |

**API 레벨**:

| Caller | Scope |
|--------|-------|
| anon (browser NEXT_PUBLIC_ANON) | 공개 read API 호출만 |
| service_role (server routes, scripts/**) | 모든 DB 작업 |
| CRON caller (bearer) | `/api/cron/**` POST |
| ADMIN caller (bearer) | `/api/admin/**` 전체 |

### 6.3 Data Protection
- CRON_SECRET/ADMIN_SECRET 32+ byte 랜덤
- IP는 hash 후 사용 (middleware 기존 패턴 유지)
- 에러 응답에 stack/name/raw message 비노출

---

## 7. Performance & Monitoring

| Metric | Target | Measurement |
|--------|--------|-------------|
| Rate limit false positive | < 0.1% | Upstash analytics |
| API p95 latency 증가 | < 10ms | Vercel Analytics |
| Cron 인증 실패 로그 | 비정상 spike 감지 | Vercel Logs |

### 7.1 Monitoring & Alerting
- Vercel Logs: `[cron-auth]` prefix로 실패 집계
- Upstash: rate limit hit rate 대시보드

---

## 8. Testing Strategy

### 8.1 Unit Tests
- `lib/auth/verify-bearer.ts`:
  - **timing-safe 검증**: `vi.spyOn(crypto, 'timingSafeEqual')` 로 호출 여부 단언 (실제 timing 측정 불가, 호출 경로 확인으로 대체)
  - 길이 불일치 버퍼: 동일 길이 padding 후 비교되는지 단언
  - ENV 빈 문자열/undefined: false 반환 단언
- Zod 스키마:
  - `admin/promote`: runIds 51개 → 422, UUID 아닌 문자열 → 422, version >64자 → 422
  - `stocks/search`: 101자 → 422, `\r\n` 포함 → 422, SQL 와일드카드 → 200 (escape 확인)
- Rate limit 유틸:
  - Upstash `Ratelimit` 클래스 `vi.mock`으로 stub 주입 (의존성 주입 설계)
  - 제한 초과 시 `{ success: false, reset: N }` 반환 경로
  - `IP_HASH_SALT` 미설정 시 salt 없는 해시로 fallback하지 않고 rate-limit 비활성화 (dev 전용)

### 8.2 Integration Tests
- API route (Vitest + mocked `NextRequest`):
  - `send-newsletter` 401 without secret, 401 with wrong secret, 200 with valid bearer
  - `admin/promote` 422 (Zod) → 401 (auth) → 200 (정상)
  - `stocks/search` 422 on invalid q, 200 on valid
  - `ai/summary` 429 + `Retry-After` on rate limit exceed (Upstash mock)
  - `cron/**`, `admin/**` rate-limit 유틸 **호출되지 않음** 단언
- RLS 자동화:
  - 로컬 `supabase start` 전제. Vitest integration에서 anon key로 4개 테이블 SELECT → 0행 단언
  - service_role key로 SELECT → 실제 데이터 있으면 >=0행 (정상)
- Migration:
  - `supabase db reset && supabase db push` → exit 0
  - Migration 029 2회 연속 실행 idempotent 단언 (에러 0)

### 8.3 Edge Case Tests
- `q`: 101자, `\r\n`/`\t`/`\0` 포함, `%`/`_` SQL wildcard
- Rate limit: Upstash 응답 실패 시 엄격 경로 503, 표준 경로 in-memory LRU 동작
- RLS rollback migration 적용 후 anon SELECT 복구 단언 (위험 재현 확인)

### 8.4 CI Gates
- `tsc --noEmit` PASS
- `eslint .` PASS
- `next build` PASS
- `pnpm test` PASS
- `pnpm audit --prod` critical + high = 0 (jq로 파싱 후 fail)
- Playwright smoke (Preview에서 수동 3종): cron 401, search 422, rate limit 429

---

## 9. Rollout Plan

### 9.1 Deployment Sequence (필수 순서 — 역전 금지)

**Pre-Deployment (P0 리스크 해소)**:
0. Isaac이 새 CRON_SECRET/GEMINI_API_KEY/RESEND_API_KEY 발급 **완료**
1. Vercel Environment Variables에 **신규 키 추가** (구 키 병렬 유지, `CRON_SECRET_OLD` 선택)
2. GitHub Actions Repository Secrets 갱신 (동일)
3. Local `.env.local` 갱신
4. Upstash Redis 계정 생성 → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` 추가
5. `IP_HASH_SALT` 생성 (`openssl rand -base64 32`) 후 ENV 추가

**Deployment**:
6. Feature branch `security-hardening`에서 PR 생성 → Preview 배포
7. Preview smoke test 3종 (Section 8.4)
8. PR 머지 → Production 배포

**Post-Deployment (revoke + 검증)**:
9. Isaac: GitHub OAuth revoke, Gemini 구 키 revoke, Resend 구 키 revoke
10. Production에서 구 CRON_SECRET으로 `/api/cron/**` POST → 401 확인
11. GitHub Secret Scanning alerts #1, #2 "revoked" close
12. Migration 029 remote apply (`supabase db push`)
13. Vercel 로그 24시간 모니터링 (cron 실패 spike, rate-limit hit rate)

**Rollback Trigger**: Step 8 이후 cron 실패율 >10% 또는 rate-limit false positive >1% 시 Isaac 판단 하에 revert + migration 029_rollback

### 9.2 Feature Flag
N/A — 보안 수정은 즉시 적용. feature flag 둘 경우 취약 상태 유지 우려.

### 9.3 Rollback Plan
- 코드: `git revert` (각 티켓 별개 커밋 유지)
- Migration 029: 역방향 migration 029_rollback (ROW LEVEL SECURITY DISABLE + DROP POLICY)
- 의존성: `pnpm-lock.yaml` 이전 버전 복원

---

## 10. Dependencies & Risks

### 10.1 Dependencies

| Dependency | Owner | Status | Risk if Delayed |
|-----------|-------|--------|-----------------|
| Upstash Redis 계정 + ENV | Isaac | 합의됨 (무료 티어) | rate limit 미적용 → AC-3 미달 |
| CRON_SECRET (신규) | Isaac | 로테이션 후 전달 | 수정 배포 후 cron 실패 |
| GEMINI_API_KEY (신규) | Isaac | 로테이션 후 전달 | 뉴스레터 생성 실패 |
| RESEND_API_KEY revoke | Isaac | 재발급 불필요 (SendGrid 이관됨) | 유출 상태 지속 |
| GitHub OAuth token revoke | Isaac | revoke만 | 유출 상태 지속 |
| IP_HASH_SALT 값 | Isaac | `openssl rand -base64 32` | rate-limit salt 생성 실패 |

### 10.1.1 Key Exposure Audit (v0.2 추가)

Git history 전수 스캔 (`git log --all -p -S`) 결과:

| Provider | History 유출 | 조치 |
|----------|------|------|
| Gemini (`GEMINI_API_KEY`) | ✅ 노출 (`ffe2977`, 2025-10-10) | **revoke + 재발급** |
| Resend (`RESEND_API_KEY`) | ✅ 노출 (`ffe2977`, 2025-10-10) | **revoke** (재발급 불필요) |
| CRON_SECRET | ✅ 노출 (`ffe2977`, 2025-10-10) | **재발급** |
| GitHub OAuth (`ghu_...`) | ✅ 노출 (`b807afc`, 2026-02-28) | **revoke** |
| MCP Registry JWT | 노출 but 만료됨 (2026-02-29) | 조치 불필요 |
| Supabase service_role | ❌ 미노출 | 로테이션 불필요 |
| SendGrid (`SG....`) | ❌ 미노출 | 로테이션 불필요 |
| KIS (`KIS_APP_*`) | ❌ 미노출 | 로테이션 불필요 |
| Naver (`NAVER_CLIENT_*`) | ❌ 미노출 | 로테이션 불필요 |
| Twitter (`TWITTER_*`) | ❌ 미노출 | 로테이션 불필요 |
| ADMIN_SECRET | ❌ 미노출 | 로테이션 불필요 |

**Abuse audit 권고 (Phase 7)**: Google Cloud Billing / Resend dashboard / SendGrid activity — 2025-10~현재 비정상 사용 내역 확인. 발견 시 침해 신고 절차 문서화.

**Fork 리스크**: Git history purge 스킵 결정에 따라 PUBLIC fork/clone 복제본이 영구 유효. GitHub Secret Scanning alert close ≠ 실제 유출 제거. **revoke가 최종 방어선**임을 명시. Phase 7에 `gh api /repos/.../forks` 기록 + 주요 fork 모니터링 체크리스트.

### 10.2 Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Next.js 15.5.15 업그레이드 회귀 | Low | High | `next build` + Playwright smoke test |
| RLS 적용 후 Cron 읽기/쓰기 실패 | Medium | High | service_role 키 사용 경로 재확인 + staging 먼저 |
| Upstash 무료 티어 한도 초과 | Low | Medium | 유료 승격 또는 fail-open 유지 |
| `send-newsletter` fail-closed 변경으로 기존 workflow 실패 | Medium | High | GitHub Actions secrets에 CRON_SECRET 존재 확인 필수 |
| `@google/genai` 버전 업의 API breaking | Medium | High | lockfile diff 검토 + 기존 호출부 컴파일 검증 |

---

## 11. Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|--------------------|
| `pnpm audit --prod` critical + high | 11건 | 0 | CI check (`pnpm audit --prod --json` jq) |
| RLS 미적용 public 테이블 | 4건 | 0 | `pg_catalog.pg_tables` 쿼리 |
| 인증 우회 가능 endpoint | 1 (send-newsletter) | 0 | curl 401 + Vitest 단언 |
| GitHub Secret Scanning open alerts | 2 | 0 (revoked close) | `gh api repos/.../secret-scanning/alerts` |
| Rate-limit false positive | N/A | < 0.1% | Upstash analytics |
| API p95 latency 증가 | baseline | < +10ms | Vercel Analytics |
| Vercel 빌드 시간 증가 | baseline | < +50% | Vercel Build Logs |
| Preview smoke test (Section 8.4) | N/A | 3/3 PASS | 수동 |

---

## 12. Open Questions

- [x] OQ-1: Upstash Redis 계정 — **Isaac 합의 (2026-04-24)**. 무료 티어 사용.
- [x] OQ-2: RLS anon 완전 차단 — **확정**. 4개 테이블 모두 클라이언트 직접 조회 없음 (grep 확인).
- [x] OQ-3: `send-newsletter` fail-closed — **안전**. `.github/workflows/daily-newsletter.yml`은 `/api/cron/**` endpoint를 **호출하지 않음** (`npx tsx scripts/send-newsletter.ts` 직접 실행). `vercel.json` 비어있음. fail-closed 전환에 영향 받는 호출자 없음. 두 cron route는 dead code 가능성 — Phase 7에서 삭제 여부 재판단.

---
