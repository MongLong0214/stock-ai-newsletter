# 운영 통합 기록

상태 기준: **2026-10-01 오전, 연구 종료 뒤 운영 반영 작업 진행 중**. 이 파일의 pending 항목이 갱신되기 전에는 새 모델이 main/실제 prepare에 반영됐다고 해석하지 않는다. [연구 인덱스](../stock-prepare-2026-09-30.md), [상세 결과](results.md)와 함께 읽는다.

## 선택과 한계

사용자가 추가 연구 결과를 확인한 뒤 운영 반영을 명시적으로 지시했다. 선택은 `L0-A-small-lambda0.65-inputs50`이다. NAVER 489일에서 T43.60%, L0 58.25%, D1 양봉48.87%, 평균 D5 net −0.173%였다. 목표인 대략 T40%와 L0 30% 동시 달성은 실패했다. 사용자 요청인 무손실·항상 높은 세 점수도 달성하지 못했다. 전체 후보 중 손실과 급등을 함께 고려한 선택이며 최적성·미래 수익을 보장하지 않는다.

고정 효용은 `(0.8*T + 0.2*B + 0.65*(1-L0)) / 1.65`다. `T`는 raw +10% touch, `B`는 추천일 양봉, `L0`는 비용30bps를 차감한 D5 수익<0이다. A는 HistGradientBoostingRegressor로 효용을 직접 회귀한다. 작은 모델은100회, 최대7leaf/깊이3, min_samples_leaf100, learning_rate.05, l2=1, max_bins255, random_state42, early_stopping=false다. 원18+확장32 입력이며 결측은 native NaN으로 둔다. 학습은 날짜별 합이 같은 가중치를 사용한다.

선정 순서는 **발행할 정수 overall 내림차순 → 거래대금 내림차순 → ASCII symbol**이며 CD20을 유지한다. 같은 정수 안에서 숨은 실수 효용으로 다시 정렬하지 않는다. 기존 6개 항목 점수는 교정된 원래 계산을 유지한다. 점수를70으로 끌어올리는 가산·하한은 없다. UI나 새로운 선정 목표 문구를 추가하지 않는다.

## KIS 최신 성숙 자료 재학습

연구용 NAVER 모델을 그대로 제품 입력에 사용하지 않고 고정한 같은 family/config를 최신 성숙 KIS 자료로 다시 학습한다. 전달받은 fit 요약은2024-12-26부터 421패널,506,470 strict 학습행, 입력 NaN119,819개다. 마지막 학습 신호일은2026-09-18이고 그 라벨은2026-09-29까지 성숙했다. 9/21·9/22 신호는 당시 아직 D5가 닫히지 않아 학습에 넣지 않는다. 9/29를 마지막 signal로 학습했다고 오해하지 않는다.

고정 모델 JSON SHA는 `381a8c6a3f95b8dd333460ab19e0487147da8a2e3714da5f64264442af176fae`, trainer SHA는 `4b3c88aed774ac8fb6c0151b9b84111bba6a20bab165479dbb41541182e10556`다. 이 식별자는 이번 fit 시점 기준이며 후속 변경 시 새 식별자를 기록한다.

제품의 작은 고정 parity fixture는 `scripts/stock-picks/fixtures/composite-utility-v1-parity.json` (18사례, SHA `997bdc19928f40dcd9a53de6fb403b6be8e72039e09fd6fcc2defcaf941da076`)이다.

최종 fit provenance와 native TS 비교는 [생산 검증 보관 자료](production/)에 추가한다. 전체 corpus 예측 parity는 모델 산술의 검증이고 실제 수익 성과의 검증이 아니다. 실제 prepare에서 전체 eligible pool·상태·현재 시장·cooldown까지 같은 결과를 보였다는 증거도 별도로 확인해야 한다. 원래 후보군에 대한 연구 replay를 실제 발행 전체시장 실행이라고 부르지 않는다.

## 구현·검증·반영 상태

| 항목 | 기록 |
|---|---|
| 직전 main | `1b0e2d2ca0cfced224fc143032f5bc630c939764` (PR218 Summary) |
| 새 입력·모델·선정 통합 | `scripts/stock-picks/observed-inputs.ts`, `utility-model.ts`, `train-composite-utility.py` 및 prepare 통합 완료; `compositeUtility`, `v4-2026-09-30` |
| 모델 바인딩 회귀 | 점수/6항목 바인딩을 제거한 실제 깨진 코드에서 3개 회귀가 실패함을 확인하고 복원; Prepare 단위37개 통과 |
| 독립 모델·TS parity | 독립 100트리 전체 재학습 일치; 최종 실제 TS/native 1,952사례 차이0, 실제 원시100사례의 50입력 5,000값/점수 차이0. [최종 TS 증거](production/independent-final-native-ts-parity.json), [원시 입력 증거](production/independent-raw-feature-parity.json) |
| 전체 테스트·타입·빌드·Prepare E2E | [367파일/4,198테스트 통과](production/full-tests-final.log.gz); app/scripts 타입검사 통과, lint 0오류/기존15경고, build 487페이지, [실제 코드 경로 E2E37개 통과](production/prepare-e2e-final.log.gz) |
| 읽기 전용 live KIS와 prepare rehearsal | 9/29 신호 44/44/43점 검사에 이어 [최신 9/30 신호 검사](production/live-read-only-signal-20260930-summary.json) 통과: 2,432/2,433 신선 KIS(99.9589%), 952 gate 후보, 3개 45/42/42점; 28행/140 OHLCV 필드 차이0, 쓰기0. 외부 실제 workflow rehearsal pending |
| PR / merge commit / remote main | [Draft PR219](https://github.com/MongLong0214/stock-ai-newsletter/pull/219). 제품 코드 head `fcbc108b02bee43fbc4f5a6bae36a7ff31a17ea2`; 해당 head CI [36794302986](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36794302986) 성공. 아직 main 반영하지 않음 |
| 새 모델을 사용한 실제 다음 prepare | **pending**; merge 후 workflow SHA ancestry와 실제 아티팩트로 확인 |

PR 브랜치 배포 실패는 사용자 지시에 따라 기존 환경 문제로 분리할 수 있으나 실제 코드 테스트·모델 parity·prepare 경로 오류를 무시하는 허가는 아니다. 이전 PR218의 4,172개 테스트·빌드487pages·E2E25 성공을 새 모델의 테스트 결과로 재사용하지 않는다.

이 문서는 제품 UI 문구가 아니다. 연구의 한계·배포 증거를 다음 연구자가 이어 확인할 수 있도록 기록한다.

## 다음 정기 실행과 이미 끝난 오늘 실행

10/1 06:10 KST 실제 Prepare [run36777694549](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36777694549)는 변경 전 `1b0e2d2ca0cfced224fc143032f5bc630c939764`로 성공했다. 오늘 실행이 새 모델을 사용했다고 주장하지 않는다. 운영 반영이 10/1 오전에 완료되면 첫 다음 정기 실행은 **10/2 06:10 KST Prepare, 07:27 KST 발송**이다. Vercel cron의 기존 main dispatch와 백업/재시도 일정을 유지한다. 다음 실행 전날의 확정 종가를 사용하므로 아직 장중인 10/1 자료로 지금 10/2 추천 결과를 발행하거나 확정하지 않는다.

[UI/copy freeze](production/ui-copy-freeze.json): 338개 파일과 Summary/표시 정렬/표시 rationale의 3개 함수 원문 변경0. 종합점수 수치만 모델에 따라 변경된다. 이 절의 추가 검증 기록은 원본 연구 426개 아티팩트의 manifest를 변경하지 않고 별도로 보관한다.

## 최신 실제 후보의 한계

9/30 확정 시세로 실행한 새 모델의 read-only 결과는 코스모로보틱스(439960)45점, 엑스게이트(356680)42점, 아스플로(159010)42점이다. 코스모로보틱스는 전일 종가 대비 약−29.98%인 평평한 하한가 봉이며 양수 거래량·기존 상태/캔들 게이트를 통과했다. range가0인 CLV 결측은 native missing routing으로 처리된다. 실제 KIS와 저장 OHLCV 검산은 차이0이므로 임의 점수 가산이나 데이터 오류 교정으로 숨기지 않는다. 이 선택은 현재 점수 계약에 맞지만 손실회피·세 종목 모두 고득점의 증거가 아니며 위험한 후보를 포함한다. 검증하지 않은 하한가 제외 규칙을 이번 적용에 끼워 넣지 않았다. 이 결과는10/1 실제 발행 추천도, 아직 확정하지 않은10/2 추천도 아니다.

## 운영 리뷰에서 발견한 R2-001

[원문 리뷰](production/formal-review-attempt2.md)의 SHA256은 `b9ea3b5601b8dbacc9f16836e4a3c210fe7053903ee68a95989fbd97798f7cc6`이다. 최초 구현 `fcbc108`에서는 후보 종목320행의 KIS source만 확인하고, KOSPI return20과 전체 active-master breadth의 실제 원천은 확인하지 않았다. [재현 결과](production/formal-attempt2-market-source-witness.json)에서 후보320행은 모두 KIS인데 KOSPI source만 바꿔 점수19→14/35, 시장에만 기여하는40개 종목을 다른 원천으로 채워19→51까지 바뀌었다. 모델 산술 parity는 이 원천 경계를 검증하지 못했다. 동일 원인의 두 경로로 묶어 수정하며, 모델에 실제 기여하는21일 KOSPI/20일 breadth만 검증한다. 결측/null 동작, 과거의 무관한 시장 봉, 기존 Summary/legacy 계산은 유지한다. 수정 후 새 전략 hash와 회귀/실제 Prepare/최종 리뷰 증거를 아래 기록에 이어 확인해야 한다.

## 10/1 새 점수에 대한 사용자 질의와 승격 재검토

사용자가 “새 로직의 상위 점수는45·42·42점인게말이돼? 너무낮잖아”라고 지적했다. 현재 고정 후보는 기존 기술 종합점수를 모델 기대 효용×100으로 바꿨다. 기존 6항목의 동일 가중치를 계산하면 같은 선택은23·64·65점인데, 새 효용 척도는45·42·42점이다. 서로 다른 의미의 수치를 동일한 제품 점수 척도처럼 사용한 설계는 **세 종목 모두 높은 종합점수** 요구를 충족하지 못한다. 원래 산식도 목표 성과를 충분히 예측하지 못했으므로 단순 복원으로 개선을 주장하지 않는다.

산식 자체의 예시로 T40%, D1양봉60%, 비손실70%를 동시에 달성하더라도 기대 효용×100은54.2424점이다. 70점 기준을 이 다른 단위에 그대로 적용할 수 없다. 이는 실제 모델에 개별 사건의 보정된 확률이 있다는 뜻이 아니다. 점수의 단위 문제와 실제 선정 품질을 분리해서 검토한다.

최신9/30 신호의 실제 최고 후보 코스모로보틱스는 하한가 부근의 flat 캔들, 직전5일−34.89%이다. 실제 KIS 대조 차이0으로 계산 오류가 아니며, 알려진 gate를 통과한 native결측/반등 후보로 모델이 평가한 결과다. 이 후보를 안전하다고 설명할 근거가 없다. 단조 점수 재조정은 이 순위를 그대로 유지하므로 해결책이 아니다. 상위3개 보너스·70점 하한·일별 백분위로 숫자만 높이지 않는다. [점수 의미 검산](production/score-semantic-diagnostic-20261001.json), [최신 실제 읽기 전용 검산](production/live-read-only-signal-20260930-summary.json).

PR219를 Draft로 전환했다. 연구 결과·코드·검증은 보관하지만, 이 후보의 점수와 선택을 새로운 사용자 제약까지 만족한 최종 운영안으로 승격하지 않는다. 실제 외부 workflow [36794297344](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36794297344)의 완료 여부는 별도로 기록한다. 실제 실행 성공이나4,198개 테스트 통과가 예측 품질·점수 의미를 해결한 증거는 아니다. 다음 정기 실행 일정은 기존과 같고 **현재 main에는 이 모델이 없다**.
