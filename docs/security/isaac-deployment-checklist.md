# Isaac Deployment Checklist — Security Hardening

**Branch**: `security-hardening` → `main`
**PRD**: `docs/prd/PRD-security-hardening.md` (v0.2, Approved)
**티켓**: `docs/tickets/security-hardening/` (T1~T10)
**Status**: 코드 PRODUCTION READY — Isaac 수동 작업 대기

> ⚠️ **순서 엄수**. 각 단계 완료 후 다음 단계. 건너뛰면 0-downtime 배포 실패.

---

## Step 0: 외부 서비스 키 발급/Revoke (15분)

### 0.1 Google Cloud (Gemini API Key)

- [ ] https://console.cloud.google.com → APIs & Services → Credentials
- [ ] 기존 `GEMINI_API_KEY` (유출: `AIzaSyDEP1eXNFbbW8DhlY7KjnUL-iqKLpfDzjU`) 찾아서 **삭제**
- [ ] **Create Credentials → API key** → 새 키 발급
- [ ] 발급된 키 안전한 곳에 복사 (`NEW_GEMINI_KEY`)

### 0.2 GitHub OAuth (MCP Registry Token)

- [ ] https://github.com/settings/applications → Authorized OAuth Apps
- [ ] 유출된 `ghu_8jRLRfRd53B1ceaBaf1H0oFOQxI3bk2cXnn7` 토큰의 OAuth 앱 찾기 (MCP Registry 관련)
- [ ] **Revoke access**

### 0.3 Resend (현재 미사용이지만 유출 상태)

- [ ] https://resend.com/api-keys
- [ ] `re_6iJuL81a_9evTDvRG2HirDAtWAXEHXa5Y` 찾아서 **Revoke**

### 0.4 Secrets 생성 (로컬 터미널)

```bash
# 새 CRON_SECRET
openssl rand -base64 48

# 새 IP_HASH_SALT
openssl rand -base64 32
```

- [ ] `NEW_CRON_SECRET` 복사
- [ ] `NEW_IP_HASH_SALT` 복사

### 0.5 Upstash Redis 계정 생성

- [ ] https://upstash.com → Sign up (무료 티어 충분, 10k commands/day)
- [ ] **Create Database** → Region: `us-east-1` 또는 가까운 곳 → Create
- [ ] Database Details → **REST API** 탭에서:
  - `UPSTASH_REDIS_REST_URL` 복사
  - `UPSTASH_REDIS_REST_TOKEN` 복사

---

## Step 1: ENV 업데이트 3곳 (10분)

### 1.1 Vercel Environment Variables

- [ ] https://vercel.com → 프로젝트 → Settings → Environment Variables
- [ ] **Production** + **Preview** + **Development** 모두 체크하고 추가:

| Key | Value | Note |
|---|---|---|
| `GEMINI_API_KEY` | `NEW_GEMINI_KEY` | 기존 값 덮어쓰기 |
| `CRON_SECRET` | `NEW_CRON_SECRET` | 기존 값 덮어쓰기 |
| `CRON_SECRET_OLD` | (기존 CRON_SECRET 값) | **배포 후 24시간 유지** — rotation window |
| `ADMIN_SECRET_OLD` | (기존 ADMIN_SECRET 값) | 선택, 외부 호출자 있을 때만 |
| `UPSTASH_REDIS_REST_URL` | (Upstash 값) | 신규 |
| `UPSTASH_REDIS_REST_TOKEN` | (Upstash 값) | 신규 |
| `IP_HASH_SALT` | `NEW_IP_HASH_SALT` | 신규 |

### 1.2 GitHub Repository Secrets

- [ ] https://github.com/MongLong0214/stock-ai-newsletter/settings/secrets/actions
- [ ] `CRON_SECRET` 갱신 (`NEW_CRON_SECRET`)
- [ ] `GEMINI_API_KEY` — 주석처리됨(daily-newsletter.yml L110). **skip 가능**
- [ ] Vertex AI 사용 중이면 `GOOGLE_CLOUD_CREDENTIALS` 확인 (별건)

### 1.3 로컬 `.env.local`

- [ ] 프로젝트 루트의 `.env.local` 열어서 동일하게 갱신
- [ ] 저장 후 `pnpm test:audit`로 상태 확인

---

## Step 2: 배포 (20분)

### 2.1 PR 머지

- [ ] https://github.com/MongLong0214/stock-ai-newsletter/pulls
- [ ] `security-hardening` PR 리뷰 → **Merge pull request**
- [ ] Vercel이 자동으로 Production 배포 시작

### 2.2 Vercel 빌드 로그 모니터링

- [ ] Vercel Dashboard → Deployments → 최신 빌드 확인
- [ ] "Build Successful" 확인 (실패 시 롤백 고려)
- [ ] 배포 시간 기록 (PRD §11 target: baseline 대비 +50% 이내)

---

## Step 3: Post-Deploy 검증 (T10, 30분)

### 3.1 Migration 029 원격 적용

```bash
# Supabase CLI 사용
supabase link --project-ref <your-project-ref>
supabase db push
```

또는 Supabase Dashboard → SQL Editor에서 `supabase/migrations/029_enable_rls_missing_tables.sql` 수동 실행.

- [ ] Migration apply 성공
- [ ] SQL Editor에서 검증 쿼리:
  ```sql
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('newsletter_content', 'prediction_snapshots',
                      'comparison_calibration', 'calibration_artifact');
  ```
  → 4 rows, 모두 `rowsecurity = t`

### 3.2 구 CRON_SECRET 401 smoke test

```bash
# 구 CRON_SECRET으로 호출 → 401 확인 (fail-closed + 구 키 revoke 검증)
curl -X POST https://stock-ai-newsletter.vercel.app/api/cron/send-newsletter \
  -H "Authorization: Bearer <구_CRON_SECRET>" \
  -i
```

- [ ] HTTP/2 401 확인
- [ ] 새 CRON_SECRET으로 테스트 (선택):
  ```bash
  curl -X POST https://stock-ai-newsletter.vercel.app/api/cron/send-newsletter \
    -H "Authorization: Bearer <새_CRON_SECRET>" \
    -i
  ```
  → 200 또는 로직에 따른 2xx/5xx (401 아님)

### 3.3 Rate limit smoke test

```bash
# 11번 연속 호출 (strict = 10/min 제한)
for i in {1..15}; do
  curl -sI https://stock-ai-newsletter.vercel.app/api/ai/summary | head -1
done
```

- [ ] 11번째부터 `429 Too Many Requests` 확인
- [ ] `Retry-After` 헤더 존재

### 3.4 GitHub Secret Scanning alerts close

- [ ] https://github.com/MongLong0214/stock-ai-newsletter/security/secret-scanning
- [ ] Alert #1 (Google API Key `AIzaSy...`) → **Close as revoked**
- [ ] Alert #2 (GitHub OAuth `ghu_...`) → **Close as revoked**

### 3.5 24시간 후 CRON_SECRET_OLD 제거

- [ ] 배포 24시간 후 Vercel ENV에서 `CRON_SECRET_OLD` 삭제
- [ ] GitHub Actions Secrets에도 남아있으면 제거

---

## Step 4: Abuse Audit (선택, 15분)

유출 기간 **2025-10-10 ~ 현재**에 비정상 사용 확인:

### 4.1 Google Cloud Billing

- [ ] https://console.cloud.google.com/billing → Reports
- [ ] 기간: 2025-10-01 ~ 오늘
- [ ] Gemini/Vertex AI API 비정상 spike 확인
- [ ] 스크린샷 저장: `docs/security/audit-google-2026-04-24.png`

### 4.2 Resend Dashboard

- [ ] https://resend.com/emails → 2025-10-10 ~ 오늘 발송 이력
- [ ] 예상 발송과 다른 메일 없는지

### 4.3 SendGrid Activity

- [ ] https://app.sendgrid.com → Activity → 비정상 발송 없는지

### 4.4 비정상 발견 시

- 해당 provider에 **침해 신고** (abuse@google.com / support@resend.com / support@sendgrid.com)
- Google Cloud: **Dispute billing** 신청
- 발견 내역 기록: `docs/security/abuse-audit-2026-04-24.md`

---

## Step 5: Fork 모니터링 (선택, 5분)

```bash
gh api /repos/MongLong0214/stock-ai-newsletter/forks > docs/security/forks-at-hardening.json
```

- [ ] fork 수 / 주요 fork 확인
- [ ] 파일 커밋 (별도 PR)

---

## Step 6: Dead cron endpoint 최종 판정 (T10 AC-7)

배포 후 24시간 Vercel 로그 관찰:

```bash
# Vercel CLI
vercel logs <deployment-url> | grep /api/cron/send-newsletter
vercel logs <deployment-url> | grep /api/cron/send-recommendations
```

- [ ] 호출 0건이면 → dead code. 별도 PR로 route 삭제
- [ ] 호출 발견 시 → DECISION_LOG에 유지 사유 기록 (호출자: GitHub Actions / cron-job.org / Vercel Cron)

---

## 완료 기록

- [ ] 위 모든 단계 완료
- [ ] `docs/security/post-deploy-checklist.md` 생성 (결과 기록)
- [ ] `docs/tickets/security-hardening/STATUS.md` T0/T10 → Done 업데이트

---

## 🚨 긴급 롤백

배포 후 cron 실패율 >10% 또는 rate-limit false positive >1% 시:

```bash
# 1. 코드 revert
git revert <merge-commit-sha>
git push origin main

# 2. Migration 029 rollback (Isaac 승인 필수 — 보안 퇴보)
psql "$DATABASE_URL" -f docs/security/rollback/029_rollback.sql
```

---

## 참고 문서

- **PRD**: `docs/prd/PRD-security-hardening.md`
- **티켓**: `docs/tickets/security-hardening/T1~T10.md`
- **Migration**: `supabase/migrations/029_enable_rls_missing_tables.sql`
- **Rollback (out-of-band)**: `docs/security/rollback/029_rollback.sql`
