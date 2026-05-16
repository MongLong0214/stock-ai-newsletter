# T9: 통합 빌드/테스트 검증

**PRD Ref**: PRD-security-hardening > G7, §8.4
**Priority**: P1
**Size**: S (< 1h)
**Status**: Todo
**Depends On**: T1, T2, T3, T4, T5, T6, T7, T8

---

## 1. Objective
모든 티켓 통합 후 PRD Section 8.4 CI Gate 4종 + pnpm audit 0건 확인.

## 2. Acceptance Criteria
- [ ] AC-1: `pnpm exec tsc --noEmit` 에러 0
- [ ] AC-2: `pnpm lint` 에러 0
- [ ] AC-3: `pnpm build` 성공
- [ ] AC-4: `pnpm test` 전체 PASS (신규 + 기존)
- [ ] AC-5: `pnpm test:audit` critical + high = 0
- [ ] AC-6: `grep checkRateLimit app/api/cron app/api/admin` 결과 0
- [ ] AC-7: `grep -E 'cookies\\(\\)|request\\.cookies' app/api/cron app/api/admin` 결과 0 (CSRF invariant)

## 3. TDD Spec (Red Phase)
N/A — 검증 전용 티켓. Test는 T1~T8에서 작성됨.

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| (없음) | - | 검증만 |

### 4.2 Implementation Steps
1. `pnpm install` (lock 동기화)
2. `pnpm exec tsc --noEmit` → 에러 수집
3. `pnpm lint` → 에러 수집
4. `pnpm build` → 에러 수집 + 빌드 시간 기록
5. `pnpm test` → 실패 케이스 수집
6. `pnpm test:audit` → critical+high = 0 확인 (T8에서 신규 script 추가)
7. `grep -r checkRateLimit app/api/cron app/api/admin` → 결과 없음 확인
8. `grep -rE '(cookies\(\)|request\.cookies)' app/api/cron app/api/admin` → 결과 없음 확인 (CSRF invariant)

### 4.3 재시도 루프
- 에러 발견 시 해당 티켓으로 역행 (T{N}-fix 보정 티켓 생성)
- 3회 초과 시 Isaac 에스컬레이션

## 5. Edge Cases
- EC-1: Upstash ENV 없는 로컬에서 테스트 실행 → rate-limit 비활성 경로 커버
- EC-2: Supabase 로컬 미기동 시 RLS 테스트 skip (tag `rls-integration`)

## 6. Review Checklist
- [ ] 4종 CI Gate PASS 증빙 (로그 캡처)
- [ ] audit 0건 증빙
- [ ] grep audit PASS
- [ ] STATUS.md 전체 티켓 Status = Done
