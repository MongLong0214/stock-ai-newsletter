# Stock Prepare 연구 기록 · 2026-09-30~10-01

## 결론과 운영 상태

목표는 종합점수 내림차순으로 서로 다른 3종목을 선정하고, 추천일 양봉과 추천일 포함 5거래일 안의 +10% 도달 성능을 높이는 것이다. UI·제품 문구·기존 Analysis Summary는 이번 PR에서 변경하지 않는다.

30개 학습 설정과 기존 점수·가중치·시장 보정을 시험했지만 **+10% 도달 약40%와 모든 음수 수익 비율 약30%를 동시에 달성한 방식은 없었다.** 세 종목 모두 높은 점수와 높은 추천일 양봉 비율도 함께 달성하지 못했다.

[PR219](https://github.com/MongLong0214/stock-ai-newsletter/pull/219)의 후보는 `L0-A-small, λ0.65, 50입력`이다. 10/1 점수·실제 후보에 대한 재검토로 Draft이며 아직 main에 없다. 실행 테스트 통과를 추천 품질 개선으로 해석하지 않는다. 중복 연구 스크립트·중간 모델·로그·선정 원장·manifest·복원 도구는 Git의 현재 파일에서 제거하고 이 기록과 운영 코드·모델·행동 회귀 테스트만 남겼다.

## 측정과 평가 구성

- 신호일 다음 실제 거래일 시가를 진입가로 가정한다. 추천일 포함 정확히5거래일 고가가 진입가의110% 이상이면 `T10`이다. 원화 반올림 비교는 `round(maxHigh)*100 >= round(entry)*110`이다.
- `D1bull`은 추천일 종가>시가. `D5net = D5close/entry - 1 - 0.003`으로 왕복비용30bps를 차감한다. `L0`는 D5net<0, `L5`는 D5net≤−5%이다. 두 손실 비율을 섞지 않는다.
- 미래5봉 중 누락·무효 OHLC·거래량0이 있으면 미확정이다. 학습·strict 성과 분모에서만 제외하며 선정 목록에서 제거하거나 거래정지일을 건너뛰지 않는다.
- 매일3개, 표시 정수 종합점수↓ → 20일 평균 거래대금↓ → ASCII 종목코드 순으로 선정한다. 기존 상태·유효 캔들·거래대금 게이트와 CD20을 유지한다. A는 직접 효용 회귀, B는 날짜별 순위학습과 시간순 보정이다.
- NAVER TRAIN2020~2022에서 시간순3 fold(학습150/350/550일, 간격5일, 보정40일, 간격5일, 평가80일)를 사용했다. A는 보정40일을 사용하지 않는다. L5 24설정·L0 4설정·FP 2설정 중5승자를 고정한 뒤2023~2024의489일을 평가했다.
- 평가 중8분기마다 이전 성숙505패널(460학습+5간격+40보정)로 재학습한다. 이전 평가기간의 성숙 라벨이 이후 학습에 포함되는 순차 평가이며 끝까지 봉인된 단일 holdout은 아니다.

## 핵심 비교 결과

NAVER2023~2024,489신호일·1,467추천. 모든 정책이 매일3개를 골랐다. 확정 분모 차이는 미래 자료 미확정 때문이다. 수익은 개별 추천 D5net 평균이다.

| 방식 | 확정/추천 | T10 | L5 | L0 | D1bull | 평균 D5net | 세 점수≥70인 날 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 기존 종합점수 |1465/1467|23.41%|27.65%|58.16%|41.16%|−0.327%|100.00%|
| 저변동 ATR |1463/1467|2.87%|4.58%|52.97%|46.21%|−0.050%|0.00%|
| L5-A 원18 |1457/1467|47.77%|42.96%|60.05%|46.67%|−0.334%|1.02%|
| L5-B 확장50 |1458/1467|41.02%|41.70%|61.18%|45.47%|−1.138%|1.64%|
| **L0-A 확장50** |1461/1467|**43.60%**|39.63%|**58.25%**|48.87%|−0.173%|0.20%|
| L0-B 원18 |1463/1467|41.63%|43.06%|59.67%|45.66%|−1.159%|0.00%|
| 목표·손절 선후 FP-A50 |1462/1467|28.18%|31.87%|58.00%|42.48%|−0.219%|0.20%|

L0-A50의 연도별 T10/L0/평균D5net은2023년40.74%/59.53%/−0.059%,2024년46.45%/56.97%/−0.285%이다. 좋은 분기만 골라 전체 실패를 지우지 않는다. 이 수치는 연구 family의 순차 평가이며 최종 KIS 재학습 모델의 새로운 미래 성과가 아니다.

날짜 이동블록10일·1,000회·seed42의 paired bootstrap과20일 민감도를 확인했다. 정책마다 자기 strict 분모를 유지했다. 다중검정 보정이나 탐색 전체 불확실성을 포함한 통계는 아니다. FP는 고정+10/−5장벽의 선후를 보고 같은 일봉 양 장벽 접촉은 순서를 알 수 없어 보수/낙관 범위를 사용했다. 이전 `FPstopBeforeLaterTouch` 필드도 같은 봉 접촉을 포함하므로 정확한 의미는 `rawTouchWithConservativeStop`이다. 장중 도달은 실현 매매 수익과 다르다.

## 반복하지 않을 실험

아래 KIS 결과는 반복해서 본 기간의 진단이며 새 외부 검증으로 합산하지 않는다.

| 시도 | 결과와 폐기 이유 |
|---|---|
| 6항목 산술·기하 가중치 | 산술 최근60일 T10 23.46%, L5 29.05%, L0 56.98%, 평균−1.116%; 세 점수≥70은28/60일. 숫자가 높아져도 급등·수익 개선 부족 |
| 원시 지표 선형 효용 | T10 12.22%, L5 17.41%, 평균−0.193%; 방어적이지만 급등 부족 |
| 18입력 T/B/L5 3-head | T10 49.25%, L5 47.20%, 평균−2.082%; 급등과 급락을 함께 추적 |
| λ0.65 손실 페널티 | T10 38.88%, L5 40.56%, 평균−2.288%; 손실 목표 실패 |
| 시장 prior 보정 | T10 43.10%, L5 37.50%, L0 58.21%, 평균−1.445% |
| bounded 목표 매핑 | T10 41.50%, L5 38.50%, L0 59.44%, 평균−1.315%; 일부기간 성과로 전체 실패를 해소하지 못함 |
| 월별 성숙 라벨 재학습 | 최근60일 T10 32.78%, L5 45.56%, L0 62.78%, 평균−2.319% |
| CD20→CD5 | 최근60일 L5-B T10 55.31→51.69%, 평균+1.241→−0.204%; 미채택 |
| 정수 동점에서 실수 점수 우선 | 선정은 바뀌지만5후보 모두 목표 실패; 정수→거래대금→코드 유지 |
| 무제한 과거 prefix | 제품과 관측 범위가 달라 폐기; 최종 피처는320거래일 관측창 |

## 실제 최근 추천과 새 후보의 문제

9/30 마감까지 직접 대조한 실제 Prepare 추천이다. 추천일 양봉은9/29에1/3,9/30에0/3이며 두 날짜의 D5는 아직 미성숙이다. 아래 수치는 비용 전 관측값이다.

| 추천일 | 종목 | D1 시가→종가 | 진입시가→9/30종가 | 관측 최고/최저 |
|---|---|---:|---:|---:|
|9/29|유나이티드제약033270|−0.338%|−0.282%|+0.000% / −1.803%|
|9/29|제일기획030000|+0.337%|+5.219%|+6.229% / −0.449%|
|9/29|LX홀딩스383800|−1.215%|−2.066%|+0.000% / −2.309%|
|9/30|오름테라퓨틱475830|−0.897%|−0.897%|+3.812% / −2.915%|
|9/30|HLB이노베이션024850|−0.062%|−0.062%|+6.773% / −6.219%|
|9/30|광진실업026910|−2.361%|−2.361%|+2.575% / −9.442%|

근거는[9/29 run36484308881](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36484308881)(SHA277d641、v2)와[9/30 run36631489672](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36631489672)(SHA87613f9、v3)이다. Prepare 아티팩트는 이메일 수신 성공의 증거가 아니다.

9/30신호→10/1추천을 새 후보로 재생하면 **코스모로보틱스439960 45점·엑스게이트356680 42점·아스플로159010 42점**이다. 같은 세 종목의 기존6항목 가중 종합점수는23·64·65다. 새 점수는 `100×(.8*T10+.2*D1bull+.65*(1-L0))/1.65`의 학습 기대값을 반올림해 기존 기술점수와 단위가 달라졌다. 산식상 도달40%·양봉60%·비손실70%도54.2424점이다. 숫자 가산·70점 하한·백분위로 올려도 순위와 추천 품질은 좋아지지 않는다.

코스모로보틱스는 실제 전일 대비−29.98%의 평평한 하한가 봉, 직전5일−34.89%였다. 양수 거래량과 기존 게이트를 통과했고 range0은 native missing routing으로 처리됐다. 실제 KIS 대조28행·140필드 차이0으로 데이터 오류가 아니었다. 점수 척도와 하락 위험을 함께 재검토해야 하며 이 선택을 안전하거나 고득점 요구를 만족한 최종안으로 설명할 수 없다.

## 남긴 구현과 검증 근거

- 코드: `scripts/stock-picks/observed-inputs.ts`, `utility-model.ts`, `production-strategy.ts`, `generate-picks.ts`, `strategies.ts`와 Prepare 저장 전 점수 결속. 원18+가격·거래량 지속/수축·압축·낙폭/회복·다기간 구조32입력이다. 6항목 기술점수는 유지한다.
- 모델: `scripts/stock-picks/models/composite-utility-v1.json`. HGB100트리, 최대7leaf/깊이3, minleaf100, LR0.05, L2=1, bins255, seed42, earlystop=false. 날짜 동일 가중치,421패널·506,470 strict행·119,819결측. 마지막 신호9/18, 라벨 성숙9/29. numpy2.5.3/sklearn1.9.1; 런타임 Python 불필요.
- Trainer: `scripts/stock-picks/train-composite-utility.py`, SHA256 `4b3c88aed774ac8fb6c0151b9b84111bba6a20bab165479dbb41541182e10556`. 학습 입력·날짜·패키지 식별자는 모델 metadata에 남는다. 모델 공백 정리 전 SHA256은 `381a8c6a3f95b8dd333460ab19e0487147da8a2e3714da5f64264442af176fae`, 정리 후는 `c21d1ff3aae3a8af89a6af311795c6126e9b13faa852abe2c49aaa06fb828ccb`. 모든 JSON 토큰이 같아 모델 값·canonical 전략 hash는 불변이다. 과거 witness의 modelArtifactSha256은 당시 원본을 가리킨다.
- Parity fixture·행동 회귀 테스트는 결측 분기·경계·반올림·원천·선정·Prepare 실패 경로를 검증한다. 최초후보 fcbc108에서4,198테스트·타입검사·lint0오류(기존15경고)·build487페이지·Prepare E2E37개가 통과했다. 독립100트리 refit, TS/native1,952사례와 raw50입력100사례가 일치했다. [CI36794302986](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36794302986). 과거 결과를 변경 후 전체검사로 재사용하지 않는다.
- 10/1 아카이브 정리 후367파일·4,211테스트(Prepare E2E 포함), app/scripts 타입검사, `git diff --check` 통과. 모델·parity JSON 전체 토큰과 canonical 전략 hash가 같고 UI 파일·Summary·표시 정렬·표시 rationale 함수는 기준main1b0e2d2와 같았다. 이 검사는 실행 로직 보존을 확인하며 점수 설계·추천 품질 재검토는 진행 중이다.
- 리뷰 R2-001: 후보320봉만 KIS로 검사해 KOSPI20일 수익과 전체 breadth에 혼합원천이 들어올 수 있었다. foreign benchmark19→14/35, foreign breadth19→51점 재현을 확인했다. fe73eee에서 실제 기여 KOSPI21일·active-master20일 원천을 한 번 검사하고 기존 결측을 유지하도록 수정했다. 동일5개 witness가 수정 전 실패·수정 후 통과했고 집중91테스트가 통과했다. hash 기대값은 f4cb2b5에서 정정했다.
- 현재 canonical 전략 hash: `d56b1782cadfe3c98f0ffa6258b8b09b599e9ecc16d567cc2a052affedb9976f`(`kis-market-21-20-v1` 포함). 최초후보 `7c1eb45a…`와 구분한다. PR219 자동 리뷰는1회 중단·2회차R2-001 보고가 있었고 남은 자동 재검토는1회다.
- [전체 Prepare 시험36794297344](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36794297344)는 fcbc108·수정 전 hash에서 성공했다. 2,434호출/2,433성공, exact-date99.9589%,17,020가격행 갱신,952후보,23분20.839초였다. 같은45·42·42를 골랐고 뉴스레터/픽스냅샷 저장·발송은 생략했다. 가격·마스터 쓰기는 실제 수행했다. 새 hash의 완료나 추천 품질 개선 증거가 아니다.
- 10/1 정기[run36777694549](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36777694549)는06:10 KST에 기존main1b0e2d2로 실행돼 경동제약·KT·CJ제일제당을 골랐다. 새 모델 운영으로 부르지 않는다. 스케줄은 main의 Prepare06:10/Send07:27 KST다.

## 데이터와 재현

Git의 현재 파일에는 원시가격·전체 실험 스냅샷이 없다. 아래는 당시 로컬 원본이며 `/tmp`는 영구 보관소가 아니다. 재수집은 조정주가·상태 vintage가 달라 동일 바이트 재현으로 부를 수 없다.

| 입력 | 당시 경로 | SHA256 |
|---|---|---|
|KIS 가격|`/tmp/stock-research-fresh-mature-20260930/input/prices.ndjson`|`c0fe673a5c0cef5197625d2ccd811c900bbe6655e81a66f4b797c6e741a1ce54`|
|NAVER 가격|`/tmp/composite-score-experimental-20260930/naver-history/prices.ndjson`|`6347d11d70043a9016f751f8f4c1de31f4498c20d29f7e69688b8e76dbd003a8`|
|현재 master|`/tmp/composite-score-experimental-20260930/naver-history/master-snapshot.json`|`45d0f4419f49f2bdf4eacc8dbbf68e35c2f9de1f6d082ec3573ac3d5a5235c00`|
|50입력|`/tmp/composite-score-experimental-20260930/extra-features.ndjson`|`5c953745cef23f54ac619d2b80ce12b559436fce7f7e43ac30550f4c8f7579a2`|

실행은 저장소 루트에서 다음과 같다. features는 실제 TS gate 통과 관측행이어야 한다. feature-spec/calendar 해시는 모델 metadata에 있다. macOS 과학 런타임이 OpenMP 경로를 필요로 하면 해당 환경의 sklearn `.dylibs`를 `DYLD_LIBRARY_PATH`에 지정한다.

```sh
uv run --script scripts/stock-picks/train-composite-utility.py \
  --features /tmp/composite-score-experimental-20260930/extra-features.ndjson \
  --feature-spec /tmp/composite-score-experimental-20260930/featurespec.json \
  --calendar /tmp/stock-research-fresh-mature-20260930/input/metadata.json \
  --prices /tmp/stock-research-fresh-mature-20260930/input/prices.ndjson \
  --as-of 2026-09-29 --output /tmp/stock-composite-refit.json \
  --audit-dir /tmp/stock-composite-refit-audit
```

실험 원본은 `/tmp/composite-score-research-20260930/`, `/tmp/composite-score-experimental-20260930/`에 있었으며 이번 Git 정리로 삭제하지 않았다. 운영 검산은 `/tmp/stock-composite-production-20260930/`, 최종 학습 검산은 `freshest-kis-fit/`에 있었다. exporter가 자기 경로/해시를 metadata에 기록하므로 다른 경로의 의미상 같은 모델과 바이트 동일 재현을 구별한다. 재훈련 exporter는 들여쓴 JSON을 출력한다. 운영 보관본의 공백 정리는 학습 변경이 아니다.

NAVER는 현재2,431master+KOSPI의1,999일 달력·4,221,467봉,1,231신호일·1,559,349현행 자격행을 사용했고9/30장중행은 제외했다. endpoint는 `https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=2000&requestType=0`이다. KIS 평가416패널과 관측423패널을 구별하며 이전235일은80~314관측으로 제품320창과 동일하지 않다.

현재 생존종목·상태·조정주가를 과거에 적용해 생존/PIT 편향이 남는다. KIS↔NAVER 공통1,192,328봉 OHLCV 일치는94.142%였다. 최근4종목×10일 재조회는 KIS40/40 일치, NAVER종가4/40 일치였다. 기업행사 원인은 확정하지 않았다. KIS 최악손실20건은 두 원천이 같아 실패 전체를 원천 차이로 무효화할 수 없다. 원천을 한 가격열로 혼합하지 않는다.

## 참고 문헌과 다음 연구

문헌은 가설·평가 방법의 참고이며 국내3종목5일+10% 성과 근거가 아니다. 전문을 재현한 것으로 주장하지 않는다.

| 자료 | 참고점·확인 범위·한계 |
|---|---|
|[Lee·Swaminathan2000](https://www.lsvasset.com/pdf/research-papers/Price-Momentum-Trad-Vol-2000.pdf)|거래량×모멘텀. 미국3~12개월 보유; 방법·결과 확인 |
|[George·Hwang2004](https://www.bauer.uh.edu/tgeorge/papers/gh4-paper.pdf)|52주 고점. 미국6개월 보유; 20일 돌파와 다름; 원문 확인 |
|[de Groot·Huij·Zhou2012](https://repub.eur.nl/pub/25718/AnotherLook_2011.pdf)|주간 반전·유동성·비용. 미국/유럽 분산 포트폴리오; 원문 확인 |
|[Nagel2012](https://www.nber.org/papers/w17653)|단기 반전·유동성 위험. 미국다수종목/헤지; 원문 확인 |
|[Daniel·Moskowitz2016](https://www.nber.org/papers/w20439)|모멘텀 붕괴·꼬리손실. 월별long/short; 원문 확인 |
|[Novy-Marx2015](https://www.nber.org/papers/w21329)|다중 신호 과최적화. 원문 방법 확인 |
|[Gu·Kelly·Xiu2020](https://www.nber.org/papers/w25398)|비선형 상호작용. 미국월별수익; 초록·표본/방법 확인 |
|[Saerens 외2002](https://doi.org/10.1162/089976602753284446)|label prior 보정. 초록 확인, 전문 확보 실패 |
|[Lipton 외2018](https://proceedings.mlr.press/v80/lipton18a.html)|label shift/관계 변화 구분. 초록·가정/방법 확인, BBSE 미구현 |
|[Gama 외2014](https://eprints.bournemouth.ac.uk/22491/1/ACM%20computing%20surveys.pdf)|지연 라벨·concept drift. 원문 갱신 설명 확인 |
|[Lo·Mamaysky·Wang2000](https://www.mit.edu/~wangj/pap/LoMamayskyWang00.pdf)|기술적 패턴 정보. 미국장기표본; 정보량과 수익은 다름 |
|[Poh 외 순위학습](https://arxiv.org/pdf/2012.07149)|날짜별 순위. 미국월별long/short; KRX5일 검증 아님 |
|[중국 candlestick ML](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0255558)|candle/volume 입력. 시장·목표·진입 조건이 다름 |
|[López de Prado barrier](https://pdfs.semanticscholar.org/bbf7/bc8f68d22cb8089a4860b111ba9ef60fc957.pdf)|경로·중첩 라벨. 이번 고정 장벽은 논문 동적 장벽과 다름 |
|[Bailey·López de Prado](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)|선택 편향. Deflated Sharpe/PBO 미계산 |

후속 연구는 종합점수와 기대 효용의 의미를 먼저 구분하고 하락 위험을 줄이면서 T10을 유지하는 입력/목표를 비교해야 한다. 반복 평가기간의 추가 threshold 탐색을 새 검증으로 부르지 않는다. 새로운 미관측 기간과 당시 상장·상태·기업행사 이력을 확보하고 원천별 성능·실제 후보·점수 분포·D1bull/L0/L5를 함께 확인한다. 목표가·손절 순서와 체결 가정은 raw touch와 별도로 보고한다.
