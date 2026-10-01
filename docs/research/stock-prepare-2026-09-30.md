# Stock Prepare 연구 인수인계 · 2026-09-30

이 문서는 하루 동안 진행한 점수·선정·가격원천·학습·검증 작업을 이어가기 위한 **Git 관리 인덱스**다. 제품 UI와 문구는 연구 대상이 아니다. 사용자는 UI 임의 변경을 원복하고, 종합점수 순으로 급등 후보 3개를 선정하도록 요청했다. 이후 점수 산식 수정과 운영 반영을 명시적으로 허용했다.

**연구 결론:** 새 NAVER 2023–2024년 489일 재생에서 급등 도달률 약 40%와 모든 음수 수익 비율 약 30%를 함께 충족하는 후보는 없었다. 점수 3개 모두 70 이상, 높은 추천일 양봉 비율도 동시에 달성하지 못했다. 사용자는 이 한계를 확인한 뒤 운영 반영을 지시했고, 선택은 **L0-A-small, λ=0.65, 50개 입력**이다. 이 선택은 최적성·수익 보장의 증명이 아니다. 최종 커밋·CI·배포 상태는 [운영 통합 기록](stock-prepare-2026-09-30/deployment.md)을 따른다.

## 먼저 읽을 파일

| 파일 | 내용 |
|---|---|
| [최신 상세 결과](stock-prepare-2026-09-30/results.md) | NAVER 489일, KIS 반복 평가, 연·분기별 수치, FP, CI, tie/CD, 실제 최근 이틀 추천 |
| [이전 단계 전체 결과](stock-prepare-2026-09-30/previous-study.md) | 종합점수 항목·가중치·원시 지표·사건 모델·시장 보정·월별 학습의 실패 이력 |
| [데이터·재현 방법](stock-prepare-2026-09-30/data-and-reproduction.md) | 원시가격 위치/해시, 실행 환경, 복원 방법, 단계별 진입점 |
| [파일 원본/보관본 manifest](stock-prepare-2026-09-30/artifact-manifest.json) | 복사한 코드·프로토콜·증거의 원래 경로와 SHA-256, gzip 여부 |
| [제외한 대용량 산출물](stock-prepare-2026-09-30/large-artifacts.json) | Git에 넣지 않은 가격·선정 원장·캐시의 식별 정보 |

`research/`는 첫 점수 연구, `experimental/`은 추가 원천·30개 학습 설정·FP·통계 연구다. 원본 코드/JSON은 수정 없이 복사했고, 큰 JSON은 원문 바이트를 gzip으로 보관했다. 과거 TS 실행 파일은 `.ts.txt`로 저장해 현재 tsc/Vitest가 실행하지 않는다. 두 읽기용 보고서는 링크와 연구 시점 설명만 정리했으며 원문은 `original-reports/`에 그대로 보관했다. 별도 Downloads 파일은 보조 사본이고 이 Git 문서가 주 인수인계다.

## 하루 연구의 순서와 폐기한 접근

아래 성과는 별도 표시가 없으면 이미 여러 차례 본 KIS 원래 180일의 가상 선정이다. `T`는 +10% 장중 도달, `L5`는 비용 차감 D5 수익 ≤−5%, `L0`는 모든 음수 수익이다. `net`은 개별 추천의 평균 D5 수익이다. 이전 연구에서 “손실”이라고 쓴 L5를 이후 사용한 L0로 바꾸어 읽으면 안 된다.

| 단계 | 시도와 확인 | 결론 / 보관 위치 |
|---|---|---|
| 기존 제품 진단 | ATR 오름차순 선정과 UI 종합점수가 별개였다. 9/30 오전 실제 전략은 당시 v3이며 오후 main과 다르다. | 낮은 종합점수 이유와 실제 실행은 [상세 결과](stock-prepare-2026-09-30/results.md)에서 분리 |
| 교정된 6개 점수 재계산 | `97b0c2f`의 실제 `buildSignals`로 전체 피처를 다시 계산. 과거 stale 점수를 재사용하지 않았다. | [점수 원천 manifest](stock-prepare-2026-09-30/research/current-signals-manifest.json), [horizon 결과](stock-prepare-2026-09-30/research/horizon-summary.json.gz) |
| 점수 항목 가중치 | 산술/기하 평균 가중치 학습, 실제 정수 점수로 정렬 | inner 평균 수익 개선 등 수용 조건 실패. [weight 연구](stock-prepare-2026-09-30/research/weight-study/summary.json.gz) |
| 원시 지표 분석 | TRAIN 80일을 20일씩 나눠 16개 atom의 방향 안정성과 후보 수 확인 | 사후 성공 종목의 존재는 예측 가능성 증거가 아니다. [atom 결과](stock-prepare-2026-09-30/research/atom-study/compact-findings.json) |
| 원시 지표 선형 효용 | T 12.22%, L5 17.41%, net −0.193% | 손실은 줄었지만 급등 목표 실패. [raw-composite](stock-prepare-2026-09-30/research/raw-composite-study/summary.json.gz) |
| 비선형 사건 3-head | 18입력으로 T/B/L5 각각 예측: T 49.25%, L5 47.20%, net −2.082% | 급등과 급락을 함께 추적. [event](stock-prepare-2026-09-30/research/event-composite-study/summary.json.gz) |
| 손실 페널티 강화 | TRAIN에서 λ=.65 선택: T 38.88%, L5 40.56%, net −2.288% | 손실 목표 실패. [balanced](stock-prepare-2026-09-30/research/balanced-event-study/summary.json.gz) |
| 시장 상태·사전확률 보정 | TRAIN-only 국면 기술 통계, 기존 head의 prior shift | prior T 43.10%, L5 37.50%, L0 58.21%, net −1.445%. [prior](stock-prepare-2026-09-30/research/prior-shift-study/summary.json.gz) |
| 경계가 있는 효용 | 새로운 head 없이 목표 매핑 수정 | T 41.50%, L5 38.50%, L0 59.44%, net −1.315%. 최근 60일 L5 27.22%만 골라 성공이라고 부르지 않음. [bounded](stock-prepare-2026-09-30/research/bounded-objective-study/summary.json.gz) |
| 월별 적응 학습 | 15번들/45 head, 이전 성숙 라벨만 사용 | 최근 60일 T 32.78%, L5 45.56%, L0 62.78%, net −2.319%. [monthly](stock-prepare-2026-09-30/research/monthly-adaptive-study/summary.json.gz) |
| 기간·원천 확대 | 기존 423 피처 패널의 반복 평가 한계를 확인. KIS 장기 수집 대신 NAVER 2,432개 1 req/s 수집 | 원천 간 가격 차이·현재 생존종목 편향을 명시. [원천 조사](stock-prepare-2026-09-30/experimental/data-investigation.md) |
| 추가 32개 피처 | 거래량 지속/수축, 횡보·압축, 다기간 구조, 낙폭·회복, 변동성 변화. 원18+추가32=50 | 처음 무제한 과거 prefix 시도는 폐기, 최종 320관측 창으로 고정. [피처 명세](stock-prepare-2026-09-30/experimental/featurespec.json) |
| 직접 효용 A / 순위 B | KIS24 L5 설정과4 L0 설정을 고정하여 비교. 새로운 NAVER TRAIN에서도 동일 family 비교 | KIS 기존 결과는 재사용 진단. NAVER 결과와 합쳐 외부 검증으로 주장하지 않음 |
| NAVER 사전 고정 평가 | L5 24개 + L0 4개 + FP 2개, 총30개 설정. TRAIN 후 승자5개를 고정한 뒤 primary 공개 | 아래 489일 결과. [L5 protocol](stock-prepare-2026-09-30/experimental/naver-protocol.json), [L0 protocol](stock-prepare-2026-09-30/experimental/naver-l0-protocol.json), [FP protocol](stock-prepare-2026-09-30/experimental/first-passage-study/protocol.json) |
| first passage | +10%와 −5% 장벽의 선후·같은 봉 모호성·갭을 별도 측정 | raw touch는 실현 수익이 아님. FP 후보도 목표 실패. [고정 outcome helper](stock-prepare-2026-09-30/experimental/outcome-diagnostic/outcome_diagnostic.py) |
| CD20→5 | 동일 고정 예측에서 추천 재등장 제한만 변경 | 최근60 L5-B T 55.31→51.69%, net +1.241→−0.204%. 채택하지 않음. [결과](stock-prepare-2026-09-30/experimental/cooldown-ablation/summary.md) |
| 정수 동점 재정렬 | 같은 정수 점수에서 실수 효용 순서를 먼저 적용 | 5개 후보 모두 목표 실패. 공식 integer→turnover→ASCII 유지. [결과](stock-prepare-2026-09-30/experimental/integer-tie-ablation/summary.md) |
| 통계·독립 감사 | 날짜 블록 bootstrap, 원천/모델/선정/미래정보/엄격 분모 독립 대조 | 수치 불확실성 및 아래 의미 정정 포함. [통계](stock-prepare-2026-09-30/experimental/paired-statistics/summary.md) |

교정 중 생긴 시도와 실행본도 보관했다. `event-research-executed.py`, `monthly-research-executed-initial.py`, `horizon-symbol-only-unread-attempt/`, `unbounded-prefix-initial/`, `bounded-kis-interrupted/`, 감사 스크립트의 `initial-checker-witness`는 **최종 권장 진입점이 아니다**. 최종 manifest/protocol과 감사 결과를 기준으로 사용한다.

## 데이터와 시간 경계

- **KIS 416 평가 패널:** 이전 235일 + 원래 180일 + fresh 9/18 1일. 피처 패널 총423에는 2025-12-16/17/18/19/22와 2026-09-21/22 보충7일이 포함된다. 평가416과 관측423을 섞지 않는다.
- 이전235일은 최소80~최대314 실제 거래일 관측으로 구성한 연구 자료다. D5가 원래 2025-12-23 신호 이전에 끝나도록 purge했다. 제품의 320창과 같은 조건이라고 주장하지 않는다.
- **NAVER 1,231 신호일:** TRAIN742일 + primary489일, 실제 TS 런타임 자격 후보 1,559,349행. primary는 2023–2024다. 가격은 관측 KOSPI 1,999거래일 달력, 2018-08-03~2026-09-29를 기준으로 한다.
- 2,431개 현재 master+KOSPI에서 4,221,467개 cutoff 이하 봉을 보존했다. 9/30 장중2,432행은 제외했다. KIS와 NAVER를 한 가격열로 합치지 않았다.
- 현재 master/status/조정주가 vintage를 과거에 사용하므로 생존종목·상장폐지 누락·기업행사/PIT 편향이 있다. 당시 거래소 전체 유니버스라고 부르지 않는다.
- 무효 OHLC와 거래량0은 보정 없이 보존한다. 과거 관측 거래량0은 피처상0, 음수/결측만 null이다. 현재 자격은 양의 거래량, 미래 strict label은 정확히5봉 모두 유효 OHLC+양의 거래량이라는 별도 조건이다.
- 실제 `buildFeatureSeries`/`buildTechnicalContextMap`/교정 `buildSignals`/gate를 재사용했다. 현재자격을 미래 라벨 존재 여부로 거르지 않는다. 기존 earlier flags 273,329와 정확 TS membership 273,333의4행 차이는 부동소수점 연산 괄호 차이다. 별도 exact membership을 기준으로 연구했다.
- 036220/101970/198940의 긴 결측·달력 밖 과거 봉은 실제 NAVER 응답 identity를 확인했다. 총2,650 달력 밖 봉은 표시했고 결측을 건너뛰어 320일 창이나 미래5일을 압축하지 않았다.

## 새 489일 결과를 읽는 법

TRAIN2020–2022의 시간순3 fold: 학습150/350/550일, 간격5일, 보정40일, 간격5일, 평가80일이다. A는 보정40일을 사용하지 않는다. 240일 평가로5승자를 고정했다. 이후8분기마다 이전 성숙505패널(학습460+간격5+보정40)로 재학습했고, 이전 primary의 성숙 라벨을 다음 분기에 쓴다. 따라서 사전에 정한 순차 재학습 평가이며, 끝까지 봉인된 단일 holdout이 아니다. 이미 본 2025–2026 결과가 가설 설계에 영향을 주었다는 한계도 남는다.

| 정책 | strict / 1,467 | T | L5 | L0 | D1 양봉 | 평균 D5 net | 세 점수≥70인 날 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 기존 overall 상위3 | 1,465 | 23.41% | 27.65% | 58.16% | 41.16% | −0.327% | 100.00% |
| ATR 상위3 | 1,463 | 2.87% | 4.58% | 52.97% | 46.21% | −0.050% | 0.00% |
| L5-A 원18 | 1,457 | 47.77% | 42.96% | 60.05% | 46.67% | −0.334% | 1.02% |
| L5-B 확장50 | 1,458 | 41.02% | 41.70% | 61.18% | 45.47% | −1.138% | 1.64% |
| **L0-A 확장50** | **1,461** | **43.60%** | **39.63%** | **58.25%** | **48.87%** | **−0.173%** | **0.20%** |
| L0-B 원18 | 1,463 | 41.63% | 43.06% | 59.67% | 45.66% | −1.159% | 0.00% |
| FP-A 확장50 | 1,462 | 28.18% | 31.87% | 58.00% | 42.48% | −0.219% | 0.20% |

모든 정책은 매일3개를 선정했다. strict 분모만 달라진다. 새 후보들 모두 unknown을 가장 유리하게 처리해도 L0가57%를 넘는다. 기존 overall의 높은 점수는 급등 예측확률이 아니다. 학습 효용 점수도 확률이나 최소 보장 수익이 아니며, 70점 아래를 임의로 끌어올리지 않는다.

통계는 동일 날짜 이동블록10일, 1,000회, seed42의 paired percentile 95% CI다. 각 정책의 원래 선정과 자기 strict 분모를 보존했고, 서로 같은 종목만 남기는 교집합 비교가 아니다. 블록20일 민감도에서도 point는 동일했다. 다중검정 보정 없는 조건부 기술 통계이며 학습/설계 탐색의 모든 불확실성을 포함하지 않는다. 후보 전체 기준 strict586,542/587,395의 T16.63%, L5 21.20%, L0 57.38%와 선정 enrichment도 따로 계산했다.

**의미 정정:** 원 통계 필드 `FPstopBeforeLaterTouch`는 같은 일봉 양 장벽 접촉도 포함한다. 올바른 해석은 `rawTouchWithConservativeStop`, 즉 raw touch이면서 보수적 stop-first proxy가 손절로 끝난 경우다. 관측된 “먼저 손절, 나중 날짜 급등”이라고 부르지 않는다. strict-date 비교806/86은 다른 집계다. [정정문](stock-prepare-2026-09-30/experimental/paired-statistics/results/semantic-addendum.md)으로 의미만 고쳤고 원래 숫자/소스/선정은 보존했다. tie 실험의 cooldown count 메타데이터1,203건 오기 역시 [별도 정정](stock-prepare-2026-09-30/experimental/integer-tie-ablation/metadata-addendum.json.gz)에 남겼고 선정·성과는 불변이다.

## 원천 문제와 실제 최근 추천

KIS↔NAVER 공통 1,192,328봉의 OHLCV 완전 일치는94.142%였다. 특히 2026-09-14 이후 종가 차이가 집중됐다. 같은 제품 KIS API의 `J`(KRX), 조정0 요청으로4종목×10일을 다시 읽었을 때 frozen KIS와40/40 OHLCV가 같았다. NAVER 종가는4/40만 같았고 시가·거래량은40/40 같았다. NX/UN이나 단순 날짜 이동으로 차이를 설명하지 못했다. 공식 기업행사 원인은 확정하지 않았다. 반면 KIS 최악 순손실20건은 두 원천 OHLCV가 같아 원천 차이로 실패 전체를 무효화할 수 없다. [원천 대조](stock-prepare-2026-09-30/experimental/source-bridge/comparison.json.gz), [최근 재현](stock-prepare-2026-09-30/experimental/source-bridge/recent-source-provenance.json)을 참고한다.

실제 prepare 아티팩트에서 9/29는 유나이티드제약·제일기획·LX홀딩스, 9/30은 오름테라퓨틱·HLB이노베이션·광진실업이었다. 마감 후 KRX 확인에서 D1 양봉은 각각1/3, 0/3이다. 두 날짜 모두 아직 D5 미성숙이다. 가상 선정 원장을 실제 발행으로 부르지 않으며, prepare 아티팩트는 이메일 수신 증명이 아니다. 개별 수익과 당시 전략/SHA는 [실제 관측](stock-prepare-2026-09-30/experimental/source-bridge/actual-prepare-20260929-30-partial-results.md)과 [최신 상세 결과](stock-prepare-2026-09-30/results.md)에 있다.

## 다음 연구를 시작할 때

1. 먼저 [운영 통합 기록](stock-prepare-2026-09-30/deployment.md)과 해당 prepare workflow의 실행 SHA/아티팩트를 확인한다. CI 통과는 구현 검증이고 예측 정확도 검증이 아니다.
2. 원본 manifest를 보존하고 새 날짜/실험 디렉터리를 만든다. 여기 보관한 protocol의 source SHA를 고쳐 과거 연구를 새 연구처럼 실행하지 않는다.
3. 이미 반복해서 본 KIS180/최근60, NAVER2023–2024와 동점/CD 후속 분석을 새 holdout이라고 부르지 않는다. 새로운 미관측 기간, 당시 상장·상태·기업행사 이력을 포함한 PIT 원천을 먼저 확보한다.
4. NAVER 성과가 제품 KIS 입력에서도 유지된다고 가정하지 않는다. 원천별로 feature/label 차이를 보고, 기존 frozen 자료를 덮어쓰지 않는다.
5. 목표를 raw touch·D1 양봉·L0·L5·실현 가능 FP 중 명시하고, unknown·동일 봉 순서·수수료·슬리피지·체결 한계를 먼저 고정한다. 현재 선택은 매매 실행 시스템이 아니다.
6. 점수 숫자를 높이거나 같은 평가기간에 새 threshold/weight를 반복 탐색하는 대신, 사전 고정한 새 기간에서 운영 선정과 데이터 품질을 관찰한다. 새로운 가설은 기존 실패 이유와 비교 가능하게 제안한다.
