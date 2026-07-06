export const STAGE_4_CALCULATE_SCORES = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 4: 7-카테고리 점수 산정 + rationale 생성 + 최종 3개 선정
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 목표: 30개 종목 → 점수 계산 → rationale 생성 → 최종 3개 선정

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【PART 1】 7개 점수 계산 (각 0-100)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 종목마다 다음 7개 점수 계산:

1. **trend_score** (추세 점수)
   포함 지표: SMA, EMA, ADX, Parabolic SAR, Ichimoku, SuperTrend, Aroon

   계산:
   = (SMA×0.20 + EMA×0.20 + ADX×0.20 + SAR×0.15 + Ichimoku×0.10 + SuperTrend×0.10 + Aroon×0.05)
   + 골든크로스 보너스 (+5점)
   + 완전정배열 보너스 (+5점)

2. **momentum_score** (모멘텀 점수)
   포함 지표: RSI, MACD, Stochastic, Williams %R, ROC, CCI, MFI, KST

   계산:
   = (RSI×0.20 + MACD×0.20 + Stoch×0.15 + Williams×0.10 + ROC×0.10 + CCI×0.10 + MFI×0.10 + KST×0.05)
   + 다이버전스 보너스 (+5점)

3. **volume_score** (거래량 점수)
   포함 지표: 거래량비율, OBV, MFI, CMF, VWAP, Force Index, A/D Line, Chaikin Osc

   계산:
   = (거래량비율×0.25 + OBV×0.20 + MFI×0.15 + CMF×0.15 + VWAP×0.10 + Force×0.05 + A/D×0.05 + Chaikin×0.05)
   + 가격거래량동반 보너스 (+5점)

4. **volatility_score** (변동성 점수)
   포함 지표: ATR, 볼린저밴드, Keltner Channel, Donchian Channel, EMV

   계산:
   = (ATR×0.30 + 볼린저×0.30 + Keltner×0.20 + Donchian×0.15 + EMV×0.05)
   + 스퀴즈 패턴 보너스 (+5점)

5. **pattern_score** (패턴 점수)
   포함 지표: 골든크로스, 지지저항 돌파, 캔들 패턴, Elder Ray, Vortex

   계산:
   = 골든크로스개수×15 + 지지저항돌파×25 + 캔들패턴×20 + ElderRay×20 + Vortex×20

6. **sentiment_score** (심리 점수)
   포함 지표: CCI, Elder Ray, Force Index, MFI, RSI

   계산:
   = (CCI×0.30 + ElderRay×0.25 + Force×0.20 + MFI×0.15 + RSI×0.10)

7. **overall_score** (종합 점수)
   계산:
   = (trend×0.25 + momentum×0.25 + volume×0.20 + volatility×0.15 + pattern×0.10 + sentiment×0.05)

   보너스:
   + 30개 지표 전부 수집 = +10점
   + 25개 이상 수집 = +5점
   + 품질 100% (모두 실제 데이터) = +5점

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【PART 2】 rationale 생성 (각 종목마다)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 종목의 수집된 30개 지표를 기반으로 rationale 문자열 생성:

**rationale 형식:**
"지표1 상태|지표2 상태|지표3 상태|...|지표N 상태"

**규칙:**
✅ 최소 12개 이상 지표 포함
✅ 각 지표는 "지표명 + 구체적 수치 + 상태" 형식
✅ "|" 로 구분
✅ 순서: TIER 1 → TIER 2 → TIER 3
✅ 가격 정보 절대 포함 금지

**좋은 예시:**
"SMA 완전정배열|EMA 골든크로스|RSI 58 강세권|MACD 양전환|거래량 165% 급증|볼린저 중상단|ATR 3.2% 적정|ADX 28 강한추세|OBV 지속상승|스토캐스틱 상승전환|SuperTrend 매수|52주 상위 72%|CCI +125 과열권|Ichimoku 호전|Vortex 상승전환"

**나쁜 예시:**
❌ "매수 추천" (투자 권유)
❌ "목표가 85,000원" (가격 예측)
❌ "좋은 종목" (애매한 표현)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【PART 3】 상위 3개 종목 선정
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**선정 프로세스:**

1단계: 과매수 구간 종목 필터링 (⚠️ 최우선 - 반드시 제외)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
다음 조건 중 **1개라도** 해당되면 즉시 제외:

❌ RSI > 70 (과매수 구간)
❌ Williams %R > -20 (극단적 과매수)
❌ Stochastic %K > 80 (과매수)
❌ 볼린저밴드 상단 돌파 후 상단 밖 (과열)
❌ CCI > 100 (과매수 신호)
❌ MFI > 80 (자금흐름 과열)

**중요:** 이미 과매수 구간인 종목은 추격매수 위험이 높아 절대 선정하지 않습니다.
         눌림목 또는 조정 이후 재상승 초기 종목만 선정합니다.

2단계: overall_score 정렬 및 최종 선정
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
과매수 필터링을 통과한 종목들을 overall_score 내림차순으로 정렬한 후,
당신이 5일 내 10% 급등 가장 확신하는 상위 3개를 선택하세요.

3단계: 예비 후보 확보 (STAGE 5 교체용 - 필수)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
정렬 결과의 4위~10위 종목을 "예비 후보"로 함께 출력하세요.
STAGE 5에서 상위 3개 중 검증 실패 종목이 나오면 이 예비 후보로 교체됩니다.
예비 후보가 없으면 교체가 불가능하므로 반드시 포함하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【PART 4】 최종 출력 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STAGE 4 최종 출력:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 4 완료: 최종 3개 종목 선정
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【종목 1】
ticker: [검색결과_ticker]
name: [검색결과_종목명]
close_price: [검색결과_정수_종가]
rationale: [검색결과_rationale]
signals:
  trend_score: [계산_정수_trend_score]
  momentum_score: [계산_정수_momentum_score]
  volume_score: [계산_정수_volume_score]
  volatility_score: [계산_정수_volatility_score]
  pattern_score: [계산_정수_pattern_score]
  sentiment_score: [계산_정수_sentiment_score]
  overall_score: [계산_정수_overall_score]

【종목 2】
ticker: [검색결과_ticker]
name: [검색결과_종목명]
close_price: [검색결과_정수_종가]
rationale: [검색결과_rationale]
signals:
  trend_score: [계산_정수_trend_score]
  momentum_score: [계산_정수_momentum_score]
  volume_score: [계산_정수_volume_score]
  volatility_score: [계산_정수_volatility_score]
  pattern_score: [계산_정수_pattern_score]
  sentiment_score: [계산_정수_sentiment_score]
  overall_score: [계산_정수_overall_score]

【종목 3】
ticker: [검색결과_ticker]
name: [검색결과_종목명]
close_price: [검색결과_정수_종가]
rationale: [검색결과_rationale]
signals:
  trend_score: [계산_정수_trend_score]
  momentum_score: [계산_정수_momentum_score]
  volume_score: [계산_정수_volume_score]
  volatility_score: [계산_정수_volatility_score]
  pattern_score: [계산_정수_pattern_score]
  sentiment_score: [계산_정수_sentiment_score]
  overall_score: [계산_정수_overall_score]

⚠️ ticker 형식: "KOSPI:005930" 또는 "KOSDAQ:035760" (시장구분:6자리코드)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【예비 후보】 (4위~10위, STAGE 5 교체용)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4위. [ticker] [종목명] - close_price: [정수] - overall_score: [정수] - rationale: [12개 이상 지표]
5위. [ticker] [종목명] - close_price: [정수] - overall_score: [정수] - rationale: [12개 이상 지표]
... (10위까지, 과매수 필터 통과 종목만)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ STAGE 4 완료: 3개 종목 + 예비 후보 데이터 준비 완료
→ STAGE 5로 전달

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이제 위 형식대로 30개 종목 점수 계산 및 상위 3개 선정을 시작하세요!
`;
