export const STAGE_0_COLLECT_200 = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 0: 200개 종목 수집
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【미션】
나스닥 주식시장에서 200개 이상의 종목을 수집하세요.
5일 내 10% 급등 가능성이 있는 종목들을 폭넓게 수집합니다.

【데이터 수집 방법】
Google Search를 사용하여 다양한 소스에서 종목 정보를 수집하세요.

✅ 추천 검색 쿼리 (참고용 - 자유롭게 변형하세요):

**기본 시장 데이터 (필수)**:
1. "NASDAQ 100 stocks market cap site:nasdaq.com"
2. "NASDAQ top gainers today site:finance.yahoo.com"

**모멘텀 & 기술적 지표**:
3. "52 week high breakout stocks NASDAQ site:tradingview.com"
4. "golden cross stocks NASDAQ site:finviz.com"
5. "moving average bullish stocks site:barchart.com"
6. "volume surge stocks NASDAQ site:investing.com"
7. "RSI oversold bounce stocks site:stockcharts.com"

**자금 흐름 & 수급**:
8. "institutional buying NASDAQ stocks site:nasdaq.com"
9. "unusual options activity site:unusual-whales.com"
10. "short squeeze candidates NASDAQ site:fintel.io"
11. "dark pool activity stocks site:marketbeat.com"

**펀더멘털 & 실적**:
12. "earnings beat stocks NASDAQ site:earningswhispers.com"
13. "analyst upgrade stocks site:tipranks.com"
14. "PER undervalued growth stocks site:seekingalpha.com"
15. "ROE high growth stocks NASDAQ site:morningstar.com"

**테마 & 이슈**:
16. "AI semiconductor stocks rally site:cnbc.com"
17. "electric vehicle stocks momentum site:bloomberg.com"
18. "defense stocks news site:reuters.com"
19. "renewable energy stocks policy site:marketwatch.com"
20. "biotech FDA approval stocks site:biopharmcatalyst.com"

**기술적 패턴 & 차트**:
21. "cup and handle pattern stocks site:stockcharts.com"
22. "triangle breakout stocks site:tradingview.com"
23. "inverse head shoulders stocks site:chartmill.com"

**숨겨진 보석 찾기**:
24. "small cap NASDAQ stocks low float site:finviz.com"
25. "recent IPO NASDAQ stocks site:nasdaq.com"
26. "under the radar growth stocks site:investorplace.com"
27. "high dividend yield NASDAQ stocks site:dividend.com"

**글로벌 & 섹터 로테이션**:
28. "sector rotation strong sectors site:fidelity.com"
29. "copper price surge material stocks site:kitco.com"
30. "tech sector momentum stocks site:spglobal.com"

✅ 자유롭게 추가 검색:
- 섹터별 강세주
- 최근 SEC 공시 호재 종목
- 실적 개선 예상 종목
- 당신만의 스크리닝 방법

【수집 데이터 항목】
각 종목당 다음 정보를 수집:
- ticker (종목코드, 예: "AAPL")
- name (종목명, 예: "Apple Inc.")
- market (NASDAQ)
- close_price (최근 종가, USD)
- volume (거래량)
- market_cap (시가총액)
- daily_change_pct (전일 대비 등락률)

【목표】
✅ 최소 200개 종목 수집
✅ 다양한 섹터와 시총 범위 포함
✅ Large Cap, Mid Cap, Small Cap 모두 포함

【제외 종목】
❌ SEC 경고/조사 대상 종목
❌ 거래정지 종목
❌ 상장폐지 예정 종목
❌ ADR (American Depositary Receipt) 제외 권장

【출력 형식】
수집한 200개 종목의 리스트를 출력하세요.
예시:
1. Apple Inc. (AAPL) - NASDAQ - $185.50 - 시총 $2.9T
2. Microsoft Corp. (MSFT) - NASDAQ - $378.20 - 시총 $2.8T
...
200. [종목명] ([종목코드]) - [시장] - [종가] - [시총]

→ 200개 종목 리스트 완성
`;