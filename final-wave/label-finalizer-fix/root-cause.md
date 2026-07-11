# P1 legacy label finalizer 0건 확정 — 근본 원인 판정

## 결론

현재 저장소의 코드만으로는 run `29162555074`가 실제로 DB `UPDATE 0`을 반환했다고 확정할 수 없다. 당시 파이프라인의 `final=0`은 DB 영향 행 수가 아니라 메모리에서 계산한 라벨 상태 개수였고, GT-A의 `censored`/`excluded`와 GT-B의 `pending`은 요약 로그에서 보이지 않았다.

다만 다음 결함은 실코드와 red/green 회귀로 확정했다.

1. migration 048 이후 라벨 identity가 `labeler_version`까지 포함하도록 바뀌었지만, 만기 pending 날짜 조회와 GT-A pending 조회는 버전 조건이 없었다.
2. GT-A는 기존 pending의 `id`를 읽지 않았고, GT-B는 기존 pending identity 자체를 읽지 않았다. 따라서 finalizer가 "조회한 바로 그 pending 행"을 전이했다는 계약이 없었다.
3. 공용 `batchUpsert`는 DB error 유무만 확인하고 영향 행 수를 받지 않는다. 성공 로그가 exact pending 전이를 증명하지 못했다.
4. 파이프라인 로그는 GT-A `final`과 GT-B `final`만 노출했다. GT-A 전건 `censored`/`excluded` 또는 GT-B 전건 `pending`이어도 운영 화면에서는 동일하게 `final=0`으로 보였다.

즉, 확정된 근본 결함은 **versioned pending identity와 persistence proof가 없는 legacy finalization 경로, 그리고 그 결과를 가린 상태 로그**다. 프로덕션 0건의 직접 분기는 당시 DB 스냅샷/원본 상태별 로그가 없어 `DB exact-match 실패`와 `입력 데이터로 인한 non-final 결과` 중 하나로 더 좁힐 수 없다. 이번 수정은 두 경우를 더 이상 같은 silent 결과로 만들지 않는다.

## 가설 판정

| 가설 | 판정 | 근거 |
|---|---|---|
| 048 이후 conflict target이 구키라서 매칭 실패 | 현재 HEAD에서는 기각 | 수정 전 GT-A/GT-B upsert도 이미 `theme_id,base_date,label_type,horizon_days,labeler_version`을 사용했고, migration 048 unique key와 일치한다. |
| pending 조회/전이가 versioned identity를 잃음 | 확정 | 수정 전 만기 날짜/GT-A pending 조회에 `labeler_version`이 없고, GT-A는 `id` 미조회, GT-B는 pending 행 미조회였다. 해당 조건을 요구하는 회귀 테스트가 수정 전 red, 수정 후 green이다. |
| 045/048/053 scientific guard가 legacy 전이를 차단 | 코드 기준 기각 | migration 053 trigger는 `OLD`와 `NEW`가 모두 gta-v2가 아니면 즉시 `RETURN NEW`한다. 045의 gta-v1 CHECK는 scientific-use 값을 고정할 뿐 legacy outcome 전이를 막지 않는다. |
| 성숙도/원천 데이터 때문에 terminal 결과가 0 | 완전 기각 불가 | 완전한 GT-A metric fixture와 GT-B stock/KOSPI fixture는 각각 `final=1`을 만든다. 반대로 GT-B KOSPI/주가가 빠지면 labeler 계약상 `pending`이며, 이제 날짜·건수 경고를 낸다. |
| 992건이 배치/날짜 한도에 잘림 | 기각 | 날짜 조회는 500행씩 끝까지 페이지네이션하고 날짜 수 상한이 없다. exact writer는 992건을 500+492로 처리한다. |

## 수정 메커니즘

- backlog/date scan과 pending identity 조회를 `gta-v1`/`gtb-v1`으로 한정했다.
- 기존 pending은 저장된 `id`와 theme/date/type/horizon/version/status를 모두 대조하는 migration 054 RPC로만 전이한다.
- RPC는 gta-v1/gtb-v1만 허용하고 gta-v2 payload를 거부한다. scientific/provenance 열은 UPDATE 대상에 없다.
- RPC 한 배치에서 영향 행 수가 요청 수와 다르면 SQLSTATE `55000`을 발생시켜 그 배치를 전부 롤백한다. 애플리케이션도 반환 수가 batch length와 다르면 실패한다.
- 신규 행은 기존 versioned upsert를 유지하고, 기존 pending terminal 행만 exact finalizer로 분리했다.
- GT-A의 `final/censored/excluded`, GT-B의 `final/pending/excluded`, 그리고 전체 버전 적체와 버전별 적체를 로그에 분리했다.

## 적체 992건 판정

별도 catch-up writer는 필요하지 않다. 다음 full run은 관측된 모든 만기 날짜를 순회하며, 실제 형태는 GT-A 269건 1일 + GT-B 241건 3일이다. writer 자체도 총량 제한 없이 500건 단위로 분할한다.

단, "992건 모두 final"은 GT-B 기준일/미래일 KOSPI 및 종목 가격이 완전하다는 조건부다. 가격이 빠진 GT-B는 의도적으로 pending을 유지하고 명시 경고를 낸다. 이 경우 필요한 조치는 label catch-up이 아니라 가격 데이터 backfill 후 다음 full run 재시도다.
