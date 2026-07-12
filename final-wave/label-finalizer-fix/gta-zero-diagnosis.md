# P1 GT-A finalize 0건 — 실데이터 진단 evidence

기준 시각: 2026-07-12 11:00 KST  
대상: legacy GT-A `gta-v1` pending finalization  
안전 조건: production DB 쓰기 및 RPC 호출 없음

## 결론

수정 전 0건이 되는 최초 조건은 `interest_metrics` DATE 매칭이나 migration 054가 아니라 **비거래일 cutoff와 labeler maturity 판정의 불일치**다.

일요일 `2026-07-12`에 `daily-label-phase.ts`는 5거래일을 바로 역산해 `finalizeCutoffDate=2026-07-06`을 만든다. 그러나 같은 거래일 함수로 7/6의 horizon을 순산하면 `2026-07-13`이다. `label-gt-a.ts`는 `today < horizonDate`이므로 pending identity 조회를 생략하고, `existingPendingOnly` 대상이 빈 집합이 되어 `totalThemes=0`, `final=0`으로 반환한다.

따라서 054 RPC는 0행을 업데이트한 것이 아니다. payload가 만들어지지 않아 호출 자체가 없었다.

## 단계별 행 수

| 단계 | 조건 | 행 수 | 판정 |
|---|---|---:|---|
| P0 | CTO 실측 `gt_a / gta-v1 / pending` | 1,000 | 7/6=269, 7/7=241, 7/8=241, 7/9=241, 7/10=8 |
| P1 | CTO 스냅샷에서 status=`pending` + version=`gta-v1` + `base_date <= 2026-07-06` | 269 | status/version/base 조건 통과 |
| P2 | `isKoreanTradingDate(base_date)` | 269 | 7/6은 정상 거래일 |
| P3 | `addKoreanTradingDays(2026-07-06, 5) <= 2026-07-12` | 0 | horizon은 7/13, 여기서 269→0 |
| P4 | `loadPendingLabels()`의 exact status/version/theme 교집합 | 미실행 | P3 false이면 호출하지 않음 |
| P5 | `interest_metrics` source/date 조회 | 미실행 | target theme 0으로 조기 반환 |
| P6 | legacy finalization payload | 0 | `existingRows`를 만들지 않음 |
| P7 | `finalize_tli_legacy_labels` (054) | 미호출 | 054 결함이 아님, 055 불필요 |

동일 CTO 스냅샷의 `interest_metrics.time` DATE 행 수는 7/6=209, 7/7=207, 7/8=206, 7/9=207, 7/10=204였다. 이 행들은 존재하지만 P3에서 조기 반환하므로 해당 일요일 run의 P5 입력으로 읽히지 않았다.

## 날짜 창 검증

실제 코드 실행 결과를 두 번 반복해 동일하게 관측했다.

```json
{"today":"2026-07-12","isTradingDay":false,"pendingBaseDate":"2026-07-12","finalizeCutoffDate":"2026-07-06","horizonDate":"2026-07-13","horizonElapsed":false}
```

7/6 라벨의 future 거래일 창은 `7/7, 7/8, 7/9, 7/10, 7/13`이다. CTO가 확인한 7/6~7/10 DATE 행은 금요일까지의 원천 데이터 존재를 입증하지만, 5거래일 maturity는 월요일 7/13에 도달한다. `labelGtA()`의 4-of-5 허용은 horizon 도달 뒤 한 관측치 결손을 허용하는 품질 규칙이며, horizon 전에 outcome을 고정하는 규칙이 아니다.

## read-only 조회 시도

진단 스크립트에는 `select`만 두고 mutation/RPC 호출이 없는지 정적 검사한 뒤 실행했다. 이 Codex 샌드박스에서는 `npx tsx`가 Unix IPC 소켓 생성에서 차단됐고, 동등한 저장소 표준 loader인 `node --import tsx`로 전환한 뒤 첫 Supabase SELECT에서 DNS가 차단됐다.

```text
Error: listen EPERM: operation not permitted /tmp/tsx-501/36039.pipe
GT-A read-only diagnosis failed: status count failed: TypeError: fetch failed
curl: (6) Could not resolve host: <redacted-project>.supabase.co
```

따라서 P0/P1의 production 숫자는 CTO 실측 스냅샷을 사용했고, P2~P7은 당시 라이브 코드와 동일한 저장소 함수들을 로컬 런타임에서 실행해 재구성했다. 요청한 production SELECT의 독립 재측정은 이 실행 환경에서 완료하지 못했다. 네트워크 요청은 PostgREST에 도달하지 않았고 DB 쓰기와 RPC 호출은 없었다.

## 가설 판정

| 가설 | 판정 | 근거 |
|---|---|---|
| 날짜 계산/거래일 maturity 불일치 | 확정 | cutoff 7/6, horizon 7/13, today 7/12 |
| status/version 필터가 0건을 만듦 | 직접 원인 아님 | 해당 조회 전에 조기 반환 |
| DATE 컬럼 문자열 매칭 실패 | 직접 원인 아님 | metric 조회 전에 조기 반환 |
| migration 054 exact UPDATE 결함 | 기각 | RPC payload 0, RPC 미호출 |

## GT-B 범위 기록

GT-B는 별도 원인이다. CTO 실측상 `stock_daily_prices`의 2026-07-07 및 2026-07-08 가격 결손이며 KIS backfill 대상이다. 이 변경에서는 GT-B 가격 수집·backfill 코드를 수정하지 않는다. 공용 daily cutoff만 같은 maturity 규칙을 사용하며, GT-B 누락 identity 생성은 기존처럼 활성 테마에 한정하고 비활성 테마는 이미 pending인 행만 재시도한다.

## 수정 및 검증

### 코드 수정

`daily-label-phase.ts`의 공용 GT-A/GT-B cutoff와 legacy identity 선택을 다음처럼 바꿨다.

1. `today`가 거래일이면 기존처럼 `today - 5거래일`을 사용한다.
2. `today`가 비거래일이면 직전 완료 거래일을 먼저 구한 뒤 거기서 5거래일을 뺀다.
3. 매 run의 현재 cutoff는 exact base/type/horizon/version identity를 조회해 **누락 또는 pending만** 처리하고, 이미 terminal인 identity는 건너뛴다. 따라서 금요일 실패 뒤 일요일에 같은 cutoff를 복구하면서 terminal `finalized_at`은 다시 쓰지 않는다.
4. 현재 cutoff보다 오래된 날짜는 기존 pending backlog 페이지네이션으로만 재시도한다.
5. mature GT-A backlog 또는 실제 처리 대상이 `final + censored + excluded = 0`이면 성공 결과로 집계하지 않고 명시적 warning을 남긴다. 모든 identity가 이미 terminal이라 처리 대상 자체가 0이면 멱등 no-op으로 취급한다.

수정 후 동일 public function driver의 실측값은 다음과 같다.

```json
{"today":"2026-07-12","isTradingDay":false,"pendingBaseDate":"2026-07-12","finalizeCutoffDate":"2026-07-03","horizonDate":"2026-07-10","horizonElapsed":true}
```

2026년 365개 날짜를 순회한 property driver에서도 매일 다음 세 조건을 검사해 실패 0건을 확인했다.

```json
{"checked":365,"failures":[],"failureCount":0}
```

- cutoff 자체가 한국 거래일이다.
- `cutoff + 5거래일 <= today`라서 선택된 날짜는 mature다.
- 다음 거래일 base의 horizon은 아직 `today`를 넘으므로 cutoff가 가장 최근 mature base다.

따라서 일요일 run은 아직 미성숙한 7/6을 확정 대상으로 오인하지 않는다. 7/3에서 누락/pending identity가 있으면 복구하고, 모두 terminal이면 아무 행도 다시 쓰지 않는다. 7/6은 다음 거래일인 7/13 run부터 정상 maturity 대상이 된다. 054 RPC 계약은 그대로이며 migrations는 수정하지 않았고 055도 추가하지 않았다.

### red → green 회귀

첫 TDD run은 `3 failed, 9 passed`, terminal 보호와 누락 identity 복구 계약을 확장한 두 번째 red run은 `8 failed, 10 passed`로 실패했다.

- 일요일 cutoff 기대값 `2026-07-03` 대신 `2026-07-06` 반환
- 금요일 실패 후 같은 mature cutoff를 비거래일에 복구하지 못함
- pending 생성 자체가 실패해 identity가 누락된 테마를 backlog scan만으로는 복구하지 못함
- 재시도 때 이미 terminal인 identity까지 upsert하면 `finalized_at`을 다시 쓰는 위험
- mature backlog의 zero-terminal 결과를 정상 확정 결과로 수용

최종 targeted run은 다음과 같이 통과했다.

```text
npx vitest run \
  scripts/tli/__tests__/tli-boundary-manifest.test.ts \
  scripts/tli/__tests__/daily-label-phase.test.ts \
  scripts/tli/__tests__/daily-label-phase-non-trading.test.ts \
  scripts/tli/__tests__/legacy-label-finalizer.test.ts \
  scripts/tli/__tests__/legacy-label-finalizer-migration.test.ts

Test Files  5 passed (5)
Tests       31 passed (31)
```

신규 회귀는 다음 계약을 고정한다.

- 2026-07-12 Sunday cutoff은 2026-07-03이다.
- 2026-01-01 주중 휴장일도 직전 완료 거래일에 anchor한다.
- 다음 거래일인 2026-07-13 cutoff은 2026-07-06으로 전진한다.
- `금요일 실패 → 일요일 동일 cutoff 복구 → 월요일 다음 cutoff 전진` 순서가 GT-A/GT-B 모두 유지된다.
- current cutoff에서는 누락/pending identity만 계산하고 terminal identity는 upsert/RPC 대상에서 제외한다.
- identity/backlog SELECT는 `horizon_days=5`까지 exact filter해 다른 horizon 행이 5일 라벨을 숨기지 못한다.
- 이미 모두 terminal인 cutoff은 warning 없는 멱등 no-op이다.
- mature gta-v1 pending 날짜가 zero terminal rows를 반환하면 warning count가 증가하고 확정 결과에 포함되지 않는다.

public function driver 결과:

```text
2026-01-01 {"pendingBaseDate":"2026-01-01","finalizeCutoffDate":"2025-12-22"}
2026-07-10 {"pendingBaseDate":"2026-07-10","finalizeCutoffDate":"2026-07-03"}
2026-07-12 {"pendingBaseDate":"2026-07-12","finalizeCutoffDate":"2026-07-03"}
2026-07-13 {"pendingBaseDate":"2026-07-13","finalizeCutoffDate":"2026-07-06"}
```

### 전체 게이트

| 게이트 | 결과 | 영수증 |
|---|---|---|
| TypeScript | PASS | `./node_modules/.bin/tsc --noEmit --pretty false` → exit 0 |
| canonical ESLint | PASS | `npm run lint` → exit 0, errors 0, 비변경 파일 기존 warnings 22 |
| 변경 TS strict ESLint | PASS | 변경 TS/테스트 + `--max-warnings=0` → exit 0 |
| diff integrity | PASS | `git diff --check` → exit 0 |
| canonical 전체 Vitest | PASS | `npx vitest run` → 258 files, 3,197 tests, 0 fail, exit 0 |
| 2026 날짜 property driver | PASS | 365일, failures 0 |

첫 canonical run은 새 helper가 `TLI_BOUNDARY_MANIFEST`에 빠진 실제 회귀를 잡아 `1 failed, 3196 passed`로 종료했다. helper를 `runtime`으로 분류한 뒤 재실행한 위 최종 영수증은 전체 0 fail이다. Level-4 파일과 migration은 수정하지 않았다.

독립 QA 재실행에서도 258 files/3,197 assertions는 모두 통과했지만, 이 샌드박스에서는 범위 밖 Level-4 CLI 두 모듈이 import 시 network `main()`을 실행하는 기존 부작용이 간헐적으로 `process.exit(1)`을 호출했다. 즉 assertion failure는 0이고 위 primary final run은 exit 0이지만, 샌드박스에서 canonical 프로세스 exit는 Level-4 network timing에 따라 비결정적이다. 요청의 Level-4 불가침 때문에 해당 모듈은 수정하지 않았다.

### 배포 후 acceptance

실제 확정 쓰기는 이 작업에서 실행하지 않는다. 배포 후 CTO run에서 다음을 확인한다.

1. 2026-07-12 run이면 corrected cutoff `2026-07-03`만 조회하고, 누락/pending이 없으면 멱등 no-op으로 끝난다.
2. 2026-07-13 이후 run은 gta-v1 `base_date=2026-07-06`을 mature current cutoff로 선택한다.
3. 처리 대상이 있으면 `final + censored + excluded`가 선택된 누락/pending 수와 일치하고 zero-terminal 경고가 없다.
4. zero-terminal 경고가 있으면 해당 base date에서 themes/identity/metric 단계별 수를 다시 조회하고 054 RPC 전 단계인지 확인한다.
5. GT-B 7/7·7/8 가격 결손은 KIS backfill 후 별도 run으로 재시도한다.
