# 배포 런북 — PR 2: 뉴스레터 발송 상태머신

마이그레이션: `058`, `059`. **PR 1(`056b`, `057`) 적용 이후에만 진행한다.**

## 1. 필수 설정

PR 1의 시크릿에 더해, 발송 잡이 아래를 모두 받아야 한다. 하나라도 없으면
`executeDelivery`가 수신자를 claim하기 전에 preflight 단계에서 실패한다(의도된 동작).

- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`
- `UNSUBSCRIBE_TOKEN_SECRET` (32자 이상)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 2. 사전 게이트

1. **진행 중인 발송 run이 없는지 확인.** `newsletter_delivery_runs`에서 `status`가
   `in_progress`인 행이 없어야 한다.
2. 발송/준비 스케줄 잡 일시 정지
3. 클린 체크아웃에서 `tsc`, `eslint`, `vitest`, `next build` 통과
4. 마이그레이션 dry-run으로 생성 SQL 확인
5. 적용 순서: `057`(PR 1) → `058` → `059`

`059`는 `058`이 만든 5-인자 `mark_delivery_outcome` 오버로드를 `DROP` 한다. 두 파일은 반드시
이 순서로, 연속해서 적용한다.

## 3. 적용 순서

1. 마이그레이션 `058` → `059` 적용
2. 검증된 커밋 배포
3. 스케줄 잡 재개

## 4. 스모크 체크

- 준비된 뉴스레터 1건에 대해 수동 발송 실행 → run이 terminal 상태로 reconcile되고 수신자
  중복 발송이 없어야 한다
- 동일 날짜로 재실행 → 아무것도 발송하지 않고 기존 run 결과를 반환(멱등)
- `newsletter_recipient_deliveries`의 `status` 분포 확인:
  `provider_accepted` + `failed` + `skipped` 합이 `total`과 일치하고 `pending`/`claimed`/
  `retryable`/`ambiguous`가 0이어야 `newsletter_content.is_sent`가 `true`로 전환된다
- **발송 시크릿 하나를 의도적으로 제거하고 실행** → 수신자가 하나도 claim되지 않은 채
  `Delivery preflight failed`로 즉시 중단되어야 한다. `ambiguous` 행이 생기면 안 된다.
- GitHub Actions 발송 잡에서 Google Cloud 자격증명 설정 단계가 사라졌는지 확인
  (발송 잡은 더 이상 생성을 수행하지 않는다)

## 5. 롤백

- 스케줄 잡부터 정지
- 앱을 직전 검증 배포로 롤백. `058`/`059`가 추가한 테이블/함수는 additive이므로 남겨둘 수 있다.
- **provider 응답이 불확실한 발송은 `ambiguous`로 두고 절대 자동 재발송하지 않는다.**
  재발송 여부는 provider 로그로 실제 수신 여부를 확인한 뒤 수동 판단한다.
- run/reconciliation 로그는 보존하되 이메일 주소는 제외한다.
