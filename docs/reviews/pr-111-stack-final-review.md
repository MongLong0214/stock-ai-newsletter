# PR #111 스택 최종 리뷰 (#119 → #120 → #118 → #115 → #116)

작성: 2026-08-11 · CTO(Claude Code)
대상 시점: `pr/05-ui-regression` = `f9659cb`

이 문서는 **인수인계용**이다. 다음 담당자가 재조사 없이 이어받을 수 있도록,
무엇을 고쳤는지뿐 아니라 **무엇을 일부러 안 고쳤는지와 그 근거**를 함께 남긴다.

---

## 1. 결론

| PR | 브랜치 | 판정 | 근거 |
|---|---|---|---|
| #119 | `pr/01-security-containment` | **머지 가능** | 무음 실패 4건 수정 |
| #120 | `pr/02-newsletter-delivery` | **머지 가능** | 배포 즉시 실패하던 P0 마이그레이션 수정 |
| #118 | `pr/03-tli-data-correctness` | **머지 가능** | 지적 2건 모두 검증에서 기각 — 수정 불필요 |
| #115 | `pr/04-query-performance` | **머지 가능** | 절단 2곳 + 마이그레이션 + 계약 수정 |
| #116 | `pr/05-ui-regression` | **머지 가능** | 리뷰 지적 0건 |

전 PR `MERGEABLE / CLEAN`. 스택이므로 **#119부터 순서대로** 머지해야 한다.

검증 상태:

```
tsc --noEmit   0
eslint .       0 errors (warning 22건은 기존)
vitest         296 files / 3,534 tests  전부 통과
playwright     60 failed — 후술. 이 변경과 무관한 환경 문제
```

---

## 2. 리뷰 방법과 그 결과

세 단계를 거쳤고, **각 단계가 앞 단계를 교정했다.** 이 이력 자체가 다음 담당자에게
필요한 정보라 남긴다.

| 단계 | 수행 | 결과 |
|---|---|---|
| 1 | 1차 리뷰어 모델 전수 diff 리뷰 | `fix` 12건 제안 |
| 2 | CTO 코드 직접 검증 | 1건 기각 |
| 3 | gpt-5.6-sol (xhigh, read-only) 적대 리뷰 | 3건 기각 + CTO 오판 1건 정정 |
| 4 | 테스트 실행 | **세 리뷰가 모두 놓친 회귀 1건 발견** |

교정 사례:

- **1차 리뷰 오판** — `unsubscribe/request`의 `catch`를 없애 설정 오류를 노출하라고 제안했다.
  그 `catch`는 주석에 이유가 적힌 의도적 코드이며, 제안대로 고치면 구독 주소에만 500이
  나가 **구독자 열거 오라클이 부활한다.**
- **CTO 오판** — `subscribe` 실패 정리 delete를 "upsert가 이미 토큰을 무효화하므로
  무해"로 기각했다. **동시 요청을 고려하지 않은 판단이었고** gpt-5.6-sol이 정정했다.
- **gpt-5.6-sol 오판** — 429 오분류를 "`retryable`을 소비하는 곳이 없다"며 기각했다.
  소비자는 `pr/02`가 들고 온다(`lib/delivery/service.ts:653`). 지시문에 "해당 PR
  브랜치에서 확인하라"고 쓴 탓에 스택 상위를 못 본 시야 제한이었다.
- **세 리뷰 공통 누락** — `app/api/tli/compare/__tests__/sparkline-order.test.ts`가
  **2026-08-05부터 매일 실패**하고 있었다. 원격 `pr/04`에서도 실패 상태였다.
  아무도 테스트를 실행하지 않아서 diff 리뷰만으로는 잡히지 않았다.

---

## 3. 수정 내역

### #119 `pr/01-security-containment` — `db976c1`

| 위치 | 문제 | 수정 |
|---|---|---|
| `lib/sendgrid.ts:287` | 429·408을 4xx 영구 실패로 분류 | `retryable: true`로 분리 |
| `lib/sendgrid.ts:331` | 제공자 거부가 `errors[]`에 안 들어가 성공 반환 | 거부를 `errors`에 적재 |
| `app/api/unsubscribe/request/route.ts` | 시크릿 미설정 throw를 발송 실패 핸들러가 삼킴 | 토큰 발급을 구독자 조회 **앞으로** 이동 |
| `app/api/subscribe/route.ts:105` | 실패 정리 delete가 주소의 모든 pending 행 삭제 | `confirm_token_hash` 조건 추가 |
| `app/api/subscribe/confirm/route.ts:61` | `no_secret`을 400으로 뭉갬 | 503으로 분기 |

429 건은 코드가 **자기 주석과 모순**된 상태였다. `lib/delivery/service.ts:654`는
`// 429/5xx → retryable`이라 적혀 있는데 `sendgrid.ts`가 429를 영구로 분류했다.

`sendStockNewsletter`는 `@deprecated`이지만 **프로덕션 cron 2개가 실제로 호출한다**
(`app/api/cron/send-newsletter/route.ts:64`, `send-recommendations/route.ts:81`).
100명 중 50명이 거부돼도 `✅ 이메일 전송 완료: 100명`을 찍고 성공 반환하고 있었다.

### #120 `pr/02-newsletter-delivery` — `9bfc1b8`

**P0 — `059`는 이미 `058`이 적용된 데이터베이스에서 반드시 실패했다.**

```
058: claim_delivery_batch RETURNS TABLE (delivery_id, subscriber_id)
059: CREATE OR REPLACE ... RETURNS TABLE (delivery_id, subscriber_id, attempt_count)
     → ERROR: cannot change return type of existing function
```

그 문장에서 파일이 중단되어 **이후 마이그레이션이 전부 미적용**으로 남는다.
058·059를 함께 처음 적용하는 DB에서는 재현되지 않아 프로덕션에서만 드러난다.

`DROP FUNCTION IF EXISTS`를 앞에 두고, **DROP이 버리는 ACL을 되살리는
REVOKE/GRANT 블록을 새 정의 뒤에 다시 넣었다.** `CREATE OR REPLACE`는 권한을
보존하지만 `DROP`은 보존하지 않는다 — 이 블록이 없으면 `service_role` 호출이
전부 permission denied가 된다.

그 외:
- `scripts/send-newsletter.ts:97` — `result.alreadySent` 무시로 재실행마다 X 중복 게시
- `lib/delivery/service.ts:318` — `newsletter_delivery_runs` 조회 error 무시

### #118 `pr/03-tli-data-correctness` — 수정 없음

지적 2건 모두 기각. §5 참조.

### #115 `pr/04-query-performance` — `2b71d95`, `cd6e7e2`, `a60d96c`

| 위치 | 문제 |
|---|---|
| `app/api/tli/changes/route.ts:38` | 활성 테마 ID를 무제한 select → PostgREST `max_rows`(1000)에서 조용히 절단 |
| 같은 파일 이름 조회 | `.in('id', themeIds)`도 같은 상한. 초과분은 이름 없이 렌더 |
| `supabase/migrations/063` | trgm 인덱스 4개가 `extensions.gin_trgm_ops` 고정 참조 |
| `app/api/openapi.json/route.ts` | 스펙이 구현과 불일치 (기존 결함) |

바로 아래 점수 조회는 `// COR-016: PostgREST max_rows=1000 우회`라는 주석과 함께
RPC로 상한을 피해 가는데, **정작 그 RPC에 넣을 ID 목록이 이미 잘려 있었다.**

`063`은 `059`와 같은 구조다. `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA extensions`는
확장이 다른 스키마에 이미 있으면 **`IF NOT EXISTS`가 먼저 걸리고 `WITH SCHEMA`가 무시된다.**
일부 Supabase 프로젝트는 `pg_trgm`을 `public`에 미리 깐다. 실제 스키마를 조회해
`format(%I)`로 인덱스를 만들도록 바꿨다.

### #116 `pr/05-ui-regression` — 수정 없음

리뷰 지적 0건. `production_ready: true`.

---

## 4. API 계약 변경 (소비자 영향)

`/api/tli/changes` 응답에 필드 3개가 **추가**됐다. 기존 필드는 그대로라 하위 호환이다.

```
currentAt    최신 관측일
previousAt   기준 관측일
gapDays      두 관측 사이 실제 일수
```

이유: 이 엔드포인트의 소비자는 UI가 아니라 **`llms.txt`·`openapi.json`을 읽는
어시스턴트**다. 그런데 lookback 창이 요청 기간보다 넓다 — 수집이 하루 걸러도
엔드포인트가 비지 않도록 **1d는 3일, 7d는 12일**을 거슬러 본다. 그래서
`currentScore`가 며칠 지난 값일 수 있고, `period=1d`인데 실제 구간이 3일일 수 있다.
어시스턴트는 그 값을 "오늘"로 단정할 수밖에 없었다.

**선택 로직은 건드리지 않았다.** 무엇을 mover로 볼지는 제품 결정이고, 창을 좁히면
수집 공백에 엔드포인트가 비는 기존 방어가 사라진다. 대신 구간을 관측 가능하게 했다.

동시에 **`openapi.json`이 이 회차 이전부터 구현과 어긋나 있었다.**

```
스펙:  id / score / stage
실제:  themeId / currentScore / currentStage
```

`stageTransitions`·`newlyEmerging`도 동일했다. 스펙대로 읽는 어시스턴트는
**없는 키를 찾고 있었다.** `ThemeChangeBase`·`ThemeMover` 공통 스키마로 실제에 맞췄다.

---

## 5. 기각한 지적 (다시 조사하지 말 것)

리뷰가 제안했으나 검증에서 **근거 없음으로 판정**한 항목이다. 각각 왜 아닌지 남긴다.

| 지적 | 기각 사유 |
|---|---|
| compare 라우트가 청킹 없이 RPC 호출 | `route.ts:30`이 5개 초과를 400으로 거부. RPC 상한 500에 못 닿음 |
| 0건 수락 완료가 콘텐츠를 sent로 표시 | `isSuccessfulDelivery`(`service.ts:148`)가 이미 `accepted > 0` 검사 |
| 2시간 넘는 활성 rate-limit 창 삭제 | 최장 창 3600초 vs 정리 컷오프 7200초. 2배 여유 |
| 1d 기준선이 입력 순서에 의존 | `date-selection.ts`의 그 헬퍼를 프로덕션이 호출하지 않음 |
| `deadlineMs`/`budgetMs=0`이 truthy로 무시 | 4번째 옵션 인자를 넘기는 호출부가 없음 |
| DB 쓰기 실패 후 배치 중단 | `break`는 이미 claim된 수신자를 고아로 만든다. `059`는 stale claim을 자동 회수하지 않으므로 현재 동작이 더 안전 |

---

## 6. 남은 문제 (다음 담당자용)

### 6.1 PR에서 도는 테스트 CI가 없다 — **우선순위 최상**

워크플로우 9개가 전부 `schedule`/`workflow_dispatch`다. **`pull_request` 트리거가 하나도 없다.**
유일한 PR 체크는 Vercel 배포이고, 그 `pass`는 "빌드가 됐다"는 뜻이지
"테스트가 통과했다"가 아니다.

**3,534개 테스트를 아무도 자동으로 돌리지 않는다.** §2의 회귀가 일주일 넘게
살아남은 직접적 원인이다.

제안 워크플로우 (`.github/workflows/ci.yml`). 저장소에 `pnpm-lock.yaml`과
`package-lock.json`이 **둘 다 커밋돼 있는데**, 기존 워크플로우 9개가 전부
node 20 + `npm ci`로 실제로 돌고 있으므로 검증된 그 경로에 맞췄다.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: typecheck · lint · test
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      # 개별 step 으로 둔다. 하나로 묶으면 첫 실패에서 멈춰 나머지 결과를 못 본다.
      - name: Typecheck
        run: npx tsc --noEmit
      - name: Lint
        run: npx eslint .
      - name: Unit tests
        run: npx vitest run --reporter=dot
```

E2E는 여기 넣지 않았다 — §6.2 참조.

### 6.2 E2E는 로컬/CI에서 구조적으로 통과 불가

```
72건 중 60건 실패. 원본 브랜치(origin/pr/05)에서도 실패 목록이 완전히 동일하다.
```

`/themes`가 **SSR에서 Supabase를 직접 조회**하는데, Playwright의 `page.route`는
브라우저 요청만 가로챈다. 서버 쪽 조회는 모킹이 안 걸리므로 실데이터가 없으면
빈 목록이 렌더되고 테마 링크 계열이 전부 실패한다.

통과하는 12건은 stats/ranking 계열(클라이언트 재호출 시나리오)이다.

**선택지**: (a) 실데이터가 있는 스테이징에서만 실행, (b) SSR 경로를 테스트 모드에서
주입 가능하게 리팩터, (c) 실패하는 60건을 SSR 의존으로 명시 분리. 제품 결정이라
손대지 않았다.

### 6.3 락파일이 두 개 커밋돼 있다

`pnpm-lock.yaml`(8,803줄)과 `package-lock.json`(13,227줄)이 공존한다.
로컬은 pnpm 10.34.5, CI 워크플로우는 `npm ci`. `package.json`에
`packageManager`·`engines` 필드가 없어 무엇이 정본인지 명시돼 있지 않다.
`.nvmrc`도 없다.

### 6.4 1d 기준선에 간격 하한이 없다 — 제품 결정 필요

```
7d:  MIN_7D_GAP_DAYS = 5 강제 + latest−7일 근처 선택
1d:  candidates[0] 그대로 — 간격 제약 없음
```

수집이 이틀 밀리면 3일치 변화가 "1일 변화"로 나간다. §4의 `gapDays`로
**관측은 가능해졌지만 동작은 그대로다.** 하한을 넣을지, 넣는다면 몇 일로 할지는
"무엇을 mover로 볼 것인가"라는 제품 결정이라 미뤘다.

---

## 7. 재현·검증 방법

```bash
# 스택 최상단에서
git switch pr/05-ui-regression

npx tsc --noEmit          # 0
npx eslint .              # 0 errors
npx vitest run            # 296 files / 3534 tests

# 계약 회귀 테스트만
npx vitest run app/api/tli/changes/__tests__/response-contract.test.ts
```

### 계약 테스트는 변이 시험을 통과했다

`response-contract.test.ts`는 **두 번 무의미했다가 세 번째에 유효해졌다.**
같은 실수를 반복하지 않도록 남긴다.

| 시도 | 방식 | 결과 |
|---|---|---|
| 1차 | 라우트 소스를 문자열로 검사 | mover의 `gapDays`를 지워도 `stageTransitions` 쪽 같은 이름에 걸려 **통과** |
| 2차 | 실제 응답 검사, 픽스처 최신 관측 = 오늘 | `currentAt`을 현재 날짜로 바꿔치기해도 **통과** |
| 3차 | 픽스처 최신 관측 = 어제 | 변이 3종 전부 **포착** |

검증한 변이:

```
mover 에서 gapDays 제거              → 2건 실패 ✓
currentAt 을 new Date() 로 고정       → 1건 실패 ✓
stageTransitions 에서 gapDays 제거    → 1건 실패 ✓
원복                                 → 5건 통과 ✓
```

**통과하는 테스트와 회귀를 막는 테스트는 다르다.** 계약 테스트를 추가하거나
고칠 때는 반드시 변이를 넣어 실패시켜 볼 것.

---

## 8. CommitLore

수정 커밋 5개 전부 트레일러를 달았고 `commit-msg` 훅을 통과했다.
`Ruled-out` 기록이 특히 중요하다 — 다음 담당자가 같은 함정에 빠지는 것을 막는다.

```
unsubscribe/request의 catch 제거로 설정오류 노출 | 구독 주소에만 500이 나가 열거 오라클이 부활한다
ALTER EXTENSION pg_trgm SET SCHEMA  | 전역 공유 확장을 우리 인덱스 4개 때문에 옮기게 된다
1d 기준선에 간격 하한 도입           | 제품 결정이고 수집 공백에 엔드포인트가 비는 회귀를 만든다
라우트 소스 문자열 검사로 계약 고정   | 같은 필드명이 다른 객체에 있으면 회귀를 놓친다
DB 쓰기 실패 시 배치 루프 중단        | 이미 claim된 수신자가 고아로 남는다
```

해당 경로를 편집하면 전역 `PreToolUse` 훅이 이 기록을 자동 주입한다.
조회를 따로 지시할 필요 없다 — **push 방식이지 pull이 아니다.**

원격 notes 미러는 아직 없다(`commitlore sync` → `no notes mirror on either side`).
트레일러는 커밋 메시지 자체에 있으므로 손실은 없다. 미러가 필요하면:

```bash
git push origin refs/notes/commitlore
```
