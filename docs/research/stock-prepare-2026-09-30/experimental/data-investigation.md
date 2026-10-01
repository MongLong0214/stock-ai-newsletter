# 추가 과거 OHLCV와 오프라인 피처 조사

2026-09-30 읽기 전용 실측. 제품 소스, DB, 발송, archive는 변경하지 않았다. 초기 표본 조사 후 Root 승인에 따라 Naver 현재 2,431종목+KOSPI 수집과 전수 감사를 완료했다. 기존 KIS와 source를 섞지 않았다.

**결론:** Naver fchart는 한 요청에 실제 2,000거래일을 반환해 2023–2024보다 앞선 연구 구간까지 확보할 수 있다. KIS와 독립된 연구 스냅샷으로 수집하는 경로가 가장 빠르다. 삼성전자·JYP는 KIS 3년치와 OHLCV가 완전히 같았지만 에코프로는 조정·반올림·거래정지 표현에 차이가 있으므로 기존 KIS 원본에 이어 붙이거나 동일 데이터라고 가정하면 안 된다.

## 실제 확보한 표본

| 원천 | 대상 | 실제 기간 / 행 | 요청 수 | 확인 결과 |
|---|---|---|---:|---|
| KIS 수정주가 | 삼성전자, 에코프로, JYP | 각각 2022-01-03~2024-12-30 / 735 | 각 8 | OHLC 유효, 에코프로 거래량 0인 11일 |
| KIS 지수 | KOSPI 0001 | 같은 기간 / 735 | 16, 마지막 빈 응답 포함 | 실제 응답 최대 50행, 삼성전자 거래일과 전부 일치 |
| Naver fchart | 위 3종목 + KOSPI | 각각 2018-08-03~2026-09-30 / 2,000 | 각 1회로 본문 확보 | 날짜 중복 없음; 장중 9/30 행 포함 |

KIS는 수정/원주가 비교 1회를 포함해 총 41 가격 GET, 2,940개 고유 행이다. 첫 수집과 지수 보완의 실제 실행 시간 합은 약 22.5초(중간 분석 시간 제외), 가격 GET 중앙값 67ms였다. 외부 쓰기 0회, 차단된 쓰기 0회다.

Naver는 `https://fchart.stock.naver.com/sise.nhn?symbol=005930&timeframe=day&count=2000&requestType=0`를 사용했다. 나머지는 symbol=086520, 035900, KOSPI이다. `insane-search`의 첫 curl_cffi safari 경로에서 200 + weak_ok였고, 이후 XML 구문·행 수·날짜·OHLCV를 별도로 검사했다. 두 요청의 실측 HTTP 시간은 72ms, 83ms였다. 메타데이터 2회와 본문 4회, 총 6 GET이며 인증은 없었다.

응답은 `chartdata` 아래 `item data="YYYYMMDD|open|high|low|close|volume"` XML이었다. `precision`은 주식 0 / 지수 2이고 `origintime`, `count`, `timeframe` 속성이 있다. API 버전 필드는 없다. **2,000은 이번에 검증한 요청 크기이며 최대 허용치 또는 영구 제공 보장은 아니다.** origintime은 반환된 첫 날짜가 아니다. 현재 장중 데이터는 반드시 고정한 완료일 2026-09-29 이후를 배제한다.

## Naver와 KIS 전수 대조: 2022–2024, 각각 735일

| 대상 | 완전 동일 OHLCV 행 | 가격 차이 | 거래량 차이 / 의미 |
|---|---:|---|---|
| 삼성전자 | 735/735 | 모든 OHLC 일치 | 모든 거래량 일치 |
| JYP | 735/735 | 모든 OHLC 일치 | 모든 거래량 일치 |
| KOSPI | 590/735 | 모든 OHLC 일치 | 145일 Naver가 1단위 작음; 현재 지수 피처는 가격만 사용 |
| 에코프로 | 36/735 | 유효 거래봉 OHL 최대 3원, close 최대 1원 | 584일 다름. 2022-01-03~12-27 Naver/KIS 약 0.94348; 2023 최대 41주, 2024 최대 15주 차이 |

에코프로 2024-04-09~04-24 거래정지 11일은 Naver OHL=0, KIS OHLC=101437이고 양쪽 거래량은 0이다. 이 외 7일은 Naver high/low와 close가 1원 어긋나 실제 `hasValidResearchOhlc`를 통과하지 못한다. 전체 2,000일의 Naver 에코프로 OHLC 무효 행은 71개다. 이러한 행을 몰래 clamp/보간하지 않는다. 원본과 invalid 사유를 보존하고 가드/라벨에 별도 적용한다.

KIS 실제 adjusted=0과 원주가=1을 에코프로 2024년 4월 21일에 대조했다. 예: 4/8 close 101437 vs 517000, volume 5479205 vs 1075042; 4/25 close 106048 vs 108100, volume 6160329 vs 6043419. **가격과 거래량 모두 조정된다.** Naver 종가는 KIS 수정주가에 거의 일치해 조정된 계열로 보이지만, 2022 거래량 차이는 조정 방식을 동일하다고 단정할 수 없다는 직접 증거다.

공식 KIS [함수 설명](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py)은 주식 요청당 최대 100건과 `0:수정주가 / 1:원주가`를 명시한다. [기존 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/legacy/Sample01/kis_domstk.py)은 분할·병합의 소급 가격 조정을 설명한다. 현재 시점에 조회한 조정 계열은 당시 조회 가능했던 point-in-time 가격 빈티지를 복원하지 않는다. 특히 절대 주가 1,000원·거래대금 gate, 정수 목표가격 경계가 영향을 받을 수 있다.

## 수집 전 비용 추정과 범위

| 선택 | 예상 호출 수 | 제한 속도 기준 하한 | 여유 포함 예상 | 저장량 추정 |
|---|---:|---:|---:|---:|
| Naver current master 2,431 + KOSPI, count=2,000 | 2,432 | 1req/s 40.5분, 2req/s 20.3분 | 1req/s 45~55분 | XML 약 0.32GB, 정규화 NDJSON 약 0.75GB; IPO가 짧으면 감소 |
| KIS 2022–2024 735일 | 약 19,464~21,895 | 2req/s 2.7~3.0시간 | 약 3~4시간 | 약 1.79M 행 / 0.25GB |
| KIS 기존 최초일 2024-08-28 이전 653일만 | 약 17,031~19,462 | 2req/s 2.37~2.70시간 | 약 2.7~3.3시간 | 약 1.59M 행 |

속도는 허용량 보장이 아니라 운영 가정이다. 보수적 1req/s로 심볼별 완료 체크포인트를 남기고 429/일시 실패는 낮은 속도로 재시도하는 오프라인 수집이면 중단·재개가 가능하다. Naver 원본을 별도 저장하고 기존 KIS 표본을 계속 독립 대조한다. 전종목 응답/상장기간/오류율은 3종목 표본만으로 보장하지 않는다.

현재 2,000일 표본은 320번째 세션이 2019-11-22이다. 따라서 충분한 당시 데이터가 있는 종목은 2023–2024 연구에 320세션 warm-up을 줄 수 있다. 2023-01-01~2024-08-27에 407개의 관측 세션이 있다. KIS 2022년부터만 확장하면 320번째 세션은 2023-04-18이다. 실제 신호 사용 가능일은 각 종목의 관측 개수·유효 창·당시 가격 존재 여부에 따라 다르다.

## 기존 수집 경로에서 주의할 실제 한계

- `app/archive/_utils/api/kis/client.ts:765`의 `fetchDailyRangePriceRows`는 조정 주식 GET 한 번만 수행한다. 기간을 몇 년으로 늘려도 자동 페이지 이동은 없다. 시작/끝을 넘기고 반환된 최저 날짜 전날로 끝을 옮겨야 한다. 지수 helper는 `:784`; 100행 미만 종료는 실제 50행 지수를 조용히 절단한다.
- `scripts/tli/prices/kis-daily-price-collector.ts:109`의 collector는 기본값이 DB upsert이다. `scripts/tli/ops/run-stock-daily-price-backfill.ts`를 연구용으로 실행하면 안 된다. 실제 client GET만 별도 임시 스크립트에서 호출한다. token 저장 POST도 가드로 차단하고 토큰 발급 이외의 쓰기를 허용하지 않았다.
- 저장된 row의 source='kis'만으로 adjustment 옵션·조회 시각·빈티지는 알 수 없다. 새 스냅샷은 원천/수집 시각/옵션/원본 해시를 보유하고, 겹친 날짜 비교 없이 기존 고정 prefix와 혼합하지 않는다.
- `load-stock-master.ts`는 현재 KIS 마스터와 현재 상태를 사용한다. 과거 상폐주 누락, 현재 살아남은 종목 편향, 당시와 다른 거래정지/관리 상태를 해결하지 않는다. 연구 범위는 **current master historical replay**이며 당시 시장 전체 또는 point-in-time universe가 아니다. Naver origintime만으로 당시 마스터를 복원하지 않는다.
- 휴일 상수는 2024~2026만 있으므로 2022/2023 날짜를 달력으로 생성하지 않는다. 실제 KOSPI와 양수 거래량 anchor 일자를 `TradingDayIndex`에 넣고 누락/정지를 건너뛰어 기간을 압축하지 않는다. KIS와 Naver 표본의 2022–2024 날짜는 전부 같았다.

## 신규 피처의 최소 오프라인 경로

별도 임시 TypeScript가 정규화 원본 → `buildPriceBook` → 관측 `TradingDayIndex` → `StockDataHandler.at(signalDate)` 순서로 연결하면 된다. 실제 `buildFeatureVector`/`buildFeatureSeries`, `buildTechnicalContextMap`, `buildSignals`, `rankLowVolatilityStableCandidates`를 그대로 재사용한다. target gate의 `(1+gap/100)*(close/open)-1` 연산 순서도 그대로 둔다. 새 피처 계산 함수에는 raw PriceBook이나 라벨을 넘기지 않는다.

| 가설군 | 원시 가격/거래량만 쓰는 후보 | 최소 창 / 주의 |
|---|---|---|
| 거래량 증가 지속 | 최근 10일 중 각각 직전 20일 평균의 1.5배 초과 횟수, volume5/20, log-volume 기울기 | 최대 30세션; 평균에 그날 거래량을 넣을지 명시 |
| 축소·횡보 압축 | 평균 true-range5/20, 10일 high-low 폭, inside-day 빈도, Bollinger 폭의 과거 percentile | 21~80세션; 미래 돌파 여부를 정의에 넣지 않음 |
| 다기간 가격 구조 | return5/20/60/120, SMA20/60/120 순서, 이전 high20/60까지 거리 | 최대 121세션; 이전 high는 신호일 제외 |
| 낙폭·회복 | trailing peak60 대비 낙폭, peak 이후 세션 수, 관측된 trailing trough 이후 반등 | 60세션; 사후 완성된 상승/하락 구간의 peak/trough 금지 |
| 변동성 전환 | realized-vol5/20 또는 20/60, downside/upside volatility, gap 빈도 | 21~61세션; 분모 0·창 부족은 null |

원시 세션이 결측/무효이면 해당 피처별 필요 필드와 창의 결측 규칙을 적용하고 실제 관측 수를 함께 기록한다. 관측된 과거 volume=0은 실제 0으로 보존하며 음수/결측 거래량만 null이다. 현재 추천 eligibility의 양수 거래량 조건과 미래 strict5 라벨 가드는 별도다. Naver OHL=0 거래정지 봉은 OHLC 무효 그대로 유지한다. 신규 가설은 기존 ATR·volumeRatio·return·trend와 중복될 수 있다. 성능을 아직 주장하지 않으며 이 조사에서는 fit·튜닝·outcome 분석을 하지 않았다. train의 변환/정규화만 고정하고 시간순 분리와 D5 purge를 적용하는 연구는 별도 단계다.

**실행 검증:** `probe-offline-features.ts`가 실제 TS 함수와 신규 8개 원시 피처를 3종목×4일에 실행했다. 최소 369 관측 세션. 미래 가격·거래량을 100배 변조해도 prefix-only 입력과 feature/signals/context/new-feature 결과가 **12/12 동일**했고 직접 미래 접근 **4/4 차단**됐다. 네트워크 비활성, 라벨 읽기 0회, source 9개 전후 SHA 동일. context breadth는 이 표본 3종목만의 값으로 시장 breadth가 아니다. 이는 구현의 인과 접근 검증이며 추천 성능 검증이 아니다. 이 임시 8피처 예시의 보수적인 양수 거래량 창 조건은 최종 피처 계약이 아니다. 실제 신규 모듈은 위의 과거 0거래량 보존 계약을 적용한다.

## 산출물

모든 파일은 `/tmp/composite-score-experimental-20260930/`에 있다.

- `long-history-sample-complete.ndjson`, `long-history-probe-complete.json`: KIS 2,940행 및 요청/조정 비교 기록. raw SHA256 `fe2000dacd2aca2017a7a02a8c0ba55de03709e46639aaa9e4ed2d6060207cb5`.
- `naver-{samsung,ecopro,jyp,kospi}.xml`, `naver-long-history-sample.ndjson`: Naver 원본 응답과 8,000행. 원문은 engine이 디코딩한 Unicode를 UTF-8로 저장했으며 XML의 EUC-KR 선언은 응답 그대로다.
- `naver-kis-comparison.json`, `naver-kis-differences-*.json`, `compare-naver-kis.py`: 735일×4대상 전수 대조와 재현 코드. Naver 정규화 SHA256는 비교 JSON에 기록.
- `offline-feature-sample.ndjson`, `offline-feature-probe.json`, `probe-offline-features.ts`: 12행 인과성 실행 증거와 실제 source hash.
- `probe-long-history.ts`, `complete-index-probe.ts`: GET 전용 작은 KIS 수집 재현 코드. credentials·headers는 출력하거나 저장하지 않았다.

작업 종료 시 git 추적 파일 변경 없음. 기존 미추적 `DESIGN.md`, `docs/ses-production-access-request.md`는 건드리지 않았다.

## 승인 후 전체 수집·감사 결과

- `naver-history/manifest.json`: 2,432/2,432개 성공, 실패·빈 응답 0. 실제 1요청/초 스케줄, 재시도 필요 0. 약 41분에 수집과 coverage 집계를 마쳤다.
- 원본 4,223,899행에서 9/30 장중 2,432행만 제외해 **4,221,467행**을 정규화했다. 가격 파일 1,594,747,409 bytes, SHA256 `6347d11d70043a9016f751f8f4c1de31f4498c20d29f7e69688b8e76dbd003a8`.
- 실제 지수·삼성전자 거래일은 2018-08-03~2026-09-29 **1,999개 전부 일치**. 3종목의 더 오래된 희소 이력 때문에 전체 raw 최소일은 2010-10-07이지만, 이를 공통 시장 캘린더 시작일로 취급하지 않는다. 2,650개의 범위 밖 행은 `outside-calendar-flags.ndjson`에 표시했고 원본 값은 보존했다.
- 036220/101970/198940의 코드·회사명은 raw XML과 고정 master에 모두 일치하며 전 2,432개 response hash 충돌은 0이다. 큰 공백은 보존된 응답 자체에 존재한다. 상세 `sparse-history-identity-audit.json`; 날짜를 압축하거나 과거 행을 fallback warm-up으로 붙이지 않는다.
- 무효 OHLC 38,990행(비양수 가격 29,407, 양수 가격 포함관계 위반 9,583), 관측 거래량 0인 61,842행을 보정 없이 유지했다. 음수/결측/비유한 숫자는 관측되지 않았다. 320행 미만 종목 56개도 고정 cohort에서 제외하지 않았다.
- `audit.json`: 독립 XML 파서로 raw 2,432개와 정규화 전체 값을 대조했고 모든 해시·값·날짜 상한이 일치했다. 별도 resume verifier도 **2,432/2,432** raw·정규화 바이트 일치. 현재 master의 생존·상태 편향은 그대로다.
- `source-bridge/comparison.json`: 고정 KIS와 2,430종목의 1,192,328개 공통 관측(2024-08-28~2026-09-29)을 대조했다. KIS 자료가 없는 486510도 cohort에 유지했다. 원본 SHA 전후 동일, 중복/충돌 0, 약 53초·최대 RAM 390MB.
- 공통 주식 관측의 OHLCV 완전 일치 **94.142%**, OHLC 일치 **95.091%**, 거래량 일치 **97.616%**. 42종목·12,490행의 일정 가격 배율 차이와 41종목·11,378행의 가격/거래량 역배율 형태를 기록했다. 이는 조정 차이 후보이지 corporate action 원인을 확정한 것은 아니다.
- KOSPI는 별도 집계: 공통 470일 **종가 전부 일치**. KIS OHL 결측 345일이 있고 양쪽 값이 있는 125일 OHL 전부 일치. 거래량은 21일에 1단위 차이.
- 새 가격의 라벨·성과·모델 fitting은 계산하지 않았다. raw source 변이 확인만으로 Naver 과거 성과가 KIS 운영 입력에서 재현된다고 주장하지 않는다.

## 최근 원천 차이 재현과 기존 선정 코호트 진단

2026-09-14~09-29 공통 주식 24,291행 중 종가 20,482행(84.32%)이 달랐다. 날짜별 OHLC 중 하나 이상 다른 비율은 86~89%였다. 장기 전체 평균 일치율만으로 최근 운영 구간을 대표하면 안 된다. `source-bridge/date-comparison.ndjson`에 날짜별 분모·각 필드 차이가 있다.

운영의 실제 `fetchDailyRangePriceRows`를 그대로 호출해 삼성전자·삼천당제약·하이트진로·KT의 9/14~9/29를 재조회했다. J/수정주가0 응답 **40/40행 OHLCV가 frozen KIS와 완전 일치**했다. raw `output2.stck_clpr`도 저장값과 같았다. NAVER와는 시가·거래량 40/40 일치, 종가 4/40, OHLCV 전체 3/40만 일치했다. 실제 helper가 요청하는 J는 KRX이고 NX는 NXT, UN은 통합, 조정0은 수정주가다([KIS 공식 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py)). 삼성·삼천당의 NX/UN 4회까지 총 8회 가격 호출에서 NAVER 종가 일치는 각각 11/20·14/20, 모든5필드 일치는 둘 다0/20였다. 시장코드 전환만으로 원천 차이를 해결할 수 있다는 증거는 없다. 삼성9/29 종가는 J272500, NX/UN274500, NAVER275000이었다.

`source-bridge/live-kis-frozen-naver-comparison.json`은 요청 조건과 모든40행 비교를, `recent-source-provenance.json`은 DB 추출·최신일 append 경로를 기록한다. 최초 snapshot은 9/29 08:18:36 UTC에 read-only Supabase에서 추출되었고, 9/30 02:17:23 UTC에 9/29 source=kis 행만 append됐다. 조사한 고정 master 주식1,192,328행과 지수470행의 source는 모두kis다. 이 raw export에는 원래 ingestion API 응답 envelope·수집시각이 없으므로 과거 모든 행의 원천 의미까지 확정하지 않는다. 이번40행은 현재 API에서 동일 재현되므로 로컬 export 변형만으로 이 차이를 설명할 수 없다.

`recent-close-lag-diagnostic.json`에서 최근 불일치20,482행의 NAVER d−2/d−1/d+1/d+2 종가 일치율은 **2.25%/3.22%/4.43%/2.53%**였다. d+1/d+2 말단 결측은 분모에서 제외해 각각18,421/16,384개만 비교했다. 일괄적인 1~2거래일 종가 shift를 지지하지 않으며 이 검사만으로 모든 형태의 미래정보 오염을 배제하지도 않는다. 공식 원천/시장/세션/조정 vintage 차이의 원인은 미확정이다.

Root가 별도 승인한 기존 KIS L5·L0 outer 선정 코호트만 사후 대조했다. signal 2025-12-23~2026-09-18, 해당 D1~D5는 2025-12-24~2026-09-29로 assert했다. 새 NAVER2023~2024 라벨·성과는 읽거나 계산하지 않았다. `source-bridge/selected-cohort.json`은 중복을 제거한3,417개 선정, 전체 policy memberships와 paired5bars를 보존한다. **최악 KIS순손실20건은 모두 동일 OHLCV·동일결과**였다. 전체 strict 양원천정상3,391건에서 touch1, L0 7, L5 6, D1양봉13건의 판정이 달랐다. 서로 겹치는 event 변화는 총25개 선정이며24개는 최근9/14 이후 차이 구간이었다.

일정배율 차이40건은 event 변화0이었다. SK디앤디210980 signal3/26 한 건은 D1~D4의 NAVER/KIS 가격배율≈0.68036에서 D5=1로 바뀌어 순D5수익률이 KIS−32.892%/NAVER−1.224%였다. 이 행은 L5 판정이 뒤집혔지만 공식 corporate action 원인은 확인하지 않았다. 기존 KIS 라벨을 덮어쓰지 않았다. `selected-cohort-metric-summary.json`은 각 provider의 strict분모와 unknown을 별도 명시하고 policy별 수치를 기록한다.

`selected-cohort-actual-ts-audit.json`: 현재 실제 TS `labelPick`로 strict KIS3,391+NAVER3,392=6,783개 결과의 entry·touch·양봉·grossD5·MAE가 독립 계산과 전부 일치했다. unknown51은 기존대로 유지했다. 원본 KIS/NAVER/ledger와 제품 source SHA 전후 동일, DB/email/archive 쓰기0. 이 대조는 반복 열람된2025~2026 자료의 사후 품질 진단이며 새 모델 선택·튜닝·성과 주장이 아니다.
