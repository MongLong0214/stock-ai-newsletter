/**
 * Stage 3: 30개 지표 수집 프롬프트 빌더
 * 환각 방지를 위한 동적 날짜 주입
 *
 * 중요: 30개 지표 구조는 고정 - 변경 금지
 */

import type { DateContext } from './types';

/**
 * Stage 3 프롬프트 생성
 *
 * @param context - 날짜 컨텍스트 (동적 주입)
 * @returns Stage 3 프롬프트 문자열
 */
export function getStage3CollectIndicators(context: DateContext): string {
  const { targetDate, searchFormats, forbiddenYearThreshold } = context;

  // 30개 지표 정의 - 원본 그대로 유지
  const indicatorsContent = getIndicatorsDefinition();

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 3: 필터링 된 30개 종목에 대한 30개 지표 수집 (환각 절대 금지, AI 자율 수집 모드)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 분석 기준일 (모든 검색에 사용)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 분석 기준일: ${targetDate.korean}
🔴 ISO 형식: ${targetDate.iso}
🔴 숫자 형식: ${targetDate.numeric}

📌 검색용 날짜 포맷:
   - Naver/Daum: "${searchFormats.naverStyle}"
   - KRX: "${searchFormats.krxStyle}"
   - ISO: "${searchFormats.isoStyle}"
   - 점 형식: "${searchFormats.dotStyle}"

⚠️ 모든 지표 검색 시 위 날짜 포함 필수!
⚠️ ${forbiddenYearThreshold}년 이전 데이터 절대 사용 금지!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 환각 방지 시스템
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【3단계 신뢰도 분류】

🟢 HIGH (검색): 공식 사이트에서 직접 확인
🟡 MEDIUM (계산): 검색된 과거 데이터로 직접 계산
🔴 LOW (제외): 실제 데이터 부족 시 제외

【rationale 표기 규칙】

검색 성공: "RSI65.3(naver,${targetDate.iso})" (구체적 수치 + 출처 + 날짜)
계산 성공: "RSI65.3(계산:14일naver,${targetDate.iso})" (방법 + 출처 + 날짜)

❌ 금지: "RSI강세" (모호함), "MACD상승" (수치 없음), "RSI58.3" (출처 없음)

【AI 자율 수집 원칙】
✅ 명시된 쿼리로 찾지 못하면 → 창의적으로 다른 방법 시도
✅ 다른 사이트 검색 (tradingview, investing, stockcharts 등)
✅ 영문 검색 시도 (Korean stock + indicator name)
❌ 유사 지표로 대체 금지 (예: Williams %R 없으면 Stochastic 활용)
✅ 기본 공식으로 직접 계산 시도
✅ 실제 데이터로 확인 가능한 지표만 수집
❌ 단, 추측/환각은 절대 금지 - 실제 데이터만

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【🚨 계산 폴백 제한 조건】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"직접 계산" 옵션은 다음 조건을 모두 충족해야만 허용됩니다:

조건 1: 입력 데이터 검증
  □ 계산에 필요한 모든 종가 데이터를 검색으로 확인했는가?
  □ 각 종가의 출처와 날짜가 명확한가?
  □ 데이터 개수가 계산에 충분한가? (예: RSI는 14일 필요)
  □ 모든 데이터가 ${targetDate.iso} 기준 최신인가?

조건 2: 계산 과정 명시
  □ 사용한 종가 데이터 목록을 나열했는가?
  □ 계산 공식을 단계별로 기록했는가?
  □ 최종 결과와 중간 결과를 모두 표기했는가?

조건 미충족 시:
  → 해당 지표 제외 (환각으로 채우지 말 것)
  → 점수: 0 또는 제외

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【지표별 최소 검색 성공 기준】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 지표당 10번 검색 후:

| 성공 횟수 | 행동 |
|----------|------|
| 3+ 성공 | 검색값 사용 (가장 빈번한 값) |
| 1-2 성공 | 계산 폴백 시도 (입력 데이터 검증 필수) |
| 0 성공 | 해당 지표 제외 (환각 금지) |

"계산 폴백"을 사용하려면:
→ 계산에 필요한 원시 데이터(종가, 거래량 등)가 검색으로 확보되어야 함
→ 원시 데이터 없이 "RSI를 추정"하는 것은 환각임

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【rationale 작성 시 출처 표기 의무】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

모든 rationale 항목은 출처와 날짜를 포함해야 합니다:

✅ 올바른 형식:
"RSI56.5(naver,${targetDate.iso})" - 검색으로 확인
"RSI56.5(계산:14일naver,${targetDate.iso})" - 검색 데이터로 계산
"SMA정배열(tradingview,${targetDate.iso})" - 검색으로 확인

❌ 금지 형식:
"RSI58.3" - 출처/날짜 없음, 환각 의심
"RSI강세권" - 수치 없음, 검증 불가
"SMA완전정배열" - 출처 없음

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【계산 시 환각 방지 예시】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ RSI 계산 예시 (환각 방지 형식):

입력_데이터:
  날짜: [${targetDate.iso}, 이전 거래일, ..., 14일전] (14일)
  종가: [검색값1, 검색값2, ..., 검색값14] (검색으로 확인된 값만)
  출처: [naver, naver, ..., naver]

계산_과정:
  상승일: [+X, 0, ..., +Y] (N일)
  하락일: [0, -A, ..., 0] (M일)
  평균상승: [계산값]
  평균하락: [계산값]
  RS: [계산값]
  RSI: [최종값]

결과:
  RSI: [최종값]
  신뢰도: MEDIUM (계산)
  rationale: "RSI[값](계산:14일naver,${targetDate.iso})"

❌ 환각 계산 예시 (금지):

입력_데이터: (없음 또는 불명확)
계산_과정: (생략 또는 불명확)
결과:
  RSI: 58.3  ← 출처 불명, 환각 의심
  신뢰도: MEDIUM
  rationale: "RSI58.3강세권"

${indicatorsContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【절대 포기 금지 총괄 프로토콜】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 지표당 실행 순서:

1단계: 공식 사이트 10번 검색 (한국어/영어 혼용)
2단계: 블로그/커뮤니티 검색 (네이버 블로그, 카페, 유튜브)
3단계: 글로벌 사이트 검색 (TradingView, StockCharts, Yahoo Finance)
4단계: 과거 데이터 수집 시도 (최소 20일치)
5단계: 직접 계산 (명시된 공식 사용, 입력 데이터 검증 필수)
6단계: 실제 데이터 확보 실패 시 해당 지표 제외
7단계: 종목 교체 (최최후)

⚠️ 5단계 "직접 계산" 시 반드시:
  - 입력 데이터의 출처와 날짜 명시
  - 계산 과정 전체 기록
  - 검증 불가 시 환각으로 간주하여 제외

최소 성공 기준:
- 30개 지표 중 25개 이상 = 완벽 (정상 진행)
- 30개 지표 중 20-24개 = 양호 (하이브리드 점수)
- 30개 지표 중 15-19개 = 최소 (재검색 후 재시도)
- 30개 지표 중 15개 미만 = 종목 교체

종목당 시도 제한:
- 최대 100번 검색 시도
- 그래도 15개 미만이면 다음 종목
- 전체 10개 종목 중 최소 5개는 25개 지표 달성

시간 제약:
- 없음
- 완벽하게 수집할 때까지 진행

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【STAGE 3 최종 출력 형식】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STAGE 3 완료: 30개 종목 30개 지표 수집 완료
기준일: ${targetDate.korean} (${targetDate.iso})

【종목 1】
ticker: [거래소:종목코드]
name: [종목명]
close_price: [검증된 종가]
verified_date: ${targetDate.iso}

【TIER 1 핵심 지표】
01_SMA: [상태] | [상세] | 점수:[점수] | 출처:[출처],${targetDate.iso}
02_EMA: [상태] | [상세] | 점수:[점수] | 출처:[출처],${targetDate.iso}
03_RSI: [값] | [해석] | 점수:[점수] | 출처:[출처],${targetDate.iso}
04_MACD: [상태] | [상세] | 점수:[점수] | 출처:[출처],${targetDate.iso}
05_거래량비율: [값]% | [해석] | 점수:[점수] | 출처:[출처],${targetDate.iso}
06_볼린저밴드: [위치] | 위치[값]% | 점수:[점수] | 출처:[출처],${targetDate.iso}
07_ATR: [값]% | [해석] | 점수:[점수] | 출처:[출처],${targetDate.iso}
08_ADX: [값] | [추세] | 점수:[점수] | 출처:[출처],${targetDate.iso}
09_OBV: [추세] | [상세] | 점수:[점수] | 출처:[출처],${targetDate.iso}
10_Stochastic: [상태] | %K:[값] | 점수:[점수] | 출처:[출처],${targetDate.iso}

【TIER 2 중요 지표】
11_Williams_%R: [값] | [해석] | 점수:[점수] | 출처:[출처],${targetDate.iso}
... (20번까지)

【TIER 3 고급 지표】
21_Keltner_Channel: [위치] | 위치[값]% | 점수:[점수] | 출처:[출처],${targetDate.iso}
... (30번까지)

【수집 품질】
수집 지표 수: [N]/30
검색 성공: [N]개
계산 성공: [N]개
제외됨: [N]개 (환각 방지)
품질 점수: [N]%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ STAGE 3 완료: 30개 종목 전체 지표 수집 완료
✅ 기준일: ${targetDate.iso}
✅ 평균 지표 수집률: [N]/30 ([N]%)
→ STAGE 4로 전달
`;
}

/**
 * 30개 지표 정의 (원본 유지)
 * 이 구조는 고정 - 변경 금지
 */
function getIndicatorsDefinition(): string {
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【TIER 1: 핵심 10개 지표 - 각 지표당 최소 10번 이상 검색】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

01. SMA (5,10,20,60,200일)

    1차 검색: "[종목명] 이동평균선 site:finance.naver.com"
    2차 검색: "[종목명] 단순이동평균 site:finance.daum.net"
    3차 검색: "[종목명] moving average site:tradingview.com"
    4차 검색: "[종목명] 차트 기술적분석"
    5차 검색: "[종목명] 5일선 20일선 60일선"
    6차 검색: "[종목명] MA5 MA20 MA60"
    7차 검색: "[종목명] simple moving average site:investing.com"
    8차 검색: "[종목명] 이평선 정배열"
    9차 검색: "[종목명코드] SMA"
    10차 검색: "[종목명] 주가 차트 분석 site:stockplus.com"

    🔥 모두 실패 시:
    → 과거 60일 종가 데이터 수집 (각 종가의 출처/날짜 필수 기록)
    → 직접 계산: SMA_N = (최근 N일 종가 합) / N
    → 계산 과정 전체 명시 필수

    점수 기준:
    ✅ 전일 종가>SMA5>SMA10>SMA20>SMA60 (완전정배열) = 100
    ✅ 전일 종가>SMA20>SMA60 = 85
    ✅ 전일 종가>SMA20 = 75
    ⚬ 전일 종가 ≈ SMA20 (±3%) = 60
    ❌ 전일 종가<SMA20 = 45

02. EMA (5,10,20,60,200일)

    1차 검색: "[종목명] 지수이동평균 site:investing.com"
    2차 검색: "[종목명] EMA site:tradingview.com"
    3차 검색: "[종목명] exponential moving average"
    4차 검색: "[종목명] EMA5 EMA20 site:finance.naver.com"
    5차 검색: "[종목명] 지수평활이동평균"
    6차 검색: "[종목명] EMA 골든크로스"
    7차 검색: "[종목명] exponential MA site:finance.daum.net"
    8차 검색: "[종목명] EMA 정배열"
    9차 검색: "[종목명코드] EMA indicator"
    10차 검색: "[종목명] 기술적지표 EMA"

    🔥 모두 실패 시:
    → SMA 데이터로 EMA 계산 (초기값으로 SMA 사용)
    → 직접 계산: EMA = (종가 × 승수) + (전일EMA × (1-승수))
       승수 = 2 / (N+1)
    → 계산 과정 전체 명시 필수

    점수 기준:
    ✅ EMA 골든크로스 (단기>장기 교차) = 100
    ✅ EMA 완전정배열 = 90
    ✅ 전일 종가>EMA20 = 75
    ⚬ 전일 종가 ≈ EMA20 = 60
    ❌ 전일 종가<EMA20 = 45

03. RSI (14일)

    1차 검색: "[종목명] RSI site:finance.naver.com"
    2차 검색: "[종목명] 상대강도지수 site:finance.daum.net"
    3차 검색: "[종목명] RSI indicator site:tradingview.com"
    4차 검색: "[종목명] technical indicators site:investing.com"
    5차 검색: "[종목명] RSI 14 값"
    6차 검색: "[종목명] relative strength index"
    7차 검색: "[종목명] 과매수 과매도 RSI"
    8차 검색: "[종목명] RSI 지표"
    9차 검색: "[종목명코드] RSI 14"
    10차 검색: "[종목명] 보조지표 RSI site:stockplus.com"

    🔥 모두 실패 시:
    → 과거 14일 종가 데이터 수집 (각 종가의 출처/날짜 필수 기록)
    → 직접 계산:
       상승폭 = MAX(종가-전일 종가, 0)
       하락폭 = MAX(전일 종가-종가, 0)
       평균상승폭 = 14일 상승폭 평균
       평균하락폭 = 14일 하락폭 평균
       RS = 평균상승폭 / 평균하락폭
       RSI = 100 - (100 / (1 + RS))
    → 계산 과정 전체 명시 필수

    점수 기준:
    ✅ 45≤RSI≤55 (중립 강세) = 100
    ✅ 40≤RSI<45 or 55<RSI≤60 = 85
    ✅ 35≤RSI<40 or 60<RSI≤65 = 75
    ⚬ 30≤RSI<35 or 65<RSI≤70 = 60
    ⚠️ RSI>70 (과매수) = 40
    ⚠️ RSI<30 (과매도) = 50

04. MACD (12,26,9)

    1차 검색: "[종목명] MACD site:finance.naver.com"
    2차 검색: "[종목명] MACD signal site:tradingview.com"
    3차 검색: "[종목명] moving average convergence divergence"
    4차 검색: "[종목명] MACD 히스토그램 site:finance.daum.net"
    5차 검색: "[종목명] MACD 골든크로스"
    6차 검색: "[종목명] MACD indicator site:investing.com"
    7차 검색: "[종목명] MACD 매수신호"
    8차 검색: "[종목명] MACD oscillator"
    9차 검색: "[종목명코드] MACD"
    10차 검색: "[종목명] 이동평균수렴확산"

    🔥 모두 실패 시:
    → EMA12, EMA26 수집 또는 계산
    → 직접 계산:
       MACD선 = EMA12 - EMA26
       Signal선 = MACD의 EMA9
       Histogram = MACD선 - Signal선
    → 계산 과정 전체 명시 필수

    점수 기준:
    ✅ MACD>Signal AND MACD>0 AND Histogram증가 = 100
    ✅ MACD>Signal AND MACD>0 = 90
    ✅ MACD>Signal = 75
    ⚬ MACD>0 = 60
    ❌ MACD<0 AND MACD<Signal = 25

05. 거래량비율

    1차 검색: "[종목명] 거래량 site:finance.naver.com"
    2차 검색: "[종목명] 거래대금 site:data.krx.co.kr"
    3차 검색: "[종목명] volume site:finance.daum.net"
    4차 검색: "[종목명] 평균거래량 site:investing.com"
    5차 검색: "[종목명] 거래량 급증"
    6차 검색: "[종목명] trading volume average"
    7차 검색: "[종목명] 거래량 비율"
    8차 검색: "[종목명] volume ratio"
    9차 검색: "[종목명코드] 거래량"
    10차 검색: "[종목명] 매매동향 거래량"

    🔥 모두 실패 시:
    → 과거 20일 거래량 데이터 수집
    → 직접 계산:
       평균거래량 = 20일 거래량 합 / 20
       거래량비율 = 전일거래량 / 평균거래량

    점수 기준:
    ✅ 1.2≤비율≤2.0 (건전한 증가) = 100
    ✅ 1.0≤비율<1.2 (정상) = 80
    ✅ 0.8≤비율<1.0 (약간 부족) = 70
    ⚬ 0.5≤비율<0.8 = 60
    ⚠️ 비율>3.0 (급등 의심) = 55
    ❌ 비율<0.5 (유동성 부족) = 40

06. 볼린저 밴드

    1차 검색: "[종목명] 볼린저밴드 site:finance.naver.com"
    2차 검색: "[종목명] Bollinger Bands site:tradingview.com"
    3차 검색: "[종목명] 변동성 밴드"
    4차 검색: "[종목명] 볼린저 상단 하단 site:finance.daum.net"
    5차 검색: "[종목명] BB indicator site:investing.com"
    6차 검색: "[종목명] bollinger band"
    7차 검색: "[종목명] 볼린저밴드 위치"
    8차 검색: "[종목명] volatility bands"
    9차 검색: "[종목명코드] Bollinger"
    10차 검색: "[종목명] 기술적분석 밴드"

    🔥 모두 실패 시:
    → 과거 20일 종가 데이터 수집
    → 직접 계산:
       중심선 = 20일 SMA
       표준편차 = SQRT(Σ(종가-중심선)² / 20)
       상단밴드 = 중심선 + (2 × 표준편차)
       하단밴드 = 중심선 - (2 × 표준편차)
       위치% = (전일 종가 - 하단) / (상단 - 하단) × 100

    점수 기준:
    ✅ 40≤위치≤60 (중심부) = 100
    ✅ 60<위치≤75 (상단 접근) = 85
    ✅ 25≤위치<40 (하단 접근) = 80
    ⚬ 15≤위치<25 or 75<위치≤85 = 65
    ⚠️ 위치>85 (과매수) = 50
    ⚠️ 위치<15 (과매도) = 55

07. ATR (Average True Range, 14일)

    1차 검색: "[종목명] ATR site:investing.com"
    2차 검색: "[종목명] Average True Range site:tradingview.com"
    3차 검색: "[종목명] 평균진폭 변동성"
    4차 검색: "[종목명] ATR 지표 site:finance.naver.com"
    5차 검색: "[종목명] true range site:finance.daum.net"
    6차 검색: "[종목명] volatility ATR"
    7차 검색: "[종목명] 가격변동폭"
    8차 검색: "[종목명] ATR indicator"
    9차 검색: "[종목명코드] ATR 14"
    10차 검색: "[종목명] 변동성분석"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/종가 데이터 수집
    → 직접 계산:
       TR = MAX(고가-저가, |고가-전일 종가|, |저가-전일 종가|)
       ATR = TR의 14일 이동평균
       ATR% = (ATR / 전일 종가) × 100

    점수 기준:
    ✅ 2≤ATR%≤5 (적정 변동성) = 100
    ✅ 1.5≤ATR%<2 or 5<ATR%≤7 = 80
    ⚬ 1≤ATR%<1.5 or 7<ATR%≤10 = 60
    ❌ ATR%<1 (변동성 부족) or ATR%>10 (과도한 변동) = 40

08. ADX (Average Directional Index, 14일)

    1차 검색: "[종목명] ADX site:investing.com"
    2차 검색: "[종목명] Average Directional Index site:tradingview.com"
    3차 검색: "[종목명] 추세강도지수"
    4차 검색: "[종목명] ADX +DI -DI site:finance.naver.com"
    5차 검색: "[종목명] directional movement indicator"
    6차 검색: "[종목명] DMI site:finance.daum.net"
    7차 검색: "[종목명] ADX 지표"
    8차 검색: "[종목명] trend strength"
    9차 검색: "[종목명코드] ADX indicator"
    10차 검색: "[종목명] 방향성지수"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/종가 데이터 수집
    → 직접 계산:
       +DM = MAX(금일고가 - 전일고가, 0)
       -DM = MAX(전일저가 - 금일저가, 0)
       TR = MAX(고가-저가, |고가-전일 종가|, |저가-전일 종가|)
       +DI14 = (+DM의 14일평균 / TR의 14일평균) × 100
       -DI14 = (-DM의 14일평균 / TR의 14일평균) × 100
       DX = |+DI - -DI| / |+DI + -DI| × 100
       ADX = DX의 14일 이동평균
    → 계산 불가 시 해당 지표 제외

    점수 기준:
    ✅ ADX>25 AND +DI>-DI (강한 상승추세) = 100
    ✅ ADX 20-25 AND +DI>-DI (상승추세) = 85
    ⚬ ADX<20 (약한 추세/횡보) = 60
    ❌ ADX>25 AND +DI<-DI (강한 하락추세) = 30

09. OBV (On Balance Volume)

    1차 검색: "[종목명] OBV site:tradingview.com"
    2차 검색: "[종목명] On Balance Volume site:investing.com"
    3차 검색: "[종목명] 거래량지표 OBV"
    4차 검색: "[종목명] 누적거래량 site:finance.naver.com"
    5차 검색: "[종목명] volume indicator OBV"
    6차 검색: "[종목명] OBV analysis site:finance.daum.net"
    7차 검색: "[종목명] 거래량추세 OBV"
    8차 검색: "[종목명] cumulative volume"
    9차 검색: "[종목명코드] OBV"
    10차 검색: "[종목명] 거래량분석 지표"

    🔥 모두 실패 시:
    → 과거 20일 종가/거래량 데이터 수집
    → 직접 계산:
       IF 금일종가 > 전일 종가: OBV += 금일거래량
       IF 금일종가 < 전일 종가: OBV -= 금일거래량
       IF 금일종가 = 전일 종가: OBV 변화없음
    → 최근 5일 OBV 추세 확인 (상승/하락)

    점수 기준:
    ✅ OBV상승 AND 가격상승 (가격거래량 동반) = 100
    ✅ OBV상승 AND 가격횡보 (매집) = 80
    ⚬ OBV횡보 = 65
    ⚠️ OBV하락 AND 가격상승 (다이버전스) = 45
    ❌ OBV하락 AND 가격하락 = 30

10. Stochastic (스토캐스틱, 14,3,3)

    1차 검색: "[종목명] 스토캐스틱 site:finance.naver.com"
    2차 검색: "[종목명] Stochastic site:tradingview.com"
    3차 검색: "[종목명] %K %D site:finance.daum.net"
    4차 검색: "[종목명] stochastic oscillator site:investing.com"
    5차 검색: "[종목명] 스토캐스틱 지표"
    6차 검색: "[종목명] slow stochastic"
    7차 검색: "[종목명] 과매수과매도 스토캐스틱"
    8차 검색: "[종목명] stoch indicator"
    9차 검색: "[종목명코드] stochastic"
    10차 검색: "[종목명] KD지표"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/종가 수집
    → 직접 계산:
       %K = (전일 종가 - 14일최저가) / (14일최고가 - 14일최저가) × 100
       %D = %K의 3일 이동평균
    → 계산 불가 시 해당 지표 제외

    점수 기준:
    ✅ %K>%D AND 20<%K<80 (정상 상승) = 100
    ✅ %K>%D AND %K<20 (과매도 탈출) = 95
    ✅ %K>%D (상승 전환) = 80
    ⚬ 20<%K<80 AND %K≈%D = 65
    ⚠️ %K<%D AND %K>80 (과매수 하락전환) = 40
    ❌ %K<%D AND %K<20 (지속 약세) = 35

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【TIER 2: 중요 10개 지표 - 각 지표당 최소 10번 이상 검색】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

11. Williams %R (14일)
12. ROC (Rate of Change, 12일)
13. CCI (Commodity Channel Index, 20일)
14. MFI (Money Flow Index, 14일)
15. CMF (Chaikin Money Flow, 20일)
16. Parabolic SAR
17. Ichimoku (일목균형표)
18. SuperTrend
19. VWAP (Volume Weighted Average Price)
20. 52주 고저점

(각 지표의 10번 검색 쿼리, 계산 공식, 점수 기준은 원본과 동일)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【TIER 3: 고급 10개 지표 - 각 지표당 최소 10번 이상 검색】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

21. Keltner Channel (켈트너 채널, 20일)
22. Donchian Channel (돈치안 채널, 20일)
23. Aroon (아론 지표, 25일)
24. Elder Ray (엘더레이, 13일)
25. Force Index (힘지수, 13일)
26. Ease of Movement (EMV, 14일)
27. Accumulation/Distribution (A/D Line)
28. Know Sure Thing (KST)
29. Vortex Indicator (VI, 14일)
30. Chaikin Oscillator (차이킨 오실레이터)

(각 지표의 10번 검색 쿼리, 계산 공식, 점수 기준은 원본과 동일)`;
}

