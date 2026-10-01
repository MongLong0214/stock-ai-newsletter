import json
from pathlib import Path

B=Path('/tmp/composite-score-research-20260930')
def load(p):return json.loads((B/p).read_text())
bal=load('balanced-event-study/report.json')
event=load('event-composite-study/report.json')
raw=load('raw-composite-study/report.json')
weights=load('weight-study/report.json')
regime=load('regime-train-study/report.json')
fresh=load('balanced-event-study/fresh-selections.json')
oldfresh=load('event-composite-study/fresh-selections.json')
def pct(v):return f'{100*v:.2f}%'
def signed(v):return f'{100*v:+.2f}%'
def line(label,z,weight=False):
    s=z['strictPositiveVolumeLabels' if weight else 'strictPositiveVolume']
    n=s.get('labels',s.get('validLabels'))
    return f'| {label} | {n}/180 | {pct(s["touchRate"])} | {pct(s["D1bullishRate"])} | {pct(s["loss5Rate"])} | {pct(s["loss10Rate"])} | {signed(s["meanNet5d"])} | {signed(s["medianNet5d"])} | {signed(s["meanMAE"])} |'

lines=[
'# 종합점수·급등 추천 연구 결과 — 2026-09-30',
'',
'손실 페널티를 조정한 후보는 최근 60일에서 **급등 도달률 43.33%, −5% 이하 손실 비율 32.22%**였습니다. 그러나 앞선 30일의 손실 비율은 **62.22%**, 전체 180일은 **40.56%**였습니다. 최근 구간은 요청한 40%·30%에 가까워졌지만, 전체 기간에 안정적으로 목표를 달성한 모델로 판단하지 않았습니다. 이 문서는 연구 결과이며 추천 엔진·UI·문구·DB·발송에는 적용하지 않았습니다.',
'',
'## 측정 기준',
'',
'- 신호일 마감까지의 관측값으로 다음 거래일 시가에 진입한다고 가정했습니다. 진입일을 포함한 5거래일의 고가가 진입 시가보다 10% 이상 높으면 급등 도달로 셉니다.',
'- 5일 수익은 5번째 거래일 종가 ÷ 진입 시가 − 1에서 왕복 비용 0.30%를 뺀 값입니다. 손실 비율은 이 값이 **−5% 이하**인 비율입니다. 모든 음수 수익의 비율과는 다릅니다.',
'- 당일 양봉은 진입일 종가 > 시가입니다. MAE는 5일 동안 가장 낮은 저가의 진입 시가 대비 변화입니다.',
'- 아래 성과의 분모는 5일 모두 유효한 OHLC와 양의 거래량이 있는 선정입니다. 거래량 0·미확인 라벨의 종목도 선정 원장에서 유지했으며, 결과를 알고 선정에서 제외하지 않았습니다.',
'- 과거를 재생한 가상 선정입니다. 실제 발행 이력이 아닙니다. 장중 +10% 가격 관측과 그 가격에 실제로 매도할 수 있었는지는 구분했습니다.',
'',
'## 최근 60일에서 실제로 무엇이 달라졌나',
'',
'기간: 신호일 2026-06-24~2026-09-17. 모든 정책은 각자의 20거래일 중복 추천 제한을 계속 유지했고, 실제 정수 종합점수 내림차순 → 거래대금 내림차순 → 종목코드 순으로 동점을 처리했습니다. ATR 기준만 기존 ATR 오름차순입니다. 정수 점수의 동점을 부동소수점 원점수로 다시 정렬하지 않았습니다.',
'',
'| 연구 정책 | 유효 라벨/선정 | +10% 도달 | 진입일 양봉 | −5% 손실 | −10% 손실 | 평균 5일 순수익 | 중앙 5일 순수익 | 평균 MAE |',
'|---|---:|---:|---:|---:|---:|---:|---:|---:|'
]
rows=[('기존 ATR 우선',bal['outerResults']['testReused']['ATRbaseline'],False),
 ('현재 종합점수 상위 3개',bal['outerResults']['testReused']['currentOverall'],False),
 ('6개 항목 가중 산술평균 학습',weights['outerResults']['test']['arithmetic'],True),
 ('6개 항목 가중 기하평균 학습',weights['outerResults']['test']['geometric'],True),
 ('원시 지표 선형 효용 점수',raw['outerResults']['testReused']['rawComposite'],False),
 ('비선형 사건 모델 · 페널티 0.20',event['outerResults']['testReused']['eventComposite'],False),
 ('비선형 사건 모델 · 페널티 0.65',bal['outerResults']['testReused']['balancedEventComposite'],False)]
lines.extend(line(*r) for r in rows)
lines.extend([
'',
'페널티 0.65는 현재 종합점수 순위보다 최근 구간의 도달률·손실률·평균/중앙 수익·양봉률이 개선됐습니다. 다만 평균 5일 수익은 여전히 음수이며, 최악의 5일 수익은 −40.32%, 최악 MAE는 −43.96%였습니다. ATR 기준은 손실이 작지만 +10% 도달률이 5%에 그칩니다. 급등 가능성과 낮은 손실을 동시에 확보하기 어렵다는 차이가 수치로 확인됩니다.',
'',
'## 손실 페널티는 과거 학습 내부 구간에서만 골랐다',
'',
'기존에 저장한 +10% 도달·진입일 양봉·−5% 손실 확률 모델 6개를 그대로 재사용했습니다. 이번 페널티 연구에서 **새 모델 학습은 0회**입니다. 먼저 고정한 후보는 0.20·0.35·0.50·0.65·0.80·1.00뿐입니다.',
'',
'정수 점수 = clamp(round(100 × (0.8 × 도달 예측값 + 0.2 × 양봉 예측값) − 100 × 페널티 × 손실 예측값), 0, 100). 산술 순서도 사전에 고정했습니다. 0.20 후보가 이전 모델의 모든 정수 점수와 선정 원장을 그대로 재현하는지 확인했고 차이는 0건입니다.',
'',
'첫 150일로 학습한 모델을 5일 공백 뒤의 내부 80일에서 비교했습니다. 도달률 40%·손실률 30%와의 제곱 거리만 최소화했으며, 동점일 때 양봉률이 높은 후보, 다음으로 낮은 페널티를 선택하도록 미리 정했습니다. 외부 기간을 보기 전에 **0.65를 선택한 파일을 저장**했고, 외부 기간에서는 이 후보 하나만 재생했습니다.',
'',
'| 페널티 | 내부 유효 라벨 | +10% 도달 | −5% 손실 | 목표와의 제곱 거리 |',
'|---:|---:|---:|---:|---:|'
])
for k,z in bal['innerResults'].items():
 s=z['strictPositiveVolume'];lines.append(f'| {z["lambda"]:.2f} | {s["labels"]}/240 | {pct(s["touchRate"])} | {pct(s["loss5Rate"])} | {z["targetSquaredDistance"]:.6f} |')
lines.extend([
'',
'| 0.65 후보 평가 구간 | 유효 라벨 | +10% 도달 | −5% 손실 | 진입일 양봉 | 평균 5일 순수익 |',
'|---|---:|---:|---:|---:|---:|'
])
scope_names=[('내부 80일',bal['innerResults']['lambda0.65']),('원래 학습 80일 · 재사용',bal['outerResults']['originalTrainDiagnostic']['balancedEventComposite']),('검증 30일 · 재사용',bal['outerResults']['validationReused']['balancedEventComposite']),('최근 60일 · 재사용',bal['outerResults']['testReused']['balancedEventComposite']),('원래 180일 전체 · 공백일 포함',bal['outerResults']['allOriginal180']['balancedEventComposite']),('추가 성숙 1일',bal['outerResults']['partialFreshSpotcheck']['balancedEventComposite'])]
for name,z in scope_names:
 s=z['strictPositiveVolume'];lines.append(f'| {name} | {s["labels"]}/{z["picks"]} | {pct(s["touchRate"])} | {pct(s["loss5Rate"])} | {pct(s["D1bullishRate"])} | {signed(s["meanNet5d"])} |')
lines.extend([
'',
'전체 180일 평균 순수익은 −2.29%, 중앙 수익은 −2.88%였습니다. +10%에 닿으면 +9.7%에 청산하고, 아니면 5일 종가에 청산한다고 단순 가정한 대용 수익도 전체 평균 −1.07%였습니다. 이 대용 수익은 체결 확인 결과가 아닙니다.',
'',
'## 3종목과 높은 점수는 따로 확인했다',
'',
'모든 정책이 최근 60일 매일 3종목을 확보했습니다. 높은 점수를 만들기 위해 순위 백분위로 점수를 올리거나 상위 3개에 보너스를 주지는 않았습니다.',
'',
'| 정책 | 최근 선정 점수 범위 | 3개 모두 70점 이상인 날 / 60일 |',
'|---|---:|---:|'
])
for label,z,isw in rows:
 lines.append(f'| {label} | {z["scoreMin"]}~{z["scoreMax"]} | {z["all3ScoreAtLeast70Days"]} |')
lines.extend([
'',
'0.65 후보 점수 평균은 34.55점이고 70점 이상인 종목은 0개였습니다. 실제 예측 사건의 값이 이 정도이므로 80~90점처럼 보이게 점수를 올리지 않았습니다. 따라서 “매일 3개 모두 높은 점수”까지 만족하는 결과는 얻지 못했습니다. 최근 60일에 3개 모두 +10%에 닿은 날은 10일, 모두 양봉인 날은 14일이었습니다.',
'',
'## 가장 최근에 성숙한 하루의 실제 선정 예',
'',
'신호일 9월 18일, 진입 가정일 9월 21일, 5번째 거래일 9월 29일입니다. 아래 이름은 현재 종목 마스터의 이름이며 당시 실제 추천 기록이 아닙니다.',
'',
'| 0.65 후보 선정 | 종합점수 | +10% 도달 | 진입일 양봉 | 5일 순수익 |',
'|---|---:|---:|---:|---:|'
])
for pol in fresh['policies']:
 if pol['name']=='balancedEventComposite':
  for p in pol['day']['picks']:
   o=p['outcome'];lines.append(f'| {p["currentMasterName"]} ({p["symbol"]}) | {p["signals"]["overall_score"]} | {"O" if o["touch"] else "X"} | {"O" if o["entryBullish"] else "X"} | {signed(o["net5d"])} |')
lines.extend([
'',
'이 하루는 1/3이 급등에 도달했고 2/3이 −5% 이하 손실이었습니다. 페널티 0.20의 이전 후보는 금강철강 39점·인텍플러스 38점·큐라티스 38점을 선택했습니다. 큐라티스는 +10%를 장중에 찍었지만 5일 순수익은 −16.50%였습니다. 급등 도달률만 높이면 최종 손실이 함께 커질 수 있다는 실제 예입니다. 새로 성숙한 하루 3종목만으로 성능을 확정할 수 없습니다.',
'',
'## 원래 점수 산식이 목표와 어긋난 부분',
'',
'현재 산식은 추세 20%·모멘텀 15%·거래량 25%·변동성 10%·패턴 20%·심리 10%의 고정 합입니다. 이 비중은 5일 +10%·당일 양봉·손실 억제의 실측 결과로 학습된 비중이 아니었습니다. 낮은 ATR부터 고르는 현재 선정 기준도 급등 목표와 직접 일치하지 않습니다.',
'',
'원시 값이 여러 항목에 반복됩니다. 52주 위치, 연속 상승일, 당일 캔들이 서로 다른 항목에 재사용되고, 추세·심리 항목의 상관은 0.88이었습니다. ATR 점수는 3%에서 100점이 되고 8% 이상에서 0점으로 내려가는데, 이 중심값이 급등과 손실을 동시에 최적화한다는 근거는 찾지 못했습니다. 직전 60일 고점 거리도 −5% 이하에서 0점, +5% 이상에서 100점으로 포화됩니다. 현재 종가가 직전 고점보다 높아질 수 있으므로 고점 거리의 부호 자체가 버그인 것은 아닙니다.',
'',
'원래 학습 구간에서 종합점수와 5일 수익의 날짜별 순위 상관은 거의 0(−0.0023)이었습니다. 높게 관측된 기술 지표의 합이 실현 수익·손실의 순서를 충분히 설명하지 못했습니다.',
'',
'이 문제를 확인하려고 6개 항목 비중만 바꾸는 산술·기하 두 가족을 학습했습니다. 내부 평가에서 산술은 손실을 줄였지만 평균 수익이 기존 점수보다 낮았고, 기하는 평균 수익·양봉률 모두 낮아 승격 조건을 통과하지 못했습니다. 이어 중복을 줄인 원시 지표 6개의 효용 학습은 매우 방어적인 점수가 됐습니다. 전체 학습에서는 상승 기여 4개 계수가 사실상 0으로 줄었고, 최근 급등 도달률은 9.44%여서 급등 목표를 달성하지 못했습니다.',
'',
'비선형 사건 모델은 급등 도달을 더 잘 골랐지만 손실 예측의 오차가 컸습니다. 이전 0.20 후보의 최근 선정에서 손실 예측 평균은 28.60%였는데 실제 −5% 손실은 46.37%였습니다. 단순히 학습 모델로 바꾸는 것만으로 위험 예측이 정확해지지는 않았습니다.',
'',
'## 약세장에 방어적으로 바꾸면 해결되는가: 학습 기간만 분석',
'',
'검증·최근 60일의 결과로 시장 조건을 맞추지 않았습니다. KOSPI 20일 수익 < 0, KOSPI 20일선 거리 < 0, 전체 관측 종목의 20일선 위 비율 < 50%라는 자연 경계만 미리 고정해 이전 235일과 원래 학습 80일을 분해했습니다. 기존 선정·쿨다운을 바꾸지 않은 설명 분석이며, 시장 전환 정책을 새로 실행한 결과는 아닙니다.',
'',
'| 학습 구간 / 상승 종목 비율 | 날짜 | 0.65 +10% 도달 | 0.65 −5% 손실 | 0.65 평균 5일 순수익 |',
'|---|---:|---:|---:|---:|'
])
for scope,label in [('earlierActiveInner80','이전 내부 80일'),('originalTrain80Reused','원래 학습 80일')]:
 for group,glabel in [('breadthBelowHalf','50% 미만'),('breadthAtOrAboveHalf','50% 이상')]:
  z=regime['results'][scope][group]['balancedEvent0.65'];s=z['strict'];lines.append(f'| {label} / {glabel} | {z["days"]} | {pct(s["touchRate"])} | {pct(s["loss5Rate"])} | {signed(s["meanD5Net"])} |')
lines.extend([
'',
'관계가 반대로 바뀌었습니다. 이전 내부 구간에서는 상승 종목 비율이 낮은 날의 손실이 컸지만, 원래 학습 구간에서는 높은 날의 손실이 컸습니다. 세 조건 중 하나라도 약한 원래 학습 구간은 도달 41.43%·손실 32.14%였고, 세 조건이 모두 건강한 구간은 도달 30.93%·손실 49.48%였습니다. 따라서 약세라는 이유만으로 후보를 바꾸는 단순 규칙을 지금 적용할 근거는 부족합니다.',
'',
'한편 실제 적격 후보군의 날짜별 ATR 중앙값 평균은 이전 내부 구간 4.41%에서 원래 학습 구간 5.64%로, 실현변동성 중앙값 평균은 42.40%에서 61.79%로 상승했습니다. 단순 시장 상승·하락 부호보다 변동성 수준과 개별 종목 위험의 이동이 더 큰 문제일 수 있습니다. 이는 관측된 차이이며 새 조건의 검증 성공을 뜻하지 않습니다. 모든 날짜의 시장 값·후보군 변동성·선정별 손실을 원장으로 남겼습니다.',
'',
'## 시간 순서·검산·자료 한계',
'',
'이전 자료는 2024-12-26~2025-12-15의 235신호일입니다. 첫 150일 모델은 라벨이 8월 18일까지 성숙한 뒤 8월 19일부터 활성화했습니다. 최초 155일은 원래 종합점수 정책으로 쿨다운 상태를 쌓았고, 이후 내부 80일에서 새 모델을 사용했습니다. 그 최초 구간을 새 모델 성과로 부르지 않았습니다. 전체 235일 재학습 모델의 마지막 라벨은 12월 22일에 성숙했고, 다음날 시작하는 원래 180일 재생에 사용했습니다.',
'',
'원래 자료는 학습 80일·공백 5일·검증 30일·공백 5일·최근 60일입니다. 공백일에도 쿨다운 상태를 유지했습니다. 이 날짜와 결과는 여러 앞선 연구에서 이미 보았기 때문에 외부 진단 구간이라는 표현을 쓰더라도 새로운 독립 표본으로 간주할 수 없습니다.',
'',
'현재 2,431개 종목 마스터·현재 상태가 과거에도 적용돼 상장폐지·당시 후보군 차이의 편향이 있습니다. 이전 235일의 이력 길이는 80~314일로 실제 생산의 320일 준비 길이와 다르고, 52주 미완결 표본은 실제 소스의 중립 처리를 따랐습니다. 5일 보유 결과가 겹쳐 표본들은 독립 시행이 아닙니다. 체결·슬리피지·가격 조정의 완전한 실거래 검증도 아닙니다.',
'',
'독립 검산은 현재 점수 수식 239,869행, 가중치 모델, 원시 효용 모델, 저장된 사건 모델 6개의 학습 입력·라벨·가중치·트리, 최신 균형 정책 1,953일/5,859선정의 원시 5일 가격·예측값·정수 점수·쿨다운·집계에서 불일치 0건을 확인했습니다. 최신 균형 감사에서는 거래량 0인 미래 관측 16건을 그대로 유지했습니다. 수치 재현성 통과는 예측 성능이나 배포 적합성의 통과를 뜻하지 않습니다.',
'',
'## 직접 확인할 자료',
'',
'- [최신 균형 연구 요약](/tmp/composite-score-research-20260930/balanced-event-study/report.json) · [선택한 페널티와 선택 시각](/tmp/composite-score-research-20260930/balanced-event-study/chosen-lambda.json) · [181일 전체 선정 원장](/tmp/composite-score-research-20260930/balanced-event-study/outer-ledger.json) · [내부 6후보 원장](/tmp/composite-score-research-20260930/balanced-event-study/inner-ledger.json)',
'- [학습 기간 시장별 집계](/tmp/composite-score-research-20260930/regime-train-study/report.json) · [모든 학습 날짜·종목·손실](/tmp/composite-score-research-20260930/regime-train-study/daily-regimes-and-losses.json)',
'- [현재 점수 진단](/tmp/composite-score-research-20260930/horizon-report.json) · [항목 가중치 연구](/tmp/composite-score-research-20260930/weight-study/report.json) · [원시 효용 연구](/tmp/composite-score-research-20260930/raw-composite-study/report.json) · [이전 사건 모델 연구](/tmp/composite-score-research-20260930/event-composite-study/report.json)',
'- [최신 균형 독립 감사](/tmp/composite-score-independent-balanced-full-audit-20260930.json) · [사건 모델 독립 감사](/tmp/composite-score-independent-event-model-audit-20260930.json)',
'',
'참고한 1차 자료는 여러 신호의 조합·가중치 탐색에서 과적합 위험을 다룬 [Novy-Marx의 연구](https://www.nber.org/papers/w21329), 유동성과 거래비용을 고려한 주간 역추세 연구인 [de Groot·Huij·Zhou의 논문](https://repub.eur.nl/pub/25718), 52주 최고가 대비 가격 비율을 다룬 [George·Hwang의 논문](https://www.bauer.uh.edu/tgeorge/papers/gh4-paper.pdf)입니다. 각각 다른 시장·보유 기간을 다루므로 국내 주식 3종목의 5일 +10% 성능을 직접 보증하는 근거로 사용하지 않았습니다.',
'',
'현재 단계에서 확보한 것은 재현 가능한 성과와 실패 원인입니다. 최근 60일의 40%·30% 근접만으로 전체 기간의 실패를 지우거나, 낮은 예측 점수를 높은 점수로 보이게 바꾸거나, 실사용 성능 개선이 배포됐다고 주장하지 않습니다.'
])
p=Path('/Users/isaac/Downloads/stock-composite-score-research-final-2026-09-30.md')
p.write_text('\n'.join(lines)+'\n')
print(p, 'bytes', p.stat().st_size, 'lines',len(lines))
