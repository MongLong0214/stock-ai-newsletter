# 배포 런북 — PR 1: 보안 격리

마이그레이션: `056b`, `057`. 앱 배포와 DB 적용을 하나의 변경 창으로 다룬다.

## 1. 필수 설정

배포 전에 모든 Vercel 환경과 뉴스레터 GitHub Actions 환경에 아래 값을 넣는다.
**이 값들이 없으면 관련 라우트는 fail-closed로 503을 반환한다.**

- `RATE_LIMIT_HMAC_SECRET` — 32자 이상 독립 난수
- `UNSUBSCRIBE_TOKEN_SECRET` — 32자 이상 독립 난수 (AEAD 토큰 키)
- `UNSUBSCRIBE_TOKEN_SECRET_PREV` — 회전 기간에만 사용. 구 토큰이 모두 만료된 뒤 제거
- 기존 값: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
  `SENDGRID_API_KEY`, SendGrid 발신자 정보

`CRON_SECRET`, Supabase 키, SendGrid 키를 신규 시크릿으로 재사용하지 않는다. 소유자와 회전
일자는 Git이 아니라 프로덕션 시크릿 매니저에 기록한다.

## 2. 사전 게이트

1. 복구 가능한 DB 백업 확인 및 복구 지점 기록
2. 클린 체크아웃에서 `tsc --noEmit`, `eslint .`, `vitest run`, `next build --turbopack` 통과
3. Supabase CLI 마이그레이션 dry-run으로 생성 SQL 확인
4. 적용 순서 확인: `056_drop_unused_indexes` (기존) → `056b` → `057`
5. **KRX 장 시간 외로 일정 조정** — `056b`가 `stock_price_cache`를 `TRUNCATE`한다.
   이후 첫 조회부터 `/api/stock/price`가 service_role로 캐시를 다시 채운다.

## 3. 적용 순서

1. 시크릿 주입 및 검증 (값이 로그에 남지 않도록 주의)
2. 마이그레이션 적용. 첫 오류에서 즉시 중단하고 이후 파일을 수동으로 이어 적용하지 않는다.
3. 검증된 커밋을 Vercel에 배포

구 애플리케이션은 익명 캐시 쓰기에 의존하고, 신 애플리케이션은 rate-limit RPC가 없으면
fail-closed다. DB 적용과 앱 승격 사이 간격을 최소화하고, 보안 권한을 되돌리는 대신 점검 창을
사용한다.

## 4. 스모크 체크

- `/subscribe` 정상 렌더 및 `?confirm=<valid-test-token>` 플로우 동작. 확인은 명시적 POST
- 신규 구독 → 확인 → 구독취소 → **재신청 → 재확인**이 끝까지 성공 (H-1 회귀 확인)
- `/unsubscribe?token=<valid-test-token>` 렌더 및 명시적 확인 후에만 상태 변경
- `/unsubscribe` (토큰 없음) 및 `/unsubscribe?email=<addr>` (레거시 링크)에서 이메일 입력 폼이
  뜨고, 구독 중인 주소로 새 링크 메일이 도착
- 미구독 주소로 링크 요청 시 메일이 가지 않으면서 응답 본문은 구독 중인 경우와 동일
- 잘못된/없는 토큰은 이메일 주소나 토큰 값 노출 없이 일반 오류 반환
- rate limit 초과 시 `429`, rate-limit 저장소/설정 부재 시 `503`
- `/api/stock/price` 최초 호출이 KIS로 나가고, 동일 티커 재호출은 캐시에서 응답
  (`stock_price_cache` 행 수 증가로 확인)
- daily-close 라우트 정상 동작

## 5. 롤백

- 앱 스모크 체크 실패 시 직전 검증 배포로 롤백
- **익명 캐시 쓰기를 되살리는 방식의 롤백은 하지 않는다.** 보안 경계를 유지한 채 service_role
  설정을 진단한다.
- 추가된 테이블/함수는 앱 롤백 시에도 남겨둘 수 있다(additive). 데이터 파괴나 스키마 실패에
  대해서는 임시 역방향 SQL 대신 기록해 둔 복구 지점으로 복원한다.
- 배포·마이그레이션 로그는 보존하되 이메일 주소와 토큰 값은 제외한다.
