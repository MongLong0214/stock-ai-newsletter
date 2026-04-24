# T8: 의존성 업그레이드 (CVE 해소)

**PRD Ref**: PRD-security-hardening > US-6
**Priority**: P1
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective
critical 1건 + high 10건 CVE 해소. 대상:
- `next`: 15.5.7 → 15.5.15+ (DoS × 3)
- `undici`: <7.24.0 → >=7.24.0 (WebSocket × 3)
- `@google/genai`: protobufjs <7.5.5 → >=7.5.5 (**RCE critical**)
- `@sendgrid/mail`: axios <1.15.0 → >=1.15.0 (SSRF + cloud metadata)
- `recharts`: lodash <=4.17.23 → >=4.18.0 (injection)
- `minimatch` (deep): <9.0.7 → >=9.0.7 (ReDoS, transitive)

## 2. Acceptance Criteria
- [ ] AC-1: `pnpm audit --prod --json` critical = 0, high = 0
- [ ] AC-2: `tsc --noEmit` PASS
- [ ] AC-3: `pnpm lint` PASS
- [ ] AC-4: `pnpm build` PASS (Turbopack 회귀 없음)
- [ ] AC-5: `pnpm test` 기존 테스트 regression 없음
- [ ] AC-6: lockfile diff 리뷰 완료 (transient deps 변경 확인)
- [ ] AC-7: Gemini API 호출부 smoke — `lib/ai/__tests__/gemini-smoke.test.ts` PASS + 로컬 `pnpm tsx scripts/send-newsletter.ts --dry-run` 1회 (KR 평일 대상)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `pnpm audit has no critical+high` | CI script (`pnpm test:audit` 분리, 일반 `pnpm test`에 미포함) | `pnpm audit --prod --json` jq | 0 + 0 |
| 2 | `next build succeeds` | Integration (CI 수동) | `pnpm build` | exit 0 |
| 3 | `Gemini SDK smoke: GoogleGenAI.generateContent mocked call` | Unit | `vi.mock` fetch + SDK 시그니처 호출 | 에러 없음, 응답 파싱 가능 |
| 4 | `SendGrid mail API smoke` | Unit | `import sgMail from '@sendgrid/mail'` + `setApiKey(...)` | no runtime error |

### 3.2 Test File Location
- `scripts/audit-check.ts` (pnpm audit 래퍼, **`pnpm test`에 미포함**. `pnpm test:audit` 전용)
- `lib/ai/__tests__/gemini-smoke.test.ts` (Gemini SDK smoke)
- `lib/email/__tests__/sendgrid-smoke.test.ts` (SendGrid SDK smoke)
- 기존 코드베이스 테스트 재실행으로 regression 확인

**package.json scripts 추가**:
- `"test:audit": "tsx scripts/audit-check.ts"` (CI에서만 호출, 로컬 빠른 개발 주기에서 제외)

### 3.3 Mock/Setup Required
- audit-check: `execSync('pnpm audit --prod --json', { encoding: 'utf8' })` → JSON 파싱 후 severity 카운트 단언
- SDK smoke: mock 없이 타입체크만

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `package.json` | Modify | 버전 bump |
| `pnpm-lock.yaml` | Modify (auto) | `pnpm update` |
| `scripts/__tests__/audit-check.test.ts` | Create | CI audit 단언 |

### 4.2 Implementation Steps (Green Phase)
1. `pnpm up next@latest` (15.5.15+ 확인)
2. `pnpm up undici@latest`
3. `pnpm up @google/genai@latest`
4. `pnpm up @sendgrid/mail@latest`
5. `pnpm up recharts@latest`
6. `pnpm dedupe`
7. `pnpm audit --prod` 결과 확인 (0 critical, 0 high 목표)
8. `pnpm install && pnpm build` smoke
9. Gemini 호출부 (`lib/ai/**`, `scripts/send-newsletter.ts`) grep → API breaking 없음 확인
10. audit-check 테스트 실행

### 4.3 Refactor Phase
- 만약 `@google/genai` API breaking 있으면 별도 fix PR로 분리 (이 티켓 scope 유지)
- transitive만 패치된 경우 `pnpm overrides` 로 강제 버전 고정 고려

## 5. Edge Cases
- EC-1: `next 15.5.15` Turbopack 회귀 가능성 → `pnpm build` 로 검증. 실패 시 `turbopack: { ... }` 옵션 재검토
- EC-2: `undici` 7.24.0+ WebSocket API 미미한 차이 — 우리 코드에 WebSocket 사용 없음 (grep 확인)
- EC-3: `lodash` direct dep 없이 recharts transitive만 — `pnpm why lodash` 로 확인
- EC-4: `pnpm up`이 일부 범위로만 올리면 `pnpm add next@15.5.15` 명시
- EC-5: lockfile 대규모 변경 → Vercel 빌드 캐시 무효화, cold build 증가 → PRD 성공 지표 "빌드시간 <+50%" 모니터링

## 6. Review Checklist
- [ ] Red: audit-check 테스트 FAILED (현재 11건)
- [ ] Green: audit 0건 + 빌드 4종 PASS
- [ ] pnpm-lock.yaml diff 검토 (breaking 의심 큰 패키지는 changelog 확인)
- [ ] Gemini/SendGrid 호출부 수동 smoke 1회
- [ ] Vercel Preview 배포 시간 기록 (baseline 대비)
