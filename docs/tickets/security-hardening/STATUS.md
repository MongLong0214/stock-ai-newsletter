# Pipeline Status: Security Hardening

**PRD**: docs/prd/PRD-security-hardening.md (v0.2, Approved)
**Size**: XL
**Current Phase**: 3

## Ticket Status 정의
- **Todo**: 미착수
- **In Progress**: 구현 중
- **In Review**: 리뷰 진행 중
- **Done**: 완료 (AC 충족 + 테스트 PASS)
- **Invalidated**: 역행으로 무효화됨

## Tickets

| Ticket | Title | Size | Status | Review | Depends / Notes |
|--------|-------|------|--------|--------|-----------------|
| T0 | **(Isaac 수동)** 키 revoke+재발급, Upstash 계정, `IP_HASH_SALT` 생성, Vercel/GHA secrets 갱신 | - | **Pending (Isaac)** | - | PRD §9.1 Pre-Deployment Step 0-5 |
| T1 | `lib/auth/verify-bearer.ts` 공유 유틸 + rotation 지원 | S | **Done** | PASS | rest parameter로 CRON_SECRET_OLD 지원 |
| T2 | `send-newsletter` fail-closed + timingSafeEqual + error hardening | S | **Done** | PASS | details 필드 완전 제거 |
| T3 | Zod 스키마 (admin/promote, stocks/search) | S | **Done** | PASS | UUID/regex/길이 상한 |
| T4 | `lib/rate-limit/` 유틸 (Upstash + LRU fallback + 503 분리 + prod fail-closed) | M | **Done** | PASS | `reason: backend_unavailable` 분리 |
| T5 | Rate-limit 공개 API 전수 적용 + cron/admin 제외 단언 | L | **Done** | PASS | 14 route + HOF |
| T6 | 에러 응답 하드닝 | S | **Done** | PASS | server-client log 제거 |
| T7 | Migration 029 (RLS 4개 테이블) + **out-of-band rollback** | S (DB 변경 예외) | **Done** | PASS | rollback SQL은 `docs/security/rollback/` 이동 |
| T8 | 의존성 업그레이드 + dedupe | M | **Done** | PASS | audit 0 critical/high |
| T9 | 통합 빌드/테스트 검증 (tsc 0 / test 2317 pass / audit 0) | S | **Done** | PASS | pre-existing 이슈 모두 해소 |
| T10 | Post-deploy: remote migration + GitHub alerts close + abuse audit + fork 기록 + p95 측정 + dead code 결정 | S | **Pending (Isaac)** | - | 배포 후 수행 |

## Review History

| Phase | Round | Verdict | P0 | P1 | P2 | Notes |
|-------|-------|---------|----|----|-----|-------|
| 2     | 1     | HAS ISSUE | 3 | 13 | 6 | strategist/guardian/tester/boomer |
| 2     | 2     | ALL PASS | 0 | 0 | 1 | guardian 재검증 |
| 4     | 1     | HAS ISSUE | 0 | 7 | 9 | strategist/tester/guardian + boomer (orchestrator) |
| 4     | 2     | ALL PASS | 0 | 0 | 0 | strategist 재검증 |
| 6     | 1     | HAS ISSUE | 1 | 6 | 6 | guardian/tester/strategist + boomer (orchestrator) |
| 6     | 2     | HAS ISSUE | 1 | 3 | 1 | **Isaac 직접 검증**: rollback 위치, 503 분리, prod fail-closed, tsc/test green, RLS 실검증 |
| 6     | 3     | HAS ISSUE | 0 | 2 | 0 | **Isaac 2차 검증**: pnpm test exit 1 (unhandled process.exit from main()) |
| 6     | 4     | **PRODUCTION READY** | 0 | 0 | 0 | isMainModule guard 7개 파일 + manifest. CI Gate all green (tsc 0 / test exit 0 / audit 0 / build ok) |
