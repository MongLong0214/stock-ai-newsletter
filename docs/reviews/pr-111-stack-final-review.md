# PR #111 스택 최종 리뷰 (#119 → #120 → #118 → #115 → #116)

작성: 2026-08-11 · 갱신: 2026-08-12 (2라운드 블라인드 리뷰 반영) · CTO(Claude Code)
대상 시점: `pr/05-ui-regression` = `12a9b2d`

이 문서는 **인수인계용**이다. 다음 담당자가 재조사 없이 이어받을 수 있도록,
무엇을 고쳤는지뿐 아니라 **무엇을 일부러 안 고쳤는지와 그 근거**를 함께 남긴다.

리뷰는 두 라운드로 진행했다. 1라운드는 3단계 교차 리뷰, 2라운드는 **1라운드의 판정과
수정 이력을 전혀 주지 않은 블라인드 재리뷰**다. 2라운드에서 14건이 더 나왔고 9건을 고쳤다.

---

## 1. 결론

| PR | 브랜치 | 판정 | 1R 수정 | 2R 수정 |
|---|---|---|---|---|
| #119 | `pr/01-security-containment` | **머지 가능** | `db976c1` | `0685bbb` |
| #120 | `pr/02-newsletter-delivery` | **머지 가능** | `9bfc1b8` | `5fe548a`, `c50c3b4` |
| #118 | `pr/03-tli-data-correctness` | **머지 가능** | 없음 | `5c3b507` |
| #115 | `pr/04-query-performance` | **머지 가능** | `2b71d95`, `cd6e7e2`, `a60d96c` | `a67a6b1`, `239f7fe` |
| #116 | `pr/05-ui-regression` | **머지 가능** | 없음 | 없음 (양 라운드 지적 0건) |

전 PR `MERGEABLE / CLEAN`. 스택이므로 **#119부터 순서대로** 머지해야 한다.

미수정 지적 4건이 남아 있다. 전부 머지 차단 사유가 아니라고 판단했고 근거는 §6에 있다.

검증 상태 (`12a9b2d`에서 2026-08-12 재실행):

```
tsc --noEmit   exit 0
eslint .       0 errors (warning 22건은 기존)
vitest         298 files / 3,560 tests  전부 통과
playwright     60 failed — 후술. 이 변경과 무관한 환경 문제
```

---

## 2. 리뷰 방법과 그 결과

**각 단계가 앞 단계를 교정했다.** 이 이력 자체가 다음 담당자에게 필요한 정보라 남긴다.

### 1라운드 — 3단계 교차 리뷰

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

### 2라운드 — 블라인드 재리뷰

1라운드가 "고쳤다"고 선언한 뒤, **gpt-5.6-sol(xhigh)에게 1라운드의 판정·수정 이력·
기각 목록을 전혀 주지 않고** 같은 5개 PR을 처음 보는 것처럼 다시 리뷰시켰다.
자기가 방금 내린 판정을 다시 확인하는 게 아니라, 판정 자체를 다시 만들게 하는 것이 목적이다.

```
결과 — 14건 (P1 12, P2 2). #116만 production_ready: true
  9건 수정   (구현은 gpt-5.6-terra, CTO 가 변이 시험으로 독립 재현)
  1건 기각   (스택 시야 제한 — §5)
  4건 보류   (§6)
```

**이 라운드가 남긴 가장 중요한 사실은, 1라운드에서 고친 것 중 두 건이 실질적으로
무효였다는 것이다.**

- `db976c1`이 429를 `retryable`로 분류했지만, 재시도 백오프가 0·2·6초라 세 번 모두
  같은 스로틀 창 안에서 429를 받고 종단 실패로 확정됐다. **분류만 고치고 예산을
  안 고쳐서 수정이 아무 효과가 없었다.** (`c50c3b4`)
- `2b71d95`가 changes 라우트의 절단 2곳을 고쳤지만, **같은 PR의 다른 두 경로가
  그대로 잘리고 있었다.** 특히 PostgREST는 SETOF/TABLE RPC 응답에도 `max_rows`를
  적용하므로 "RPC로 감싸서 우회한다"는 이 PR의 전제 자체가 틀렸다. (`a67a6b1`)

수정이 **증상을 없앴는지**가 아니라 **원인을 없앴는지**를 따로 확인해야 한다는 뜻이다.
1라운드는 지적된 줄을 고쳤고, 2라운드는 그 줄을 고쳐도 시나리오가 여전히 성립함을 보였다.

### 검증 방식

블라인드 지적을 그대로 신뢰하지 않았다. 수정은 gpt-5.6-terra가 구현하고,
CTO가 **변이 시험(mutation test)**으로 독립 재현했다 — 수정을 되돌렸을 때
새 테스트가 실제로 실패하는지 확인했다. 되돌려도 통과하는 테스트는 회귀를 못 막는다.

변이 대상 줄을 지정하는 도구를 따로 만들어 썼다. 문자열 치환으로 변이를 넣다가
**같은 문자열의 다른 출현부를 두 번 잘못 건드렸고**, 그때마다 "테스트가 변이를 못 잡는다"는
잘못된 결론에 도달할 뻔했다. 실제로는 변이가 의도한 줄에 들어가지도 않았다.

---

## 3. 수정 내역 — 1라운드

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
**단, 이 수정만으로는 효과가 없었다 — `c50c3b4` 참조.**

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

### #118 `pr/03-tli-data-correctness` — 1라운드 수정 없음

1라운드 지적 2건 모두 기각. §5 참조. 2라운드에서 `5c3b507`이 나왔다.

### #115 `pr/04-query-performance` — `2b71d95`, `cd6e7e2`, `a60d96c`

| 위치 | 문제 |
|---|---|
| `app/api/tli/changes/route.ts:38` | 활성 테마 ID를 무제한 select → PostgREST `max_rows`(1000)에서 조용히 절단 |
| 같은 파일 이름 조회 | `.in('id', themeIds)`도 같은 상한. 초과분은 이름 없이 렌더 |
| `supabase/migrations/063` | trgm 인덱스 4개가 `extensions.gin_trgm_ops` 고정 참조 |
| `app/api/openapi.json/route.ts` | 스펙이 구현과 불일치 (기존 결함) |

바로 아래 점수 조회는 `// COR-016: PostgREST max_rows=1000 우회`라는 주석과 함께
RPC로 상한을 피해 가는데, **정작 그 RPC에 넣을 ID 목록이 이미 잘려 있었다.**
(그 주석 자체도 틀렸다 — `a67a6b1` 참조.)

`063`은 `059`와 같은 구조다. `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA extensions`는
확장이 다른 스키마에 이미 있으면 **`IF NOT EXISTS`가 먼저 걸리고 `WITH SCHEMA`가 무시된다.**
일부 Supabase 프로젝트는 `pg_trgm`을 `public`에 미리 깐다. 실제 스키마를 조회해
`format(%I)`로 인덱스를 만들도록 바꿨다.

### #116 `pr/05-ui-regression` — 수정 없음

양 라운드 모두 지적 0건. `production_ready: true`.

---

## 4. 수정 내역 — 2라운드 (블라인드)

전부 **CTO가 변이 시험으로 재현 확인**한 것만 실었다.

### #119 — `0685bbb`

| 위치 | 문제 |
|---|---|
| `app/api/stock/price/route.ts:84` | 아카이브 티커를 400으로 거부 |
| `app/subscribe/page.tsx:194` | pending인데 "구독 완료"로 표시 |

`stock/price`가 `isValidTicker`만 적용했다. 그 검증기는 6자리 숫자이거나 영숫자 10자
이내를 요구하는데, 아카이브에 저장된 티커는 `KOSPI:005930` 형식이라 **콜론 때문에 전부
실패했다.** `archives.json`의 티커 558개 전부가 접두사 형식이고 고유값 186개가 하나도
통과하지 못한다. 모든 종목 뉴스레터에서 현재가와 수익률이 사라졌다.

같은 화면이 부르는 `daily-close`는 `TICKER_WITH_EXCHANGE_PATTERN`을 쓰고 있어서
**과거 종가만 정상이고 현재가만 비는** 형태였다 — 두 라우트가 서로 다른 검증기를 썼다.
같은 파일이 이미 export하는 `isValidExchangeTicker`를 함께 적용했다.

subscribe 페이지는 `POST /api/subscribe`가 `status:'pending'`만 반환하는데도 200을
받자마자 "구독이 완료되었습니다"를 띄웠다. 실제 활성화는 확인 메일 링크를 눌러야
일어나므로, **사용자는 링크를 안 누르고 오지 않을 뉴스레터를 기다린다.**

### #120 — `5fe548a`, `c50c3b4`

**전원 실패가 발송 완료로 기록되고 재시도해도 성공이었다** (`5fe548a`).

폐기된 API 키로 수신자 300명 전원이 401을 받으면 `accepted=0 failed=300`이고 모두
종단 상태다. `updateContentSentFlag`의 판정에 `accepted` 조건이 없어 "종단 상태뿐"이라는
것만 보고 `is_sent = true`로 올렸다. 그다음 재시도는 `handleAlreadySent`로 빠지는데
그 반환값의 `success`가 **하드코딩 `true`**였다. 아무도 받지 못한 뉴스레터가 발송
완료로 기록되고 재시도해도 계속 성공으로 응답해 **복구가 불가능했다.**

두 곳 모두 이 파일에 이미 있는 공통 판정 `isSuccessfulDelivery`를 쓰게 했다.
수신자 0명인 날은 그 정의가 성공으로 취급하므로 기존 동작이 유지된다.

**429 재시도 예산과 provider 호출 전 claim 유실** (`c50c3b4`).

백오프 base 2초 · `max_attempts` 3이면 시도가 **0초·2초·6초**에 몰려 6초 안에 예산이
소진된다. SendGrid 스로틀 창은 그보다 길어 세 번 모두 같은 창에서 429를 받는다.
`RETRY_BACKOFF_MAX_MS=30000`이 정의돼 있었지만 attempt 3에서 4초라 **도달조차 하지 않는
상수**였다. 429 전용 `RATE_LIMIT_BACKOFF_BASE_MS=12000`을 분리해 0·12·36초로 배치했다.
일반 5xx는 기존 2초를 유지해 회복 속도를 희생하지 않는다.

두 번째는 더 조용하다. `claim_delivery_batch`가 `attempt_count`를 올리고 `claimed`로
바꾼 뒤 **수신자 상세 조회가 실패하면 그대로 throw**했다. 그 행들은 `claimed`로 남고,
`recover_stale_claims`는 stale claim을 `ambiguous`로만 표시하며 재회수하지 않는다.
`claim_delivery_batch`는 `pending`과 `retryable`만 집으므로 `ambiguous`는 다시 안 잡힌다.
**SendGrid 요청이 한 번도 나가지 않은 수신자가 일시적 DB 오류 한 번에 영구 미발송으로
굳었다.** `release_delivery_claim_batch` RPC를 **마이그레이션 060**으로 추가했다 —
해당 워커의 `claimed` 행만 해제하고 `ambiguous`는 건드리지 않으며, 요청이 나가기 전이므로
`attempt_count`를 1 환불한다.

### #118 — `5c3b507`

**`061`이 자기가 격리한 행 때문에 실패했다.**

`061`은 지원되지 않는 `model_type` 행을 archived/invalidated/blocked로 격리한 뒤
`model_type IN (...)` CHECK를 추가한다. 그런데 격리 UPDATE는 생명주기 필드만 바꾸고
`model_type`은 그대로 두므로, **격리 대상 행이 하나라도 있으면 그 행이 새 제약을 위반해
ALTER TABLE이 실패한다.** 마이그레이션이 그 자리에서 중단된다.

제약을 격리 상태와 함께 판정하도록 바꿨다(격리된 행은 예외).

**이 회차에 같은 구조를 세 번 고쳤다 — `059`, `063`, `061`.**
공통점은 `supabase db reset`으로는 재현되지 않고 **실제 데이터가 있는 환경에서만**
드러난다는 것이다. 마이그레이션 리뷰 시 "기존 데이터가 있는 DB에서도 성립하는가"를
별도 항목으로 확인해야 한다.

### #115 — `a67a6b1`, `239f7fe`

**이 PR의 목적이 `max_rows` 우회인데 두 경로가 그대로 걸려 있었다** (`a67a6b1`).

`get-ranking-server`는 활성 테마를 무제한 select로 읽었다. `/themes` SSR과
`/api/ai/summary`가 모두 이 경로를 쓴다. 잘린 쪽에 고점 테마가 있으면 랭킹에서 통째로
빠지고 집계도 실제보다 작게 나간다.

`loadThemeScoreWindows`는 더 근본적이다. **PostgREST는 SETOF/TABLE을 반환하는 RPC
응답에도 `max_rows`를 적용한다. RPC로 감쌌다고 상한을 벗어나지 않는다.** 테마 500개가
각각 14일치 점수를 가지면 약 7,000행인데 1,000행만 돌아왔다. 뒤쪽 테마는 점수·sparkline·
변화량이 비거나 틀린 값이 되고, **오류가 없어 조용히** 잘못된 응답이 나갔다.
range 페이지네이션을 적용하고 `// bypass PostgREST max_rows` 주석도 사실에 맞게 고쳤다.

테마 청크 크기 축소로는 못 고친다 — 테마당 행 수가 가변이라 어떤 청크 크기도
`max_rows` 미만을 보장하지 못한다.

**공개 compare API가 RLS 때문에 항상 빈 결과였다** (`239f7fe`).

compare 라우트가 anon 클라이언트로 `load_latest_published_comparison_runs`를 호출했다.
그 RPC는 `SECURITY INVOKER`라 **호출자의 RLS가 그대로 적용되는데**,
`theme_comparison_runs_v2`는 RLS가 켜져 있고 정책이 `service_role` 전용 하나뿐이다
(`016_comparison_v4_foundation.sql`). published 비교가 존재해도 0행이 돌아왔고,
오류가 안 나서 "비교 데이터 없음"으로 보였다.

published run 조회와 후속 후보 조회 **두 곳에만** service-role을 적용했다. 테마 메타·
점수·종목 조회는 anon 그대로다. 노출 범위는 RPC가 `status='published' AND publish_ready=true`를
강제하고 후보는 그 run ID로만 조회하므로 초안·미발행 run은 나가지 않는다.

---

## 5. API 계약 변경 (소비자 영향)

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

## 6. 기각한 지적 (다시 조사하지 말 것)

리뷰가 제안했으나 검증에서 **근거 없음으로 판정**한 항목이다. 각각 왜 아닌지 남긴다.

### 1라운드

| 지적 | 기각 사유 |
|---|---|
| compare 라우트가 청킹 없이 RPC 호출 | `route.ts:30`이 5개 초과를 400으로 거부. RPC 상한 500에 못 닿음 |
| 0건 수락 완료가 콘텐츠를 sent로 표시 | `isSuccessfulDelivery`(`service.ts:148`)가 이미 `accepted > 0` 검사 |
| 2시간 넘는 활성 rate-limit 창 삭제 | 최장 창 3600초 vs 정리 컷오프 7200초. 2배 여유 |
| 1d 기준선이 입력 순서에 의존 | `date-selection.ts`의 그 헬퍼를 프로덕션이 호출하지 않음 |
| `deadlineMs`/`budgetMs=0`이 truthy로 무시 | 4번째 옵션 인자를 넘기는 호출부가 없음 |
| DB 쓰기 실패 후 배치 중단 | `break`는 이미 claim된 수신자를 고아로 만든다. `059`는 stale claim을 자동 회수하지 않으므로 현재 동작이 더 안전 |

### 2라운드

| 지적 | 기각 사유 |
|---|---|
| 7d가 여전히 바로 앞 행과 비교한다 (`changes/route.ts:73`, P1) | **스택 시야 제한.** `pr/03`에서는 맞는 지적이지만 `pr/04`가 `selectPreviousChangesRow`를 라우트에 배선한다(`route.ts:133`). 스택 최상단에서는 성립하지 않는다 |

1라운드 §2의 gpt-5.6-sol 오판(`retryable` 소비자)과 **정확히 같은 종류**다.
"해당 PR 브랜치에서만 확인"이라는 지시가 스택 리뷰에서 반복적으로 만들어내는 오탐이다.
**다음 리뷰에서는 지적을 스택 최상단에서 한 번 더 확인하고 판정할 것.**

---

## 7. 보류한 지적 4건 (수정 안 함 — 판단 근거 포함)

2라운드에서 나왔고 **실재하는 결함으로 인정하되 이번 회차에서 고치지 않은** 것이다.
기각이 아니라 보류다. 다음 담당자가 판단을 뒤집어도 된다.

### 7.1 동시 구독이 이미 발송된 확인 링크를 무효화한다 — P1

`app/api/subscribe/route.ts:83`

```
요청 A·B가 같은 주소로 동시 구독
  → A가 토큰 A 저장, B가 토큰 B로 덮어씀
  → A의 메일 발송 성공, B의 발송 실패
  → B가 정리 delete 로 공유 행 삭제
  → A는 200 을 받았지만 전달된 토큰 A 에 해당하는 pending 행이 없어 확인이 실패
```

제안된 수정은 **pending 확인을 토큰 해시별 개별 행으로 저장**하는 것이다.
`upsert(onConflict: email)` 구조를 바꿔야 하고, 확인·재구독·정리 경로가 전부
"주소당 한 행" 전제 위에 있다. **스키마 변경 + 4개 경로 재작성**이라 이 회차 범위를 넘는다.

발생 조건은 같은 주소의 동시 POST이고, 사용자가 재구독하면 회복된다.
`db976c1`이 이미 "실패한 요청이 남의 토큰까지 지우는" 더 넓은 문제는 막았다
(`confirm_token_hash` 조건). 남은 건 그보다 좁은 경합이다.

### 7.2 일시적 시세 조회 실패가 종목 탈퇴로 기록된다 — P1

`scripts/tli/collectors/naver-finance-themes.ts:74`

KIS 조회가 타임아웃되면 그 종목을 **조용히 빼고 나머지를 반환한다**(73–77행 catch).
20종목 중 1종목이 빠져도 19/20이라 70% 커버리지 게이트를 통과하고, `upsertThemeStocks`의
부재-diff가 그 누락을 **실제 탈퇴로 취급해** 멤버십 이력을 종료하고 `is_active=false`로 만든다.

이건 **수집 파이프라인 문제이지 이 PR들이 만든 결함이 아니다.** 제안된 수정("조회 실패가
하나라도 있으면 그 테마를 미관측으로 표시하고 부재-diff에서 제외")은 커버리지 게이트와
멤버십 이력 정책을 함께 바꾸는 일이라 **별도 티켓이 맞다.**

다만 **파급이 조용하고 누적된다** — 잘못 종료된 멤버십은 다음 수집에서 자동 복구되지
않는다. 4건 중 우선순위가 가장 높다.

### 7.3 종단 재개가 sent 플래그를 복구하지 않는다 — P2

`lib/delivery/service.ts:234`

모든 발송 결과가 기록되고 `status=completed`까지 갔는데 `newsletter_content` 갱신만
일시적으로 실패하면, 재시도가 `is_sent=false`와 종단 run을 보고 **`updateContentSentFlag`
호출 전에 반환한다.** `alreadySent`도 안 세운다. 뉴스레터가 아카이브에 안 남고,
`scripts/send-newsletter.ts:101`이 이걸 신규 발송으로 취급해 **X 중복 게시가 가능하다.**

`5fe548a`가 `handleAlreadySent` 경로는 고쳤지만 이 종단 분기는 다른 경로다.
수정 자체는 작다(종단 분기에서 `updateContentSentFlag` 호출 후 `alreadySent:true`).
**`5fe548a`·`c50c3b4`가 같은 파일의 발송 판정을 크게 건드린 직후라 같은 회차에
세 번째 판정 변경을 얹지 않았다.** 다음 회차 1순위.

### 7.4 아주 오래된 점수가 newly emerging 으로 나간다 — P2

`app/api/tli/changes/route.ts` + `063` 마이그레이션 55행

`latest_rows` CTE에 `p_recent_since` 술어가 없다. 유일한 점수가 6개월 전인 테마를
`period=1d`로 조회하면, 그 행에 선행 행이 없으므로 **6개월 된 테마가 `newlyEmerging`으로
분류된다.** `openapi.json:1009`가 문서화한 3일/12일 lookback과 모순된다.

제안된 수정은 **라우트에서** 최신 `calculated_at`이 `cutoff`보다 이르면 그 테마를 버리는
것이다(RPC의 무제한 최신행 동작은 랭킹 신선도 감쇠에 필요하므로 유지).

**보류 사유는 §5와 같다** — 무엇을 "새로 등장"으로 볼지는 제품 결정이다. 하한을 넣으면
수집 공백 기간에 `newlyEmerging`이 비게 되고, 그게 더 나은지는 확인 안 됐다.
§8.4와 같은 종류의 결정이므로 **함께 결정하는 것이 맞다.**

---

## 8. 남은 문제 (다음 담당자용)

### 8.1 PR에서 도는 테스트 CI가 없다 — **우선순위 최상**

워크플로우 9개가 전부 `schedule`/`workflow_dispatch`다. **`pull_request` 트리거가 하나도 없다.**
유일한 PR 체크는 Vercel 배포이고, 그 `pass`는 "빌드가 됐다"는 뜻이지
"테스트가 통과했다"가 아니다.

**3,560개 테스트를 아무도 자동으로 돌리지 않는다.** §2의 회귀가 일주일 넘게
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

E2E는 여기 넣지 않았다 — §8.2 참조.

### 8.2 E2E는 로컬/CI에서 구조적으로 통과 불가

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

### 8.3 락파일이 두 개 커밋돼 있다

`pnpm-lock.yaml`(8,803줄)과 `package-lock.json`(13,227줄)이 공존한다.
로컬은 pnpm 10.34.5, CI 워크플로우는 `npm ci`. `package.json`에
`packageManager`·`engines` 필드가 없어 무엇이 정본인지 명시돼 있지 않다.
`.nvmrc`도 없다.

### 8.4 1d 기준선에 간격 하한이 없다 — 제품 결정 필요

```
7d:  MIN_7D_GAP_DAYS = 5 강제 + latest−7일 근처 선택
1d:  candidates[0] 그대로 — 간격 제약 없음
```

수집이 이틀 밀리면 3일치 변화가 "1일 변화"로 나간다. §5의 `gapDays`로
**관측은 가능해졌지만 동작은 그대로다.** 하한을 넣을지, 넣는다면 몇 일로 할지는
"무엇을 mover로 볼 것인가"라는 제품 결정이라 미뤘다.

**§7.4와 같은 결정이다. 함께 처리할 것.**

---

## 9. 재현·검증 방법

```bash
# 스택 최상단에서
git switch pr/05-ui-regression   # 12a9b2d

npx tsc --noEmit          # exit 0
npx eslint .              # 0 errors
npx vitest run            # 298 files / 3560 tests

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

### 2라운드 수정의 변이 시험

9건 전부 같은 방식으로 재현했다. 대표적으로:

```
티커 검증을 isValidTicker 단독으로 되돌림        → 2건 실패 ✓
handleAlreadySent 를 success:true 로 되돌림      → 1건 실패 ✓
updateContentSentFlag 판정을 status 만으로 되돌림 → 1건 실패 ✓
429 대기를 2초로 되돌림                          → 2건 실패 ✓
페이지네이션 종료 조건 < 를 <= 로 변경           → 2건 실패 ✓
061 CHECK 에서 격리 예외 제거                    → 실패 ✓
compare 라우트를 anon 클라이언트로 되돌림        → 실패 ✓
```

**변이는 반드시 줄 번호를 지정해서 넣을 것.** 문자열 치환으로 넣으면 같은 문자열의
다른 출현부에 들어가고, 변이가 원래 자리에 들어가지도 않은 채 **"테스트가 회귀를 못
잡는다"는 잘못된 결론**이 나온다. 이 회차에 실제로 두 번 발생했다
(`service.ts` 238행 vs 336행, `061.sql` 9행 UPDATE vs 26행 CHECK).

---

## 10. CommitLore

수정 커밋 11개 전부 트레일러를 달았고 `commit-msg` 훅을 통과했다.
`Ruled-out` 기록이 특히 중요하다 — 다음 담당자가 같은 함정에 빠지는 것을 막는다.

```
unsubscribe/request의 catch 제거로 설정오류 노출 | 구독 주소에만 500이 나가 열거 오라클이 부활한다
ALTER EXTENSION pg_trgm SET SCHEMA  | 전역 공유 확장을 우리 인덱스 4개 때문에 옮기게 된다
1d 기준선에 간격 하한 도입           | 제품 결정이고 수집 공백에 엔드포인트가 비는 회귀를 만든다
라우트 소스 문자열 검사로 계약 고정   | 같은 필드명이 다른 객체에 있으면 회귀를 놓친다
DB 쓰기 실패 시 배치 루프 중단        | 이미 claim된 수신자가 고아로 남는다
아카이브 티커에서 접두사를 벗겨 전송  | 캐시 키와 daily-close 응답 키가 갈라진다
테마 청크 크기 축소로 max_rows 회피   | 테마당 행 수가 가변이라 어떤 크기도 상한 미만을 보장 못 한다
RPC 를 SECURITY DEFINER 로 변경       | 라우트 밖 호출자에게도 권한 상승이 적용된다
RETRY_BACKOFF_BASE_MS 자체를 12초로   | 일시적 5xx 회복까지 느려져 정상 발송이 늘어난다
```

해당 경로를 편집하면 전역 `PreToolUse` 훅이 이 기록을 자동 주입한다.
조회를 따로 지시할 필요 없다 — **push 방식이지 pull이 아니다.**

원격 notes 미러는 아직 없다(`commitlore sync` → `no notes mirror on either side`).
트레일러는 커밋 메시지 자체에 있으므로 손실은 없다. 미러가 필요하면:

```bash
git push origin refs/notes/commitlore
```
