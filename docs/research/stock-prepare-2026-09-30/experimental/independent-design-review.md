# 다음 실험 독립 설계 검토 — 2026-09-30

현재 근거로 추천하는 다음 비교는 **동일한 급등 전 raw setup 입력에 대한 직접 기대효용 회귀와 날짜별 LambdaRank, 두 family**다. 모델핏, 기존 보고서, production 소스는 수정하지 않았다. 이 문서는 제안이며 Root가 확정한 실험 계획을 대신하지 않는다.

## 실제로 확인한 실패 원인과 목표

- 월별 adaptive family는 독립 15묶음/45헤드/4,500트리 및 own cooldown20 재생이 모두 일치했지만, 최근60일 touch59/180=32.78%, loss5 82/180=45.56%, anynegative113/180=62.78%, D5평균−2.319%였다. 코드 오류가 발견되지 않았다는 사실은 성과 근거가 아니다.
- 이전 prior-shift의 최근60일 선정종목 touch 평균예측은62.63%, 실제42.78%였다. Universe 최근20일 prevalence를 바꾸는 보정은 선정된 top3의 posterior calibration을 보장하지 않았다. 새 두 family에 이 보정을 자동으로 재사용하지 말 것을 권고한다.
- `T=추천일 포함 D1..D5 장중 high >= D1open*1.10`, `B=D1close>D1open`, `R=D5close/D1open−1−0.003`, `L=R<=−0.05`, `A=R<0`를 각각 유지한다. **30% 목표의 loss5와 모든 음수 수익 A는 다른 값**이다. 0volume/결측 미래bar는 selection에서 빼지 않고 strict unknown으로 보고한다.
- T와 L은 서로 배타적이지 않다. 전체180일 이전 event policy에 `(T=1,L=1)`47건/536strict, 월별 policy36건/539strict가 실제 존재한다. 새 결과에는 T×L 4상태를 함께 보고한다. 목표 익절 proxy는 `P=0.097 if T else R`; D5종가 손실과 병기한다. 이것은 OHLC daily-high 기반 proxy이고 실제 주문 체결이나 stop시간순서가 아니다. `T AND positiveD5`로 목표를 바꾸지 않는다.

## 동일 입력, 두 family의 구체 제안

현재18개 raw 입력에 시계열 형태를 보강하되 같은 정보를 다른 점수 이름으로 복제하지 않는다. 두 family는 같은 입력을 사용한다. 추가 후보는 **신호일 직전** TR5/TR20, realized-vol5/20, mean-volume5/20, signal-volume/prior5-volume, down-dollar-volume20 share, price-path-efficiency10의 여섯 개다. 기존 prior20고점 거리%는 ATR 단위 거리 `(signalClose−prior20OHLC high)/ATR14`로 대체할 수 있다. 모든 window의 signal일 포함 여부, priorhigh의 제외 기준, 부족한 history의 nativeNaN을 사전에 정의한다. 이후 성과에 따라 window를 바꾸지 않는다. 새로운 데이터가 없다면 예측하지 못하는 결측을 미래 outcome으로 걸러서는 안 된다.

비교를 간단히 하기 위해 두 family에 공통 목표 효용을 권고한다:

`Uλ = T + 0.10*B − λ*L`, `Vλ = (Uλ+λ)/(1.10+λ)`.

이는 **급등/당일 양봉/−5%손실 회피의 선형 선호 지수**, 금전수익이나 touch확률이 아니다. 0.10은 양봉이 부차적인 목표라는 설계 제안이며 승인된 성능 수치가 아니다. λ는 TRAIN 안에서만 고르는 고정 두 값 `{0.35,0.65}`를 제안한다. 원시 target-exit proxy P와 손실크기는 별도 경제적 성과로 반드시 공개한다. V는 큰 손실과 작은 손실을 L만으로 구분하지 않는 한계가 있다. monetary expected-P 회귀를 추가하려면 이것을 **세 번째 별도 family**로 명시해야 하며 결과를 본 뒤 첫 family의 label을 바꾸지 않는다.

**A: 직접 nonlinear expected-V 회귀.** 날짜별 equal-weight nativeNaN HGB regressor가 V를 직접 학습한다. 기존 세 개 log-loss head를 가중합한 것과 달리 하나의 joint utility target에 회귀한다. 기존 모델 용량(100iterations,7leaves,depth3,minleaf100,LR.05,L2=1,seed42,noearlystop)을 그대로 두어 이번에는 입력과 손실함수의 효과를 비교한다. HGB 회귀 raw 출력이 범위를 벗어나면 미리 정한 clip[0,1]만 허용하고 초과 빈도를 공개한다.

**B: 날짜=query인 LambdaRank.** 같은 T,L,B의 여덟 상태에 대해 `Uλ`를 정렬한 index0..7을 relevance label로 사용한다. `label_gain`은 정렬한 `Uλ+λ`의 실제 값으로 지정한다. 기본 `2^grade−1`은 사용자 선호에 없는 지수 보상을 추가하므로 쓰지 않는다. λ=.65 예시 gains는 `[0,.10,.65,.75,1.00,1.10,1.65,1.75]`다. 쿼리마다 실제 strict known TRAIN 후보를 사용하며 날짜를 row-random split하지 않는다. 용량은 A와 유사하게 고정하고 `eval_at=3`, `lambdarank_truncation_level=6`, `lambdarank_norm=true`, deterministic CPU로 고정하는 안이 적당하다. 날짜 equal-weight를 원하는 경우 rowweight와 query-normalization이 실제 어떻게 결합되는지 구현에서 확인한다. NDCG@3은 진단이고 실제 선정 목표를 대체하지 않는다. [LightGBM 공식 파라미터](https://lightgbm.readthedocs.io/en/stable/Parameters.html)

Ranker margin은 0..100 품질점수도 확률도 아니다. `sigmoid(margin)*100`을 임의로 붙이거나 output percentile로 고득점을 만들지 않는다. 두 family 모두 독립 시간 calibration 구간에서 **positive-slope fractional-logistic mapping을 V에 맞추는 동일 절차**를 사전 선택하면, 최종 score는 `round(100*mappedExpectedV)`라는 해석을 갖는다. calibration은 전체 eligible 후보에 date-equal weights로 적합하고 top3/after-cooldown tail의 calibration도 별도 점검한다. Top3만으로 calibration을 적합하면 불선정 후보로 바뀌는 정책의 값을 학습할 수 없으며, 전체 calibration만으로 top3 calibration을 주장하는 것도 잘못이다. [scikit-learn 공식 calibration 문서](https://scikit-learn.org/stable/modules/calibration.html)

## TRAIN 내부 선택과 이후 재생

새 family의 λ와 calibration/용량 변경을 이미 확인한 원래 VAL/TEST180일로 고르면 안 된다. 기존 earlier235TRAIN 안에서 가능한 명시적 chronological nested 예시는 다음과 같다. index는235 actual signal panels의0-based이며 각 fit/calibration label의 D5 maturity가 다음 단계 활성시점보다 늦지 않아야 한다.

| fold | learner fit | calibration | policy validation |
|---|---|---|---|
|1|0..79|85..109|115..144|
|2|0..109|115..139|145..174|
|3|0..149|155..179|185..214|

각 경계의5 signal panels는 maturity buffer다. validation 전까지 기존 currentOverall을 원래 calendar대로 연속 재생해 cooldown state를 만들고, 각 candidate는 activation 후 자신의20일 cooldown을 계속 쓴다. fully fitted learner/calibrator를 과거 warm decisions에 소급 사용하지 않는다. 최종 선택된 family/λ는 learner0..204, calibration210..234로 묶어12/23부터 고정 재생할 수 있다. 이 안은 calibration 독립성을 위해 마지막25일을 learner fit에 쓰지 않는다. all235 learner fit 후 같은 마지막25일 prediction으로 calibration하면 다시 train leakage다. 다른 최종 refit 방식을 쓸 때에는 그 방식도 TRAIN 안에서 사전 정의해야 한다.

선택 기준은 목표 이상 성과를 벌하지 않는 `D = max(0,.40−touch)^2 + max(0,loss5−.30)^2`를 권고한다. 기존 양쪽 squared distance는 touch>.40/손실<.30도 벌한다. fold를 날짜 단위로 합치되 각 fold의 touch/loss와 strict coverage를 함께 보며, 동률 순서는 target-exit proxy mean→D1bull→작은 λ로 고정한다. 모든 지표가 ATR baseline을 이겨야 한다는 새로운 gate는 만들지 않는다. 원래 요청대로 정확히3개를 내는지, 손실을 낮추려고 출력일을 빠뜨리는지 함께 확인한다. unknown을 제외한 strict rate와 전체 선정 수 기준 unknown upper/lower bounds를 병기한다.

최종 **published integer DESC→turnover DESC→ASCII**가 실제 selector다. float ranking은 별도 성공률 비교를 추가하지 않고 동일 exclusions에서 점수 압축/tie 진단만 한다. Calibration의 flat regions와 정수 압축은 turnover 선택을 늘릴 수 있으므로 실제 calibration 이후 integer roster로 TRAIN 후보를 선택한다. 모든 날 세 종목≥70 요구는 경험적으로 가능할 때만 사실로 보고하며, 고득점 floor 또는 점수 부풀리기로 충족시키지 않는다.

원래180일은 이미 수차례 열람한 재사용 진단이다. 새 fit에 직접 넣지 않았어도 이제 untouched holdout이라 부를 수 없다. 미사용2023–24를 확보한다면 **각 평가일 이전의 데이터만 학습하는 forward 재생**으로 독립성을 보강할 수 있다. 2025–26에 fit한 모델을 과거2024에 적용하는 것은 미열람 구간이어도 causal OOS가 아니다. 현재 master/status 생존 편향, raw-price 조정/수정 이력, 고정30bps 비용과 실제 fills의 차이는 별도 한계로 남는다. 반복된 투자전략 선택에서 holdout만으로 과적합을 해결했다고 주장할 수 없다는 원문 범위만 참고했으며 KRX 성과 보장으로 인용하지 않는다. [Bailey 외 원문](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf)

기존 원본/실패 결과는 보존한다. 새로운 fit은 Root의 확정 계획 뒤에만 수행하고, 여기서 추가 모델·feature window search·production 변경은 하지 않았다.

## Root 확정 protocol의 후속 검토

Root는 원 제안 대신 `A HGB goal-utility regression / B LambdaRank` × `18/50inputs` × `λ=.35/.65/1` × `small/medium`의24variants와 `V=(.8T+.2B+λ(1−L))/(1+λ)`를 확정했다. 이 아래는 확정안의 검토이며 위 제안의 가중치/folds로 바꾸자는 요청이 아니다. 새 family나 variant를 추가하지 않는다.

기존 KIS235 구간 안의 prefix80/105/130 fit, activation85/110/135, B calibration110에서85..104 및135에서85..104+110..129는 D5 maturity가 모두 다음 activation 이전이므로 타당하다. 110..129+135..149의 공통35일만 assessment하며 gap은 직전 활성 모델/calibrator와 own cooldown을 그대로 진행해야 한다. B110 이전 oldoverall과 A85 활성으로110의 cooldown warm state가 다른 것은 명시된 정책 차이이며, 동일 float top3로 바꾸거나 평가일만 이어 붙이면 안 된다. λ1에서는 서로 다른 두 상태의 V가.5로 같으므로8states를7uniquegrades로 dedup하는 계약을 실제 구현에서 확인해야 한다. Isotonic은 `out_of_bounds='clip'`과 date-equal sample weights를 명시한다. OOF margin을 새로운 full-fit ranker에 적용하는 calibration transfer는 직접 미래누수가 아니지만 scale/offset 안정성 가정이 남고 flat regions 및 integer ties는 실제 roster로 평가해야 한다.

추가32개 입력의 actual source를 읽었고 synthetic6개 asof에서 미래 suffix 변경 및 prefix truncation 불변, 네 volume/return window 수식이 독립 계산과 일치했다. 원18 vs50 ablation은 유효하지만 새return1은 기존 신호일 close-close return과 같은 원자이며 다중 고점거리/turnover/window들의 상관이 있으므로50개 독립 정보라고 주장하지 않는다. Export 파일은 **symbol-major**이므로 LGBM의 date query는 반드시 date-contiguous로 join/reorder해야 한다. 이 조건을 지키지 않고 group count만 넘기면 다른 날짜·종목이 같은 query로 묶인다. 원본18입력/라벨/turnover/score 역시 재정렬된 동일 key 순서로 맞춰야 한다.

이후 Root는 **Naver-only TRAIN2020–2022 + 새2023–2024 평가**를 primary 후보로 제시했다. learner150/cal155..194/assessment200..279, learner350/cal355..394/assessment400..479, learner550/cal555..594/assessment600..679의 일정도 타당하다. 마지막 calibration D5는 각각199/399/599이므로 다음 assessment 전에 성숙한다. 각 fold learner와 B40일 calibrator는 고정하며 assessment 전 legacy overall로 state를 만들고 activation부터 자신의20일 cooldown을 쓴다. 같은24variants/fixed one-sided selection으로 family별 winner를 저장한 뒤에만 새2023–24 outcome을 조회한다. 아직 미사용2023–24 가격/라벨을 직접 읽지 않았다.

Quarterly eval의 최근505 consecutive mature signal panels, `460 learner +5 gap +40 B calibration`은 learner 마지막459의 D5가464, calibration 첫465이어서 겹침을 막는다. 마지막 calibration504의 D5는 closed-asof activation 당일까지 성숙하며 다음날 open 진입 가정과 맞다. A/B가 같은460일 learner 범위를 쓰고 A는 calibration을 쓰지 않는다는 계약을 유지해야 한다. 최초2023에505 actual panels 또는320 asof prefix가 부족하면 날짜를 압축/대체하지 말고 Root에 알린다. 실제 KOSPI 거래일 calendar 전체를 연속 재생하고, 신호일별 future outcome 결측은 선정filter가 아니라 unknown으로 남긴다.

Naver 방향의 구체 구현 문제를 Root와 owner에게 알렸다: 현재 `extra_features._bar`는 `source=='kis'`만 허용해 Naver 행을 그대로 넣으면32개 추가 입력이 전부 결측이다. 새 Naver source를 정식으로 지원해야 하고 KIS라고 거짓 tag하거나 기존 KIS 결과와 섞으면 안 된다. Naver의 현재 시점 adjusted OHLC에 과거 volume을 곱한 turnover/logTurnover는 실제 과거 시점 유동성과 다를 수 있고, NAVER 연구와 production KIS 사이의 input/source shift도 남는다. NAVER2023–24 결과가 좋아도 이를 KIS production 성과와 바로 동일시할 수 없다. Currentmaster 생존 편향 및 사후 adjusted/vintage 한계를 함께 명시한다.

이 추가 검토 시점의 model fit은0이다. Frozen source가 준비되면 labels/query order/weights/maturity/score/own cooldown을 실제 코드에서 검산할 예정이며, 검토가 아직 실행 코드 전체의 정확성을 확인했다는 뜻은 아니다.

## 실제 실행 코드와 목표 정의 검토

후속 `kis-research.py` 전체와 두 단계의 read-only loader를 읽었다. Symbol-major50입력을 원본 `(date,symbol)` 순서에 정확히 join하여 날짜별 query로 연결하고, turnover는 원본 `averageTurnover20`을 직접 사용한다. Strict 미래 라벨 mask는 learner/calibrator에만 사용하며 native NaN과 미래 unknown은 선정에서 유지한다. Prefix80/105/130과 activation85/110/135, B의 causal20/40 OOF calibration, gap의 직전 bundle 및 자체20일 state 진행, 공통35일 assessment, winner 저장 뒤 inner/outer 진행이 동결 계획과 맞다. 이 source 검토에서 구체적 미래누수는 찾지 못했다. 실제 model/input/roster 검산은 별도 파일에 진행하며 이 문장이 모든 실행 결과의 정확성을 뜻하지 않는다.

최종 32개 raw features는 독립 계산640cases/20,480values, 원본18은509,015행 전수 검산에서 불일치0이다. 관측 volume0은0으로 보존하고 음수/결측만null, invalid OHLC는 carry 없이 결측으로 처리한다. KIS/Naver provider는 explicit tag로 분리하며 전체320 bar Wilder window의 이전 prefix 수정 불변도 확인했다. 이전 synthetic checker가 invalid 현재 OHLC에서 역사만 쓰는 두 feature도null이어야 한다고 잘못 가정한2개 witness는 별도 보존하고 checker만 정정했다.

현재24개 실험의 손실 target은 `L5=netD5<=−.05`다. 유저가 말한 손실률30%와 `L0=netD5<0`는 다르므로 성공 판정에서 바꿔 부르면 안 된다. `T`는5일 중 +10% high touch이며 그 뒤 D5 loss가 나도 T는true다. 그러므로 ANYnegative, T&positive/nonnegative/negativeD5, T×L5 joint counts, full5 MAE, 손실크기와 target-exit proxy를 각각 공개해야 한다. 점수V는 bounded favorable-outcome utility index이며 touch probability나 금전 수익률이 아니다.

Root는 본24개 실험을 유지한 채 별도4개 L0 sensitivity(A/B×18/50, small, λ.65)를 최초 신규2023–24 outcome 열람 전 동결했다. 이는 기존L5 결과를 본 뒤 λ를 조정하는 가설이 아니다. Score/calibration/choice 모두 L0로 일치해야 하며 기존L5/L10 지표는 계속 병기한다. L0 family도 −0.1%와 −30%를 같은 한 사건으로 취급하는 한계가 남는다.

추가 경제적 검증이 필요하다면 새 ranking family를 즉흥적으로 늘리기보다 **고정 +10%/−5% first-passage proxy**를 별도 진단한다. Entry는D1open, opening stop gap은 actual open, opening target은 보수적으로 target 가격에 cap한다. Open이 두 barrier 사이이고 같은 날 H/L이 모두 닿으면 순서를 모르는 것이므로 stop-first와 target-first bounds 및 ambiguous flag를 같이 보인다. Cost는 선택한 exit gross에 round-trip30/60/100bps를 한 번 빼며 원래5일 T metric을 이 proxy로 대체하지 않는다. 미래5bar 중 결측/volume0은 strict proxy unknown으로 보존한다. 이 진단은 실제 체결·intraday 순서 확인이 아니다.

Cooldown20은 하루3개 서로 다른 종목이라는 계약과 별개다. 구조적 TRAIN ablation을 한다면 동일 frozen 모델/configuration/predictions에 CD5/CD20만 사전 지정해 각각 actual calendar에서 own state를 진행하는 것이 적당하다. CurrentOverall과 동결 TRAIN winner를 그대로 쓰며 outer를 본 뒤 config를 재선택하지 않는다. Per-slot T/L0/L5/proxy와 반복추천 빈도, 같은 종목/entry-date 사건 및 날짜 block 의존성을 함께 공개한다. 이미 상승 중인 종목을 다시 고르는 효과와 표본 상관 증가를 구분해야 한다. RSI85/runup15 pool의 관측 cohort 진단은 제외된 기회를 보지만, 기존75/10 내부에서만 학습한 모델의 바깥 후보는 support shift이므로 pool 완화만으로 production 개선을 주장할 수 없다.

## 실행 증거와 새 FP2 검토

KIS24 실제 bundle79개와 calibrator26개를 independently 재구성한 X/events/date query/weights/입력 hash와 비교했다. Calibrator26개는 재핏한 isotonic threshold도 exact였다. 첫 small λ.35 A/B18/50 네 모델은 별도로100개 tree 모두 독립 재핏했다. 실제 정수 roster는24개 TRAIN와 winner/baseline inner/outer32policy,5,264policy-days,15,792선정에서 own cooldown/calendar/raw5bar까지 불일치0이었다. 모든79개 tree를 독립 재핏했다는 뜻은 아니다. 해당 범위와 checker 자체의 두 수정 witness를 각 `independent-kis-*-audit` 파일에 보존했다.

Naver observed current1,559,349행 및 relaxed추가43,258행 전수 SHA/key/gate/source7/breadth/중복 검산은0diff다. Date-contiguous cache의 원18/source7/turnover 전수도 symbol-major actual TS 결과와 exact였다. 첫 TRAIN150의2020 원시294,759bar를 직접 decode하여 cache와 대조하고166,126strict labels를 재구성했다. A/B18/50 네 실제100-tree spot refit 및 observed assessment1280종목 prediction도 exact였다. 새2023–24 signal outcome은 이 감사에서 조회하지 않았다. Byte/source consistency는 당시 adjusted vintage나 KIS/Naver 시장 종가의 동등성을 입증하지 않는다.

고정된 KIS11,070선정 전체를 original helper import 없이 별도 Decimal OHLC oracle로 검산했다. Exact next5 calendar, entry, strict/raw unknown, opening event 우선, ambiguous 두 bounds,30/60/100bps를247,024assertions 및78개 overlapping split aggregation으로 확인했고 불일치0이었다. Gap stop325, ambiguous150, earlier stop then later target806은 정책중복 포함 count이며 pooled 독립 투자건수가 아니다. 별도의25개 실제 원천bar witness도 복사된 ledger와 일치했다. Intraday touch를 전부 성공 익절로 세면 earlier stop와 same-bar ambiguity를 숨길 수 있다는 실제 근거다. 실제 주문 체결이나 source-vintage 진실을 확인했다는 뜻은 아니다.

Root는 원24/L0를 바꾸지 않고 FP small λ.65 A18/50 두개를 사전 동결했다. `T_safe`는 보수적 first-passage target exit, `L0_FP`는 같은 보수적 exit gross−.003<0, B는D1close>open이다. 실제 `naver_fp.py`/`fp_models.py` 전체를 읽었고 exact helper labels, 원래 floating T/D5 metric 보존, strict labels only fitting, missing observed inputs native NaN, own20/int sorting, first150/350/550 maturity, quarterly460+5+40/epoch key, all5 TRAIN winner primary guard에서 blocking defect를 찾지 못했다. 새 FP outcome은 original raw intraday target의 stricter surrogate다. 결과에는 raw T/D5 L0/L5와 conservative FP T/loss/mean을 계속 구분해야 한다.

FP의 binary loss도 작은 손실과 큰 gap loss를 같은0/1로 취급한다. Stop gap의 실제 손실크기와 cost-sensitive mean/tail을 함께 보며, loss rate를 달성했다고 기대수익이나 최대손실까지 개선됐다고 주장하지 않는다. Full5 MAE는 hypothetical exit 이후 candle도 포함하는 관측치이며 pre-exit MAE로 바꿔 부르지 않는다. Naver가 새로운 시기라는 장점은 있지만 currentmaster/status와 사후 adjusted source, 이미2025–26을 본 가설설계의 한계는 그대로다.

## 최종 독립 실행 감사 종료

All5 TRAIN winner가 고정되고 Root의 primary 실행 승인을 받은 뒤 NAVER 전 모델130개와 isotonic58개를 검산했다. 각 모델의 실제 전체 X/events/date query/weights/hash/native NaN/params/저장 tree, 모든 quarterly505=460+5+40/activation/label maturity가 동결 계획과 일치했다. Isotonic58개는 같은 learner의40일 margin과 date-equal weight로 독립 재핏한 thresholds까지 exact였다. 모델130개를 모두 tree 재핏한 것은 아니며, 별도 NAVER A/B18/50 및 FP18/50 실제100-tree spot refit6개가 exact였다는 범위다. 증거는 `independent-naver-complete-bundle-audit.json`과 두 spot-refit 감사 파일이다.

NAVER primary489일 전체11개 policy ledger(고유5모델+2baseline, baseline 중복 포함)16,137선정을 독립 재생했다. 모델2,445개 whole eligible panel의 actual saved-joblib prediction, integer top3, 자체20일 state, source6/overall, raw T/B/D5 및 별도 first-passage oracle, 모든121개 집계와 직접 original raw NDJSON37,829unique bars에서 불일치0이었다. 이 감사는 `independent-naver-complete-policy-audit.json`에 보존했다. 모델/selector 검산 성공은 손실 목표 달성이나 시장 가격의 실제 정확성, 거래 체결 증명이 아니다. 최종5학습 후보는 목표 손실률을 충족하지 못해 production 승격 근거가 없다.

선택적 KIS FP2도 실제 원시 가격 기반 독립 정수 barrier oracle로8개 fitted inputs/query/weights/hash/maturity/저장 tree를 검산했다. 두 TRAIN와 전체 inner/outer8정책4,644선정의 whole-universe prediction/정수 tie/own20 state/source6/원시5일/FP unknown 처리에서 불일치0이었다. `independent-kis-first-passage-audit.json`에 보존했으며 새 tree fit은0이다. 감사 checker 초기 실행은 매 행마다 NPZ 배열을 다시 압축해제하는 성능 문제로 중단하고 배열을 한 번만 읽도록 checker만 고쳤다. 초기 checker/log는 별도 파일로 보존했고 연구 source/model/roster는 변경하지 않았다. KIS2025–26은 여러 번 본 재사용 진단이며 fresh OOS로 표현할 수 없다.

Paired 통계의 `FPstopBeforeLaterTouch` 원 카운터는 실제로 raw touch가 참이고 보수적 종료가 stop/stop_gap인 사례로, 같은 일봉의 양장벽도 포함한다. 이를 엄격한 날짜 선후관계로 읽으면 잘못이다. 원본을 변경하지 않은 `paired-statistics/results/semantic-addendum.md`는 정확히 `rawTouchWithConservativeStop` proxy로 의미를 정정하고 기존 strictly-earlier806/86과 분리했다. 정정 원문을 확인하여 이 보고 의미 지적은 종료했다. 다른 숫자·선정·모델·원 라벨은 변경되지 않았다.

이 마지막 감사에서 제품/production/UI/문구 파일은 수정하지 않았다. Source 일치와 모델 기계적 정확성에는 blocking defect를 찾지 못했지만, 40% touch 및30% 손실(특히 ANYnegative), 높은 세 점수와 실제 경제적 만족을 함께 달성했다는 근거는 없다. Currentmaster/status·adjusted vintage·원천 간 종가 차이·daily OHLC 주문 순서와 체결·조건부 bootstrap 한계는 남는다.

Root의 마지막 별도 integer-tie 진단은 같은 published integer 안에서만 동일 unrounded expected utility를 두 번째 정렬 키로 썼다. 동결5모델의2,445 saved candidate-panel predictions와 saved isotonic threshold를 독립 np.interp로 재계산해12정책×489일17,604선정의 점수/정렬/own20/raw5bar 및 전체 strict T/L5/L0/B/D5 mean을 확인했고 불일치0이었다. `integer-tie-ablation/independent-audit.json`이 증거다. 원 공식 protocol은 이 키를 쓰지 않았으므로 이 결과를 원 protocol 성과로 대체할 수 없으며, 이미 열람된 PRIMARY의 재사용 진단이고 모델 fit/predict는0이다. 새 day가 원 day metadata를 복사하면서1,203일의 `scorableAfterCooldownCount`를 갱신하지 않은 보고 오류를 발견했다. 원본을 보존한 `metadata-addendum.json`은 실제 own cooldown의 `afterCooldownCount`가 올바른 scorable count이고 native observed unscorable0임을 명시했다. 선정/성과 영향0이며 addendum를 확인해 지적은 종료했다. 새 동점 정책 역시 ANYnegative 목표를 충족하지 못한다.
