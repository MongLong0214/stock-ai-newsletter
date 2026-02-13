// 키워드 생성 프롬프트 상수 (가중치, 콘텐츠타입 룰, Few-Shot 예시)

/** 키워드 평가 SEO 가중치 */
export const SEO_SCORING_WEIGHTS = {
  intent: {
    informational: 1.2,
    commercial: 1.1,
    transactional: 0.9,
    navigational: 0.7,
  },
  difficulty: {
    low: 1.3,
    medium: 1.0,
    high: 0.7,
  },
  volume: {
    optimal: { min: 500, max: 1500, weight: 1.2 },
    good: { min: 100, max: 500, weight: 1.0 },
    low: { max: 100, weight: 0.6 },
    high: { min: 3000, weight: 0.8 },
  },
} as const;

/** 프롬프트와 검증 양쪽에서 쓰는 검색량 상한 */
export const MAX_SEARCH_VOLUME = 5000;

/** 콘텐츠 타입 매칭 규칙 (프롬프트에 삽입) */
export const CONTENT_TYPE_RULES = `
<content-type-matching-rules>
  <rule type="comparison">
    <triggers>vs, 비교, 차이, 어떤게, 뭐가, 좋은, 추천</triggers>
    <patterns>
      - "A vs B" 형태의 비교 쿼리
      - "어떤 것이 더 좋은가" 의사결정 쿼리
      - 복수 옵션 평가 쿼리
    </patterns>
    <examples>삼성전자 vs SK하이닉스, 국내주식 해외주식 비교, 증권사 수수료 비교</examples>
  </rule>

  <rule type="guide">
    <triggers>방법, 하는법, 시작, 입문, 초보, 기초, 설명, 뜻, 의미</triggers>
    <patterns>
      - "어떻게 하는가" How-to 쿼리
      - 개념 설명 요청 쿼리
      - 단계별 프로세스 쿼리
    </patterns>
    <examples>주식 시작하는 방법, RSI 지표 보는법, PER PBR 뜻</examples>
  </rule>

  <rule type="listicle">
    <triggers>TOP, 순위, 목록, 종목, 리스트, 추천주, 베스트, 개</triggers>
    <patterns>
      - 숫자 기반 목록 쿼리
      - 순위/랭킹 쿼리
      - 큐레이션 요청 쿼리
    </patterns>
    <examples>2024년 배당주 TOP 10, AI 관련주 목록, 초보자 추천 종목 5개</examples>
  </rule>

  <rule type="review">
    <triggers>후기, 리뷰, 사용기, 경험, 실제, 평가, 분석, 장단점</triggers>
    <patterns>
      - 특정 서비스/상품 평가 쿼리
      - 실사용 경험 요청 쿼리
      - 심층 분석 요청 쿼리
    </patterns>
    <examples>키움증권 HTS 후기, 토스증권 사용 리뷰, 네이버 증권 분석 평가</examples>
  </rule>
</content-type-matching-rules>`;

/** 주제 버킷(topicArea) 정의 (프롬프트에 삽입) */
export const TOPIC_BUCKETS = `
1. technical: 기술적 분석
   - 지표: RSI, MACD, 스토캐스틱, Williams %R, ADX, ATR, OBV, VWAP, MFI
   - 패턴/구조: 캔들(장악형/망치/도지), 추세(HH/HL, LH/LL), 박스권 돌파/이탈
   - 밴드/채널: 볼린저밴드 스퀴즈/밴드워크, 돈치안/켈트너 채널
   - 신호/전략: 골든크로스/데드크로스, 다이버전스(가격 vs RSI/MACD/OBV), 거래량 동반 확인
   - 예시 키워드 결: "RSI 다이버전스 매수 타이밍", "볼린저밴드 스퀴즈 이후 돌파 기준"

2. value: 가치투자
   - 밸류에이션: PER, PBR, PSR, EV/EBITDA, PEG
   - 수익성/효율: ROE, ROA, 영업이익률, 매출총이익률, 자산회전율
   - 재무안정성: 부채비율, 유동비율, 이자보상배율, 순현금/순차입
   - 현금흐름/배당: FCF, 배당성향, 배당수익률, 자사주 매입
   - 예시 키워드 결: "FCF로 배당 여력 확인", "저PBR인데 ROE 높은 기업 찾는 법"

3. strategy: 투자 전략
   - 매수/매도: 분할매수(몇 번/비율), 분할매도, 물타기 vs 불타기
   - 리스크 관리: 손절선 설정, 익절 기준, 포지션 사이징, R:R(손익비)
   - 운영/루틴: 매매일지, 체크리스트, 규칙 기반 진입/이탈
   - 포트폴리오: 분산/집중, 리밸런싱 주기, 현금 비중 조절
   - 예시 키워드 결: "3차 분할매수 비율", "손절선 잡는 공식(ATR)"

4. market: 시장 분석
   - 지수/섹터: 코스피/코스닥, 업종 순환(섹터 로테이션), 대형주/중소형주 강세 구간
   - 거시 변수: 금리, 환율(달러-원), 유가, CPI/물가, 경기선행지수
   - 수급/자금: 외국인/기관/개인 수급, 프로그램 매매, 공매도/대차잔고
   - 이벤트: FOMC, 실적 시즌, 옵션 만기일, MSCI 리밸런싱
   - 예시 키워드 결: "금리 인상기 유리한 업종", "외국인 수급 보는 법"

5. discovery: 종목 발굴
   - 성장/모멘텀: 실적 턴어라운드, 매출/이익 성장률, 신고가 돌파, 거래대금 급증
   - 테마/이슈: 정책 수혜, 산업 트렌드, 공급망 이슈, 신사업/신제품
   - 배당/방어: 고배당주, 배당 성장주, 리츠/인컴 전략, 우선주
   - ETF: 지수/섹터 ETF, 레버리지/인버스 이해, 분배금/세금
   - 예시 키워드 결: "거래대금 급증 종목 찾는 법", "배당 성장주 스크리닝"

6. psychology: 투자 심리
   - 대표 이슈: 뇌동매매, FOMO, 손실회피, 확증편향, 복수매매
   - 루틴/교정: 감정 체크, 매매 규칙 강화, 손실 이후 회복 프로세스
   - 멘탈 관리: 연속 손실 대처, 과신 방지, 수면/컨디션과 매매 성과
   - 습관화: 매매일지 작성법, 실수 리스트, 사후복기 템플릿
   - 예시 키워드 결: "뇌동매매 고치는 법", "손절 못하는 심리 극복"

7. education: 투자 교육
   - 입문: 계좌 개설, 주문 유형(시장가/지정가), 호가 단위, 거래 시간
   - 용어: 시가총액, EPS, BPS, PER/PBR, 유상증자/무상증자, 액면분할
   - 세금/제도: 배당소득세, 양도세(해외/국내 차이), ISA/연금 계좌, 공매도
   - 증권사/도구: MTS/HTS 비교, 수수료/환전, 알림/조건검색 활용
   - 예시 키워드 결: "주식 용어 초보 가이드", "증권사 수수료 비교 표"

8. execution: 실전 투자
   - 매매 방식: 단타/스윙/중장기, 추세추종 vs 역추세, 눌림목 매매
   - 체결/호가: 호가창 잔량, 체결강도, 거래대금, 분봉/일봉 해석
   - 타이밍: 진입 조건, 추가매수 조건, 손절/익절 실행, 갭상승 대응
   - 실수 방지: 슬리피지, 과도한 레버리지, 뉴스 반응 매매 주의
   - 예시 키워드 결: "호가창 보는 법", "눌림목 매수 타이밍 체크리스트"`;

/** 검색 쿼리 품질 기준 (프롬프트에 삽입) */
export const SEARCH_QUERY_GUIDELINES = `
## 검색 쿼리 형태 규칙 (필수)

keyword는 사용자가 Google/Naver 검색창에 실제로 입력하는 자연어 검색 쿼리여야 합니다.
블로그 제목이나 후킹 문구가 아닙니다. 제목은 별도 단계에서 자동 생성됩니다.

### 길이 제한
- 2~8개 단어 조합 (한글 기준 10~40자)
- 40자를 초과하면 안 됩니다

### 올바른 검색 쿼리 패턴
- [지표/개념] + [활용/방법/뜻]: "매입채무 회전율 보는 법"
- [상황] + [대응/판단]: "흑자도산 기업 판별 방법"
- [대상] + [비교/추천]: "가치투자 재무지표 비교"
- [구어체 질문]: "주식 분할매수 몇 번 나눠서 사야"
- [지표 A] vs [지표 B]: "PER vs PBR 뭘 봐야"

### 금지 패턴 (블로그 제목이지 검색 쿼리가 아닌 것)
- "99%가 모르는 ~" → 아무도 이렇게 검색하지 않음
- "3초 판별법", "100% 걸러내는" → 후킹 문구이지 검색어가 아님
- "~에 속아 상폐 당할 뻔?" → 기사 헤드라인이지 검색어가 아님
- 40자 이상의 긴 문장 → 검색창에 입력하기엔 너무 김

### 자가 검증
keyword를 작성한 뒤, "이 문장을 실제로 검색창에 입력할 사람이 있는가?"를 자문하세요.
"아니오"라면 더 자연스러운 검색 쿼리로 수정하세요.`;

/** Few-Shot 예시 (분석 패턴 + 출력 품질 참고용) */
export const FEW_SHOT_EXAMPLES = `
<few-shot-examples>
  <example id="1" quality="excellent" category="가치투자">
    <keyword>PER PBR 낮은 저평가 주식 찾는 방법</keyword>
    <analysis>
      <step name="intent-analysis">
        가치투자를 위해 저평가 주식 발굴 방법을 배우려는 의도
        -> "방법", "찾는" 트리거 -> informational intent
      </step>
      <step name="difficulty-assessment">
        "PER PBR" + "낮은" + "저평가" + "주식" + "찾는 방법" = 구체적 롱테일
        -> 경쟁도 낮음 -> difficulty: low
      </step>
      <step name="volume-estimation">
        가치투자 관심 지속적, 투자 입문자 검색 다수
        -> 월간 검색량 추정: 800-1200 (optimal zone)
      </step>
      <step name="content-type-matching">
        "방법", "찾는" 트리거 -> guide 타입
        단계별 스크리닝 방법 설명에 적합
      </step>
      <step name="relevance-scoring">
        실용적 투자 정보 + 한국 시장 + 초보-중급 타겟
        -> relevanceScore: 9.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "PER PBR 낮은 저평가 주식 찾는 방법",
        "searchIntent": "informational",
        "difficulty": "low",
        "estimatedSearchVolume": 950,
        "relevanceScore": 9.0,
        "contentType": "guide",
        "reasoning": "가치투자 핵심 지표인 PER/PBR 활용법을 알려주는 실용 가이드. 초보 투자자들의 검색 수요가 높은 주제."
      }
    </output>
  </example>

  <example id="2" quality="excellent" category="투자전략">
    <keyword>주식 분할매수 방법 몇 번 나눠서 사야</keyword>
    <analysis>
      <step name="intent-analysis">
        분할매수 전략의 구체적 실행 방법을 알고 싶은 의도
        -> "방법" 트리거 -> informational intent
      </step>
      <step name="difficulty-assessment">
        구어체 롱테일 키워드로 경쟁도 낮음
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        실전 투자 전략에 대한 꾸준한 검색 수요
        -> 월간 검색량 추정: 600-900
      </step>
      <step name="content-type-matching">
        "방법" 트리거 + 실전 전략 -> guide 타입
      </step>
      <step name="relevance-scoring">
        실용적 투자 전략 + 초보 타겟
        -> relevanceScore: 8.5/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "주식 분할매수 방법 몇 번 나눠서 사야",
        "searchIntent": "informational",
        "difficulty": "low",
        "estimatedSearchVolume": 720,
        "relevanceScore": 8.5,
        "contentType": "guide",
        "reasoning": "실전 투자자들이 자주 검색하는 분할매수 전략 가이드. 구어체 롱테일로 검색 의도가 명확함."
      }
    </output>
  </example>

  <example id="3" quality="excellent" category="종목발굴">
    <keyword>2024년 고배당주 추천 목록 TOP 10</keyword>
    <analysis>
      <step name="intent-analysis">
        배당 투자를 위한 종목 리스트를 원하는 의도
        -> "TOP 10", "추천" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        연도 특정 + 숫자 목록 = 시즈널 롱테일
        -> difficulty: medium
      </step>
      <step name="volume-estimation">
        배당 시즌 전후 검색 급증
        -> 월간 검색량 추정: 1200-1800
      </step>
      <step name="content-type-matching">
        "TOP 10", "목록" 트리거 -> listicle 타입
      </step>
      <step name="relevance-scoring">
        종목 추천 + 한국 시장 + 실용적 정보
        -> relevanceScore: 9.2/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "2024년 고배당주 추천 목록 TOP 10",
        "searchIntent": "commercial",
        "difficulty": "medium",
        "estimatedSearchVolume": 1450,
        "relevanceScore": 9.2,
        "contentType": "listicle",
        "reasoning": "배당 투자자들의 핵심 검색어. 시즌별 업데이트로 지속적 트래픽 확보 가능한 키워드."
      }
    </output>
  </example>

  <example id="4" quality="excellent" category="투자심리">
    <keyword>주식 손절 못하는 이유 심리 극복 방법</keyword>
    <analysis>
      <step name="intent-analysis">
        투자 심리 문제 해결을 원하는 의도
        -> "방법", "극복" 트리거 -> informational intent
      </step>
      <step name="difficulty-assessment">
        감성적 롱테일 키워드로 경쟁도 낮음
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        투자 실패 후 검색 패턴, 꾸준한 수요
        -> 월간 검색량 추정: 500-800
      </step>
      <step name="content-type-matching">
        "방법", "극복" 트리거 -> guide 타입
      </step>
      <step name="relevance-scoring">
        투자 교육 + 실용적 정보 + 공감 콘텐츠
        -> relevanceScore: 8.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "주식 손절 못하는 이유 심리 극복 방법",
        "searchIntent": "informational",
        "difficulty": "low",
        "estimatedSearchVolume": 650,
        "relevanceScore": 8.0,
        "contentType": "guide",
        "reasoning": "투자자들의 공감을 얻을 수 있는 심리 관련 키워드. 손실 회피 심리 극복 가이드로 높은 체류 시간 기대."
      }
    </output>
  </example>

  <example id="5" quality="excellent" category="시장분석">
    <keyword>금리 인상 주식시장 영향 어떤 업종 유리</keyword>
    <analysis>
      <step name="intent-analysis">
        거시경제와 주식시장 관계를 이해하려는 의도
        -> "영향", "유리" 트리거 -> informational intent
      </step>
      <step name="difficulty-assessment">
        구어체 + 복합 질문 = 롱테일
        -> difficulty: medium
      </step>
      <step name="volume-estimation">
        금리 변동기 검색 급증, 경제 뉴스 연동
        -> 월간 검색량 추정: 800-1200
      </step>
      <step name="content-type-matching">
        분석 요청 + 업종 비교 -> guide/comparison 혼합 -> guide 선택
      </step>
      <step name="relevance-scoring">
        시장 분석 + 실용적 정보 + 검색 수요 높음
        -> relevanceScore: 8.5/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "금리 인상 주식시장 영향 어떤 업종 유리",
        "searchIntent": "informational",
        "difficulty": "medium",
        "estimatedSearchVolume": 980,
        "relevanceScore": 8.5,
        "contentType": "guide",
        "reasoning": "거시경제 이해를 돕는 시장 분석 콘텐츠. 뉴스 이슈와 연동되어 트래픽 급증 가능성 높음."
      }
    </output>
  </example>

  <example id="6" quality="excellent" category="투자교육">
    <keyword>증권사 수수료 비교 2024 어디가 싼지</keyword>
    <analysis>
      <step name="intent-analysis">
        증권사 선택을 위한 비교 정보를 원하는 의도
        -> "비교", "어디가" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        연도 특정 + 구어체 = 틈새 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        신규 투자자 유입 시 검색 급증
        -> 월간 검색량 추정: 1000-1500
      </step>
      <step name="content-type-matching">
        "비교" 트리거 명확 -> comparison 타입
      </step>
      <step name="relevance-scoring">
        투자 입문 + 실용적 정보 + 검색 수요 높음
        -> relevanceScore: 9.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "증권사 수수료 비교 2024 어디가 싼지",
        "searchIntent": "commercial",
        "difficulty": "low",
        "estimatedSearchVolume": 1200,
        "relevanceScore": 9.0,
        "contentType": "comparison",
        "reasoning": "주식 입문자들의 필수 검색어. 표로 정리된 비교 콘텐츠로 높은 공유율 기대."
      }
    </output>
  </example>

  <example id="7" quality="excellent" category="기술적분석">
    <keyword>이동평균선 골든크로스 데드크로스 매매 신호</keyword>
    <analysis>
      <step name="intent-analysis">
        기술적 분석 신호 해석을 배우려는 의도
        -> informational intent
      </step>
      <step name="difficulty-assessment">
        전문 용어 조합 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        기술적 분석 학습자 꾸준한 수요
        -> 월간 검색량 추정: 700-1000
      </step>
      <step name="content-type-matching">
        교육 콘텐츠 -> guide 타입
      </step>
      <step name="relevance-scoring">
        기술적 분석 핵심 주제 + 실용적 정보
        -> relevanceScore: 9.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "이동평균선 골든크로스 데드크로스 매매 신호",
        "searchIntent": "informational",
        "difficulty": "low",
        "estimatedSearchVolume": 850,
        "relevanceScore": 9.0,
        "contentType": "guide",
        "reasoning": "기술적 분석의 기본인 이동평균선 활용법. 차트와 함께 설명하면 높은 교육 가치."
      }
    </output>
  </example>

  <example id="8" quality="excellent" category="실전투자">
    <keyword>주식 호가창 보는법 매수매도 잔량 의미</keyword>
    <analysis>
      <step name="intent-analysis">
        실전 매매를 위한 기초 지식을 배우려는 의도
        -> "보는법", "의미" 트리거 -> informational intent
      </step>
      <step name="difficulty-assessment">
        초보자 대상 구체적 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        HTS/MTS 입문자 상시 검색
        -> 월간 검색량 추정: 600-900
      </step>
      <step name="content-type-matching">
        "보는법" 트리거 -> guide 타입
      </step>
      <step name="relevance-scoring">
        실전 투자 기초 + 초보 타겟
        -> relevanceScore: 8.5/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "주식 호가창 보는법 매수매도 잔량 의미",
        "searchIntent": "informational",
        "difficulty": "low",
        "estimatedSearchVolume": 780,
        "relevanceScore": 8.5,
        "contentType": "guide",
        "reasoning": "주식 입문자들이 반드시 검색하는 기초 콘텐츠. 스크린샷과 함께 설명하면 완성도 높음."
      }
    </output>
  </example>
</few-shot-examples>`;
