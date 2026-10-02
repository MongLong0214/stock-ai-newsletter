# Stock Prepare 연구 기록 · 2026-09-30~10-01

## 결론과 운영 상태

목표는 종합점수 내림차순으로 서로 다른 3종목을 선정하고, 추천일 양봉과 추천일 포함 5거래일 안의 +10% 도달 성능을 높이는 것이다. UI·제품 문구·기존 Analysis Summary는 이번 PR에서 변경하지 않는다.

30개 학습 설정과 기존 점수·가중치·시장 보정을 시험했지만 **+10% 도달 약40%와 모든 음수 수익 비율 약30%를 동시에 달성한 방식은 없었다.** 세 종목 모두 높은 점수와 높은 추천일 양봉 비율도 함께 달성하지 못했다.

[PR219](https://github.com/MongLong0214/stock-ai-newsletter/pull/219)의 최종 운영안은 `L0-A-small, λ0.65, 50입력`에 고정 학습 분포의 smooth 점수와 잠김 하락 후보 제외를 적용한 `v4.2-2026-10-01`이다. 최종 코드의 CI·build·실제 Prepare 시험이 통과했고 main 반영 상태는 PR에서 확인한다. 실행 테스트 통과를 추천 품질 개선으로 해석하지 않는다. 중복 연구 스크립트·중간 모델·로그·선정 원장·manifest·복원 도구는 Git의 현재 파일에서 제거하고 이 기록과 운영 코드·모델·행동 회귀 테스트만 남겼다.

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

## 10/1 점수 의미 보존 후보 재검증

기존 기술 종합점수, 기술75%+효용25%, 기존 효용 비교군, 평평한 봉 또는 전일 대비−10% 이하 제외, 기술70점 이상 효용 정렬, 효용 상위10% 안의 기존 기술 종합점수 정렬을 고정해 다시 평가했다. 자체 CD20과 정수 점수→20일 거래대금→ASCII 순서를 사용했다. 상위10% 정책의 필터→CD20→남은 후보10% 순서는 첫 프로세스를 중단한 뒤 결과·로그를 읽기 전에 명확히 고정했다. 결과를 보고 컷이나 가중치를 조정하지 않았다.

| 방식 | KIS180 T10 / L0 / 평균D5net | NAVER489 T10 / L0 / 평균D5net |
|---|---|---|
| 기존 기술 종합 |35.57% / 56.42% / −0.452%|23.41% / 58.16% / −0.327%|
| 기술75%+효용25% |36.50% / 56.24% / −0.254%|26.09% / 57.99% / −0.493%|
| 기존 효용 |48.60% / 58.10% / −0.741%|43.60% / 58.25% / −0.173%|
| 급락·평평한 봉 제외 효용 |49.07% / 59.48% / −0.743%|42.57% / 58.11% / −0.389%|
| 기술≥70 효용 정렬 |45.98% / 60.37% / −0.605%|38.85% / 62.38% / −1.927%|
| 효용 상위10%→기술 종합 |42.46% / 62.57% / −2.051%|37.82% / 61.35% / −1.048%|

모든 방식은 매일3개이며 미래 미확정은 선정에서 제거하지 않았다. KIS180의 확정 분모는535~538/540, NAVER489는1461~1465/1467이다. 9/30 실측 후보952개에서 상위10% 정책은 저스템81·태성77·메가터치76을 골랐지만 과거 손실과 평균 수익이 악화돼 채택 근거가 아니다. 세 점수≥70인 날도119/180·388/489에 불과했다. 기존 기술 종합의 현재 후보는 레이언스83·프로텍82·저스템81이다. 어느 미리보기도 다음5일 성과를 관측한 결과가 아니다.

KIS 기존150/235일 모델과 NAVER 분기 고정8모델을 사용해 최신421일 모델을 과거에 적용하지 않았다. 사용 모델10개의 실제 재계산과 캐시 비교, 기존 추천·라벨·점수5,430건, 전체 정책 CD20/정수 순서 검산에서 차이0이었다. 750예측 패널을 사용했다. 반복 관측 자료의 진단이며 독립 검증이 아니다. 원본은 `/tmp/stock-score-quality-reopen-20261001/{protocol.json,replay.py,results.json,audit.json,summary.md}`에 있고 이 문서에는 핵심 반례만 남긴다. 급등40%·L0손실30%를 동시에 충족하거나 기존 종합점수의 의미를 지키면서 손실까지 개선한 새 후보는 확인하지 못했다.

## 10/1 최종 점수 척도와 잠김 후보 제외

기술 종합점수에 `계수×(효용−학습 기준값)`을 더하는 계수0/50/100/200/400을 TRAIN240일에서 비교했다. 선택된200의 재사용 NAVER489일 결과는 T10 39.67%, L0 59.92%, D1bull 45.69%, 평균D5net−0.553%로 기존 효용보다 나빠 채택하지 않았다.

재검토 중인 후보 점수는 `round(clip(50 + 20×(clip(utility,0,1)−학습평균)/학습표준편차,0,100))`이다. 각 과거 모델의 성숙한 학습 행에 날짜 동일 가중치를 적용한 기준값만 사용한다. 평균이50점, 평균보다1표준편차 높으면70점이다. 당일 백분위·상위3개 보너스·70점 하한이 아니며 약한 후보의 점수는 낮게 남는다. 공개 정수점수→거래대금→코드 순서와 자체 CD20을 유지한다. 점수 척도 변경만으로 예측력이나 수익이 개선됐다고 주장하지 않는다.

10/15/20점·잠김 제외 유무를 TRAIN에서 비교해20점·잠김 제외를 선택했다. 제외는 신호일 `high==low`이고 전일 종가 대비≤−20%인 유효 캔들에만 적용한다. 일반 하락·보합·폭이 있는 봉까지 제외하지 않는다. 이전 모델과 잠김 제외로 발생한 선정·동점 변화 및 이후 CD20을 함께 재생했다.

| 자료 | 확정/추천 | T10 | L0 | L5 | D1bull | 평균D5net | 세 점수≥70인 날 |
|---|---:|---:|---:|---:|---:|---:|---:|
| TRAIN240일 |715/720|38.32%|55.66%|35.66%|46.43%|−0.260%|85/240|
| 재사용 NAVER489일 진단 |1461/1467|43.46%|59.27%|40.11%|47.57%|−0.163%|489/489|

기존 효용의 NAVER T10 43.60%·L0 58.25%·평균−0.173%와 비교해 급등은 비슷하고 손실 비율은 악화됐다. 손실30%·높은 추천일 양봉 목표를 달성하지 못했다. 이미 본 TRAIN/평가기간의 후속 진단으로 새 OOS가 아니다. 모든 날3종목이며 NAVER선정점수70~100, TRAIN최저51점·100점 추천10.28%였다. 원본은 `/tmp/stock-composite-{overlay,normalization}-20261001.py`와 동명 결과 디렉터리에 있으며 Git에는 중복 원장을 남기지 않는다.

운영 기준값은421패널·506,470성숙 KIS행, 평균0.329215672917516·표준편차0.07781234949998984다. 모델 schema2/`composite-utility-v2`, 점수 `utility-reference-z20-v1`로 의미 변경을 식별한다. 라벨 기준일9/29·마지막 신호9/18과 fit-input hash를 모델에 결속한다. 전체 재학습에서 기존100트리·baseline·학습입력 hash는 동일했고 native/portable3,900예측·점수 차이는0이었다. 모델 SHA256은 `3d325eef020ddc66b76bde8dd25fc39c76c060da9df585f4652d20bcdd10c034`이다. 원본·검산은 `/tmp/stock-composite-normalized-refit-20261001/`이다.

실제 TypeScript와 native sklearn의3,900사례·600개 분기 경계에서도 효용·환산점수 차이0이었다. 9/30신호의 실제 저장 시세·현재CD20으로 뽑힌 후보는 **진영285800 74점·엑스게이트356680 73점·아스플로159010 73점**이며 코스모로보틱스는 제외됐다. read-only실행은2,433active master·820,430봉·fresh KIS2,432종목을 읽고 선정3종목+KOSPI28봉/140필드를 KIS로 대조해 차이0·쓰기시도0이었다. 현재 시장판정NORMAL은 안전성 보증이 아니다. 원본은 `/tmp/stock-composite-normalized-live-20261001.json`이다. 운영 식별자는 `v4.1-2026-10-01`, canonical hash `9be0ca6f1383468bff5d8eaddfef2c5e2a2a29e7c6060bfb72e0c65a25c7f7ec`이다. UI파일과 Summary·rationale·표시 정렬함수는 기준main1b0e2d2와 동일하다.

## 10/1 추가 KIS 재검증: 상단 점수 포화로 인한 채택 반례

최신421일 모델·9/29 기준값을 과거에 적용하지 않고 당시150/235일 고정 모델의 성숙한 학습 기준값으로 같은 후보를 재생했다. 별도 학습·새로운 컷 탐색 없이 실제 공개 정수 순서와 각 정책의 CD20을 적용했다. 이 결과도 반복 관측 자료의 진단이며 새 holdout이 아니다.

| 자료·방식 | 확정/추천 | T10 | L0 | 평균D5net | 100점 추천 |
|---|---:|---:|---:|---:|---:|
|KIS180 기존 효용|537/540|48.60%|58.10%|−0.741%|0/540|
|KIS180 z20·잠김 제외|536/540|46.83%|60.63%|−1.633%|128/540|
|최근60 기존 효용|178/180|47.75%|57.87%|+0.670%|0/180|
|최근60 z20·잠김 제외|178/180|37.64%|61.24%|−2.575%|82/180|

최근60일에서100점 포화가45.56%이고54/60일의 선정 구성이 달라졌다. 높은 표시 점수만으로 이 악화를 정당화할 수 없으므로 **현재 선형 z20 후보의 main 반영을 보류하고 상단 분해능을 다시 검토한다.** 전체 Prepare 성공과 코드 리뷰 통과는 이 추천 품질 반례를 해소하지 않는다. 실제 native/캐시2,385행, 기존 원장415일·1,245선정과 대조해 일치했다. 원본은 `/tmp/stock-normalization-independent-20261001/kis-chronological-candidate.json` 및 동명 선정 원장이다.

## 10/1 상단 포화 수정: 고정 기준의 연속 환산

R3-001에서 효용0.54·0.55·0.56·0.80이 모두100점이 되어 거래대금으로 강한 후보가 밀리는 재현을 확인했다. 최종 후보는 `round(50+50×z/sqrt(z²+5.25))`, `z=(clip(utility,0,1)−성숙 TRAIN 평균)/TRAIN 표준편차`다. 상수5.25는 평균50·+1표준편차70이라는 두 기준에서 `(50/20)²−1`로 유도했고 성과로 탐색하지 않았다. +2σ83·+3σ90·+4σ93이며 당일 순위·하한 보너스는 없다. 런타임과 Trainer는 동치인 `delta/hypot(delta,sqrt(5.25)×표준편차)`를 사용해 아주 작은 표준편차에서도 오버플로를 피한다. 정수점수·거래대금·ASCII·정책 자체 CD20 계약은 유지한다.

| 반복 관측 자료 | 확정/추천 | T10 | L0 | D1bull | 평균D5net | 세 점수≥70인 날 | 100점 추천 |
|---|---:|---:|---:|---:|---:|---:|---:|
|KIS180일|537/540|48.23%|59.96%|41.34%|−0.845%|136/180|0|
|KIS 최근60일|178/180|48.31%|56.74%|43.82%|+0.598%|54/60|0|
|TRAIN240일|715/720|37.48%|57.48%|46.29%|−0.377%|86/240|0|
|NAVER489일|1461/1467|43.53%|58.80%|47.64%|−0.139%|489/489|0|

최신421일 모델을 과거에 소급하지 않고 당시 고정 모델의 각자 학습 기준값과 실제 정수 순서·CD20을 재생했다. KIS 최근60일의 선형 z20 악화는 해소됐지만 원효용 대비 전체 기간 우월성을 입증한 결과는 아니다. NAVER 원효용T10 43.60%·L0 58.25%와도 큰 차이가 없다. **손실30%·무손실·높은 추천일 양봉 목표는 미달이며 새 OOS가 아니다.** 원본은 `/tmp/stock-normalization-independent-20261001/{kis-smooth-diagnostic.json,naver-smooth-diagnostic.log,naver-smooth-diagnostic.json}`이다. 점수 상단 차이를 복원한 수정이며 예측기를 개선했다고 부르지 않는다.

고정된 smooth·원효용 정책을 날짜 이동블록10일·1,000회·seed42로 paired bootstrap 검산했다. NAVER489일의 T10 차이(smooth−원효용)는−0.068%p, 95% 구간[−1.506,+1.710]; KIS180일은−0.372%p, [−2.991,+2.231]이다. 두 자료의 T10·L0·평균D5net 차이 여섯 구간 모두0을 포함해 성과 우월성 근거가 없었다. 이는 동일 성과의 증명도 아니며 반복 탐색·생존/PIT·원천 편향을 교정하지 않는다. 정책별 strict 분모를 유지했고669일·2,007추천, 독립 quantile12개·표집 metric2,000회가 일치했다. 재학습·파라미터 선택은0회이며 원본은 `/tmp/stock-normalization-independent-20261001/smooth-paired-bootstrap.{json,md}`이다.

동일421일·506,470행을 고정 Trainer로 재학습해100트리·baseline·50입력·학습 hash·평균/표준편차가 그대로임을 확인했다. schema3/`composite-utility-v3`, 점수 `utility-reference-smooth-v1`, 전략 `v4.2-2026-10-01`, canonical hash `fa9f1666db9b5b7a5bf4d19b4d122547ab8b5b732b230452661a687165cf86cc`다. 모델 SHA256은 `4f5c9f061d69254d9c5f6dd986742ecb6f52768ee6d8f357d06a450c5d13d30c`. 실제 native/TypeScript3,900입력·600분기에서 효용·점수 차이0, 관측 입력 최고98점이었다. 상단 점수·실제 선정 회귀는 수정 전 실패를 확인했다. 원본은 `/tmp/stock-composite-smooth-stable-refit-20261001/`이다.

9/30 마감 시세820,430봉·실제 재추천 제외 이력의 새 후보는 **엑스게이트356680 73점·진영285800 73점·아스플로159010 72점**이다. 전체active master2,433·fresh KIS2,432·951후보·쓰기시도0이며 미래 성과는 관측하지 않았다. UI 및 Summary·rationale·표시 정렬함수는 기존 기준과 동일하다. 코드 기준은 cfd801e이며 병합 상태는 [PR219](https://github.com/MongLong0214/stock-ai-newsletter/pull/219)에서 확인한다. 수정 전 f6002aa의 [Prepare36800470633](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36800470633)는 v4.1/hash9be0…·74/73/73으로 성공했으며 v4.2 실행 증거로 재사용하지 않는다.

10/1 v4.2 전체367파일·4,217테스트(Prepare E2E40개 포함), app/scripts 타입검사·변경 TypeScript lint·프로덕션 build가 통과했다. 상단 포화 회귀는 원코드에서100/100/100/100으로 실패한 뒤88/89/90/97로 통과했고 실제 선정을 통해97점 후보가 거래대금으로 밀리지 않는 것도 검증한다. 고정 함수9개의 원문 비교 차이0·`git diff --check` 통과. 무관한 로컬 lockfile·DESIGN·SES 문서는 반영하지 않는다. 최종 정확한 SHA의 외부 Prepare와 마지막 리뷰는 별도 확인한다.

cfd801e의 [CI36803250538](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36803250538) 성공. 새 read-only live 검사에서도 위3종목을 선정했고 KIS28봉·140필드 차이0·쓰기0이다. 과거990예측 패널·1,230,005후보에 실제 운영 `normalizeUtilityScore`를 호출해 연구의 `z/sqrt`와 안정적인 `delta/hypot`의 정수점수 차이0을 확인했다. 해당 과거 정책은 모델/학습 기준값/정수순서/CD20을 그대로 사용하며 새 학습·탐색을 하지 않았다. 원본은 `/tmp/stock-pr219-smooth-replay-formula-20261001.json` 및 `/tmp/stock-composite-smooth-live-20261001.json`이다.

[최종 실제 Prepare36803261525](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36803261525)는 10/1 11:17 KST에 성공했다. 실행 SHA cfd801e·signal9/30·target10/1·v4.2·hash `fa9f1666…`가 snapshot과 일치했고 엑스게이트73·진영73·아스플로72를 종합점수·동점 거래대금 순으로 선정했다. active2,433→fresh2,432→complete2,400→gate951→3개, KIS2,434호출 중2,433성공·누락1개(KOSDAQ:468670의 empty 응답)·exact-date99.9589%·가격17,020행 갱신·총22분58.300초다. dry-run의 뉴스레터·픽 스냅샷 저장 및 발송은 생략했고 마스터·일봉 갱신은 실제 실행했다. 저장 전 시장 판정을 다시 평가해 NORMAL이었지만 야간선물 stale로 데이터 상태는 degraded90이며 안전성 보증이 아니다. 실제 아티팩트는 `/tmp/stock-normalization-independent-20261001/smooth-final-real-prepare/`에 있다. 10/2는 기존 거래일 함수에서 거래일이며 Prepare06:10/Send07:27 KST의 main 참조를 확인했다.

## 10/2 변동성 0점 붕괴 수정

실제 발송된 [Prepare36926865586](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36926865586)의 signal10/1·target10/2 후보는 빛샘전자072950(ATR9.9436%, 종합74), 진영285800(ATR10.4998%, 종합72), 아이씨티케이456010(ATR8.4521%, 종합71)이었고 변동성은 모두0이었다. 기존 `round(clamp(100-20*abs(ATR%-3),0,100))`가 ATR3%를 최적으로 취급하고 ATR8% 이상을 전부0으로 지우는 것이 원인이다. 급등 종합 모델과 맞지 않는 세부 산식을 남긴 결함이었다.

변동성은 관측 가격 변동폭의 강도로 정의하고 `round(100/(1+5.221735562010756/ATR%))`로 변경했다. ATR0은0, 결측·비유한·음수는50이다. 기준값은 같은421일·506,470건 strict matured TRAIN의 날짜 동일 가중 중앙값이며 마지막 signal9/18·라벨 성숙9/29·입력 hash `7e390305a071d6dbb57d9b3800eb880b5ca6abcb066347f6f4fe12340bcc9ed2`가 종합 모델 학습과 일치한다. 성과 탐색·당일 후보 순위·점수 하한 보너스를 사용하지 않았다. 새 학습도 하지 않았다.

오늘 전체 피처를 실제 TypeScript에 넣은 결과 변동성은 **빛샘전자66·진영67·아이씨티케이62**이며 다른5개 항목과 종합74·72·71은 동일하다. 506,470건 전수 적용에서 기존0점93,665건→새0점0건, 관측9~89점·81개 점수·ATR 증가에 대한 단조성을 확인했다. 기존 ATR≥8%만92,749건(날짜 가중18.1344%)이었다. 새 점수는 상승 확률이나 손실 위험 점수가 아니며 추천 성능 개선 증거로 해석하지 않는다. 선정용50입력·모델·종합점수 환산·정수점수 정렬은 그대로다. 발행·저장 검증은 `buildSignals(feature, selectedOverallScore)`로 선정 종합점수를 명시적으로 결속한다. 미전달 가중 기술점수 경로는 남았으나 현재 비테스트 호출자는 발행과 저장검증 두 곳이며 둘 다 모델 점수를 전달한다.

수정 전 회귀9개 실패를 확인한 뒤 집중162개·전체367파일/4,229테스트, app/scripts 타입검사·변경파일 lint·프로덕션 build·diff check가 통과했다. 수집→실제 피처→모델선정→뉴스레터 저장 E2E에 ATR8% 초과 후보를 추가했다. UI·제품 문구·Summary·rationale와 선정 모델 파일은 동일하다. 운영 식별자는 `technical-signals-v3-2026-10-02`, `v4.3-2026-10-02`, hash `acbf4d9e2d036d7e00a1e9811bc75783e395d39a1f49f5856ef21dad68ace8e7`이다. 검산 원본은 `/tmp/stock-volatility-reference-20261002.py`, `/tmp/stock-volatility-history-20261002.py`, `/tmp/check-stock-volatility-20261002.ts`, 결과는 `/tmp/stock-volatility-actual-history-20261002.json`이다. 원시 데이터와 로그는 Git에 넣지 않는다. 오늘 이미 발송된 저장본·메일은 수정하지 않는다.

[PR220](https://github.com/MongLong0214/stock-ai-newsletter/pull/220)의 코드 SHA `3e84ac0c2278f0afba71f4e0ac8ee516aebc4577`로 실행한 [실제 Prepare36946710450](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36946710450)가 성공했다. signal10/1·target10/2·v4.3/hashacbf4d9e가 snapshot과 일치했고 출력 로그에서 변동성66·67·62, summary에서 종합74·72·71을 확인했다. active2,432→fresh2,432→complete2,396→gate900→3개, KIS2,433호출 모두 성공·exact-date100%·가격17,016행 갱신·총24분20.300초다. 뉴스레터·픽 스냅샷 저장 및 발송은 생략했고 마스터·가격 갱신은 실제 수행했다. 실행 전후 오늘 발송본의 내용 hash `6a3afe34faca79c356c9573b1ed15f122bac031834cad533a677df2e8bb7e16c`·sent_at·is_sent가 동일했다. 저장 전 시장 재평가NORMAL·데이터degraded90(야간선물stale)이었고 보조 Serp 이벤트 조회에 초기geopolitics·최종financialInstitutionFailure 타임아웃이 남았다. 실행 성공을 추천 품질이나 시장 안전성 증거로 쓰지 않는다. 아티팩트는 `/tmp/stock-volatility-pr220-real-prepare-20261002/`에 있다. 같은 코드 SHA의 GitHub CI36946703927도4,229테스트·전체lint·app/scripts 타입검사를 통과했다. cron의main참조와 다음 거래일10/6을 확인했다.

## 남긴 구현과 검증 근거

- 코드: `scripts/stock-picks/observed-inputs.ts`, `utility-model.ts`, `production-strategy.ts`, `generate-picks.ts`, `strategies.ts`와 Prepare 저장 전 점수 결속. 원18+가격·거래량 지속/수축·압축·낙폭/회복·다기간 구조32입력이다. 6항목 기술점수는 유지한다.
- 모델: `scripts/stock-picks/models/composite-utility-v1.json`. HGB100트리, 최대7leaf/깊이3, minleaf100, LR0.05, L2=1, bins255, seed42, earlystop=false. 날짜 동일 가중치,421패널·506,470 strict행·119,819결측. 마지막 신호9/18, 라벨 성숙9/29. numpy2.5.3/sklearn1.9.1; 런타임 Python 불필요.
- 최초 Trainer: `scripts/stock-picks/train-composite-utility.py`, SHA256 `4b3c88aed774ac8fb6c0151b9b84111bba6a20bab165479dbb41541182e10556`. 학습 입력·날짜·패키지 식별자는 모델 metadata에 남는다. 최초 모델 공백 정리 전 SHA256은 `381a8c6a3f95b8dd333460ab19e0487147da8a2e3714da5f64264442af176fae`, 정리 후는 `c21d1ff3aae3a8af89a6af311795c6126e9b13faa852abe2c49aaa06fb828ccb`다. 이 공백 정리에서는 모든 JSON 토큰이 같았다. 현재v3·witness는 위 최종 smooth 환산 모델을 가리킨다.
- Parity fixture·행동 회귀 테스트는 결측 분기·경계·반올림·원천·선정·Prepare 실패 경로를 검증한다. 최초후보 fcbc108에서4,198테스트·타입검사·lint0오류(기존15경고)·build487페이지·Prepare E2E37개가 통과했다. 독립100트리 refit, TS/native1,952사례와 raw50입력100사례가 일치했다. [CI36794302986](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36794302986). 과거 결과를 변경 후 전체검사로 재사용하지 않는다.
- 10/1 아카이브 정리 후367파일·4,211테스트(Prepare E2E 포함), app/scripts 타입검사, `git diff --check` 통과. 모델·parity JSON 전체 토큰과 canonical 전략 hash가 같고 UI 파일·Summary·표시 정렬·표시 rationale 함수는 기준main1b0e2d2와 같았다. 이 검사는 실행 로직 보존을 확인하며 점수 설계·추천 품질 재검토는 진행 중이다.
- 리뷰 R2-001: 후보320봉만 KIS로 검사해 KOSPI20일 수익과 전체 breadth에 혼합원천이 들어올 수 있었다. foreign benchmark19→14/35, foreign breadth19→51점 재현을 확인했다. fe73eee에서 실제 기여 KOSPI21일·active-master20일 원천을 한 번 검사하고 기존 결측을 유지하도록 수정했다. 동일5개 witness가 수정 전 실패·수정 후 통과했고 집중91테스트가 통과했다. hash 기대값은 f4cb2b5에서 정정했다.
- 원천 수정 당시 canonical 전략 hash: `d56b1782cadfe3c98f0ffa6258b8b09b599e9ecc16d567cc2a052affedb9976f`(`kis-market-21-20-v1` 포함). 최초후보 `7c1eb45a…` 및 위v4.1과 구분한다. PR219 자동 리뷰는1회 중단·2회차R2-001·3회차R3-001 재현이 있었다. 자동 리뷰3회 한도를 소진했고 추가 회차로 초기화하지 않는다. 이후 수정은 보존한 반례와 실제 수정 코드의 회귀·실행 증거로 확인한다.
- [전체 Prepare 시험36794297344](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36794297344)는 fcbc108·수정 전 hash에서 성공했다. 2,434호출/2,433성공, exact-date99.9589%,17,020가격행 갱신,952후보,23분20.839초였다. 같은45·42·42를 골랐고 뉴스레터/픽스냅샷 저장·발송은 생략했다. 가격·마스터 쓰기는 실제 수행했다. 새 hash의 완료나 추천 품질 개선 증거가 아니다.
- 원천 검사 수정 후 [전체 Prepare 시험36796445208](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36796445208)도 fe73eee에서 성공했다(10/1 09:53 KST 완료). signal9/30→target10/1, `PICKS_SOURCE=code`, canonical hash `d56b1782…`가 실행 로그와 snapshot에서 일치했다. 2,434호출/2,433성공, exact-date99.9589%,17,020가격행 갱신,952후보,23분17.117초였다. 세 종목·45/42/42점은 같았고 뉴스레터/픽스냅샷 저장·발송을 생략했다. 저장 전 시장 재평가 NORMAL은 규칙 미충족이며 데이터 상태는 degraded였다. 원천 수정의 실제 실행 증거이며 추천 품질 문제의 해소 증거는 아니다. JSON 공백 정리 후06d567b의 [CI36798253498](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36798253498)도 성공했다.
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

실험 원본은 `/tmp/composite-score-research-20260930/`, `/tmp/composite-score-experimental-20260930/`에 있었으며 이번 Git 정리로 삭제하지 않았다. 운영 검산은 `/tmp/stock-composite-production-20260930/`, 최초 학습 검산은 `freshest-kis-fit/`에 있었다. exporter가 자기 경로/해시를 metadata에 기록하므로 다른 경로의 의미상 같은 모델과 바이트 동일 재현을 구별한다. 현재 exporter는 숫자 배열을 compact JSON으로 출력한다.

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


## 10/2 최종 운영 리뷰: 저장·발송 일관성

발송 시작 후에도 `is_sent=false`인 동안 Prepare가 같은 날짜의 내용을 덮어쓰는 반례를 실제 Prepare E2E에서 재현했다. Send가 내용 조회 후 잠금을 잡기 전에 Prepare가 갱신하면 이전 내용을 발송하는 반례도 확인했다. 최초 발송 시작 시각이 있는 행은 잠금 만료 후에도 보존하고, Prepare의 갱신 CAS에 `sending_started_at IS NULL`을 추가했다. Send는 잠금 획득 후 내용을 다시 조회하고 자기 소유인 경우에만 발송한다. 수집 중 발송 시작·신규 insert 충돌·만료된 잠금·조회 누락·소유권 변경을 포함한 동일 회귀7개가 수정 전 실패·수정 후 통과했다.

저장/발송 집중3파일·99테스트와 전체367파일·4,236테스트, app/scripts 타입검사, 변경파일 lint, 프로덕션 build, diff check가 통과했다. 운영 DB에 최초 발송 시각 열이 존재하고 실제 발송된10/2행이 새 null 조건에 제외되는 것을 읽기만으로 확인했다. UI·문구·Summary·모델·점수·선정 순서 변경은 없다. 이는 운영 일관성 수정이며 위 T10/L0/D1bull 성능 미달과 새 OOS 부재를 해소하지 않는다.
