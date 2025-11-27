export const STAGE_3_COLLECT_INDICATORS = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 3: 필터링 된 30개 종목에 대한 30개 지표 수집 (환각 절대 금지, AI 자율 수집 모드)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 환각 방지 시스템
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【3단계 신뢰도 분류】

🟢 HIGH (검색): 공식 사이트에서 직접 확인
🟡 MEDIUM (계산): 과거 데이터로 직접 계산
🔴 LOW (추정): 패턴 분석으로 추정

【rationale 표기 규칙】

검색 성공: "RSI65.3" (구체적 수치)
계산 성공: "RSI65.3(계산)" (방법 명시)
추정 사용: "RSI추정강세(상승패턴)" (근거 명시)

❌ 금지: "RSI강세" (모호함), "MACD상승" (수치 없음)

【AI 자율 수집 원칙】
✅ 명시된 쿼리로 찾지 못하면 → 창의적으로 다른 방법 시도
✅ 다른 사이트 검색 (tradingview, investing, stockcharts 등)
✅ 영문 검색 시도 (stock ticker + indicator name)
✅ 유사 지표로 대체 (예: Williams %R 없으면 Stochastic 활용)
✅ 기본 공식으로 직접 계산 시도
✅ 어떻게든 해당 지표를 찾아서 수집
❌ 단, 추측/환각은 절대 금지 - 실제 데이터만

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【TIER 1: 핵심 10개 지표 - 각 지표당 최소 10번 이상 검색】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

01. SMA (5,10,20,60,200일)

    1차 검색: "[ticker] moving average site:finance.yahoo.com"
    2차 검색: "[ticker] simple moving average site:tradingview.com"
    3차 검색: "[ticker] SMA technical analysis site:investing.com"
    4차 검색: "[ticker] chart technical analysis"
    5차 검색: "[ticker] 5 day 20 day 60 day moving average"
    6차 검색: "[ticker] MA5 MA20 MA60"
    7차 검색: "[ticker] simple moving average site:stockcharts.com"
    8차 검색: "[ticker] moving average alignment"
    9차 검색: "[ticker] SMA indicators"
    10차 검색: "[ticker] stock chart analysis site:barchart.com"

    🔥 모두 실패 시:
    → 과거 60일 종가 데이터 수집
    → 직접 계산: SMA_N = (최근 N일 종가 합) / N

    점수 기준:
    ✅ 현재가>SMA5>SMA10>SMA20>SMA60 (완전정배열) = 100
    ✅ 현재가>SMA20>SMA60 = 85
    ✅ 현재가>SMA20 = 75
    ⚬ 현재가 ≈ SMA20 (±3%) = 60
    ❌ 현재가<SMA20 = 45

02. EMA (5,10,20,60,200일)

    1차 검색: "[ticker] exponential moving average site:investing.com"
    2차 검색: "[ticker] EMA site:tradingview.com"
    3차 검색: "[ticker] exponential moving average"
    4차 검색: "[ticker] EMA5 EMA20 site:finance.yahoo.com"
    5차 검색: "[ticker] exponential smooth moving average"
    6차 검색: "[ticker] EMA golden cross"
    7차 검색: "[ticker] exponential MA site:stockcharts.com"
    8차 검색: "[ticker] EMA alignment"
    9차 검색: "[ticker] EMA indicator"
    10차 검색: "[ticker] technical indicators EMA"

    🔥 모두 실패 시:
    → SMA 데이터로 EMA 근사 계산
    → 직접 계산: EMA = (종가 × 승수) + (전일EMA × (1-승수))
       승수 = 2 / (N+1)

    점수 기준:
    ✅ EMA 골든크로스 (단기>장기 교차) = 100
    ✅ EMA 완전정배열 = 90
    ✅ 현재가>EMA20 = 75
    ⚬ 현재가 ≈ EMA20 = 60
    ❌ 현재가<EMA20 = 45

03. RSI (14일)

    1차 검색: "[ticker] RSI site:finance.yahoo.com"
    2차 검색: "[ticker] relative strength index site:tradingview.com"
    3차 검색: "[ticker] RSI indicator site:investing.com"
    4차 검색: "[ticker] technical indicators site:finviz.com"
    5차 검색: "[ticker] RSI 14 value"
    6차 검색: "[ticker] relative strength index"
    7차 검색: "[ticker] overbought oversold RSI"
    8차 검색: "[ticker] RSI indicator"
    9차 검색: "[ticker] RSI 14"
    10차 검색: "[ticker] momentum indicators RSI site:stockcharts.com"

    🔥 모두 실패 시:
    → 과거 14일 종가 데이터 수집
    → 직접 계산:
       상승폭 = MAX(종가-전일종가, 0)
       하락폭 = MAX(전일종가-종가, 0)
       평균상승폭 = 14일 상승폭 평균
       평균하락폭 = 14일 하락폭 평균
       RS = 평균상승폭 / 평균하락폭
       RSI = 100 - (100 / (1 + RS))

    점수 기준:
    ✅ 45≤RSI≤55 (중립 강세) = 100
    ✅ 40≤RSI<45 or 55<RSI≤60 = 85
    ✅ 35≤RSI<40 or 60<RSI≤65 = 75
    ⚬ 30≤RSI<35 or 65<RSI≤70 = 60
    ⚠️ RSI>70 (과매수) = 40
    ⚠️ RSI<30 (과매도) = 50

04. MACD (12,26,9)

    1차 검색: "[ticker] MACD site:finance.yahoo.com"
    2차 검색: "[ticker] MACD signal site:tradingview.com"
    3차 검색: "[ticker] moving average convergence divergence"
    4차 검색: "[ticker] MACD histogram site:investing.com"
    5차 검색: "[ticker] MACD golden cross"
    6차 검색: "[ticker] MACD indicator site:stockcharts.com"
    7차 검색: "[ticker] MACD buy signal"
    8차 검색: "[ticker] MACD oscillator"
    9차 검색: "[ticker] MACD"
    10차 검색: "[ticker] momentum indicator MACD"

    🔥 모두 실패 시:
    → EMA12, EMA26 수집 또는 계산
    → 직접 계산:
       MACD선 = EMA12 - EMA26
       Signal선 = MACD의 EMA9
       Histogram = MACD선 - Signal선

    점수 기준:
    ✅ MACD>Signal AND MACD>0 AND Histogram증가 = 100
    ✅ MACD>Signal AND MACD>0 = 90
    ✅ MACD>Signal = 75
    ⚬ MACD>0 = 60
    ❌ MACD<0 AND MACD<Signal = 25

05. 거래량비율

    1차 검색: "[ticker] volume site:finance.yahoo.com"
    2차 검색: "[ticker] trading volume site:nasdaq.com"
    3차 검색: "[ticker] volume site:investing.com"
    4차 검색: "[ticker] average volume site:finviz.com"
    5차 검색: "[ticker] volume surge"
    6차 검색: "[ticker] trading volume average"
    7차 검색: "[ticker] volume ratio"
    8차 검색: "[ticker] volume indicator"
    9차 검색: "[ticker] volume analysis"
    10차 검색: "[ticker] trading activity volume"

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

    1차 검색: "[ticker] Bollinger Bands site:finance.yahoo.com"
    2차 검색: "[ticker] Bollinger Bands site:tradingview.com"
    3차 검색: "[ticker] volatility bands"
    4차 검색: "[ticker] Bollinger upper lower site:investing.com"
    5차 검색: "[ticker] BB indicator site:stockcharts.com"
    6차 검색: "[ticker] bollinger band"
    7차 검색: "[ticker] Bollinger Band position"
    8차 검색: "[ticker] volatility bands"
    9차 검색: "[ticker] Bollinger"
    10차 검색: "[ticker] technical analysis bands"

    🔥 모두 실패 시:
    → 과거 20일 종가 데이터 수집
    → 직접 계산:
       중심선 = 20일 SMA
       표준편차 = SQRT(Σ(종가-중심선)² / 20)
       상단밴드 = 중심선 + (2 × 표준편차)
       하단밴드 = 중심선 - (2 × 표준편차)
       위치% = (현재가 - 하단) / (상단 - 하단) × 100

    점수 기준:
    ✅ 40≤위치≤60 (중심부) = 100
    ✅ 60<위치≤75 (상단 접근) = 85
    ✅ 25≤위치<40 (하단 접근) = 80
    ⚬ 15≤위치<25 or 75<위치≤85 = 65
    ⚠️ 위치>85 (과매수) = 50
    ⚠️ 위치<15 (과매도) = 55

07. ATR (Average True Range, 14일)

    1차 검색: "[ticker] ATR site:investing.com"
    2차 검색: "[ticker] Average True Range site:tradingview.com"
    3차 검색: "[ticker] volatility ATR"
    4차 검색: "[ticker] ATR indicator site:finance.yahoo.com"
    5차 검색: "[ticker] true range site:stockcharts.com"
    6차 검색: "[ticker] volatility ATR"
    7차 검색: "[ticker] price range volatility"
    8차 검색: "[ticker] ATR indicator"
    9차 검색: "[ticker] ATR 14"
    10차 검색: "[ticker] volatility analysis"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/종가 데이터 수집
    → 직접 계산:
       TR = MAX(고가-저가, |고가-전일종가|, |저가-전일종가|)
       ATR = TR의 14일 이동평균
       ATR% = (ATR / 현재가) × 100

    점수 기준:
    ✅ 2≤ATR%≤5 (적정 변동성) = 100
    ✅ 1.5≤ATR%<2 or 5<ATR%≤7 = 80
    ⚬ 1≤ATR%<1.5 or 7<ATR%≤10 = 60
    ❌ ATR%<1 (변동성 부족) or ATR%>10 (과도한 변동) = 40

08. ADX (Average Directional Index, 14일)

    1차 검색: "[ticker] ADX site:investing.com"
    2차 검색: "[ticker] Average Directional Index site:tradingview.com"
    3차 검색: "[ticker] trend strength indicator"
    4차 검색: "[ticker] ADX +DI -DI site:finance.yahoo.com"
    5차 검색: "[ticker] directional movement indicator"
    6차 검색: "[ticker] DMI site:stockcharts.com"
    7차 검색: "[ticker] ADX indicator"
    8차 검색: "[ticker] trend strength"
    9차 검색: "[ticker] ADX indicator"
    10차 검색: "[ticker] directional index"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/종가 데이터 수집
    → 직접 계산:
       +DM = MAX(금일고가 - 전일고가, 0)
       -DM = MAX(전일저가 - 금일저가, 0)
       TR = MAX(고가-저가, |고가-전일종가|, |저가-전일종가|)
       +DI14 = (+DM의 14일평균 / TR의 14일평균) × 100
       -DI14 = (-DM의 14일평균 / TR의 14일평균) × 100
       DX = |+DI - -DI| / |+DI + -DI| × 100
       ADX = DX의 14일 이동평균
    → 계산 불가 시 대체: 최근 10일 중 상승일 개수로 추세 강도 유추

    점수 기준:
    ✅ ADX>25 AND +DI>-DI (강한 상승추세) = 100
    ✅ ADX 20-25 AND +DI>-DI (상승추세) = 85
    ⚬ ADX<20 (약한 추세/횡보) = 60
    ❌ ADX>25 AND +DI<-DI (강한 하락추세) = 30

09. OBV (On Balance Volume)

    1차 검색: "[ticker] OBV site:tradingview.com"
    2차 검색: "[ticker] On Balance Volume site:investing.com"
    3차 검색: "[ticker] volume indicator OBV"
    4차 검색: "[ticker] cumulative volume site:finance.yahoo.com"
    5차 검색: "[ticker] volume indicator OBV"
    6차 검색: "[ticker] OBV analysis site:stockcharts.com"
    7차 검색: "[ticker] volume trend OBV"
    8차 검색: "[ticker] cumulative volume"
    9차 검색: "[ticker] OBV"
    10차 검색: "[ticker] volume analysis indicator"

    🔥 모두 실패 시:
    → 과거 20일 종가/거래량 데이터 수집
    → 직접 계산:
       IF 금일종가 > 전일종가: OBV += 금일거래량
       IF 금일종가 < 전일종가: OBV -= 금일거래량
       IF 금일종가 = 전일종가: OBV 변화없음
    → 최근 5일 OBV 추세 확인 (상승/하락)

    점수 기준:
    ✅ OBV상승 AND 가격상승 (가격거래량 동반) = 100
    ✅ OBV상승 AND 가격횡보 (매집) = 80
    ⚬ OBV횡보 = 65
    ⚠️ OBV하락 AND 가격상승 (다이버전스) = 45
    ❌ OBV하락 AND 가격하락 = 30

10. Stochastic (스토캐스틱, 14,3,3)

    1차 검색: "[ticker] Stochastic site:finance.yahoo.com"
    2차 검색: "[ticker] Stochastic site:tradingview.com"
    3차 검색: "[ticker] %K %D site:investing.com"
    4차 검색: "[ticker] stochastic oscillator site:stockcharts.com"
    5차 검색: "[ticker] stochastic indicator"
    6차 검색: "[ticker] slow stochastic"
    7차 검색: "[ticker] overbought oversold stochastic"
    8차 검색: "[ticker] stoch indicator"
    9차 검색: "[ticker] stochastic"
    10차 검색: "[ticker] KD indicator"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/종가 수집
    → 직접 계산:
       %K = (현재가 - 14일최저가) / (14일최고가 - 14일최저가) × 100
       %D = %K의 3일 이동평균
    → 계산 불가 시: RSI로 대체 (%K ≈ RSI 유사 패턴)

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

    1차 검색: "[ticker] Williams site:investing.com"
    2차 검색: "[ticker] Williams %R site:tradingview.com"
    3차 검색: "[ticker] Williams Percent Range"
    4차 검색: "[ticker] Williams site:finance.yahoo.com"
    5차 검색: "[ticker] %R indicator"
    6차 검색: "[ticker] Williams oscillator site:stockcharts.com"
    7차 검색: "[ticker] Williams percent"
    8차 검색: "[ticker] williams %R 14"
    9차 검색: "[ticker] Williams"
    10차 검색: "[ticker] overbought oversold Williams"

    🔥 모두 실패 시:
    → Stochastic 데이터로 변환 계산
    → 직접 계산: %R = -100 × (14일최고가 - 현재가) / (14일최고가 - 14일최저가)
    → 또는 %R = Stochastic %K - 100

    점수 기준:
    ✅ -50<%R<-20 (중립) = 100
    ✅ -20<%R<0 (과매수 주의) = 75
    ✅ -80<%R<-50 (침체) = 70
    ⚠️ %R>-20 (과매수) = 50
    ⚠️ %R<-80 (과매도) = 55

12. ROC (Rate of Change, 12일)

    1차 검색: "[ticker] ROC site:tradingview.com"
    2차 검색: "[ticker] Rate of Change"
    3차 검색: "[ticker] price rate of change site:investing.com"
    4차 검색: "[ticker] ROC indicator site:finance.yahoo.com"
    5차 검색: "[ticker] price rate of change"
    6차 검색: "[ticker] ROC indicator site:stockcharts.com"
    7차 검색: "[ticker] momentum ROC"
    8차 검색: "[ticker] price change rate"
    9차 검색: "[ticker] ROC"
    10차 검색: "[ticker] momentum indicator"

    🔥 모두 실패 시:
    → 과거 12일 종가 데이터 수집
    → 직접 계산: ROC = ((현재가 - 12일전종가) / 12일전종가) × 100

    점수 기준:
    ✅ 0<ROC≤5 (건전한 상승) = 100
    ✅ 5<ROC≤10 (강한 상승) = 90
    ⚬ -5≤ROC<0 (약세) = 60
    ⚠️ ROC>15 (과열) = 50
    ❌ ROC<-10 (급락) = 35

13. CCI (Commodity Channel Index, 20일)

    1차 검색: "[ticker] CCI site:investing.com"
    2차 검색: "[ticker] Commodity Channel Index"
    3차 검색: "[ticker] CCI indicator site:tradingview.com"
    4차 검색: "[ticker] channel index site:finance.yahoo.com"
    5차 검색: "[ticker] CCI indicator"
    6차 검색: "[ticker] CCI 20 site:stockcharts.com"
    7차 검색: "[ticker] commodity index"
    8차 검색: "[ticker] CCI oscillator"
    9차 검색: "[ticker] CCI"
    10차 검색: "[ticker] channel index"

    🔥 모두 실패 시:
    → 과거 20일 고가/저가/종가 수집
    → 직접 계산:
       TP (Typical Price) = (고가 + 저가 + 종가) / 3
       SMA_TP = TP의 20일 이동평균
       MD (Mean Deviation) = |TP - SMA_TP|의 20일 평균
       CCI = (TP - SMA_TP) / (0.015 × MD)

    점수 기준:
    ✅ -100<CCI<100 (정상) = 100
    ✅ 100<CCI<200 (상승 모멘텀) = 85
    ⚬ CCI≈0 (중립) = 70
    ⚠️ CCI>200 (과매수) = 50
    ⚠️ CCI<-200 (과매도) = 55

14. MFI (Money Flow Index, 14일)

    1차 검색: "[ticker] MFI site:investing.com"
    2차 검색: "[ticker] Money Flow Index site:tradingview.com"
    3차 검색: "[ticker] money flow index"
    4차 검색: "[ticker] MFI indicator site:finance.yahoo.com"
    5차 검색: "[ticker] money flow site:stockcharts.com"
    6차 검색: "[ticker] MFI 14"
    7차 검색: "[ticker] volume weighted RSI"
    8차 검색: "[ticker] money inflow"
    9차 검색: "[ticker] MFI"
    10차 검색: "[ticker] volume RSI"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/종가/거래량 수집
    → 직접 계산:
       TP = (고가 + 저가 + 종가) / 3
       MF (Money Flow) = TP × 거래량
       IF 금일TP > 전일TP: Positive MF
       IF 금일TP < 전일TP: Negative MF
       MFI = 100 - (100 / (1 + (Positive MF 14일합 / Negative MF 14일합)))
    → 계산 불가 시: RSI + 거래량 조합으로 유추

    점수 기준:
    ✅ 40≤MFI≤60 (중립) = 100
    ✅ 60<MFI≤70 (자금 유입) = 85
    ⚬ 30≤MFI<40 (자금 이탈) = 65
    ⚠️ MFI>80 (과매수) = 45
    ⚠️ MFI<20 (과매도) = 50

15. CMF (Chaikin Money Flow, 20일)

    1차 검색: "[ticker] Chaikin Money Flow site:tradingview.com"
    2차 검색: "[ticker] CMF site:investing.com"
    3차 검색: "[ticker] Chaikin money flow"
    4차 검색: "[ticker] Chaikin indicator site:finance.yahoo.com"
    5차 검색: "[ticker] money flow CMF"
    6차 검색: "[ticker] CMF indicator site:stockcharts.com"
    7차 검색: "[ticker] accumulation distribution flow"
    8차 검색: "[ticker] money flow Chaikin"
    9차 검색: "[ticker] CMF"
    10차 검색: "[ticker] accumulation distribution indicator"

    🔥 모두 실패 시:
    → 과거 20일 고가/저가/종가/거래량 수집
    → 직접 계산:
       MFM = ((종가 - 저가) - (고가 - 종가)) / (고가 - 저가)
       MFV = MFM × 거래량
       CMF = 20일 MFV 합 / 20일 거래량 합

    점수 기준:
    ✅ 0.05<CMF<0.25 (자금 유입) = 100
    ✅ 0<CMF≤0.05 (약한 유입) = 80
    ⚬ -0.05≤CMF≤0 (중립) = 65
    ❌ CMF<-0.1 (자금 이탈) = 40

16. Parabolic SAR

    1차 검색: "[ticker] Parabolic SAR site:tradingview.com"
    2차 검색: "[ticker] SAR site:investing.com"
    3차 검색: "[ticker] stop and reverse"
    4차 검색: "[ticker] parabolic SAR site:finance.yahoo.com"
    5차 검색: "[ticker] parabolic indicator"
    6차 검색: "[ticker] SAR indicator site:stockcharts.com"
    7차 검색: "[ticker] parabolic stop"
    8차 검색: "[ticker] trend reversal point"
    9차 검색: "[ticker] parabolic SAR"
    10차 검색: "[ticker] stop loss indicator"

    🔥 모두 실패 시:
    → 과거 10일 고가/저가 데이터 수집
    → 직접 계산 (복잡하므로 간소화):
       IF 상승추세: SAR = 전일SAR + AF × (최근고점 - 전일SAR)
       IF 하락추세: SAR = 전일SAR - AF × (전일SAR - 최근저점)
       AF (가속인자) = 0.02 (최대 0.2)
    → 계산 불가 시: 추세 전환점 패턴으로 유추 (지지/저항 돌파)

    점수 기준:
    ✅ SAR<현재가 AND 상승추세 = 100
    ⚬ SAR<현재가 = 75
    ⚬ SAR≈현재가 (전환점) = 60
    ❌ SAR>현재가 AND 하락추세 = 35

17. Ichimoku (일목균형표)

    1차 검색: "[ticker] Ichimoku Cloud site:tradingview.com"
    2차 검색: "[ticker] Ichimoku site:investing.com"
    3차 검색: "[ticker] Ichimoku indicator site:stockcharts.com"
    4차 검색: "[ticker] ichimoku indicator site:finance.yahoo.com"
    5차 검색: "[ticker] conversion base line"
    6차 검색: "[ticker] kumo cloud ichimoku"
    7차 검색: "[ticker] Ichimoku chart"
    8차 검색: "[ticker] kumo cloud"
    9차 검색: "[ticker] ichimoku"
    10차 검색: "[ticker] leading span"

    🔥 모두 실패 시:
    → 과거 52일 고가/저가 데이터 수집
    → 직접 계산:
       전환선 = (9일최고가 + 9일최저가) / 2
       기준선 = (26일최고가 + 26일최저가) / 2
       선행스팬1 = (전환선 + 기준선) / 2 (26일 선행)
       선행스팬2 = (52일최고가 + 52일최저가) / 2 (26일 선행)
       후행스팬 = 당일종가 (26일 후행)
    → 계산 불가 시: 이동평균 조합으로 근사

    점수 기준:
    ✅ 현재가>구름대 AND 전환선>기준선 = 100
    ✅ 현재가>구름대 = 85
    ⚬ 현재가=구름대 (균형) = 65
    ❌ 현재가<구름대 = 40

18. SuperTrend

    1차 검색: "[ticker] SuperTrend site:tradingview.com"
    2차 검색: "[ticker] super trend indicator"
    3차 검색: "[ticker] SuperTrend site:investing.com"
    4차 검색: "[ticker] SuperTrend indicator"
    5차 검색: "[ticker] super trend site:stockcharts.com"
    6차 검색: "[ticker] trend following indicator"
    7차 검색: "[ticker] trend following indicator"
    8차 검색: "[ticker] ATR trend"
    9차 검색: "[ticker] SuperTrend"
    10차 검색: "[ticker] SuperTrend buy sell"

    🔥 모두 실패 시:
    → ATR 데이터 수집 또는 계산
    → 직접 계산:
       기본 상단밴드 = (고가 + 저가) / 2 + (승수 × ATR)
       기본 하단밴드 = (고가 + 저가) / 2 - (승수 × ATR)
       승수 = 3 (기본값)
       IF 상승추세: SuperTrend = 하단밴드
       IF 하락추세: SuperTrend = 상단밴드
    → 계산 불가 시: ATR + 이동평균 조합으로 근사

    점수 기준:
    ✅ SuperTrend<현재가 AND 상승추세 = 100
    ✅ SuperTrend<현재가 = 80
    ⚬ 추세 전환 중 = 60
    ❌ SuperTrend>현재가 AND 하락추세 = 35

19. VWAP (Volume Weighted Average Price)

    1차 검색: "[ticker] VWAP site:tradingview.com"
    2차 검색: "[ticker] Volume Weighted Average Price"
    3차 검색: "[ticker] VWAP site:investing.com"
    4차 검색: "[ticker] VWAP indicator site:finance.yahoo.com"
    5차 검색: "[ticker] volume weighted price"
    6차 검색: "[ticker] VWAP site:stockcharts.com"
    7차 검색: "[ticker] volume average price"
    8차 검색: "[ticker] VWAP indicator"
    9차 검색: "[ticker] VWAP"
    10차 검색: "[ticker] buying pressure VWAP"

    🔥 모두 실패 시:
    → 당일 분봉 데이터 수집 (고가/저가/종가/거래량)
    → 직접 계산:
       TP = (고가 + 저가 + 종가) / 3
       TPV = TP × 거래량
       VWAP = Σ(TPV) / Σ(거래량)
    → 당일 데이터 없으면 최근 5일 평균으로 근사

    점수 기준:
    ✅ 현재가>VWAP (매수세 우세) = 100
    ⚬ 현재가≈VWAP (±1%) = 70
    ❌ 현재가<VWAP (매도세 우세) = 45

20. 52주 고저점

    1차 검색: "[ticker] 52 week high low site:finance.yahoo.com"
    2차 검색: "[ticker] 52week high low site:investing.com"
    3차 검색: "[ticker] yearly high low site:nasdaq.com"
    4차 검색: "[ticker] 1 year high low site:marketwatch.com"
    5차 검색: "[ticker] 52 week new high"
    6차 검색: "[ticker] yearly high low"
    7차 검색: "[ticker] 52 week price range"
    8차 검색: "[ticker] annual price range"
    9차 검색: "[ticker] 52week"
    10차 검색: "[ticker] yearly high low"

    🔥 모두 실패 시:
    → 과거 250일(거래일 기준 1년) 종가 데이터 수집
    → 직접 계산:
       52주고점 = 250일 중 최고가
       52주저점 = 250일 중 최저가
       현재위치% = (현재가 - 저점) / (고점 - 저점) × 100
    → 250일 데이터 없으면 최근 6개월(120일)로 대체

    점수 기준:
    ✅ 현재위치 70-85% (건전한 상승) = 100
    ✅ 현재위치 50-70% (중간) = 80
    ⚬ 현재위치 30-50% (하단) = 65
    ⚠️ 현재위치 85%+ (고점 근처) = 55
    ❌ 현재위치 30%- (저점 근처) = 50

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【TIER 3: 고급 10개 지표 - 각 지표당 최소 10번 이상 검색】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

21. Keltner Channel (켈트너 채널, 20일)

    1차 검색: "[ticker] Keltner Channel site:tradingview.com"
    2차 검색: "[ticker] Keltner Channel site:investing.com"
    3차 검색: "[ticker] Keltner indicator"
    4차 검색: "[ticker] keltner band site:finance.yahoo.com"
    5차 검색: "[ticker] ATR channel"
    6차 검색: "[ticker] Keltner indicator site:stockcharts.com"
    7차 검색: "[ticker] keltner envelope"
    8차 검색: "[ticker] volatility channel"
    9차 검색: "[ticker] keltner"
    10차 검색: "[ticker] ATR band"

    🔥 모두 실패 시:
    → EMA20, ATR14 데이터 수집
    → 직접 계산:
       중심선 = EMA20
       상단 = EMA20 + (2 × ATR14)
       하단 = EMA20 - (2 × ATR14)
       위치% = (현재가 - 하단) / (상단 - 하단) × 100

    점수 기준:
    ✅ 40≤위치≤60 (중심부) = 100
    ✅ 60<위치≤75 (상단 접근) = 85
    ⚬ 25≤위치<40 or 75<위치≤85 = 70
    ⚠️ 위치>85 or 위치<25 = 50

22. Donchian Channel (돈치안 채널, 20일)

    1차 검색: "[ticker] Donchian Channel site:tradingview.com"
    2차 검색: "[ticker] Donchian Channel site:investing.com"
    3차 검색: "[ticker] Donchian indicator"
    4차 검색: "[ticker] price channel site:finance.yahoo.com"
    5차 검색: "[ticker] price channel"
    6차 검색: "[ticker] Donchian indicator site:stockcharts.com"
    7차 검색: "[ticker] breakout channel"
    8차 검색: "[ticker] breakout channel"
    9차 검색: "[ticker] donchian"
    10차 검색: "[ticker] high low channel"

    🔥 모두 실패 시:
    → 과거 20일 고가/저가 데이터 수집
    → 직접 계산:
       상단 = 20일 최고가
       하단 = 20일 최저가
       중간선 = (상단 + 하단) / 2
       위치% = (현재가 - 하단) / (상단 - 하단) × 100

    점수 기준:
    ✅ 현재가 = 상단 (신고가 돌파) = 100
    ✅ 70≤위치<100 (상단 근접) = 85
    ⚬ 40≤위치<70 = 70
    ❌ 현재가 = 하단 (신저가) = 35

23. Aroon (아론 지표, 25일)

    1차 검색: "[ticker] Aroon site:tradingview.com"
    2차 검색: "[ticker] Aroon indicator site:investing.com"
    3차 검색: "[ticker] Aroon indicator"
    4차 검색: "[ticker] aroon up down site:finance.yahoo.com"
    5차 검색: "[ticker] trend indicator aroon"
    6차 검색: "[ticker] Aroon site:stockcharts.com"
    7차 검색: "[ticker] trend strength aroon"
    8차 검색: "[ticker] aroon oscillator"
    9차 검색: "[ticker] aroon"
    10차 검색: "[ticker] trend strength aroon"

    🔥 모두 실패 시:
    → 과거 25일 고가/저가 데이터 수집
    → 직접 계산:
       Aroon Up = ((25 - 최고가이후일수) / 25) × 100
       Aroon Down = ((25 - 최저가이후일수) / 25) × 100
       Aroon Oscillator = Aroon Up - Aroon Down

    점수 기준:
    ✅ Aroon Up>70 AND Aroon Down<30 (강한 상승) = 100
    ✅ Aroon Up>50 = 80
    ⚬ Aroon Up≈Aroon Down (횡보) = 60
    ❌ Aroon Up<30 AND Aroon Down>70 (강한 하락) = 35

24. Elder Ray (엘더레이, 13일)

    1차 검색: "[ticker] Elder Ray site:tradingview.com"
    2차 검색: "[ticker] Elder Ray site:investing.com"
    3차 검색: "[ticker] Elder Ray indicator"
    4차 검색: "[ticker] bull power bear power"
    5차 검색: "[ticker] bull power bear power"
    6차 검색: "[ticker] Elder indicator site:finance.yahoo.com"
    7차 검색: "[ticker] elder ray power"
    8차 검색: "[ticker] buying selling pressure"
    9차 검색: "[ticker] elder"
    10차 검색: "[ticker] Elder Ray analysis"

    🔥 모두 실패 시:
    → EMA13, 고가, 저가 데이터 수집
    → 직접 계산:
       Bull Power = 고가 - EMA13
       Bear Power = 저가 - EMA13

    점수 기준:
    ✅ Bull>0 AND Bear>0 (강한 매수세) = 100
    ✅ Bull>0 AND Bear<0 BUT Bear상승 = 85
    ⚬ Bull>0 AND Bear<0 = 70
    ❌ Bull<0 AND Bear<0 (강한 매도세) = 35

25. Force Index (힘지수, 13일)

    1차 검색: "[ticker] Force Index site:tradingview.com"
    2차 검색: "[ticker] Force Index site:investing.com"
    3차 검색: "[ticker] Force indicator"
    4차 검색: "[ticker] force index 13"
    5차 검색: "[ticker] trading strength index"
    6차 검색: "[ticker] Force Index site:stockcharts.com"
    7차 검색: "[ticker] volume force"
    8차 검색: "[ticker] trading pressure index"
    9차 검색: "[ticker] force"
    10차 검색: "[ticker] Elder Force Index"

    🔥 모두 실패 시:
    → 과거 13일 종가/거래량 데이터 수집
    → 직접 계산:
       Force Index = (종가 - 전일종가) × 거래량
       Force Index(13) = Force Index의 EMA13

    점수 기준:
    ✅ Force>0 AND 증가 (강한 매수압력) = 100
    ✅ Force>0 (매수압력) = 80
    ⚬ Force≈0 (균형) = 65
    ❌ Force<0 AND 감소 (강한 매도압력) = 35

26. Ease of Movement (EMV, 14일)

    1차 검색: "[ticker] Ease of Movement site:tradingview.com"
    2차 검색: "[ticker] EMV site:investing.com"
    3차 검색: "[ticker] ease movement indicator"
    4차 검색: "[ticker] ease of movement"
    5차 검색: "[ticker] EMV indicator"
    6차 검색: "[ticker] arms ease site:finance.yahoo.com"
    7차 검색: "[ticker] volume ease"
    8차 검색: "[ticker] volume movement"
    9차 검색: "[ticker] EMV"
    10차 검색: "[ticker] ease of movement indicator"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가/거래량 데이터 수집
    → 직접 계산:
       Distance Moved = ((고가 + 저가) / 2) - ((전일고가 + 전일저가) / 2)
       Box Ratio = (거래량 / 100,000,000) / (고가 - 저가)
       EMV = Distance Moved / Box Ratio
       EMV(14) = EMV의 14일 SMA

    점수 기준:
    ✅ EMV>0 AND 증가 (용이한 상승) = 100
    ✅ EMV>0 (상승 용이) = 80
    ⚬ EMV≈0 = 65
    ❌ EMV<0 (하락 압력) = 40

27. Accumulation/Distribution (A/D Line)

    1차 검색: "[ticker] Accumulation Distribution site:tradingview.com"
    2차 검색: "[ticker] A/D Line site:investing.com"
    3차 검색: "[ticker] accumulation distribution line"
    4차 검색: "[ticker] accumulation indicator site:finance.yahoo.com"
    5차 검색: "[ticker] A/D indicator"
    6차 검색: "[ticker] accumulation distribution site:stockcharts.com"
    7차 검색: "[ticker] accumulation line"
    8차 검색: "[ticker] distribution indicator"
    9차 검색: "[ticker] A/D"
    10차 검색: "[ticker] accumulation indicator"

    🔥 모두 실패 시:
    → 과거 20일 고가/저가/종가/거래량 수집
    → 직접 계산:
       CLV = ((종가 - 저가) - (고가 - 종가)) / (고가 - 저가)
       A/D = 전일A/D + (CLV × 거래량)

    점수 기준:
    ✅ A/D상승 AND 가격상승 (매집) = 100
    ✅ A/D상승 = 80
    ⚬ A/D횡보 = 65
    ⚠️ A/D하락 AND 가격상승 (다이버전스) = 45
    ❌ A/D하락 AND 가격하락 (분산) = 35

28. Know Sure Thing (KST)

    1차 검색: "[ticker] Know Sure Thing site:tradingview.com"
    2차 검색: "[ticker] KST site:investing.com"
    3차 검색: "[ticker] KST indicator"
    4차 검색: "[ticker] know sure thing oscillator"
    5차 검색: "[ticker] KST indicator"
    6차 검색: "[ticker] pring KST"
    7차 검색: "[ticker] momentum KST"
    8차 검색: "[ticker] summed ROC"
    9차 검색: "[ticker] KST"
    10차 검색: "[ticker] sure thing indicator"

    🔥 모두 실패 시:
    → 과거 40일 종가 데이터 수집
    → 직접 계산 (복잡):
       RCMA1 = ROC(10)의 SMA(10)
       RCMA2 = ROC(15)의 SMA(10)
       RCMA3 = ROC(20)의 SMA(10)
       RCMA4 = ROC(30)의 SMA(15)
       KST = (RCMA1×1) + (RCMA2×2) + (RCMA3×3) + (RCMA4×4)
       Signal = KST의 SMA(9)
    → 계산 불가 시: ROC로 대체

    점수 기준:
    ✅ KST>Signal AND KST>0 = 100
    ✅ KST>Signal = 80
    ⚬ KST≈Signal = 65
    ❌ KST<Signal AND KST<0 = 35

29. Vortex Indicator (VI, 14일)

    1차 검색: "[ticker] Vortex Indicator site:tradingview.com"
    2차 검색: "[ticker] VI site:investing.com"
    3차 검색: "[ticker] vortex"
    4차 검색: "[ticker] VI+ VI- site:finance.yahoo.com"
    5차 검색: "[ticker] vortex indicator"
    6차 검색: "[ticker] vortex indicator"
    7차 검색: "[ticker] trend vortex"
    8차 검색: "[ticker] VI indicator"
    9차 검색: "[ticker] vortex"
    10차 검색: "[ticker] vortex indicator"

    🔥 모두 실패 시:
    → 과거 14일 고가/저가 데이터 수집
    → 직접 계산:
       VM+ = |금일고가 - 전일저가|
       VM- = |금일저가 - 전일고가|
       TR = MAX(고가-저가, |고가-전일종가|, |저가-전일종가|)
       VI+ = 14일 VM+ 합 / 14일 TR 합
       VI- = 14일 VM- 합 / 14일 TR 합

    점수 기준:
    ✅ VI+>1.0 AND VI+>VI- (상승추세) = 100
    ✅ VI+>VI- = 80
    ⚬ VI+≈VI- = 60
    ❌ VI->VI+ (하락추세) = 40

30. Chaikin Oscillator (차이킨 오실레이터)

    1차 검색: "[ticker] Chaikin Oscillator site:tradingview.com"
    2차 검색: "[ticker] Chaikin Oscillator site:investing.com"
    3차 검색: "[ticker] Chaikin indicator"
    4차 검색: "[ticker] CHO site:finance.yahoo.com"
    5차 검색: "[ticker] A/D oscillator"
    6차 검색: "[ticker] Chaikin indicator site:stockcharts.com"
    7차 검색: "[ticker] chaikin volume"
    8차 검색: "[ticker] volume oscillator"
    9차 검색: "[ticker] chaikin"
    10차 검색: "[ticker] accumulation distribution oscillator"

    🔥 모두 실패 시:
    → A/D Line 계산 (위 27번 참고)
    → 직접 계산:
       Chaikin Oscillator = EMA3(A/D) - EMA10(A/D)

    점수 기준:
    ✅ CHO>0 AND 증가 (매집 가속) = 100
    ✅ CHO>0 (매집) = 80
    ⚬ CHO≈0 = 65
    ❌ CHO<0 AND 감소 (분산 가속) = 35

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【절대 포기 금지 총괄 프로토콜】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 지표당 실행 순서:

1단계: 공식 사이트 10번 검색 (영문 검색)
2단계: 블로그/커뮤니티 검색 (Seeking Alpha, Reddit, YouTube)
3단계: 글로벌 사이트 검색 (TradingView, StockCharts, Yahoo Finance)
4단계: 과거 데이터 수집 시도 (최소 20일치)
5단계: 직접 계산 (명시된 공식 사용)
6단계: 유사 지표로 대체
7단계: 프라이스 액션 기반 추정
8단계: 종목 교체 (최최후)

최소 성공 기준:
- 30개 지표 중 25개 이상 = 완벽 (정상 진행)
- 30개 지표 중 20-24개 = 양호 (하이브리드 점수)
- 30개 지표 중 15-19개 = 최소 (대체 분석 병행)
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

【종목 1】
ticker: NASDAQ:AAPL
name: Apple Inc.
close_price: 185.50

【TIER 1 핵심 지표】
01_SMA: 완전정배열 | 5일>10일>20일>60일 | 점수:100
02_EMA: 골든크로스 | EMA5>EMA20 | 점수:100
03_RSI: 58.3 | 강세권 | 점수:85
04_MACD: 양전환 | MACD>Signal | Histogram증가 | 점수:100
05_거래량비율: 165% | 건전한증가 | 점수:100
06_볼린저밴드: 중상단 | 위치62% | 점수:85
07_ATR: 3.2% | 적정변동성 | 점수:100
08_ADX: 28 | 강한상승추세 | +DI>-DI | 점수:100
09_OBV: 지속상승 | 가격거래량동반 | 점수:100
10_Stochastic: 상승전환 | %K>%D | %K:65 | 점수:100

【TIER 2 중요 지표】
11_Williams_%R: -35 | 중립강세 | 점수:100
12_ROC: 4.2% | 건전한상승 | 점수:100
13_CCI: 125 | 상승모멘텀 | 점수:85
14_MFI: 58 | 자금유입 | 점수:100
15_CMF: 0.15 | 강한유입 | 점수:100
16_Parabolic_SAR: 매수 | SAR<현재가 | 점수:100
17_Ichimoku: 호전 | 현재가>구름대 | 점수:85
18_SuperTrend: 매수 | 상승추세 | 점수:100
19_VWAP: 우세 | 현재가>VWAP | 점수:100
20_52주고저점: 상위72% | 건전한상승 | 점수:100

【TIER 3 고급 지표】
21_Keltner_Channel: 중상단 | 위치68% | 점수:85
22_Donchian_Channel: 상단근접 | 위치82% | 점수:85
23_Aroon: 강한상승 | Up:85 Down:20 | 점수:100
24_Elder_Ray: 강한매수세 | Bull>0 Bear>0 | 점수:100
25_Force_Index: 강한매수압력 | 증가 | 점수:100
26_EMV: 용이한상승 | EMV>0 증가 | 점수:100
27_A/D_Line: 매집 | A/D상승 가격상승 | 점수:100
28_KST: 모멘텀강세 | KST>Signal KST>0 | 점수:100
29_Vortex: 상승추세 | VI+>VI- VI+>1.0 | 점수:100
30_Chaikin_Osc: 매집가속 | CHO>0 증가 | 점수:100

【수집 품질】
수집 지표 수: 30/30
검색 성공: 25개
계산 성공: 5개
추정 사용: 0개
품질 점수: 100%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【종목 2】
ticker: NASDAQ:MSFT
name: Microsoft Corp.
close_price: 378.20

【TIER 1 핵심 지표】
(동일한 형식으로 30개 지표 나열)
...

【수집 품질】
수집 지표 수: 30/30
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

... (30개 종목 모두 동일한 형식)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ STAGE 3 완료: 30개 종목 전체 지표 수집 완료
✅ 평균 지표 수집률: 28.5/30 (95%)
→ STAGE 4로 전달
`;