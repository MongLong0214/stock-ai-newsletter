# T10: Post-deploy Ops (Isaac 체크리스트 + abuse audit)

**PRD Ref**: PRD-security-hardening > §9.1 Post-Deployment, §10.1.1
**Priority**: P1
**Size**: S (< 1h, 수동 작업)
**Status**: Todo
**Depends On**: T1-T9 모두 Done + 프로덕션 배포 완료

---

## 1. Objective
Isaac 수동 체크리스트 + 과거 abuse audit + GitHub Secret Scanning alert close + fork 모니터링.

## 2. Acceptance Criteria
- [ ] AC-1: 구 `CRON_SECRET` 으로 `/api/cron/send-newsletter` POST → 401 확인 (curl)
- [ ] AC-2: GitHub Secret Scanning alert #1 (Google API Key), #2 (GitHub OAuth) 모두 "revoked" 상태로 close
- [ ] AC-3: Google Cloud Billing 2025-10~현재 비정상 사용 내역 확인 (스크린샷 또는 기록)
- [ ] AC-4: Resend 대시보드 활동 로그 2025-10~현재 확인 + 구 키 revoke 확인
- [ ] AC-5: SendGrid + KIS 활동 로그 2025-10~현재 확인 (유출 없었으나 방어적)
- [ ] AC-6: `gh api repos/MongLong0214/stock-ai-newsletter/forks` 결과 기록 (`docs/security/forks-at-hardening.json`)
- [ ] AC-7: 두 cron endpoint (`send-newsletter`, `send-recommendations`) dead code 여부 최종 판단 — **기준**:
  - (a) `gh code-search /api/cron/send-newsletter`, Vercel 로그 30일, `.github/workflows/` 전수 grep → 호출자 0 확인
  - (b) 유지 결정 시 DECISION_LOG 기록 (유지 사유 + 외부 트리거 계획)
  - (c) 삭제 결정 시 별도 후속 PR 티켓 생성 후 이 작업 완료
- [ ] AC-8: Migration 029 remote apply (`supabase db push`) → `pg_tables.rowsecurity=true` × 4 확인
- [ ] AC-9: Vercel Analytics p95 latency — 배포 전후 24h 비교. PRD §11 타겟 `<+10ms` 충족 스크린샷 또는 숫자 기록 → `docs/security/post-deploy-checklist.md`

## 3. TDD Spec
N/A (운영/수동 작업)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `docs/security/post-deploy-checklist.md` | Create | 체크 결과 기록 |
| `docs/security/forks-at-hardening.json` | Create | fork 스냅샷 |

### 4.2 Steps (순서 엄수)
1. Production 배포 완료 확인
2. `supabase db push` 로 migration 029 remote apply → `pg_tables` 쿼리로 4개 테이블 rowsecurity=t 확인
3. 구 CRON_SECRET으로 `/api/cron/send-newsletter` POST → 401 확인 (curl)
4. GitHub Secret Scanning alerts #1, #2 "revoked" close
5. `gh api /repos/MongLong0214/stock-ai-newsletter/secret-scanning/alerts` 재조회 → open 0건 확인
6. `gh api /repos/MongLong0214/stock-ai-newsletter/forks > docs/security/forks-at-hardening.json`
7. Google Cloud Console → Billing → 2025-10~현재 청구 리뷰
8. Resend 대시보드 → 구 키 revoke 상태 + 이력 리뷰
9. SendGrid activity log + KIS 관리자 콘솔 리뷰
10. Vercel Analytics 24h 전후 p95 latency 비교 기록
11. dead cron endpoint 결정: AC-7 기준 (a)(b)(c) 적용

### 4.3 abuse 발견 시
- 해당 provider에 침해 신고 (fraud@...)
- 청구 분쟁 제기
- 사용자 통지 여부 Isaac 판단

## 5. Edge Cases
- EC-1: Gemini는 Vertex AI로 이관 중 (workflow 주석 확인). 구 GEMINI_API_KEY 사용 이력 / 새 Gemini 키 실제 필요 여부 재확인
- EC-2: fork 스냅샷에 주요 fork 존재 시 takedown 검토 (Isaac 결정)

## 6. Review Checklist
- [ ] 모든 AC 체크 완료
- [ ] `docs/security/post-deploy-checklist.md` 결과 기록
- [ ] GitHub Secret Scanning open alerts 0건
- [ ] 비정상 사용 발견 시 대응 기록
