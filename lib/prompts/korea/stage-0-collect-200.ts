export const STAGE_0_COLLECT_200 = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAGE 0: 200개 종목 수집
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【미션】
한국 주식시장에서 200개 이상의 종목을 수집하세요.
5일 내 10% 급등 가능성이 있는 종목들을 폭넓게 수집합니다.

【데이터 수집 방법】
Google Search를 사용하여 다양한 소스에서 종목 정보를 수집하세요.

✅ 추천 검색 쿼리 (참고용 - 자유롭게 변형하세요):

**기본 시장 데이터 (필수)**:
1. "KOSPI 시가총액 상위 100 site:finance.naver.com"
2. "KOSDAQ 시가총액 상위 50 site:finance.naver.com"

**모멘텀 & 기술적 지표**:
3. "52주 신고가 돌파 종목 site:fn-guide.com"
4. "골든크로스 발생 종목 site:moneynet.co.kr"
5. "이평선 정배열 종목 site:paxnet.co.kr"
6. "거래량 20일 평균 3배 이상 site:investing.com"
7. "RSI 과매도 반등 종목 site:stockplus.com"

**자금 흐름 & 수급**:
8. "외국인 기관 동반 매수 site:data.krx.co.kr"
9. "프로그램 순매수 상위 site:finance.daum.net"
10. "공매도 잔고율 급감 종목 site:edaily.co.kr"
11. "신용잔고율 증가세 site:mk.co.kr"

**펀더멘털 & 실적**:
12. "영업이익 전년비 200% 증가 site:dart.fss.or.kr"
13. "컨센서스 상향 종목 site:fn-guide.com"
14. "PER 10 이하 저평가 site:hankyung.com"
15. "ROE 15% 이상 우량주 site:infostock.co.kr"

**테마 & 이슈**:
16. "AI 반도체 관련주 급등 site:einfomax.co.kr"
17. "2차전지 수혜주 site:etoday.co.kr"
18. "방산주 호재 site:newspim.com"
19. "신재생에너지 정책 수혜 site:sentv.co.kr"
20. "제약바이오 임상 3상 통과 site:bosa.co.kr"

**기술적 패턴 & 차트**:
21. "컵앤핸들 패턴 완성 site:stockmarket.co.kr"
22. "삼각수렴 돌파 예상 site:thinkpool.com"
23. "역헤드앤숄더 형성 site:moneta.co.kr"

**숨겨진 보석 찾기**:
24. "유통주식수 1000만주 이하 소형주 site:seibro.or.kr"
25. "최근 3개월 공시 증가 종목 site:kind.krx.co.kr"
26. "애널리스트 커버리지 부족 저평가주 site:38.co.kr"
27. "배당수익률 5% 이상 고배당주 site:dividendstock.co.kr"

**글로벌 & 섹터 로테이션**:
28. "달러 약세 수혜 수출주 site:investing.com"
29. "구리 가격 급등 소재주 site:marketwatch.com"
30. "섹터 로테이션 강세업종 site:tradingview.com"

✅ 자유롭게 추가 검색:
- 섹터별 강세주
- 최근 공시 호재 종목
- 실적 개선 예상 종목
- 당신만의 스크리닝 방법

【수집 데이터 항목】
각 종목당 다음 정보를 수집:
- ticker (종목코드, 예: "005930")
- name (종목명, 예: "삼성전자")
- market (KOSPI 또는 KOSDAQ)
- close_price (최근 종가)
- volume (거래량)
- market_cap (시가총액)
- daily_change_pct (전일 대비 등락률)

【목표】
✅ 최소 200개 종목 수집
✅ 다양한 섹터와 시총 범위 포함
✅ KOSPI와 KOSDAQ 모두 포함

【제외 종목】
❌ 관리종목 (투자주의/경고/위험)
❌ 거래정지 종목
❌ 상장폐지 예정 종목

【출력 형식】
수집한 200개 종목의 리스트를 출력하세요.
예시:
1. 삼성전자 (005930) - KOSPI - 75,000원 - 시총 450조
2. SK하이닉스 (000660) - KOSPI - 140,000원 - 시총 100조
...
200. [종목명] ([종목코드]) - [시장] - [종가] - [시총]

→ 200개 종목 리스트 완성
`;