# Stock Matrix 프로젝트 준비도 전수 리뷰

- **리뷰 일자:** 2026-07-30
- **고정 스냅샷:** `8e614aaa75a8f1d103140ff4a293e4ba8fff3ae2`
- **브랜치:** `main`
- **커밋 시각:** 2026-07-25T13:15:47+09:00
- **대상 저장소:** `/Users/isaac/projects/stock-ai-newsletter`
- **최종 판정:** **NOT READY — 현 상태 그대로의 다음 production release를 승인하지 않음**
- **변경 범위:** 이 보고서만 추가. 애플리케이션 코드·설정·migration·test는 변경하지 않음.

> 이 판정은 “좋은 코드가 없다”는 뜻이 아니다. 과학적 TLI containment, immutable provenance, Python 모델 계약, DataLab 수집 계약, 최근 RLS 정책 등에는 매우 강한 통제가 있다. 그러나 인증 없이 대량 메일을 유발할 수 있는 route, 익명 쓰기가 가능한 주가 cache, 구독자 소유권·해지 설계, 비멱등 newsletter 발송, 재현 불가능한 DB bootstrap, red 상태의 기본 test/E2E gate, runtime dependency 취약점, 데이터 날짜·완전성 오류가 동시에 남아 있어 release risk를 수용 가능한 수준으로 낮추지 못했다.

---

## 1. 경영 요약

### 1.1 결론

프로젝트는 기능 폭과 과학적 검증 장치는 인상적이지만, production readiness의 기본 축인 **보안 기본값, 메일 idempotency, 재현 가능한 배포, 자동 quality gate, 개인정보 수명주기, 운영 관측성**이 아직 일관된 하나의 시스템으로 닫혀 있지 않다. 특히 다음 네 가지는 즉시 containment가 필요하다.

1. `app/api/cron/send-newsletter/route.ts`는 `CRON_SECRET`이 없으면 인증 검사를 생략한다.
2. `stock_price_cache`는 anon insert/update를 허용하고 browser code가 그 값을 신뢰한다.
3. unsubscribe URL에 raw email을 넣고 page load가 즉시 해지를 실행한다.
4. newsletter의 `Promise.all` 발송과 사후 단일 sent flag는 partial delivery 후 retry 중복을 방지하지 못한다.

또한 clean Supabase 환경이 migration 030에서 재현되지 않고, pull request CI가 없으며, 기본 `npm test`와 실제 Playwright E2E가 red이고, root typecheck는 핵심 `scripts/`를 제외한다. 따라서 “현재 production이 존재한다”는 사실은 새 release·재해복구·staging 재현 가능성을 증명하지 않는다.

### 1.2 준비도 매트릭스

| 영역 | 상태 | 핵심 판단 |
|---|---:|---|
| 보안·개인정보 | 🔴 | fail-open cron, 구독자 소유권 부재, cache poisoning, scraper SSRF, PII URL/log |
| 정확성·메일 신뢰성 | 🔴 | partial delivery 중복, sent-state 실패 무시, 잘못된 7d 비교, calendar drift |
| 데이터·AI 신뢰성 | 🔴 | Naver 날짜/완전성, correlated self-verification, crash fallback false-negative |
| 테스트·품질 gate | 🔴 | 기본 test red, E2E 13 failures, scripts type errors, PR CI 없음 |
| 배포·DR | 🔴 | clean DB bootstrap 불가, schema/app 순서 미강제, dual lock drift |
| 성능·확장성 | 🟠 | prediction N+1, subscriber 1,000-row cap, archive client bundle 성장 |
| 아키텍처·모듈화 | 🟠 | runtime boundary 위반, 중복 client/retry/calendar/pagination, orphan code |
| 과학적 ML containment | 🟢 | immutable manifests, hash binding, interval replay, fail-closed exposure |
| 문서·DX | 🔴 | root README/env/deploy 문서 부재, canonical SSOT가 gitignored·결손 |

### 1.3 Release blockers

아래 항목은 수정하거나, owner·기한·명시적 risk acceptance를 남기기 전에는 release를 진행하지 않는 것을 권고한다.

| Blocker | 관련 finding | 차단 이유 | 최소 해제 조건 |
|---|---|---|---|
| RB-01 인증 없는 대량 메일 가능 | SEC-001 | secret 미설정이 “거부”가 아니라 “허용”으로 바뀜 | route 삭제/비공개화 또는 secret 필수+timing-safe 검증+negative test |
| RB-02 구독·해지 소유권 및 PII 설계 | SEC-002, SEC-003, SEC-013 | 타인 재구독/해지, scanner auto-unsubscribe, URL PII | signed opaque token, confirmation UX, rate limit, double opt-in, privacy 문서 |
| RB-03 주가 cache poisoning 및 quota abuse | SEC-005, SEC-006 | anon이 금융 표시값을 임의 수정하고 KIS quota를 소진 가능 | anon writes revoke, server-only cache writer, validation, rate limit |
| RB-04 scraper SSRF/runner 격리 부재 | SEC-007, SEC-008, AI-009 | 외부 URL/redirect/private network 검증 없이 `--no-sandbox` browser 실행 | allowlist/denylist, DNS·redirect 재검증, sandboxed isolated worker |
| RB-05 newsletter 비멱등 전달 | COR-002~005, PERF-001 | partial success 후 retry 중복, 1,000명 이후 누락, DB state 실패 성공 처리 | per-recipient ledger/idempotency key, bounded concurrency, pagination, atomic claim |
| RB-06 clean DB bootstrap·DR 불가 | DEP-002~004 | 핵심 3개 table의 CREATE가 없고 migration 030이 fresh reset에서 중단 | tested baseline, clean reset CI, schema-first deploy gate, restore drill |
| RB-07 자동 quality gate 부재·현재 red | QA-001~007, DEP-001 | PR에 test/type/build가 없고 실제 기본 test/E2E가 실패 | required PR CI green, scripts typecheck, real DB migration rehearsal |
| RB-08 dependency/build 재현성 | SEC-015, DEP-005 | direct runtime Next/Undici high advisories, 두 lock의 15/52 direct resolution 차이 | 취약점 patch, 단일 package manager/lock, exact Node pin, clean install build |
| RB-09 newsletter AI fail-safe와 실행 예산 | AI-001~008 | 근거 미검증·자기검증·300초와 불일치·저신뢰 crash를 NORMAL로 전환 | 독립 source 검증, deadline/call budget, outage 시 recommendation abstain |
| RB-10 뉴스 데이터 날짜·완전성 | DATA-001~003 | KST 날짜 이동, 1,000 cap을 complete로 기록, false zero가 public score/study에 유입 | KST parsing, cap truncation status, coverage proof, dedupe-before-count |
| RB-11 부분 pipeline artifact | ARC-001, COR-012~013 | critical 중간 실패 후 의존 단계를 계속 실행하며 rollback 없음 | stage dependency DAG, fail-stop/transactional publish, run-scoped commit |
| RB-12 prediction containment 우회·legacy PIT | SEC-011, ARC-004, ML-002~003 | anon view가 legacy rows를 노출할 수 있고 legacy basket은 current membership 사용 | view grant revoke, PIT loader 실제 배선, model type/freshness DB constraints |
| RB-13 공개 UI 회귀 | COR-017~018, QA-004 | low-confidence 경고 소실, mobile chart 0px가 3/3 재현 | prop/reason wiring, mobile min-height, E2E contract 갱신·green |
| RB-14 개인정보 governance | SEC-004, SEC-013 | subscriber PII log, policy/terms 부재, retention 자동 집행 부재 | PII redaction, retention scheduler, privacy/terms, data inventory/owner |

### 1.4 조건부 차단

- **Prediction 공개 전 필수:** ARC-004, DATA-001/002, SEC-011, ML-002/003, 관측성·drill prerequisite를 모두 닫아야 한다. 현재 `dataSource:"none"` containment는 올바른 안전장치이므로 우회해서는 안 된다.
- **Subscriber 1,000명 전 필수:** subscriber pagination, delivery ledger, bounded concurrency, retry/idempotency, bounce/suppression 처리를 완료해야 한다.
- **새 staging/DR 환경 전 필수:** production schema dump에 의존하지 않는 clean baseline과 restore rehearsal이 필요하다.

---

## 2. 범위와 방법

### 2.1 Coverage accounting

Git tracked snapshot을 기준으로 정확히 분류했다.

| 분류 | 파일 | 줄 수 |
|---|---:|---:|
| Code | 742 | 101,027 |
| Tests | 296 | 48,707 |
| Documentation | 124 | 30,417 |
| SQL | 63 | 13,167 |
| Config/data | 42 | 37,159 |
| Assets/other | 50 | — |
| **합계** | **1,317** | — |

추가 구조 지표:

- static import graph: **997 modules / 2,175 edges**
- Next/API routes: **20**
- GitHub Actions workflows: **9**
- Supabase migration SQL files: **56**
- 주요 실행면: Next.js 15, Supabase, newsletter/blog automation, TLI collection/scoring/comparison, scientific Python ML, MCP package
- 분석 산출물: `/tmp/stock-ai-newsletter-review-inventory.json`, `/tmp/stock-ai-newsletter-import-graph.json`, audit JSON 및 command logs

### 2.2 Eight-pass methodology

1. **Architecture/requirements/flow:** entrypoint, dependency direction, runtime/research boundary, feature availability, import graph.
2. **Correctness/edge cases:** dates, retries, partial failures, idempotency, limits, stale/latest semantics, bitemporal behavior.
3. **Security/privacy/supply chain:** authn/authz, RLS, PII, SSRF, CSP, secret scan, npm audit, workflow trust.
4. **Data/AI/external APIs:** schema contracts, provenance, prompt injection, factual verification, quota, source completeness, ML containment.
5. **Performance/resilience/operability:** N+1, pagination, concurrency, caching, bundle size, observability, failure semantics.
6. **Tests/types/quality gates:** actual Vitest, TypeScript, ESLint, Next build, Python, MCP, Playwright runs.
7. **Deployment/config/CI/docs/DX:** clean DB bootstrap, workflow triggers, lockfiles, runtime pins, env matrix, release metadata.
8. **Independent revalidation:** 별도 auditor가 top findings·severity·orphan 후보를 재검증했고, auditor의 오판은 primary evidence로 기각했다.

### 2.3 분류 기준

- **Verified defect:** 현재 snapshot의 결정적 코드 경로 또는 재현 test가 잘못된 동작을 입증.
- **Verified exposure:** 실행 환경 값에 따라 활성화되지만 code default가 취약하거나 직접 공격면을 제공.
- **Risk/unknown:** production env/traffic/data 없이는 발생 여부를 확정할 수 없으나 통제가 부재.
- **Governance gap:** 재현성·승인·문서·소유권·release process 결함.
- **Positive control:** 실제 blast radius를 줄이는 강한 통제.

Severity:

- **Critical:** 무인 원격 악용, 대량 side effect, 민감 데이터/금융 데이터 무결성 훼손, 되돌리기 어려운 대규모 영향.
- **High:** release/DR을 차단하거나 사용자·데이터·운영에 큰 피해를 줄 수 있음.
- **Medium:** 조건부·제한적 영향이나 반복될 경우 품질/운영 비용이 큼.
- **Low:** hygiene, 국소 UX, 미래 유지보수 문제.

---

## 3. Critical/High findings 상세

### SEC-001 — `CRON_SECRET` 미설정 시 대량 메일 route가 fail-open

- **Severity / type:** Critical / Verified exposure
- **Evidence:** `app/api/cron/send-newsletter/route.ts:20-24`는 `if (process.env.CRON_SECRET && ...)`로 검사한다. build route table에도 `/api/cron/send-newsletter`가 public dynamic route로 포함됐다.
- **Scenario:** production env에서 secret 누락·오타·preview env 미설정 시 임의 caller가 service-role subscriber read, Gemini 작업, SendGrid 대량 발송을 유발한다.
- **Mitigation already present elsewhere:** `app/api/cron/send-recommendations/route.ts:40`은 secret이 없으면 401로 fail-closed하고 timing-safe compare를 사용한다.
- **Remediation:** 취약 route를 제거하거나 동일 fail-closed helper를 공유한다. deployment schema에서 `CRON_SECRET`을 필수로 검증하고 “unset/empty/wrong/missing header” route tests를 추가한다.

### SEC-002 / SEC-003 — 구독 lifecycle의 소유권·rate control 부재와 scanner-triggered 해지

- **Severity / type:** High / Verified defect
- **Evidence:** `app/api/subscribe/route.ts`, `app/api/unsubscribe/route.ts`는 email만으로 상태를 바꾸며 rate limit, CAPTCHA, double opt-in, signed ownership token이 없다. `lib/sendgrid.ts`는 `/unsubscribe?email=<raw email>` 링크를 만들고 `app/unsubscribe/page.tsx:17-23`은 page load `useEffect`에서 즉시 POST한다.
- **Scenario:** 공격자가 타인 email을 반복 등록/해지할 수 있고, mail security scanner 또는 link preview가 사용자 의도 없이 해지한다. raw email은 history, proxy, analytics, support screenshot에 남을 수 있다.
- **Remediation:** random opaque one-time token 또는 HMAC token, expiry·purpose binding, explicit confirmation 또는 standards-compliant one-click endpoint, rate limiting, double opt-in, audit log를 사용한다. URL·log에 raw email을 넣지 않는다.

### SEC-005 — anon-writable stock cache poisoning

- **Severity / type:** Critical / Verified defect
- **Evidence:** `supabase/migrations/create_stock_price_cache.sql:33-59`는 public select/insert/update를 `USING(true)`/`WITH CHECK(true)`로 허용한다. `app/archive/_utils/cache/stock-price.ts:102,150`은 browser Supabase client로 read/upsert한다.
- **Scenario:** anon client가 ticker의 current/previous price, rate, timestamp, expiry를 임의 값으로 덮어 사용자 전원에게 금융 표시값을 제공한다. distributed single-flight도 없어 stampede가 가능하다.
- **Remediation:** anon insert/update를 즉시 revoke하고 server-only RPC/service writer로 이동한다. ticker/range/timestamp/source validation, monotonic freshness, authoritative KIS fallback을 적용한다.

### SEC-007 / SEC-008 — blog scraper SSRF 및 `--no-sandbox`

- **Severity / type:** High / Verified exposure
- **Evidence:** SERP 결과 URL을 scheme/private IP/DNS/redirect 검증 없이 `undici` redirect-follow와 Playwright로 열며, browser launch에 `--no-sandbox`가 사용된다.
- **Scenario:** search result/redirect/DNS rebinding이 CI runner metadata·internal service에 접근하거나 악성 page가 sandbox 없는 browser의 blast radius를 키울 수 있다.
- **Remediation:** `https` allowlist, literal/private/link-local/loopback deny, resolve 전후·redirect hop별 DNS 검사, body/redirect/time limit, isolated low-privilege container와 browser sandbox를 적용한다. 검증 전 자동 blog workflow를 중지하는 것이 안전하다.

### COR-003 / COR-004 — newsletter partial delivery 후 중복과 성공 오보고

- **Severity / type:** High / Verified defect
- **Evidence:** `lib/sendgrid.ts`는 recipient별 send를 unbounded `Promise.all`로 수행한다. `scripts/send-newsletter.ts`는 전체 성공 뒤에만 `newsletter_content.is_sent`를 갱신하고, 그 DB update 실패는 warning-only로 종료한다.
- **Scenario:** N명 중 일부는 SendGrid가 수락한 뒤 한 요청이 reject하면 job은 실패하고 `is_sent=false`가 남는다. retry가 성공 수신자에게 다시 보낸다. 반대로 전송 후 sent-state write가 실패해도 workflow가 성공한다.
- **Remediation:** immutable delivery run + per-recipient state (`pending/claimed/accepted/failed`), provider message/idempotency key, bounded queue, retry classification, atomic claim/lease, final reconciliation을 구현한다. DB state write 실패는 job failure여야 한다.

### DEP-002 — clean Supabase bootstrap 불가

- **Severity / type:** High / Verified governance/operational defect
- **Evidence:** 56 migration의 DDL inventory에서 55개 created table을 찾았으나 `subscribers`, `email_logs`, `kis_tokens`는 migration 030에서 ALTER만 되고 CREATE가 없다. `supabase/migrations/030_security_rls_lockdown.sql:24-26`은 unconditional ALTER를 수행한다. `docs/tli-v3-status-2026-07-14.md`도 local reset이 030에서 깨진다고 명시한다.
- **Impact:** fresh developer/staging/DR database를 repository만으로 복원할 수 없다. production schema dump에 의존하는 workaround는 infrastructure-as-code와 disaster recovery를 충족하지 못한다.
- **Remediation:** 이미 적용된 production history를 임의 rewrite하지 말고, 검토된 baseline/squash 전략을 정한다. 세 foundation table과 extension/grant/function을 포함한 clean schema를 만들고 PostgreSQL/Supabase reset을 CI에서 매번 실행한다.

### QA-001 / QA-002 / DEP-001 — 기본 quality gate red, 핵심 scripts는 typecheck 밖

- **Severity / type:** High / Verified defect/governance gap
- **Evidence:** 기본 `npm test`는 269 files 중 2 files/3 tests 실패했다. root `tsconfig.json`은 `scripts`, `e2e`, `mcp`를 제외한다. 별도 production scripts typecheck는 4 errors를 냈다. 9 workflows 중 `pull_request`/`push` CI와 test/lint/type/build gate는 0개다.
- **Impact:** 가장 중요한 TLI operational code의 type regression과 red tests가 main/production으로 들어갈 수 있다.
- **Remediation:** 단일 required PR workflow에 clean install, root+scripts+MCP+e2e typecheck, lint, default tests, Python tests, build, migration reset/smoke를 넣는다. flaky test를 제외하는 방식이 아니라 timeout/module-isolation 원인을 수정한다.

### SEC-015 / DEP-005 — runtime vulnerability와 비재현 dependency graph

- **Severity / type:** High / Verified supply-chain risk
- **Evidence:** root audit는 858 dependencies에서 Critical 1/High 15/Moderate 2. direct runtime `next`와 `undici`에 High advisories가 있고 fix가 제공된다. npm/pnpm lock은 52 direct dependencies 중 15개를 다르게 resolve한다. 현재 `node_modules`는 Next/eslint-config 15.5.15이지만 package와 두 lock은 exact 15.5.7이라 `npm ls`가 invalid다.
- **Impact:** local build, GitHub Actions(`npm ci`), Vercel(pnpm으로 문서화)이 서로 다른 코드로 검증·배포된다. build 성공이 production dependency graph를 증명하지 않는다.
- **Remediation:** 단일 manager/lock을 선택하고 `packageManager`, Node exact pin, engines를 선언한다. clean install에서 audit·test·build를 재실행하고 Next/Undici 및 MCP advisories를 patch한다.

### AI-008 — source outage 중 저신뢰 crash가 NORMAL로 바뀜

- **Severity / type:** High / Verified policy defect
- **Evidence:** `lib/llm/korea/gemini-pipeline.market-assessment.test.ts`가 low-confidence fallback crash를 NORMAL로 downgrade하는 동작을 명시적으로 기대한다.
- **Scenario:** 실제 shock 시 required market source 하나가 장애 나면 Gemini fallback으로 전환되고, crash signal confidence가 70 미만이면 정상 recommendation을 계속할 수 있다.
- **Remediation:** market source outage + crash ambiguity는 `ABSTAIN/DEGRADED`, recommendation suppression, operator alert로 처리한다. NORMAL은 정상 관측 근거가 있을 때만 허용한다.

### DATA-001 / DATA-002 — Naver News 날짜 이동과 false completeness

- **Severity / type:** High before scientific promotion; Medium current public / Verified defect
- **Evidence:** `scripts/tli/collectors/naver-news-api.ts:192`는 `new Date(pubDate).toISOString().slice(0,10)`으로 KST 00:00–08:59 기사를 전날 UTC date에 배정한다. API의 1,000-result cap 도달 시 requested window 전체를 덮었는지 확인하지 않고 run을 complete로 쓰고 missing dates를 zero로 만든다.
- **Impact:** public news momentum과 immutable scientific feature에 systematic date shift·undercount·false zero가 들어간다. immutable run은 나중에 정정 비용이 더 크다.
- **Remediation:** KST calendar date parsing, oldest-fetched/total/cap proof, `partial/truncated` state, zero-write 금지, URL/article dedupe 후 count, correction provenance를 구현한다.

### ARC-001 — intra-analysis critical failure 뒤 의존 단계 계속 실행

- **Severity / type:** High / Verified defect
- **Evidence:** `scripts/tli/batch/pipeline-steps.ts:84-200`은 scoring/materialization/comparison/snapshot failure마다 `criticalFailures++`하지만 다음 단계를 실행한다. collection→analysis 경계의 abort는 정상이나 analysis 내부 dependency는 중단되지 않는다.
- **Impact:** 최종 exit 1 이전에 stale lifecycle score를 사용한 comparison, partial snapshot, evaluation materialization이 저장될 수 있다. exit code는 이미 쓴 artifact를 rollback하지 않는다.
- **Remediation:** run-scoped state machine과 dependency graph를 만들고 critical stage 실패 시 downstream skip한다. publish pointer는 모든 artifact 검증 뒤 원자적으로 전환한다.

### SEC-011 — direct DB view가 API containment를 우회할 수 있음

- **Severity / type:** High / Verified authorization gap
- **Evidence:** migration 019는 `v_prediction_v4_serving`에 anon grant를 주며 migration 043은 base table grants만 revoke한다. API는 검증된 champion 전까지 `dataSource:"none"`을 의도하지만 legacy view 직접 query는 별도 노출면이다.
- **Remediation:** 정책 의도를 확인하고 anon/authenticated view execute/select를 revoke한다. public scientific RPC/view 하나만 canonical serving surface로 남기고 grant test를 실제 Postgres에서 수행한다.

### COR-017 / COR-018 — confidence 경고 소실과 mobile chart 0px

- **Severity / type:** High UX/data-communication defect / Browser reproduced
- **Evidence:** `DetailHeader`의 `LifecycleScore` 호출(`app/themes/[id]/_components/detail-header/index.tsx:98`)은 존재하는 `confidenceLevel` prop과 reason을 전달하지 않는다. `comparison-workspace.tsx:14,95,196`은 parent height를 `xl:`에서만 지정하면서 chart에 `height="100%"`를 전달한다. mobile Playwright는 single worker 3/3 실패했다.
- **Impact:** 데이터 부족 경고가 사용자에게 사라지고 mobile에서 핵심 lifecycle graph가 보이지 않는다.
- **Remediation:** score confidence와 reason을 명시적으로 렌더하고 accessible label을 추가한다. mobile base min-height/explicit numeric height를 주고 375/768/desktop visual contract를 green으로 만든다.

---

## 4. 전체 finding register

### 4.1 Architecture, boundaries, dead paths

| ID | Sev | 분류 | Evidence / 영향 / remediation |
|---|---:|---|---|
| ARC-001 | High | Defect | `pipeline-steps.ts:84-200`; critical stage 이후 downstream 실행. fail-stop + atomic publish 필요. |
| ARC-002 | Medium | Defect | `materialize-phase0-artifacts.ts:29,677`가 `ops/run-theme-state-history-backfill.ts`를 import/call. boundary test는 분류만 보고 import direction을 검사하지 않음. runtime service로 추출하고 dependency rule test 추가. |
| ARC-003 | High | Defect | `lib/tli/constants/tli-params.ts:188-193`; `TLI_PARAMS_VERSION=v2`가 gitignored research output을 읽고 missing/invalid면 version은 v2인 채 defaults 사용. immutable promoted artifact로 교체하고 mismatch fail-closed. |
| ARC-004 | High conditional | Defect/orphan | `load-membership-as-of.ts`는 self/test/manifest 외 inbound import 0. `load-feature-inputs.ts:258-262`는 current `theme_stocks.is_active` 사용. legacy prediction을 공개하지 말고 PIT loader를 실제 배선. |
| ARC-005 | Medium | Product mismatch | MCP README는 prediction을 제공한다고 설명하지만 API는 의도적으로 `dataSource:none`. containment는 유지하되 docs/tool response에 unavailable state·조건 명시. |
| ARC-006 | High | Governance | 6 tracked docs가 반드시 읽으라는 `.omo/plans/tli-v3-scientific-rebuild-master.md`는 checkout에 없고 `.omo`는 ignored. canonical plan을 tracked docs로 승격. |
| ARC-007 | Low/Medium | Incomplete | Google Trends fallback adapter가 `not_implemented`. fallback claim을 제거하거나 구현·contract test. |
| ARC-008 | Medium | Maintainability | 7개 strong dead files와 1개 integrate 대상 orphan. 아래 §5 참조. |
| ARC-009 | Medium | Modularity | pagination, KIS clients, retry/sleep/timeout, Supabase initialization이 중복. shared policy modules로 통합. |

### 4.2 Correctness and edge cases

| ID | Sev | 분류 | Evidence / 영향 / remediation |
|---|---:|---|---|
| COR-001 | High | Defect | `/api/tli/changes?period=7d`가 약 7일 전이 아니라 두 번째 최신 row와 비교하고 주석의 5-day minimum을 구현하지 않음. date-targeted lookup/RPC 필요. |
| COR-002 | High | Defect | `scripts/prepare-newsletter.ts` same-date rerun이 이미 sent인 row를 `is_sent:false`로 되돌림. immutable revision 또는 sent row update 금지. |
| COR-003 | High | Defect | SendGrid `Promise.all` partial success 후 global reject/retry 중복. per-recipient ledger 필요. |
| COR-004 | High | Defect | newsletter sent-state DB update failure가 warning-only success. delivery reconciliation 실패로 job을 실패시켜야 함. |
| COR-005 | High | Defect | Vercel cron newsletter route는 delivery state를 기록하지 않음. 중복 구현 제거 후 canonical sender 공유. |
| COR-006 | High | Defect | blog quality gate는 threshold 통과 draft가 없어도 fail-open. publish abstain/failure로 변경. |
| COR-007 | Medium | Defect | blog timeout이 `Promise.race`만 사용해 underlying scraping/LLM 작업을 abort하지 않음. AbortController 전파. |
| COR-008 | Low/Medium | Defect | blog publish path가 `published` state를 두 번 write. single transition/state machine. |
| COR-009 | High | Defect | trading-calendar 구현과 workflow holiday list가 중복·불일치하며 old path는 지원연도 이후 throw. 2026-07-17도 prepare/send가 갈림. 단일 calendar source + KRX observed fallback. |
| COR-010 | Medium | Defect | stock daily-close/price APIs의 ticker/date validation이 부족. strict regex/date bounds와 typed schema 필요. |
| COR-011 | Medium | Test quality | deterministic unit test에 seedless `Math.random()`. seeded PRNG/fixed vectors 사용. |
| COR-012 | High | Defect | membership history close와 replacement가 별도 requests여서 partial bitemporal transition 가능. DB transaction RPC. |
| COR-013 | High | Defect | theme-stock deactivation failures를 상위 pipeline이 ignore할 수 있음. batch result 합산·throw. |
| COR-014 | Low | Defect/dead | dead Serp usage checker가 실제 zero를 `\|\| 250`로 바꿈. 삭제하거나 `??`. |
| COR-015 | High | Defect | Naver theme collector가 `stockCode.startsWith('0')`로 market 추정. 내부 반례 `KOSDAQ:000250`, `KOSPI:105560`. authoritative market field/table 사용. |
| COR-016 | High at scale | Risk | compare/search/list/ranking이 global row limit 후 theme별 latest를 선택해 uneven history에서 theme 누락. window function/RPC 또는 per-theme lateral query. |
| COR-017 | High | Defect | score confidence prop/reason 미전달. UI warning 복원. |
| COR-018 | High | Defect | mobile chart 0 height, E2E 3/3. responsive height contract 수정. |
| COR-019 | Positive | Control | pure bitemporal selector는 business/system-time boundary를 올바르게 적용. |
| COR-020 | Positive | Control | theme detail ascending query + reverse scan의 historical reference 방향은 올바름. |

### 4.3 Security, privacy, supply chain

| ID | Sev | 분류 | Evidence / 영향 / remediation |
|---|---:|---|---|
| SEC-001 | Critical | Exposure | `CRON_SECRET` unset 시 mass-mail auth bypass. fail-closed shared auth. |
| SEC-002 | High | Exposure | subscribe/unsubscribe에 rate limit, CAPTCHA, double opt-in, ownership proof 없음. abuse controls 추가. |
| SEC-003 | High | Defect | raw email unsubscribe URL + page-load mutation. opaque signed token. |
| SEC-004 | High | Privacy | `scripts/send-newsletter.ts`가 subscriber email/name 전부 CI log에 출력. count/redacted ID만 log. |
| SEC-005 | Critical | Defect | anon stock cache writes. revoke + server writer. |
| SEC-006 | High | Exposure | public stock-price request 하나가 최대 10 KIS calls, app rate limit 없음. authenticated/bucketed rate budget. |
| SEC-007 | High | Exposure | scraper URL/redirect/private-IP/DNS rebinding 검증 없음. SSRF guard. |
| SEC-008 | High | Exposure | untrusted page를 Playwright `--no-sandbox`로 실행. sandbox/isolation. |
| SEC-009 | Medium | Defect | MCP analytics limit가 caller-provided `p_ip_hash`를 신뢰해 randomization 우회. trusted server-derived key. |
| SEC-010 | Medium | Defect | public `increment_blog_view_count` SECURITY DEFINER RPC로 counter inflation 가능. revoke public 또는 authenticated server endpoint. |
| SEC-011 | High | Defect | anon-readable legacy prediction view가 API containment 우회 가능. grant revoke. |
| SEC-012 | Medium | Hardening | CSP에 `script-src 'unsafe-inline'`; HSTS, `object-src`, `base-uri` 부재. nonce/hash CSP와 headers 보강. |
| SEC-013 | High | Governance | email/name/IP hash/UA 수집에도 privacy policy/terms가 없고 90-day cleanup 자동 schedule 근거 없음. policy+retention job. |
| SEC-014 | Medium | Supply chain | Actions가 `@v4/@v7/@v2` floating major tag. immutable SHA pin 및 update automation. |
| SEC-015 | High | Supply chain | root 18 vulnerabilities, MCP 4; direct runtime Next/Undici 포함. clean-lock patch/audit. |
| SEC-016 | Positive | Control | redacted tracked-secret scan에서 private key/AWS/GitHub/SendGrid/Google/JWT pattern 0. |
| SEC-017 | Positive | Control | admin APIs와 `send-recommendations`는 fail-closed + timing-safe token. |
| SEC-018 | Positive | Control | blog Markdown `rehype-sanitize`, SendGrid text HTML escaping; open redirect/user-controlled shell sink 미발견. |

### 4.4 Data, AI, prompts, external APIs

| ID | Sev | 분류 | Evidence / 영향 / remediation |
|---|---:|---|---|
| AI-001 | High | Risk | stock JSON은 shape/count/ticker/score만 검증하고 name/previous close/rationale를 KIS·독립 source와 대조하지 않음. structured claims verifier. |
| AI-002 | High | Risk | Stage 5/6이 동일 Gemini preview model+search를 사용해 correlated self-verification. independent deterministic/source verifier. |
| AI-003 | High | Defect | 최대 90 calls, stage timeout 20분이 Vercel `maxDuration=300`과 불일치. global deadline/call/cost budget. |
| AI-004 | High | Governance | newsletter row에 model/prompt version/hash, grounding URL/time, generation run ID, content hash 없음. immutable generation manifest. |
| AI-005 | High | Defect | KIS parse가 malformed/missing change/changePct를 zero로 바꾸고 direct-valid 처리해 false NORMAL 가능. missing은 invalid/degraded. |
| AI-006 | Medium | Reliability | KIS token cache에 auth failure invalidate+single refresh 없음. 401/403 limited refresh. |
| AI-007 | Medium/High | Reliability | required market source 하나 실패 시 전체 Gemini fallback. source-level partial state와 deterministic surviving evidence 사용. |
| AI-008 | High | Defect | low-confidence fallback crash를 NORMAL로 downgrade. abstain/suppress. |
| AI-009 | High | Prompt security | scraped competitor text를 XML-like tags에 escape/instruction boundary 없이 삽입. untrusted data escaping + explicit non-instruction rule. |
| AI-010 | Medium | Validation | generated blog type guard가 shallow하고 FAQ child 구조를 검증하지 않음. full Zod schema. |
| AI-011 | High | Quality | blog quality score는 길이/keyword/headings 중심이며 factual/citation 검증 없음. fail-open auto-publish와 결합. source-backed claim gate. |
| DATA-001 | High* | Defect | Naver KST date를 UTC date로 이동. KST parse. |
| DATA-002 | High* | Defect | 1,000 cap을 complete/zero로 기록. truncation proof/status. |
| DATA-003 | Medium | Defect | article count가 dedupe 전에 계산되고 storage만 `(theme_id,link)` dedupe. canonical dedupe-before-metric. |
| DATA-004 | Positive | Control | DataLab은 strict Zod, immutable run status, partial/failed, anchor default, DB request-window enforcement. |
| REL-001 | Medium | Defect | common retry가 모든 4xx를 retry하고 Retry-After/jitter/quota budget 없음. status-aware policy. |
| REL-002 | High | Defect | KIS daily-range가 모든 error를 `[]`로 swallow. typed failure/partial. |
| REL-003 | High | Defect | upper pipeline이 price failure를 warning으로만 처리하며 stale prices로 진행 가능. freshness gate. |
| ML-001 | Positive | Control | exact feature order/length, v1 reject, canonical SHA-256, immutable manifests, 500 replicate replay/hash, strict public candidate view, service-role RPC, exact-true exposure. |
| ML-002 | High before exposure | Defect | DB `model_type` constraint 없음; legacy scorer는 non-`m1_logistic` 모두 B-Abl로 실행하면서 original version label 유지. CHECK + exhaustive switch. |
| ML-003 | Medium/High | Risk | theme-specific public prediction load에 maximum freshness age 없음. serving age constraint. |

### 4.5 Performance, scalability, resilience, operability

| ID | Sev | 분류 | Evidence / 영향 / remediation |
|---|---:|---|---|
| PERF-001 | High | Defect | newsletter concurrency group 없음, subscriber pagination 없음(기본 1,000), unbounded sends, daily timeout 없음. lease+pagination+queue+timeout. |
| PERF-002 | High | Defect | `snapshotThemePredictionsV3()`가 theme마다 global 20-day interest/news/price/snapshot/episode를 다시 load하는 severe N+1. preload once, index by theme. |
| PERF-003 | High | Risk | API failure를 zero/empty success로 바꾸고 6/24h edge cache. degraded result에는 no-store/error status. |
| PERF-004 | Medium | Scale | `%ILIKE%` search에 trigram index 없음. `pg_trgm` GIN/GiST 또는 search vector. |
| PERF-005 | High | Defect | `batchQuery` default fail-open, nonunique OFFSET order, exact count가 duplicate-replacement를 못 잡음. keyset+unique order+failOnError default. |
| PERF-006 | High growth | Defect | 620KB archive JSON이 client static import되고 hook이 render마다 normalize/map/Map 재생성. build 결과 `/archive` 202KB, first load 404KB. server/date shard + module-level memo. |
| PERF-007 | Medium | Build/runtime | `lib/og-background.ts`가 약 190KB base64를 code에 내장. static asset/cache로 이동. |
| PERF-008 | Medium | MCP | 15s timeout·제한 retry는 긍정이나 Retry-After/jitter/single-flight 없고 대부분 runtime schema 없음; 6h MCP cache가 6/24h edge cache와 겹침. route TTL/schema 정책. |
| OPS-001 | High | Gap | app error tracking, tracing, health endpoint, production metrics 구현 없음. SLO/telemetry. |
| OPS-002 | High | Gap | comparison observability/alerts/retention/drills가 future work이며 promotion gate가 prerequisite를 강제하지 않음. machine-enforced gate. |
| OPS-003 | Medium | Hygiene | 28MB TTC, 1.2MB Smithery map, 4 tracked pyc, growing archive 등 large/generated artifacts. artifact policy/LFS/CDN. |
| PERF-009 | Positive | Control | news-count RPC는 set-based이며 `(theme_id,pub_date)` composite index 존재. migration 043 hot-query indexes도 긍정. |

### 4.6 Tests, types, build, quality

| ID | Sev | 분류 | Evidence / 영향 / remediation |
|---|---:|---|---|
| QA-001 | High | Gate failure | 기본 `npm test`: 267/269 files, 3272/3275 pass. monthly 5s parallel import timeout과 ignored research JSON을 scan하는 boundary test. canonical command green 필요. |
| QA-002 | High | Type gap | root tsc pass지만 scripts 제외. production scripts 별도 tsc 4 errors: reflexivity pagination generic 2, forecast canonical JSON 2. 전용 `tsconfig.scripts.json`. |
| QA-003 | Medium | Gate weakness | ESLint exit 0 with 22 unused warnings, max-warning gate 없음. baseline 정리 후 `--max-warnings=0`. |
| QA-004 | High | Browser failure | Playwright 55/68 pass, 13 fail. stale assertions 외 confidence/chart 실제 회귀. chart isolated repeat 0/3. |
| QA-005 | High | Coverage gap | API route direct tests 7/20. subscribe/unsubscribe/cron/stock/changes 등 critical route가 직접 미검증. |
| QA-006 | Medium | Governance | coverage provider/line/branch threshold 없음. risk-weighted thresholds와 changed-code coverage. |
| QA-007 | High | DB gap | 많은 migration tests가 SQL text regex이며 실제 Postgres apply/constraint/RLS semantics를 검증하지 않음. clean DB integration. |
| QA-008 | Medium | Drift | optimizer Python 9/10; test는 10 params 기대, 구현 19, comment 20. contract SSOT 정리. |
| QA-009 | Positive | Control | targeted Vitest 95/95, adjusted full 3270/3270, scientific Python 135/135, MCP type/build, e2e tsc 통과. |
| QA-010 | Qualified positive | Build | Next build 42.5s/383 pages 성공. 단 installed Next 15.5.15가 locks 15.5.7과 달라 canonical clean build 증거는 아님. |

### 4.7 Deployment, configuration, CI/CD, docs, DX

| ID | Sev | 분류 | Evidence / 영향 / remediation |
|---|---:|---|---|
| DEP-001 | High | Governance | 9 workflows 모두 operational schedule/manual; PR/push CI 0. required checks 추가. |
| DEP-002 | High | DR | foundation tables CREATE 누락, reset 030 failure. baseline/reset CI. |
| DEP-003 | Medium | Config | `supabase/config.toml`은 `./seed.sql`을 enable하지만 파일 없음. seed 추가 또는 disable. |
| DEP-004 | High | Deploy race | docs는 schema-first/app-second를 요구하지만 Vercel auto-deploy와 migration apply가 연결되지 않음. gated deploy pipeline. |
| DEP-005 | High | Reproducibility | npm+pnpm locks, packageManager/engines/.nvmrc 없음, 15 direct resolutions differ. 단일 manager. |
| DEP-006 | High | Env/DX | root README/env template/deployment doc 없음. 추출된 env/system names 94, `lib/env`은 9개만 검증하고 한 route만 import. typed per-surface env matrix. |
| DEP-007 | High | Automation | archive workflow가 schedule+workflow_run 이중 trigger, concurrency/timeout 없이 JSON을 main에 direct push. Vercel ignore가 archive를 제외하지 않아 매일 unreviewed rebuild. data serving 재설계/PR/lock. |
| DEP-008 | Medium/High | Workflow | newsletter concurrency/permissions/timeout 부족; manual tests가 실제 email/Tweet를 전송하고 protected environment 승인 없음. 최소 권한+environment approval. |
| DEP-009 | Medium | MCP release | package/mcp server/smithery 0.5.0, root `server.json` 0.1.3, generated Smithery manifest 0.1.1. release invariant check. |
| DEP-010 | Medium | Governance | Dependabot, CODEOWNERS, root SECURITY/CONTRIBUTING 없음. ownership/update policy. |
| DEP-011 | Medium | Hygiene/DX | 35 machine-absolute `/Users/isaac` links across 14 docs; tracked CPython3.14/pytest9.1 pyc; generated `.smithery`. relative links/cleanup. |
| DEP-012 | Medium | Unknown surface | 두 `/api/cron/*` route는 repository trigger/config reference가 0. 외부 scheduler가 없다면 삭제; 있다면 documented owner/auth/SLO. |
| DEP-013 | Positive | Control | TLI/blog workflows 일부는 concurrency, timeout, explicit permissions, artifact retention을 갖춤. MCP clean build는 tracked 36 dist files와 byte-identical. |
| DOC-001 | High | Governance | 최신 status는 상세하고 reset break까지 솔직히 기록하지만, 반드시 읽으라는 canonical `.omo` plan과 evidence가 fresh clone에 없음. tracked SSOT 필요. |

---

## 5. Dead code, orphan code, reuse, modularization

### 5.1 Strong dead candidates

정적 import graph, literal reference search, independent auditor를 교차 확인했다. 삭제 전 framework convention/dynamic loading을 한 번 더 확인하되 현재 snapshot에서는 inbound production usage가 없다.

| 파일 | 판정 | 조치 |
|---|---|---|
| `app/blog/[slug]/_components/social-share.tsx` | strong dead | 삭제 또는 blog post UI에 명시적으로 배선 |
| `app/technical-indicators/_components/sections/conclusion-cta.tsx` | strong dead | 삭제/section registry 통합 |
| `app/themes/[id]/_components/theme-prediction/sub-components.tsx` | old duplicate | 현재 `index.tsx` 구현과 통합 후 삭제 |
| `components/ui/badge.tsx` | zero imports | 삭제 또는 canonical Badge로 표준화 |
| `components/ui/card.tsx` | zero imports | `GlassCard` 정책과 중복 여부 결정 후 삭제 |
| `lib/crash-alert-to-image.ts` | zero imports | `text-to-image` 경로와 통합 후 삭제 |
| `types/newsletter.ts` | zero imports | 실제 canonical newsletter schema로 통합하거나 삭제 |

### 5.2 삭제하면 안 되는 orphan

- `scripts/tli/features/load-membership-as-of.ts`는 production importer가 0이지만 bitemporal PIT 계약을 구현한다. 이는 **삭제 후보가 아니라 legacy prediction input에 배선해야 할 구현 자산**이다.
- `scripts/tli/ops/run-zombie-theme-cleanup.ts`는 documented manual ops entrypoint이므로 static importer가 없어도 dead가 아니다.
- `mcp/dist/**`는 published package artifact이며 clean build와 byte-identical하므로 dead가 아니다.

### 5.3 Maximal sensible modularization

| 우선순위 | 모듈 | 통합 대상 | 설계 원칙 |
|---|---|---|---|
| 1 | `newsletter-delivery` state machine | prepare, GH sender, 두 cron routes, SendGrid | claim/lease, per-recipient ledger, idempotency, provider reconciliation |
| 2 | `market-calendar` | app utils, TLI, workflow holidays | KST dates, observed KRX data, supported range, one SSOT |
| 3 | `kis-client` | archive client, market assessment, price collectors | token cache/refresh, timeout, retry, schema, quota budget |
| 4 | `supabase-pagination` | 10+ `fetchAllRows`, `batchQuery` variants | keyset, unique order, fail-closed default, typed page result |
| 5 | `external-retry-policy` | blog, Naver, KIS, MCP | status classification, Retry-After, jitter, deadline, circuit/quota budget |
| 6 | `env-contracts` | Next routes, scripts, workflows, MCP | surface별 Zod schema, secret/nonsecret 구분, build/runtime validation |
| 7 | `latest-per-theme` DB layer | ranking/search/list/compare | SQL window/RPC로 global-limit 오류 제거 |
| 8 | `generation-manifest` | newsletter/blog AI | prompt/model/source/hash/run provenance, immutable state transitions |
| 9 | archive serving | static client JSON | server/date shard, CDN cache, typed response, no anon DB writes |
| 10 | TLI dependency rules | runtime/ops/research | AST/import rule와 entrypoint test를 함께 강제 |

과도한 추상화는 피한다. 예를 들어 scientific pure functions와 immutable contract modules는 이미 명확한 경계를 가지므로 generic framework로 다시 감싸지 않는다. 공통화 대상은 **반복 구현이 실제 policy drift를 만든 영역**에 한정한다.

---

## 6. 강한 긍정 통제

1. **Scientific ML contract:** exact feature order/vector length, nonfinite guard, v1 artifact reject, canonical SHA-256, immutable source manifests, 500-replicate interval replay/hash verification.
2. **Public prediction containment:** eligible/public/candidate/champion 조건과 exact-true exposure flag가 기본적으로 fail-closed다. 현재 empty response는 고장이 아니라 올바른 통제다.
3. **DataLab:** strict Zod, immutable complete/partial/failed run, anchor default, DB request-window verification.
4. **Recent TLI DB security:** service-role-only RLS와 explicit revoke가 대체로 잘 구성되어 있다.
5. **Admin authentication:** admin APIs와 `send-recommendations`는 missing secret을 거부하고 timing-safe comparison을 사용한다.
6. **Output sanitization:** blog Markdown sanitize, SendGrid escaping, user-controlled shell/open redirect 미발견.
7. **Testing depth:** adjusted TS suite 3,270 tests와 scientific Python 135 tests는 domain contract에 대한 상당한 투자를 보여 준다.
8. **Operational candor:** 최신 TLI status는 incident, containment, reset break, forward-only migration을 숨기지 않는다.
9. **DB query positives:** set-based news count RPC와 composite/hot-query indexes.
10. **MCP artifact reproducibility:** temporary clean build 36 files가 tracked `mcp/dist`와 byte-for-byte 일치한다.
11. **Secret hygiene:** targeted tracked secret patterns 0건.

이 긍정점들은 일부 finding의 blast radius를 줄이지만, public attack surface와 release gate를 대체하지는 않는다.

---

## 7. 실제 검증 결과

모든 long-running command에 hard deadline을 두었고 application source는 수정하지 않았다.

| 검증 | 결과 | 해석 |
|---|---|---|
| Targeted Vitest 8 files | **PASS 95/95** | pipeline/membership/Naver/KIS/market/prediction 핵심 회귀 |
| 기본 `npm test` | **FAIL** 267/269 files, 3272/3275 | canonical gate red |
| Monthly calibration isolated | **PASS 4/4** | full-suite 5s import contention 후 mock pollution으로 분리 |
| Full Vitest, boundary 제외 + 15s | **PASS 268 files/3270 tests** | 나머지 suite는 green; default 수정은 여전히 필요 |
| Root `tsc --noEmit` | **PASS** | 단 `scripts/e2e/mcp` 제외 |
| Production scripts temp tsc | **FAIL 4 errors** | reflexivity loader 2, forecast manifest JSON typing 2 |
| E2E dedicated tsc | **PASS** | Playwright source type valid |
| ESLint | **PASS with 22 warnings** | max-warning gate 없음 |
| Next production build | **PASS**, 42.5s, 383 pages | `/archive` 202KB/404KB; local dependency graph invalid |
| MCP typecheck/temp build | **PASS**, 36 outputs | tracked dist와 byte-identical |
| Scientific Python | **PASS 135/135**, 42.04s | CPython3.13.11 + exact deps; local uv 0.9.28 vs documented 0.9.25 |
| Optimizer Python | **FAIL 9/10** | param-count contract drift |
| Playwright actual browser | **FAIL 55/68** | stale assertions + real confidence/chart regressions |
| Mobile chart isolated repeat | **FAIL 0/3** | deterministic responsive defect |
| Root npm audit | **18**: C1/H15/M2 | direct Next/Undici high 포함; fixes available |
| MCP npm audit | **4**: H1/M2/L1 | fixes available |
| Redacted secret scan | **PASS 0 targeted hits** | 값은 출력하지 않음 |
| MCP dist hash comparison | **PASS 36/36** | generated dist current |

대표 command logs:

- `/tmp/stock-ai-targeted-vitest.log`
- `/tmp/stock-ai-full-vitest.log`
- `/tmp/stock-ai-full-vitest-adjusted.log`
- `/tmp/stock-ai-runtime-scripts-tsc.log`
- `/tmp/stock-ai-next-build.log`
- `/tmp/stock-ai-python-pytest.log`
- `/tmp/stock-ai-optimizer-pytest.log`
- `/tmp/stock-ai-playwright-rerun.log`
- `/tmp/stock-ai-playwright-chart-repeat.log`
- `/tmp/stock-ai-root-npm-audit.json`
- `/tmp/stock-ai-mcp-npm-audit.json`

### 7.1 Test coverage 해석

- 20 API routes 중 direct `route.test`는 7개다.
- newsletter auth/delivery, subscribe/unsubscribe, stock APIs, changes 등 가장 위험한 routes가 직접 미검증이다.
- coverage provider/threshold가 없다.
- 많은 migration tests는 SQL text를 읽어 regex/substring을 확인하며 PostgreSQL에서 실제 apply하지 않는다.
- E2E assertion 일부는 UI redesign 뒤 갱신되지 않았으므로 test contract ownership이 필요하다.
- 테스트 수가 많다는 사실과 critical path가 검증됐다는 사실을 구분해야 한다.

---

## 8. Remediation roadmap

### Phase 0 — 즉시 containment

1. 취약 `send-newsletter` API route를 disable/delete하거나 fail-closed auth helper로 교체.
2. `stock_price_cache` anon insert/update revoke; browser direct writer 중단.
3. unsubscribe raw-email link와 auto side effect 중단; signed token 방식 배포.
4. subscriber PII logging 제거.
5. scraper automation을 일시 중지하거나 SSRF/private-network/sandbox guard 배포.
6. Next/Undici와 audit fix 가능한 production dependencies patch.
7. prediction legacy view의 public grant revoke 여부를 production DB에서 확인·적용.

### Phase 1 — release gate 복구

1. newsletter delivery ledger, atomic claim, per-recipient reconciliation, pagination, bounded concurrency.
2. root/scripts/MCP/e2e type configs와 canonical green commands 확립.
3. PR CI required checks; default Vitest flake/boundary filesystem scan 수정.
4. mobile chart와 confidence warning 수정, stale E2E 갱신.
5. 단일 package manager/lock, exact Node/package manager pin, clean install build.
6. clean DB baseline + reset/migration/RLS integration CI.
7. typed environment matrix와 `.env.example`(placeholder only), build/runtime validation.

### Phase 2 — data and operational integrity

1. Naver KST parsing, truncation/partial run contract, dedupe-before-count correction.
2. pipeline run-scoped artifacts, stage dependency stop, atomic publish pointer.
3. market assessment missing-value handling과 `ABSTAIN/DEGRADED` policy.
4. AI generation manifest와 independent claim/source verification.
5. health/error tracking/tracing/SLO dashboards와 alert owner.
6. archive server/date sharding; direct main push workflow 제거 또는 protected PR flow.

### Phase 3 — scale and modularization

1. legacy prediction global-data N+1 제거.
2. keyset pagination/fail-closed `batchQuery`와 latest-per-theme SQL.
3. KIS/retry/calendar/Supabase clients 통합.
4. search trigram indexes와 query plans 검증.
5. dead code 정리 및 generated artifact policy 적용.
6. MCP schemas/cache freshness/release metadata invariant 보강.

### Phase 4 — prediction exposure 전용 gate

1. PIT membership loader를 실제 production scoring path에 배선.
2. Naver corrections 이후 clean immutable cohort를 다시 증명.
3. DB `model_type` constraint와 exhaustive loader, prediction max age.
4. direct legacy view 차단과 canonical public RPC만 허용.
5. observability/retention/rollback drills를 promotion gate가 기계적으로 검사.
6. prospective sample/effect gate를 변경 없이 통과할 때만 exposure flag 전환.

---

## 9. Release checklists

### 9.1 Security/privacy

- [ ] 모든 cron/admin route는 secret missing/empty/wrong을 401/403으로 거부한다.
- [ ] stock cache anon writes가 production DB에서 revoke됐다.
- [ ] subscribe/unsubscribe에 ownership proof와 rate limiting이 있다.
- [ ] URL, logs, analytics에 raw subscriber email이 없다.
- [ ] scraper는 private/link-local/loopback/DNS rebinding/redirect를 차단한다.
- [ ] browser sandbox와 isolated runner가 활성화됐다.
- [ ] privacy policy, terms, retention schedule, data owner가 공개·승인됐다.
- [ ] public SECURITY DEFINER/view grants를 실제 DB에서 enumerate하고 승인했다.
- [ ] root/MCP audit의 accepted vulnerabilities가 owner/expiry와 함께 기록됐다.

### 9.2 Newsletter

- [ ] newsletter row는 sent 상태에서 prepare rerun으로 되돌아가지 않는다.
- [ ] delivery run과 recipient별 상태/idempotency key가 있다.
- [ ] subscriber pagination이 1,000행 이상 test로 검증됐다.
- [ ] SendGrid concurrency와 retry budget이 제한된다.
- [ ] provider accept 후 DB failure reconciliation test가 있다.
- [ ] duplicate concurrent workflow test가 있다.
- [ ] model/prompt/source/run/content hash가 저장된다.
- [ ] source outage/crash ambiguity에서는 recommendation을 보내지 않는다.

### 9.3 Data/TLI/ML

- [ ] KST Naver date fixtures와 cap-truncated fixture가 통과한다.
- [ ] partial/truncated run은 complete/zero로 쓰이지 않는다.
- [ ] membership history transition이 DB transaction이다.
- [ ] legacy prediction이 PIT membership만 사용한다.
- [ ] critical stage 실패 시 downstream artifacts가 publish되지 않는다.
- [ ] model type/freshness constraints가 DB와 loader 양쪽에 있다.
- [ ] public prediction access surface가 하나뿐이다.
- [ ] scientific promotion은 dashboard/alerts/retention/drills를 강제한다.

### 9.4 Build/test/CI

- [ ] clean checkout에서 선택한 단일 manager로 install한다.
- [ ] `npm test` 또는 대체 canonical test command가 예외 없이 green이다.
- [ ] root와 production scripts typecheck가 모두 green이다.
- [ ] ESLint warning budget이 0 또는 승인된 baseline이다.
- [ ] Playwright desktop/mobile가 green이다.
- [ ] critical 20 API routes의 risk-based route tests가 있다.
- [ ] migration은 empty Postgres/Supabase에 실제 적용된다.
- [ ] PR required checks가 branch protection에 연결됐다.
- [ ] clean install build의 dependency versions가 deployment와 동일하다.

### 9.5 Deployment/DR/operations

- [ ] fresh DB가 production schema를 repository만으로 재현한다.
- [ ] schema-first/app-second 순서가 자동 gate다.
- [ ] backup restore와 forward-fix rehearsal evidence가 있다.
- [ ] archive update가 중복 trigger/direct main push를 하지 않는다.
- [ ] workflow concurrency, timeout, permissions, protected environment가 설정됐다.
- [ ] health, error tracking, tracing, metrics, alert routing이 동작한다.
- [ ] runbook과 canonical plan이 tracked fresh clone에서 열리고 상대 링크가 유효하다.
- [ ] MCP package/server/Smithery version이 release check에서 일치한다.

---

## 10. 독립 재검증과 오탐 처리

별도 auditor는 SEC-001, SEC-003, SEC-005, newsletter partial delivery, no PR CI/dual lock/type gap, 7개 dead files, scientific containment의 강점을 확인했다. 다음 auditor 결론은 primary evidence가 반박해 채택하지 않았다.

| Auditor 주장 | 최종 판정 | 근거 |
|---|---|---|
| PIT loader가 production에서 사용됨 | 기각 | self/test/manifest 외 import 0; live legacy loader는 current `theme_stocks` query |
| confidence warning이 존재하므로 문제 없음 | 기각 | comparison confidence와 score confidence는 다른 계약; `DetailHeader`가 `LifecycleScore.confidenceLevel`을 전달하지 않음 |
| chart default 350px라 collapse 불가 | 기각 | workspace가 `height="100%"`로 override하고 parent height는 `xl:` only; mobile 3/3 실패 |
| audit high/critical은 모두 dev-only | 기각 | direct runtime Next와 Undici high advisories가 저장된 audit JSON에 존재 |
| clean bootstrap은 production에 영향 없어 Low | 상향 | DR/staging/reproducibility를 차단하고 최신 status도 reset break를 인정 |
| Naver 날짜/cap은 Low | 상향 | immutable study/public score에 false date/zero/undercount를 기록 |

이 과정은 독립 리뷰 결과도 사실 검증 없이 권위로 채택하지 않았음을 명시한다.

---

## 11. 제한사항

1. CommitLore history는 ready였고 path records는 0이었지만 notes mirror가 unfetched라 context/guard가 `incomplete:true`, `proposal_checked:false`였다. matched ruled-out record는 없었다.
2. production Supabase schema, RLS 실제 적용 상태, Vercel environment, GitHub branch protection, SendGrid/KIS/Naver quota와 live traffic은 직접 검증하지 않았다.
3. production data mutation, actual mass email, destructive DB reset, remote deployment는 실행하지 않았다.
4. Next build는 local `.env.production.local/.env.local`과 invalid `node_modules`를 사용했으므로 clean Vercel/npm-ci build와 동일하다고 주장하지 않는다.
5. default Vitest boundary failure에는 gitignored local optimizer outputs가 영향을 줬다. 이 자체가 environment-sensitive test 문제지만 clean CI에서 같은 파일은 없을 수 있다.
6. static import graph는 dynamic import, framework convention, external consumer를 완전하게 증명하지 못하므로 dead candidates는 삭제 전 마지막 확인이 필요하다.
7. npm audit는 review 시점 registry advisory와 lockfiles에 대한 point-in-time 결과다.
8. Playwright 상세 tests는 mock API + local dev server였고 production visual/network behavior 전체를 대체하지 않는다.
9. file:line references는 고정 snapshot 기준이며 이후 변경 시 이동할 수 있다.
10. canonical `.omo` plan과 일부 ignored evidence가 checkout에 없어 그 문서의 과학적 주장 자체는 전수 검증할 수 없었다.

---

## 12. 최종 승인 조건

현재 판정은 **NOT READY**다. 다음 production release 승인에는 최소한 다음 증거가 필요하다.

1. RB-01~RB-08, RB-13, RB-14가 닫혔거나 명시적 risk acceptance가 있다.
2. clean checkout/clean install/clean DB에서 required CI 전체가 green이다.
3. default test, scripts typecheck, Playwright mobile/desktop가 green이다.
4. production DB grant probe와 dependency audit가 release artifact에 보존된다.
5. newsletter duplicate/partial-delivery fault-injection test가 green이다.
6. Naver correction과 pipeline fail-stop이 run-scoped integration test로 증명된다.
7. prediction exposure는 별도 conditional blockers가 모두 닫힐 때까지 `dataSource:none`과 fail-closed flags를 유지한다.

이 조건을 충족하기 전까지는 기능 추가보다 containment, reproducibility, delivery correctness, data integrity를 우선한다.

---

## Appendix A — Review artifacts and repository state

- Inventory: `/tmp/stock-ai-newsletter-review-inventory.json`
- Tracked paths: `/tmp/stock-ai-newsletter-tracked-files.txt`
- Import graph: `/tmp/stock-ai-newsletter-import-graph.json`
- Root audit: `/tmp/stock-ai-root-npm-audit.json`
- MCP audit: `/tmp/stock-ai-mcp-npm-audit.json`
- Application source/config modifications by this review: **none**
- Pre-existing user change preserved: `.serena/project.yml`
- Intended repository diff from this review: **only this Markdown file**
