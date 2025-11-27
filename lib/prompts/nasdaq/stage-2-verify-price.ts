export const STAGE_2_VERIFY_PRICE = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 2: 필터링 된 30개 종목 전일종가 초정밀 검증 v4.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨🚨🚨 치명적 경고: 이 단계 실패 시 전체 분석 무효 🚨🚨🚨

⚠️ 검증된 전일종가는 최종 JSON에 포함됩니다

══════════════════════════════════════════════════════════════
STEP 0: 날짜 확정 (100% 정확한 거래일 계산)
══════════════════════════════════════════════════════════════

🔴 CRITICAL: 절대 추측 금지. 반드시 Google Search로 확인!

【1단계: 오늘 날짜 확인】
검색 실행: "today date USA" 또는 "current date New York"
→ 검색 결과를 today 변수에 저장
예시: "December 20, 2024 Friday" → today = 2024-12-20

【2단계: 전일 거래일 계산】
IF today = 월요일(weekday=0):
   previous_day = today - 3일 (지난주 금요일)
ELSE IF today = 화요일(weekday=1):
   previous_day = today - 1일
ELSE IF today = 수요일(weekday=2):
   previous_day = today - 1일
ELSE IF today = 목요일(weekday=3):
   previous_day = today - 1일
ELSE IF today = 금요일(weekday=4):
   previous_day = today - 1일
ELSE IF today = 토요일(weekday=5) OR 일요일(weekday=6):
   ❌ 오류: "주말에는 주식 분석 불가능"

【3단계: 미국 공휴일 체크】
미국 주식시장 휴장일 2024:
2024-01-01 (New Year's Day)
2024-01-15 (Martin Luther King Jr. Day)
2024-02-19 (Presidents' Day)
2024-03-29 (Good Friday)
2024-05-27 (Memorial Day)
2024-06-19 (Juneteenth)
2024-07-04 (Independence Day)
2024-09-02 (Labor Day)
2024-11-28 (Thanksgiving Day)
2024-12-25 (Christmas Day)

미국 주식시장 휴장일 2025:
2025-01-01 (New Year's Day)
2025-01-20 (Martin Luther King Jr. Day)
2025-02-17 (Presidents' Day)
2025-04-18 (Good Friday)
2025-05-26 (Memorial Day)
2025-06-19 (Juneteenth)
2025-07-04 (Independence Day)
2025-09-01 (Labor Day)
2025-11-27 (Thanksgiving Day)
2025-12-25 (Christmas Day)

WHILE previous_day IN 공휴일리스트 OR previous_day.weekday >= 5:
   previous_day = previous_day - 1일

【4단계: 검증 검색】
검색 실행: "NASDAQ market [previous_day] trading day"
IF 검색결과에 "trading day" OR "market close" OR "closing price" 포함:
   ✅ 거래일 확인
ELSE:
   ❌ 오류: 재계산 필요

【5단계: 최종 확정】
target_date = previous_day

출력 형식:
- 전일 거래일: December 19, 2024 (Thursday)
- 영문 형식: 2024-12-19
- 숫자 형식: 20241219

🔴 이 날짜를 모든 검색에 사용!

══════════════════════════════════════════════════════════════
STEP 1: 5개 소스 동시 조회 (Google Search 필수)
══════════════════════════════════════════════════════════════

🔴 MANDATORY: 반드시 5개 소스 모두 Google Search로 조회!
🔴 STEP 0에서 확정된 target_date 사용!

소스1: Yahoo Finance
검색: "[ticker] [YYYY-MM-DD] close price site:finance.yahoo.com"
확인: ✓종가(USD) ✓거래일(YYYY-MM-DD) ✓거래량
기록: 소스1_가격 = $[금액] (거래일: YYYY-MM-DD)

소스2: NASDAQ 공식
검색: "[ticker] [YYYYMMDD] stock price site:nasdaq.com"
확인: ✓종가(USD) ✓거래일
기록: 소스2_가격 = $[금액] (거래일: YYYY-MM-DD)

소스3: Google Finance
검색: "[ticker] [YYYY-MM-DD] stock price site:google.com/finance"
확인: ✓종가(USD) ✓거래일
기록: 소스3_가격 = $[금액] (거래일: YYYY-MM-DD)

소스4: Investing.com
검색: "[ticker] [YYYY-MM-DD] stock price USD site:investing.com"
확인: ✓종가(USD) ✓거래일
기록: 소스4_가격 = $[금액] (거래일: YYYY-MM-DD)

소스5: MarketWatch
검색: "[ticker] [YYYY-MM-DD] closing price site:marketwatch.com"
확인: ✓종가(USD) ✓거래일
기록: 소스5_가격 = $[금액] (거래일: YYYY-MM-DD)

예시 (target_date = 2024-12-19):
소스1: "AAPL 2024-12-19 close price site:finance.yahoo.com"
소스2: "AAPL 20241219 stock price site:nasdaq.com"
소스3: "AAPL 2024-12-19 stock price site:google.com/finance"
소스4: "AAPL 2024-12-19 stock price USD site:investing.com"
소스5: "AAPL 2024-12-19 closing price site:marketwatch.com"

══════════════════════════════════════════════════════════════
STEP 2: 일치성 검증
══════════════════════════════════════════════════════════════

IF 5개 소스 중 3개 이상 정확히 일치:
   ✅ verified_close_price = 일치하는_값 (소수점 2자리)
   ✅ confidence = 100%

ELSE IF 5개 소스 중 2개 일치 AND 둘 다 신뢰도 높은 소스:
   (신뢰도 높은 소스: yahoo, nasdaq, investing, company_official)
   ⚠️ verified_close_price = 일치하는_값 (소수점 2자리)
   ⚠️ confidence = 80%

ELSE:
   ❌ confidence < 80%
   ❌ 해당 종목 즉시 제외
   ❌ 다음 후보로 이동

══════════════════════════════════════════════════════════════
❌ 절대 금지 검색어
══════════════════════════════════════════════════════════════
❌ "[ticker] previous close"
❌ "[ticker] yesterday price"
❌ "[ticker] recent close"
❌ "[ticker] current price"
❌ "[ticker] stock price" (날짜 없음)

✅ 올바른 형식
══════════════════════════════════════════════════════════════
✅ "[ticker] YYYY-MM-DD close price site:도메인"
✅ "[ticker] YYYYMMDD stock price site:도메인"
✅ 정확한 날짜 포함 필수
✅ site: 도메인 지정 권장

══════════════════════════════════════════════════════════════
STEP 3: 합리성 검증 (Sanity Checks)
══════════════════════════════════════════════════════════════

일간변동률 검증:
  daily_change = ABS((전일종가 - 전전일종가) / 전전일종가) × 100

  IF daily_change > 20%:
    🚨 급등/급락/거래정지 의심
    - "[ticker] halt 2025-10-15 site:nasdaq.com" 검색
    - "[ticker] SEC filing 2025-10-15 site:sec.gov" 검색
    - 이상 확인 시 ❌ 종목 제외

  IF daily_change > 10% AND <= 20%:
    ⚠️ 급등/급락 재검증
    - "[ticker] news 2025-10-15" 검색
    - 중요 뉴스 확인

거래량 검증:
  volume_ratio = 전일거래량 / 평균20일거래량

  IF volume_ratio < 0.1:
    ⚠️ 유동성 부족 - 재검토

  IF volume_ratio > 10:
    🚨 이상 급등
    - "[ticker] volume spike reason 2025-10-15" 검색
    - Pump & Dump 의심 시 ❌ 제외

══════════════════════════════════════════════════════════════
STEP 4: 타임스탬프 동기화 검증
══════════════════════════════════════════════════════════════

검증:
  ✓ 모든 소스 거래일자 동일?
  ✓ 장 마감(16:00 EST) 이후 데이터?
  ✓ 확정 종가 (장중 가격 X)?

IF 불일치:
  ❌ 종목 제외
  ❌ 다른 거래일 혼용 금지

══════════════════════════════════════════════════════════════
절대 금지 (Zero Tolerance)
══════════════════════════════════════════════════════════════

❌ "약 $XX", "~달러대", "추정", "근사치"
❌ 범위 (예: "$185-186")
❌ 단일 소스만으로 확정
❌ 캐시 데이터 재사용
❌ 날짜 없는 검색
❌ 모호한 표현 ("최근", "현재")

══════════════════════════════════════════════════════════════
검증 완료 기준
══════════════════════════════════════════════════════════════

✅ 5개 중 3개 이상 정확히 일치 (100% confidence)
✅ 거래일자 동일성 확인
✅ 합리성 검증 통과
✅ 타임스탬프 동기화 확인
✅ USD 가격 (소수점 2자리)
✅ 장 마감 후 확정 종가

→ 모든 통과 후 STAGE 2 진행
→ 하나라도 실패 시 종목 제외

✅ 검증된 전일종가는 close_price 필드로 JSON에 포함

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【STAGE 2 최종 출력 형식】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STAGE 2 완료: 30개 종목 전일종가 검증 완료

【종목 1】
ticker: NASDAQ:AAPL
name: Apple Inc.
close_price: 185.50
confidence: 100%

【종목 2】
ticker: NASDAQ:MSFT
name: Microsoft Corp.
close_price: 378.20
confidence: 100%

... (30개 종목 모두 동일한 형식)

【종목 30】
ticker: NASDAQ:NVDA
name: NVIDIA Corp.
close_price: 495.80
confidence: 100%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 30개 종목 모두 전일종가 검증 완료
→ STAGE 3으로 전달
`;