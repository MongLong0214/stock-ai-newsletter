# Stock Prepare 심화 실험 결과 · 2026-09-30

추가 연구의 결론: 점수 계산·학습 목적·입력 지표를 바꾸고 서로 다른 시기/원천에서 직접 재생했지만, 급등 도달률 약40%와 손실 비율 약30%를 함께 유지하는 후보는 확인하지 못했다. 높은 점수3개, 추천일 높은 양봉 비율도 함께 충족하지 못했다. 이 문단은 **운영 반영 지시 전 실험 단계**의 기록이다. 해당 단계의 제품·UI·워딩·DB·발송·archive 변경은 0이었다. 이후 사용자가 운영 반영을 명시적으로 지시하여 L0-A 후보 통합을 진행 중이다. 최종 반영 상태는 [운영 통합 기록](deployment.md)을 확인한다.

## 판정 기준

- 추천일은 신호일 다음 실제 거래일. 추천일 시가에 진입한다고 가정하며 추천일 포함 정확히5거래일의 장중 고가가 시가의110% 이상이면 raw 급등 도달(T)이다.
- L0는 D5 종가/추천일 시가−1−0.003이 음수인 모든 수익 손실. L5는 같은 값이−5% 이하인 큰 손실이다. 둘을 같은 손실 비율로 부르지 않는다. 표의 D5 수익은 가상 왕복비용30bps를 한번 차감한 개별 추천 수익이며 포트폴리오 수익률이 아니다.
- FP는 +10% 목표가와−5% 손절선 중 먼저 닿는 것을 따로 본다. 같은 일봉에서 둘 다 닿으면 보수/낙관 범위를 제시한다. 손절 시가 갭은 실제 시가를 사용하고, 목표가 초과 시가 갭의 이익은+10%로 제한한다. 이 결과는 실제 주문 체결이나 구현된 매매 시스템의 성과가 아니다.
- 미래5개 봉 중 누락·무효 OHLC·거래량0이 있으면 미확정으로 유지한다. 모델 학습/엄격 집계 분모에서만 제외하고 선정 목록에서는 삭제하지 않는다. 거래정지·누락일을 건너뛰어5일을 압축하지 않았다.

## 실제 최근 이틀 Prepare 추천

실제 prepare 선정 아티팩트의 9/30 KRX 장 마감 후 중간 관측이다. 발송 성공 자체는 이 아티팩트만으로 증명하지 않으며, 연구용 종목 리스트와 구분한다. 두 추천일 모두 5거래일 결과는 아직 미성숙이다.

| 추천일 | 종목 | D1 양봉 | 추천일 시가→종가 | 시가→9/30 종가 | 관측 고점 | 관측 저점 |
|---|---|---:|---:|---:|---:|---:|
| 2026-09-29 | 유나이티드제약 033270 | 아니오 | -0.338% | -0.282% | +0.000% | -1.803% |
| 2026-09-29 | 제일기획 030000 | 예 | +0.337% | +5.219% | +6.229% | -0.449% |
| 2026-09-29 | LX홀딩스 383800 | 아니오 | -1.215% | -2.066% | +0.000% | -2.309% |
| 2026-09-30 | 오름테라퓨틱 475830 | 아니오 | -0.897% | -0.897% | +3.812% | -2.915% |
| 2026-09-30 | HLB이노베이션 024850 | 아니오 | -0.062% | -0.062% | +6.773% | -6.219% |
| 2026-09-30 | 광진실업 026910 | 아니오 | -2.361% | -2.361% | +2.575% | -9.442% |

위 수익은 비용 전 가격 변화다. 가상 왕복비용30bps를 적용하면 각각0.30%p를 차감한다. 실제 주문·체결·손익이 아니다. 아티팩트의 score는 전략 순위값이며 화면의 종합점수로 해석하지 않았다.

9/29: lowVolatilityStable v2-2026-09-23, SHA277d64161f44e1e1b7ece2f7aaa10a7a14f2955b.
9/30: bullishTarget5d v3-2026-09-29, SHA87613f95379ca5f22393677dd7e1429f7085daa0. 현재 main의 전략과 오늘 오전 실행 전략을 혼동하지 않는다.


[9/29 실제 Prepare 실행](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36484308881) · [9/30 실제 Prepare 실행](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36631489672). Prepare 아티팩트는 실제 선정 증거이고 이메일 수신 성공 자체의 증거는 아니다.

## 새 구간 재생: 2023~2024년 489거래일

2020~2022년의3개 시간순 학습/평가 fold에서24개 L5 설정,4개 L0 설정,2개 FP 설정을 평가하고 총5개 승자를 고정한 뒤 새 구간을 열었다. 기존18지표와 원시 가격·거래량에서 만든 추가32지표를 비교했다. A는 직접 효용 회귀, B는 날짜별 순위학습과 시간순 보정이다. 학습한5개 후보는 표시될 정수 종합점수 내림차순, 거래대금 내림차순, 종목코드 순으로 정확히3개를 선정했다. 기존 종합점수 비교군도 같은 정수 정렬을 사용했고, 저변동 ATR 비교군만 ATR 오름차순·종목코드 순이다. 숨은 실수 점수 순위나 점수 하한 가산은 사용하지 않았다.

분기마다 고정한505개 성숙 패널(460학습·5간격·40보정, A는40을 사용하지 않음)만 사용해 재학습했다. 분기 사이 모델은 고정했다. 이전 평가 구간의 성숙 라벨을 다음 분기에 사용하는 사전 지정 순차 학습이므로 완전히 봉인된 일회성 holdout은 아니다. 가설 자체도 이미 본2025~2026 실패 결과를 참고했고, 현재 생존종목/현재 상태/현재 조정주가로 재생했으므로 편향 없는 당시 시장 전체 검증이라고 주장하지 않는다.

| 선정 방식 | 확정/선정 | +10% 도달 | L5 ≤−5% | L0 모든 음수 | D1 양봉 | 평균 D5 net | 세 점수 모두≥70인 날 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 기존 종합점수 상위3 | 1465/1467 | 23.41% | 27.65% | 58.16% | 41.16% | -0.327% | 100.00% |
| 저변동 ATR 상위3 | 1463/1467 | 2.87% | 4.58% | 52.97% | 46.21% | -0.050% | 0.00% |
| L5 직접효용 A · 원18 | 1457/1467 | 47.77% | 42.96% | 60.05% | 46.67% | -0.334% | 1.02% |
| L5 순위학습 B · 확장50 | 1458/1467 | 41.02% | 41.70% | 61.18% | 45.47% | -1.138% | 1.64% |
| L0 직접효용 A · 확장50 | 1461/1467 | 43.60% | 39.63% | 58.25% | 48.87% | -0.173% | 0.20% |
| L0 순위학습 B · 원18 | 1463/1467 | 41.63% | 43.06% | 59.67% | 45.66% | -1.159% | 0.00% |
| 목표·손절 선후 학습 · 확장50 | 1462/1467 | 28.18% | 31.87% | 58.00% | 42.48% | -0.219% | 0.20% |

모든 방식은489일 모두3개를 선정했다. 기존 종합점수 상위3은489일 전부70점 이상이었지만, 급등과 손실 성과는 좋지 않았다. 큰 점수 숫자만으로 예측력이 생기지 않는다.

### 연도·분기별 결과

| 구간 | 방식 | +10% | L5 | L0 | D1 양봉 | 평균 D5 net |
| --- | --- | --- | --- | --- | --- | --- |
| 2023 | 기존 종합점수 상위3 | 22.86% | 25.17% | 55.78% | 39.86% | +0.118% |
| 2023 | 저변동 ATR 상위3 | 3.28% | 3.42% | 51.44% | 47.06% | +0.032% |
| 2023 | L5 직접효용 A · 원18 | 46.30% | 40.96% | 62.05% | 45.07% | +0.056% |
| 2023 | L5 순위학습 B · 확장50 | 41.43% | 38.82% | 59.81% | 45.68% | -0.515% |
| 2023 | L0 직접효용 A · 확장50 | 40.74% | 38.55% | 59.53% | 47.05% | -0.059% |
| 2023 | L0 순위학습 B · 원18 | 40.03% | 41.80% | 59.56% | 44.95% | -0.749% |
| 2023 | 목표·손절 선후 학습 · 확장50 | 29.73% | 30.55% | 56.44% | 42.74% | +0.134% |
| 2024 | 기존 종합점수 상위3 | 23.97% | 30.14% | 60.55% | 42.47% | -0.775% |
| 2024 | 저변동 ATR 상위3 | 2.46% | 5.74% | 54.51% | 45.36% | -0.131% |
| 2024 | L5 직접효용 A · 원18 | 49.24% | 44.98% | 58.05% | 48.28% | -0.724% |
| 2024 | L5 순위학습 B · 확장50 | 40.60% | 44.58% | 62.55% | 45.27% | -1.762% |
| 2024 | L0 직접효용 A · 확장50 | 46.45% | 40.71% | 56.97% | 50.68% | -0.285% |
| 2024 | L0 순위학습 B · 원18 | 43.23% | 44.32% | 59.78% | 46.37% | -1.570% |
| 2024 | 목표·손절 선후 학습 · 확장50 | 26.64% | 33.20% | 59.56% | 42.21% | -0.572% |
| 2023Q1 | 기존 종합점수 상위3 | 22.58% | 19.35% | 51.08% | 39.78% | +1.267% |
| 2023Q1 | 저변동 ATR 상위3 | 2.70% | 3.24% | 58.38% | 45.41% | -0.177% |
| 2023Q1 | L5 직접효용 A · 원18 | 49.73% | 35.68% | 53.51% | 47.03% | +2.346% |
| 2023Q1 | L5 순위학습 B · 확장50 | 50.27% | 29.73% | 46.49% | 49.73% | +3.410% |
| 2023Q1 | L0 직접효용 A · 확장50 | 44.57% | 30.43% | 50.54% | 52.72% | +2.880% |
| 2023Q1 | L0 순위학습 B · 원18 | 41.94% | 38.17% | 57.53% | 48.39% | +1.539% |
| 2023Q1 | 목표·손절 선후 학습 · 확장50 | 36.22% | 27.57% | 50.81% | 45.95% | +1.640% |
| 2023Q2 | 기존 종합점수 상위3 | 21.31% | 28.42% | 57.38% | 34.43% | -0.026% |
| 2023Q2 | 저변동 ATR 상위3 | 3.31% | 4.42% | 60.22% | 46.41% | -0.323% |
| 2023Q2 | L5 직접효용 A · 원18 | 43.89% | 43.89% | 63.33% | 38.89% | +0.021% |
| 2023Q2 | L5 순위학습 B · 확장50 | 31.69% | 46.99% | 71.58% | 42.62% | -3.623% |
| 2023Q2 | L0 직접효용 A · 확장50 | 37.02% | 39.78% | 66.30% | 41.44% | -0.724% |
| 2023Q2 | L0 순위학습 B · 원18 | 38.80% | 40.44% | 58.47% | 41.53% | -0.639% |
| 2023Q2 | 목표·손절 선후 학습 · 확장50 | 25.41% | 32.04% | 66.30% | 37.02% | -1.385% |
| 2023Q3 | 기존 종합점수 상위3 | 25.27% | 30.11% | 61.83% | 41.40% | -0.799% |
| 2023Q3 | 저변동 ATR 상위3 | 3.24% | 3.78% | 45.41% | 49.19% | +0.033% |
| 2023Q3 | L5 직접효용 A · 원18 | 46.49% | 47.03% | 65.41% | 47.57% | +0.100% |
| 2023Q3 | L5 순위학습 B · 확장50 | 45.05% | 44.51% | 62.64% | 48.35% | -0.570% |
| 2023Q3 | L0 직접효용 A · 확장50 | 43.48% | 43.48% | 58.15% | 48.37% | -0.715% |
| 2023Q3 | L0 순위학습 B · 원18 | 42.62% | 46.45% | 61.20% | 49.73% | -1.970% |
| 2023Q3 | 목표·손절 선후 학습 · 확장50 | 26.49% | 37.30% | 58.92% | 41.08% | -1.141% |
| 2023Q4 | 기존 종합점수 상위3 | 22.22% | 22.78% | 52.78% | 43.89% | +0.024% |
| 2023Q4 | 저변동 ATR 상위3 | 3.89% | 2.22% | 41.67% | 47.22% | +0.604% |
| 2023Q4 | L5 직접효용 A · 원18 | 45.00% | 37.22% | 66.11% | 46.67% | -2.309% |
| 2023Q4 | L5 순위학습 B · 확장50 | 38.55% | 34.08% | 58.66% | 41.90% | -1.338% |
| 2023Q4 | L0 직접효용 A · 확장50 | 37.78% | 40.56% | 63.33% | 45.56% | -1.726% |
| 2023Q4 | L0 순위학습 B · 원18 | 36.67% | 42.22% | 61.11% | 40.00% | -1.984% |
| 2023Q4 | 목표·손절 선후 학습 · 확장50 | 30.73% | 25.14% | 49.72% | 46.93% | +1.433% |
| 2024Q1 | 기존 종합점수 상위3 | 24.04% | 26.23% | 54.64% | 43.17% | +0.851% |
| 2024Q1 | 저변동 ATR 상위3 | 4.92% | 1.09% | 57.38% | 47.54% | +0.419% |
| 2024Q1 | L5 직접효용 A · 원18 | 47.80% | 50.00% | 63.74% | 49.45% | -1.378% |
| 2024Q1 | L5 순위학습 B · 확장50 | 43.17% | 49.73% | 66.67% | 45.36% | -3.471% |
| 2024Q1 | L0 직접효용 A · 확장50 | 44.81% | 44.81% | 61.75% | 49.73% | -0.613% |
| 2024Q1 | L0 순위학습 B · 원18 | 43.17% | 48.09% | 61.75% | 45.90% | -2.234% |
| 2024Q1 | 목표·손절 선후 학습 · 확장50 | 26.23% | 26.78% | 55.19% | 42.62% | +0.527% |
| 2024Q2 | 기존 종합점수 상위3 | 20.56% | 28.89% | 63.89% | 38.89% | -0.626% |
| 2024Q2 | 저변동 ATR 상위3 | 0.56% | 3.33% | 53.33% | 41.67% | -0.286% |
| 2024Q2 | L5 직접효용 A · 원18 | 52.81% | 39.89% | 51.69% | 50.56% | +0.764% |
| 2024Q2 | L5 순위학습 B · 확장50 | 34.08% | 39.66% | 60.34% | 47.49% | -0.357% |
| 2024Q2 | L0 직접효용 A · 확장50 | 53.33% | 35.56% | 48.89% | 50.00% | +1.894% |
| 2024Q2 | L0 순위학습 B · 원18 | 45.00% | 40.56% | 57.78% | 42.78% | -0.335% |
| 2024Q2 | 목표·손절 선후 학습 · 확장50 | 25.56% | 28.89% | 58.33% | 38.33% | -0.405% |
| 2024Q3 | 기존 종합점수 상위3 | 24.46% | 34.78% | 58.70% | 46.20% | -1.509% |
| 2024Q3 | 저변동 ATR 상위3 | 1.61% | 6.45% | 51.08% | 47.31% | -0.066% |
| 2024Q3 | L5 직접효용 A · 원18 | 44.86% | 43.24% | 55.68% | 45.95% | -0.250% |
| 2024Q3 | L5 순위학습 B · 확장50 | 42.70% | 41.62% | 59.46% | 43.78% | +0.082% |
| 2024Q3 | L0 직접효용 A · 확장50 | 40.86% | 38.17% | 56.99% | 51.61% | -0.053% |
| 2024Q3 | L0 순위학습 B · 원18 | 41.94% | 43.01% | 59.68% | 43.01% | -1.229% |
| 2024Q3 | 목표·손절 선후 학습 · 확장50 | 29.57% | 38.17% | 60.75% | 45.16% | -0.530% |
| 2024Q4 | 기존 종합점수 상위3 | 26.78% | 30.60% | 65.03% | 41.53% | -1.810% |
| 2024Q4 | 저변동 ATR 상위3 | 2.73% | 12.02% | 56.28% | 44.81% | -0.596% |
| 2024Q4 | L5 직접효용 A · 원18 | 51.65% | 46.70% | 60.99% | 47.25% | -2.009% |
| 2024Q4 | L5 순위학습 B · 확장50 | 42.31% | 47.25% | 63.74% | 44.51% | -3.300% |
| 2024Q4 | L0 직접효용 A · 확장50 | 46.99% | 44.26% | 60.11% | 51.37% | -2.338% |
| 2024Q4 | L0 순위학습 B · 원18 | 42.86% | 45.60% | 59.89% | 53.85% | -2.471% |
| 2024Q4 | 목표·손절 선후 학습 · 확장50 | 25.14% | 38.80% | 63.93% | 42.62% | -1.877% |

### 목표가·손절선 선후 및 비용

| 방식 | 목표 먼저 비율 | FP 음수 비율 범위 | 목표가만 적용 평균 | 목표·손절 평균 범위 |
| --- | --- | --- | --- | --- |
| 기존 종합점수 상위3 | 19.25%~20.27% | 62.25%~63.28% | -0.188% | -0.536%~-0.382% |
| 저변동 ATR 상위3 | 2.87%~2.87% | 53.66%~53.66% | -0.053% | -0.092%~-0.092% |
| L5 직접효용 A · 원18 | 33.01%~35.07% | 61.91%~63.97% | +0.017% | -0.075%~+0.233% |
| L5 순위학습 B · 확장50 | 29.36%~31.28% | 63.85%~65.78% | -0.333% | -0.439%~-0.151% |
| L0 직접효용 A · 확장50 | 31.42%~33.33% | 61.94%~63.86% | -0.294% | -0.181%~+0.107% |
| L0 순위학습 B · 원18 | 29.80%~31.85% | 63.57%~65.62% | -0.750% | -0.460%~-0.153% |
| 목표·손절 선후 학습 · 확장50 | 22.57%~23.32% | 62.59%~63.34% | -0.473% | -0.497%~-0.384% |

### 통계 오차와 미확정

| 방식 | 도달률95% 구간 | L5 95% 구간 | L0 95% 구간 | D5 평균95% 구간 | 미확정 |
| --- | --- | --- | --- | --- | --- |
| 기존 종합점수 상위3 | 21.13%~25.56% | 24.95%~30.58% | 55.11%~61.20% | -0.89%~0.26% | 2 |
| 저변동 ATR 상위3 | 1.98%~3.83% | 2.87%~6.35% | 48.46%~57.72% | -0.35%~0.26% | 4 |
| L5 직접효용 A · 원18 | 45.02%~50.62% | 39.75%~46.50% | 56.58%~63.72% | -1.45%~0.97% | 10 |
| L5 순위학습 B · 확장50 | 38.05%~44.13% | 38.76%~45.51% | 58.18%~65.05% | -2.35%~-0.04% | 9 |
| L0 직접효용 A · 확장50 | 40.45%~46.45% | 36.46%~43.43% | 55.20%~61.63% | -1.30%~0.92% | 6 |
| L0 순위학습 B · 원18 | 38.74%~44.22% | 39.88%~46.89% | 57.23%~62.60% | -2.25%~-0.12% | 4 |
| 목표·손절 선후 학습 · 확장50 | 25.44%~30.85% | 28.71%~35.48% | 54.73%~62.12% | -1.07%~0.52% | 5 |

같은 날짜를 묶는10거래일 moving-block bootstrap1000회(seed42)의 percentile 구간이다. 여러 모델·지표·시기를 동시에 본 것에 대한 다중검정 보정은 하지 않은 설명용 불확실성 구간이다. 각 정책의 원래 선정/엄격 분모를 각각 유지하고 동일 날짜 블록을 뽑았으며, 종목 교집합으로 유리한 표본만 남기지 않았다. 미확정의 최선/최악 event bound는 원본 통계 파일에 별도로 보존했다.

20거래일 블록으로 다시 계산한140개 point estimate는 모두 동일했고, 손실 목표 미달이라는 해석도 유지됐다. 미확정을 전부 비손실로 놓아도 새5개 후보의 D5 음수 비율은57% 이상이다.

동일 현행 eligibility의 전체587,395개 원시 관측 중 엄격 확정586,542개를 따로 재생한 기본 도달률은16.628%, L5는21.198%, 모든 음수는57.377%였다. 후보는 급등을 더 잘 모았지만, 동시에 큰 손실도 더 모았다. 모집단 비교와 정책 간 차이를 별개로 보존했다.

L5-A가 기존 종합점수보다 도달률을24.36%p 높인 차이의95% 구간은[21.28, 27.81]%p였다. 동시에 L5 손실도15.32%p 증가했고 구간은[11.93, 18.70]%p였다. 급등만 좋아진 결과를 전체 개선으로 판정하지 않았다.

## 기존 KIS 구간의 별도 실험

| 방식 | 구간 | 확정/선정 | +10% | L5 | L0 | 평균 D5 net |
| --- | --- | --- | --- | --- | --- | --- |
| L5-winnerA | allOriginal180 | 532/540 | 47.37% | 42.11% | 58.65% | -1.166% |
| L5-winnerB | allOriginal180 | 534/540 | 46.07% | 43.82% | 57.49% | -0.804% |
| L5-winnerA | testReused | 179/180 | 46.93% | 36.31% | 55.31% | -1.286% |
| L5-winnerB | testReused | 179/180 | 55.31% | 38.55% | 51.40% | +1.241% |
| L0-winnerA | allOriginal180 | 537/540 | 48.60% | 42.64% | 58.10% | -0.741% |
| L0-winnerB | allOriginal180 | 535/540 | 47.85% | 39.81% | 57.01% | +0.746% |
| L0-winnerA | testReused | 178/180 | 47.75% | 41.57% | 57.87% | +0.670% |
| L0-winnerB | testReused | 180/180 | 47.22% | 36.67% | 55.56% | +1.121% |

이 구간은 반복 사용한2025~2026 진단 데이터다. 새 외부 검증으로 부르지 않는다. 단기 성과가 좋은 후보도 전체 기간/다른 시기에서 손실이 재현됐다.

## 같은 정수 점수의 동점 처리 실험

# 정수 점수 동점 처리 진단

2023–2024 이미 열람한 검증 기간을 재사용한 진단입니다. 원래 공식 실험은 정수 점수 다음에 거래대금으로 정렬했고, 이번에는 **같은 정수 점수 안에서만 동일한 반올림 전 복합 효용**을 먼저 적용했습니다. 점수, 모델, 입력, 보정, 학습 날짜, 20일 cooldown은 고정했습니다. 새 학습·모델 예측 호출은 0입니다.

**5개 후보 모두 급등 도달 40%와 손실 30%를 함께 충족하지 못했습니다.** 여기서 −5% 손실과 모든 음수 D5 수익을 별도로 표시합니다. 30bps 비용을 포함하며, 장중 +10% 도달과 실제 매도 수익은 다릅니다.

| 후보 | 정렬 | +10% 도달 | D5≤−5% | D5<0 | 추천일 양봉 | 평균 D5 순수익 |
|---|---|---:|---:|---:|---:|---:|
| L5-A | 기존 | 47.77% | 42.96% | 60.05% | 46.67% | -0.33% |
| L5-A | 같은 정수 안 효용 우선 | 46.88% | 42.96% | 60.26% | 47.36% | -0.46% |
| L5-B | 기존 | 41.02% | 41.70% | 61.18% | 45.47% | -1.14% |
| L5-B | 같은 정수 안 효용 우선 | 41.14% | 41.27% | 60.71% | 45.65% | -0.87% |
| L0-A | 기존 | 43.60% | 39.63% | 58.25% | 48.87% | -0.17% |
| L0-A | 같은 정수 안 효용 우선 | 44.45% | 38.97% | 58.08% | 47.74% | 0.02% |
| L0-B | 기존 | 41.63% | 43.06% | 59.67% | 45.66% | -1.16% |
| L0-B | 같은 정수 안 효용 우선 | 41.79% | 42.68% | 58.82% | 46.51% | -1.09% |
| FP-A | 기존 | 28.18% | 31.87% | 58.00% | 42.48% | -0.22% |
| FP-A | 같은 정수 안 효용 우선 | 27.63% | 29.34% | 56.22% | 45.76% | -0.08% |

모든 정책은 489일 모두 3종목을 확보했습니다. 변경 후 3종목 모두 70점 이상인 날은 L5-A 5일, L5-B 8일, L0-A 1일, L0-B 0일, FP-A 1일입니다. 낮은 정수 점수가 높은 정수 점수보다 앞서는 경우는 없습니다.

| 후보 | 선정이 달라진 날짜 | 엄격한 알려진 결과/1,467슬롯 | 목표·손절 보수 평균 | 보수 매도 모형 음수 비율 |
|---|---:|---:|---:|---:|
| L5-A | 353/489 | 1457/1467 | -0.127% | 64.24% |
| L5-B | 217/489 | 1461/1467 | -0.356% | 65.02% |
| L0-A | 416/489 | 1460/1467 | -0.113% | 64.11% |
| L0-B | 150/489 | 1462/1467 | -0.425% | 65.39% |
| FP-A | 475/489 | 1462/1467 | -0.388% | 62.24% |

고정 10거래일 블록·1,000회·seed42 paired bootstrap에서 FP-A의 −5% 손실 차이는 −2.53%p(95% −4.46~−0.64), 양봉 차이는 +3.28%p(0.85~5.78)였습니다. 그러나 급등 도달은 27.63%, 모든 음수 수익은 56.22%로 목표에 미달했습니다. 그 외 후보의 핵심 수익·손실 차이 구간 대부분은 0을 포함합니다. 구간은 선택된 모델·현재 자료에 조건부인 기술통계이며 다중 실험, 현재 master와 수정 가격 편향을 보정하지 않습니다.

보수/낙관 익절·손절 수익은 일봉 가격 모형이며 실제 체결 수익이 아닙니다. 미래 OHLCV가 미확정인 종목도 선정 기록에 남겼고, 알려진 결과의 집계에서만 제외했습니다. 쿨다운 상태 전파로 이후 종목까지 달라지므로 변경 날짜 수는 당일 직접 동점 변경 수와 같지 않습니다.

독립 원래 종목·정수 점수·반올림 전 값·원시 결과·baseline 재생 차이는 0입니다. 기존 모델·자료·공식 ledgers의 보호 해시도 유지했습니다. 추가 KIS 실험은 실행하지 않았습니다.

후보 수 metadata 오류 1,203개가 발견됐습니다. 새로운 cooldown 상태의 실제 afterCooldownCount는 맞지만, scorableAfterCooldownCount가 이전 정책 값을 복사했습니다. 선정·점수·성과에는 영향이 없으며 원본 파일을 보존하고 아래 정정 기록에 올바른 해석을 남겼습니다.

[전체·연도·분기 및 paired 통계](experimental/integer-tie-ablation/report.json.gz) · `전체 선정·원시 5봉` (로컬 대용량 원장; [복원 안내](data-and-reproduction.md)) · [후보 수 metadata 정정](experimental/integer-tie-ablation/metadata-addendum.json.gz) · [사전 고정 계획](experimental/integer-tie-ablation/protocol.json)

독립 전수 감사도 완료했습니다. 저장된 2,445개 후보 예측 패널과 별도 보정 계산으로 12개 정책·489일·17,604개 선정의 정수 순위, cooldown, 원점수, 원시 5봉 및 엄격한 수익률 집계 차이가 0입니다. 후보 수 metadata 정정도 확인됐습니다. [독립 감사](experimental/integer-tie-ablation/independent-audit.json)


이 마지막 실험의 블록은 circular 10일 방식이며, 앞의 공식 통계에서 사용한 non-circular moving block과 구분한다. 동일 정수 점수 안에서만 반올림 전 효용을 쓴 별도 재사용 진단이다. 공식 평가 결과를 이 수치로 교체하지 않았다.

고정한 FP18/50 두 설정의 KIS 재생도 추가했다. 원180일/537확정·3미확정에서 raw 도달42.46%, L5 36.69%, 모든 음수56.61%, D5 평균+0.119%였다. 보수적 목표·손절 모형에서는 목표 먼저29.80%, 가상 FP 음수64.06%, 평균−0.196%였다. 다른 원천의 새2년 구간에서는 이 개선이 유지되지 않았다.

재추천 금지 기간을20일에서5일로 줄이는 구조 실험도 선정/점수/모델을 고정한 상태로 실시했다. 최근60일 L5-B는 도달55.31→51.69%, L5 손실38.55→40.45%, D5 평균+1.241→−0.204%로 나빠졌다. 재추천 간격을 짧게 하는 것만으로 목표를 해결하지 못했다.

기존 L5-B 전체180일은 raw 도달46.07%였지만 먼저−5% 손절을 거친 뒤+10%를 찍은86건이 있었다. 목표가가 먼저인 비율은25.84~29.96%, 목표/손절 가상 평균은−1.270~−0.652%였다.

## 현재 점수가 목표와 어긋나는 이유

현행 생산 selector는 ATR 변동폭이 낮은 순으로 고른다. 화면의 종합점수는 추세20%·모멘텀15%·거래량25%·변동성10%·패턴20%·수급심리 대용치10%를 합산한 별도 수치다. 따라서 생산 선정은 화면 종합점수 순이 아니며, 점수가 낮은 종목을 뽑는 이유가 여기에 있다. 변동성 점수도 ATR3% 부근에 높은 점수를 주는 구조이고, 높은 점수의 추세/모멘텀/패턴은 미래5일+10%와 손실 억제를 직접 학습한 값이 아니다. 산술 구현 검산과 목표에 맞는 예측력 검증을 구분했다. 이번 연구의 새 점수들은 미래 성과를 학습하도록 바꿔 오프라인 종합점수 순으로 선정했지만, 이를 생산에 올릴 만큼 위험 조건을 충족하지 못했다.

## 원천·인과 접근·전수 검산

- NAVER current master2431종목+KOSPI2432응답을 모두 수집했다. 4,223,899원시행에서 모든9/30장중행2432개를 균일하게 배제한4,221,467행을 별도 보존했다. 기존 KIS 원본과 섞지 않았다. 관측 cache는1231일/1,559,349현행 gate 통과행이고 실제 TypeScript의 기존18입력·7점수·eligibility를 재사용했다.
- 기존18입력/점수·새32입력은 원시 가격 독립 검산과 미래 suffix/320일 이전 prefix 변조로 확인했다. 새 피처가 유리한 추가 RSI/cohort 파일은 이번30설정 연구에 섞지 않았다.
- KIS와 NAVER1,192,328공유행 중 OHLCV 전체가 같은 비율은94.142%였다. 최근9/14이후 종가 차이는 라이브KIS40/40행으로 재현됐고, 시장코드 NX/UN이나 날짜 이동만으로 해결되지 않았다. 원인 미확정이며 생산 API를 임의로 바꾸지 않았다. 최악 손실20건은 두 원천의 결과가 같았다.
- NAVER130개 모델의 실제 fit 입력/날짜별 가중치·query·라벨 성숙일·입력 hash·저장 tree·epoch를 전수 재구성했고58개 보정 모델은 독립 isotonic 재학습 결과와 일치했다. Tree 전체130개를 독립 재학습했다고 주장하는 것은 아니며 별도의 실제 tree 독립 재학습6개로 구현을 대조했다. 원선정 정수순위/재추천 간격/6개 분야 점수/미확정 유지, 별도 일봉 선후 판정도 검산했다.

## 참고한 연구와 적용 범위

- [Lo·Mamaysky·Wang 기술적 패턴 연구](https://www.mit.edu/~wangj/pap/LoMamayskyWang00.pdf): 미국1962~1996 기술적 패턴의 추가 정보에 관한 연구. 정보량이 수익성이나 한국5일+10% 도달을 보장하지 않는다. 다기간 가격/거래량 패턴 가설에만 참고했다.
- [Poh 등의 날짜별 순위학습](https://arxiv.org/pdf/2012.07149): 미국 월별 long/short 연구. 이번 날짜별 LambdaMART를 시험할 근거이지 한국5일 목표의 검증은 아니다.
- [중국 candlestick ML 연구](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0255558): 시장·진입가격·목표·모델 선택 방식이 다르다. candle/volume shape를 관측 입력으로 시험했으며 논문 성과를 이식했다고 주장하지 않는다.
- [López de Prado의 first-barrier 설명](https://pdfs.semanticscholar.org/bbf7/bc8f68d22cb8089a4860b111ba9ef60fc957.pdf): 가격 경로와 중첩 라벨을 고려한다. 원자료의 변동성 기반 동적 barrier를 그대로 구현한 것은 아니며, 이번 고정+10/−5/5일 목표·손절 실험은 별도 가설이다.
- [Bailey·López de Prado 선택 편향 연구](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf): 반복 탐색의 성과 과장 위험. 불리한 설정과 전체 구간도 함께 보존했고 Deflated Sharpe나 PBO를 실제 계산했다고 주장하지 않는다.
- [Novy-Marx 다중 신호 과최적화](https://www.nber.org/papers/w21329), [Lee·Swaminathan 거래량·모멘텀](https://www.lsvasset.com/pdf/research-papers/Price-Momentum-Trad-Vol-2000.pdf), [52주 고점](https://www.bauer.uh.edu/tgeorge/papers/gh4-paper.pdf), [유동성과 단기 반전](https://www.nber.org/papers/w17653), [모멘텀 crash](https://www.nber.org/papers/w20439), [Gu·Kelly·Xiu 비선형 예측](https://www.nber.org/papers/w25398)을 시장/기간 차이를 명시하고 가설 참고로 사용했다.
- 라이브러리 동작은 [LightGBM 공식 문서](https://lightgbm.readthedocs.io/en/stable/Parameters.html)와 [sklearn 공식 문서](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html)로 확인했다. 논문·라이브러리 설명을 이 제품의 상승 확률로 표시하지 않았다.

## 제품 반영 상태

현재 remote main은1b0e2d2ca0cfced224fc143032f5bc630c939764이고 로컬3642c44의 tree와 동일하다. 이전에 허용받은 Analysis Summary 변경 PR218은 이미 별도로 반영/검증됐다. 이번 추가 연구에서 추천 점수 모델이나 UI/문구는 새로 배포하지 않았다. 현재 코드의 생산 selector는 lowVolatilityStable v2.1이며, 오늘 오전 실제 Prepare의 bullishTarget5d v3와 구분해야 한다. 현재 생산 selector도 급등 목표의 최선이라고 결론내린 것은 아니다.

[기존 Summary PR218](https://github.com/MongLong0214/stock-ai-newsletter/pull/218) · [해당 main CI](https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/36671803159). 기존 변경에 대해4172tests·487pages build·Prepare E2E25·readonly KIS·실제 웹 확인은 이전 단계에서 완료됐다. 연구 성과가 좋아졌다는 증거로 CI 통과를 사용하지 않는다.

## 재현 가능한 주요 결과

통계 파일의 기존 필드 FPstopBeforeLaterTouch는 같은 봉에서 양쪽 가격을 닿은 보수적 stop 우선 모형도 포함한다. 실제로 먼저 손절한 뒤 나중 날짜에 목표가를 닿았다는 관측 지표로 해석하면 안 된다. 날짜 순서를 따로 비교한 기존86건과는 다른 지표다. 원본 수치·선정·모델은 보존하고 [의미 정정문](experimental/paired-statistics/results/semantic-addendum.md)을 추가했다.

- [naver/primary-report.json](experimental/naver/primary-report.json.gz) · SHA256 `3482543e43cd3a5ae7e8e20d9d69618ae5ca4506b7c29e1b79c77322acfa2086`
- `naver/primary-ledger.json` (로컬 대용량 산출물; [복원·해시 안내](data-and-reproduction.md)) · SHA256 `8f0573dc894ba1abec6998443a2b59a26fd35368c19fc7bc76c6e5c26713ba2b`
- [naver-l0/primary-report.json](experimental/naver-l0/primary-report.json.gz) · SHA256 `1a07501c25e40d8dfefe83c0c6d93527c4de2d1f7bc58c44b830df4c4679d79a`
- `naver-l0/primary-ledger.json` (로컬 대용량 산출물; [복원·해시 안내](data-and-reproduction.md)) · SHA256 `c9c587c993d0fbc395493596626df497a2fc77fbe1346e7ed39c0868e4eec7cd`
- [first-passage-study/naver-primary-report.json](experimental/first-passage-study/naver-primary-report.json.gz) · SHA256 `f2ce7d31032ba87e07112d0f37ffcc38a0f073a5c18581eb7f796c613ed24d3b`
- `first-passage-study/naver-primary-ledger.json` (로컬 대용량 산출물; [복원·해시 안내](data-and-reproduction.md)) · SHA256 `d2f8f9591634dc36e87836828a0c46cbfc0811a554084f0914816f256c33d0e0`
- [first-passage-study/kis-report.json](experimental/first-passage-study/kis-report.json.gz) · SHA256 `696676369ad2a256cd90d465ce48eedf90066f802c9f86bb8ffdd80cd995fb33`
- `first-passage-study/kis-outer-ledger.json` (로컬 대용량 산출물; [복원·해시 안내](data-and-reproduction.md)) · SHA256 `4cd79efc078972f05835ff83891b472b2280ea1915cefc999687931d76c88eb2`
- [first-passage-study/naver-primary-selected-audit.json](experimental/first-passage-study/naver-primary-selected-audit.json) · SHA256 `7a75266552d65f59f33f59775beee64b1851cfb863a9197ef9048102c64fe736`
- [first-passage-study/kis-selected-independent-audit.json](experimental/first-passage-study/kis-selected-independent-audit.json) · SHA256 `53d0bcdf01486df3910eff4c9fb68c79ccb2e17b8d61ed58cbbe7ac07a5e083c`
- [paired-statistics/results/statistics.json](experimental/paired-statistics/results/statistics.json.gz) · SHA256 `c0a2a17c971fd596439b014b641b459c12ffc2f6bfd12a58a2f5db72df120539`
- [paired-statistics/results/population-enrichment.json](experimental/paired-statistics/results/population-enrichment.json.gz) · SHA256 `67af5c9b5ad7fb3533ad3aabc3e0e31b8f2d9960002b025eb7e664eacbe1da47`
- [paired-statistics/results/block20-sensitivity.json](experimental/paired-statistics/results/block20-sensitivity.json) · SHA256 `1666d726ce0c22df84663579ce2769d44282d4960b9a6c0d72d17be5fb035680`
- [paired-statistics/results/semantic-addendum.json](experimental/paired-statistics/results/semantic-addendum.json) · SHA256 `c83af8372cfe655e70ca58d099f1f0f79e8d98f339fb7f74c76aed7ebe4db057`
- [paired-statistics/verification.json](experimental/paired-statistics/verification.json) · SHA256 `41aa5d53ff6b442bf1a047ec921014e4ae924c134aaad30d6333e5897fe981e1`
- [paired-statistics/results/metrics.csv](experimental/paired-statistics/results/metrics.csv) · SHA256 `b253785782faa784dee4c0af444fff31e5110fc64cbde613b7a6bf1ed7031a95`
- [paired-statistics/results/paired-differences.csv](experimental/paired-statistics/results/paired-differences.csv) · SHA256 `616e355ff409ea4a4a0d285975786269cfbcc4a13fd78dc281ed5b29fc5120ee`
- [source-bridge/actual-prepare-20260929-30-partial-results.json](experimental/source-bridge/actual-prepare-20260929-30-partial-results.json) · SHA256 `53c8c28ac6e9ae093da36dbf240a359f3d05b8cabcc8d021077abbb41c45b0a9`
- `source-bridge/selected-cohort.json` (로컬 대용량 산출물; [복원·해시 안내](data-and-reproduction.md)) · SHA256 `383ba5a5af28ea464e3e772ae62ff9676e7838af605326c33f009ac59858fa7b`
- [cooldown-ablation/summary.md](experimental/cooldown-ablation/summary.md) · SHA256 `c98b9a9c1d6c7378616b1dbe3d2c0e478a552b8d31375bed5b6a22c33e5bf1b2`
- [outcome-diagnostic/kis-l0-actual/COMPARISON.md](experimental/outcome-diagnostic/kis-l0-actual/COMPARISON.md) · SHA256 `63caa84ad9498907d2ef157201b575d8d77a137eed5d77509114ee9face88d86`
- [integer-tie-ablation/protocol.json](experimental/integer-tie-ablation/protocol.json) · SHA256 `3f8332167db23152842c0f6a30849094ed7e215ccd9f62a997b9aadbfa339c58`
- [integer-tie-ablation/report.json](experimental/integer-tie-ablation/report.json.gz) · SHA256 `9a356ef1449b739dbbb1b50c16dfebef3e54e45718ca3b16fdf6a8541027148b`
- `integer-tie-ablation/ledger.json` (로컬 대용량 산출물; [복원·해시 안내](data-and-reproduction.md)) · SHA256 `2a7dd390cd5c94e10b6b0ccff116c077bfecc6f9fb47b1283f434396ae840a83`
- [integer-tie-ablation/metadata-addendum.json](experimental/integer-tie-ablation/metadata-addendum.json.gz) · SHA256 `97ab934c72dc57a9bdb562642b8b32d84e43a6f65488e1fc0a084454506a2eb5`
- [integer-tie-ablation/independent-audit.json](experimental/integer-tie-ablation/independent-audit.json) · SHA256 `afe55e2a63a08682dc3744f764e0001a5fed65819e6ced61b9c5ae3b19a21fd0`
- [independent-economic-diagnostic-audit.json](experimental/independent-economic-diagnostic-audit.json) · SHA256 `606518048c34c952aae08e408f5248801cdb2b6506d3a3b9cb407bad1138dfc5`
- [independent-extra-feature-check.json](experimental/independent-extra-feature-check.json) · SHA256 `38cc5a7a6d01f343357caf0fa349e1a9e30b14392a8b1d79604612a9f63cdc1b`
- [independent-feature-protocol-audit.json](experimental/independent-feature-protocol-audit.json) · SHA256 `013cfd824d2ee8218652ce497a78651f36fce6b6202aecc0ce8d98394163aa80`
- [independent-first-passage-train-audit.json](experimental/independent-first-passage-train-audit.json.gz) · SHA256 `cfa44b06ab7290a1edb7b3f27eb79a70638af19ec3bd389bb8e2948950e8433c`
- [independent-kis-bundle-audit.json](experimental/independent-kis-bundle-audit.json) · SHA256 `eef01db6bc55e8599156d00ef165155e8df71987f7f9bcac24861c76357fe5f2`
- [independent-kis-first-B-model-audit.json](experimental/independent-kis-first-B-model-audit.json) · SHA256 `8f9f4e5947509ca3faa405356386d57331e63c478403191d60377412a7389a34`
- [independent-kis-first-model-audit.json](experimental/independent-kis-first-model-audit.json) · SHA256 `f8748dd76e6c5dea8d7f85aca014b6a8c77ae8a40424c2d961a1a50e3b3de77a`
- [independent-kis-first-passage-audit.json](experimental/independent-kis-first-passage-audit.json) · SHA256 `230fb689e0bd89c8283c4be2b8c8103151feab1d6b432f4dd21b0eda3c6797bc`
- [independent-kis-policy-audit.json](experimental/independent-kis-policy-audit.json) · SHA256 `c9ae96e7e93f22e198a0b486651ddda1c6dbdadeb119174ffac997a631a5f6e8`
- [independent-model-mechanics-audit.json](experimental/independent-model-mechanics-audit.json) · SHA256 `44d43eb0f2cd6fde565d1d466bb736d2513f7149f21b74ab61b632f57c2d29e3`
- [independent-naver-complete-bundle-audit.json](experimental/independent-naver-complete-bundle-audit.json.gz) · SHA256 `c4a607011804e4e250293afaa7dc7e95451edc424911fbb6d97f73cfc948ec1d`
- [independent-naver-complete-policy-audit.json](experimental/independent-naver-complete-policy-audit.json.gz) · SHA256 `805e646f8d9b11ea07339c54bb1a49e3ea5de83f5f0fed82443e48ce25dd2997`
- [independent-naver-first-model-audit.json](experimental/independent-naver-first-model-audit.json) · SHA256 `efc0c2482ef49ef6c81e5bbea18224b93775b4758fa86bca48ed081586fa5cd0`
- [independent-naver-observed-audit.json](experimental/independent-naver-observed-audit.json) · SHA256 `a6681858f4fc62e4fcc2bf2a9e3e4ad82d27776b73068bcd5ee621cefaf42929`

이 보고서의 제품 반영 상태는 연구 종료 당시의 기록이다. 이후 사용자가 균형 후보 적용과 main 반영을 지시했고, L0-A-small λ0.65 확장50의 고정 설정을 선택했다. Git의 연구 인계 문서에 실제 적용 커밋과 운영 검증을 별도로 기록한다. 아직 목표를 충족하지 못했다는 연구 결과는 바뀌지 않는다.

오프라인의 매일3개 후보 재생은 당시 전체 Prepare의 시장 폭락 판정과 발송 중단까지 복원한 실제 발행 이력은 아니다.

작성 시각: 2026-09-30T08:38:19.735065+00:00
