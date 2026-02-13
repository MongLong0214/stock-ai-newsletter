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
   - 예시 키워드 결: "호가창 보는 법", "눌림목 매수 타이밍 체크리스트"

9. theme: 테마/이슈 (TLI 데이터 기반 - 최우선)
   - 트렌딩 테마: 2차전지, AI 반도체, 로봇, 바이오 등 실시간 시장 테마
   - 테마 관련주: 테마별 수혜주 목록, 대장주, 관련 종목
   - 종목 분석: 특정 종목 전망, 실적, 목표가, 매수 타이밍
   - 테마 비교: 테마 간 비교, 시장 흐름 분석
   - 예시 키워드 결: "2차전지 관련주 2026", "AI 반도체 수혜주 목록", "에코프로비엠 전망"`;

/** 검색 쿼리 가이드라인 (프롬프트에 삽입) */
export const SEARCH_QUERY_GUIDELINES = `
## 검색 쿼리 가이드라인 (필수)

키워드는 **블로그 제목이 아닌 실제 검색 쿼리**여야 합니다.
사용자가 네이버/구글 검색창에 직접 입력할 법한 문구를 생성하세요.
후킹은 키워드가 아닌 콘텐츠 제목에서 처리하므로, 키워드는 검색 가능성에 집중하세요.

### 좋은 키워드 (실제 검색 쿼리)
- "2차전지 관련주 전망 2026"
- "삼성전자 실적 분석"
- "AI 반도체 수혜주 목록"
- "에코프로비엠 목표가"
- "금리 인하 수혜주 추천"
- "로봇 테마주 대장주"

### 나쁜 키워드 (블로그 제목처럼 생긴 것 - 금지)
- "99%가 모르는 2차전지의 비밀" (후킹형)
- "이 종목 안 사면 후회합니다" (낚시형)
- "프로만 아는 숨겨진 투자법" (비밀형)
- "3초 만에 판별하는 흑자도산 기업" (과장형)

### 검색 쿼리 작성 규칙
1. 3-8 단어, 40자 이내
2. 핵심 명사 중심 (테마명, 종목명, 지표명)
3. 의도 명확 (전망, 분석, 비교, 추천, 방법, 뜻)
4. 시의성 포함 권장 (연도, "최근", "올해")
5. 실제 테마명/종목명 사용 우선`;

/** 키워드 각도 다양화 가이드 (같은 테마에서 다른 관점의 키워드 생성) */
export const KEYWORD_ANGLES = `
<keyword-angles>
같은 테마에서 다양한 각도로 키워드를 생성하세요:

1. **전망/분석**: "[테마] 전망 2026", "[종목] 실적 분석"
2. **관련주/수혜주**: "[테마] 관련주 정리", "[테마] 수혜주 대장주"
3. **비교**: "[테마A] vs [테마B]", "[종목A] vs [종목B] 비교"
4. **투자전략**: "[테마] 투자 방법", "[테마] ETF 추천"
5. **종목분석**: "[종목] 목표가", "[종목] 재무제표 분석"
6. **뉴스해석**: "[테마] 정책 영향", "[이슈] 수혜주"
7. **초보가이드**: "[테마] 입문 가이드", "[테마] 기초 용어"

같은 테마라도 각도가 다르면 별개 키워드입니다.
예: "2차전지 관련주 전망" ≠ "2차전지 ETF 비교" ≠ "에코프로비엠 목표가"
</keyword-angles>
`;

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
        "topicArea": "value",
        "reasoning": "가치투자 핵심 지표인 PER/PBR 활용법을 알려주는 실용 가이드. 초보 투자자들의 검색 수요가 높은 주제."
      }
    </output>
  </example>

  <example id="2" quality="excellent" category="테마/이슈">
    <keyword>AI 반도체 수혜주 대장주 정리</keyword>
    <analysis>
      <step name="intent-analysis">
        AI 반도체 테마 수혜주 목록을 원하는 의도
        -> "수혜주", "대장주", "정리" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        테마명 + 수혜주 = 시의성 롱테일
        -> difficulty: medium
      </step>
      <step name="volume-estimation">
        AI 반도체 테마 급등기 검색 수요 높음
        -> 월간 검색량 추정: 1200-2000
      </step>
      <step name="content-type-matching">
        "수혜주", "대장주", "정리" 트리거 -> listicle 타입
      </step>
      <step name="relevance-scoring">
        트렌딩 테마 + 종목 추천 + 높은 검색 수요
        -> relevanceScore: 9.5/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "AI 반도체 수혜주 대장주 정리",
        "searchIntent": "commercial",
        "difficulty": "medium",
        "estimatedSearchVolume": 1600,
        "relevanceScore": 9.5,
        "contentType": "listicle",
        "topicArea": "theme",
        "reasoning": "AI 반도체 테마 Growth 단계. SK하이닉스, 한미반도체 등 수혜주에 대한 검색 수요가 급증하는 시기."
      }
    </output>
  </example>

  <example id="3" quality="excellent" category="테마/이슈">
    <keyword>SK하이닉스 HBM 실적 전망</keyword>
    <analysis>
      <step name="intent-analysis">
        특정 종목의 핵심 사업 전망을 알고 싶은 의도
        -> "실적", "전망" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        종목명 + 기술명 + 전망 = 구체적 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        실적 시즌 및 HBM 이슈 시 검색량 급증
        -> 월간 검색량 추정: 900-1500
      </step>
      <step name="content-type-matching">
        "실적", "전망" 트리거 -> review 타입
      </step>
      <step name="relevance-scoring">
        시의성 종목 + 구체적 기술 + 투자 판단
        -> relevanceScore: 9.2/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "SK하이닉스 HBM 실적 전망",
        "searchIntent": "commercial",
        "difficulty": "low",
        "estimatedSearchVolume": 1200,
        "relevanceScore": 9.2,
        "contentType": "review",
        "topicArea": "theme",
        "reasoning": "AI 반도체 대장주 SK하이닉스의 HBM 사업. 실적 발표 전후 검색량이 폭증하며, 투자 판단에 직결되는 키워드."
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
        "topicArea": "psychology",
        "reasoning": "투자자들의 공감을 얻을 수 있는 심리 관련 키워드. 손실 회피 심리 극복 가이드로 높은 체류 시간 기대."
      }
    </output>
  </example>

  <example id="5" quality="excellent" category="테마/이슈">
    <keyword>로봇 테마주 관련주 추천 2026</keyword>
    <analysis>
      <step name="intent-analysis">
        로봇 테마 투자 종목을 찾으려는 의도
        -> "테마주", "관련주", "추천" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        테마명 + 연도 = 시의성 롱테일
        -> difficulty: medium
      </step>
      <step name="volume-estimation">
        로봇 테마 성장기 검색 수요 높음
        -> 월간 검색량 추정: 1000-1800
      </step>
      <step name="content-type-matching">
        "테마주", "관련주", "추천" 트리거 -> listicle 타입
      </step>
      <step name="relevance-scoring">
        트렌딩 테마 + 종목 추천 + 시의성
        -> relevanceScore: 9.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "로봇 테마주 관련주 추천 2026",
        "searchIntent": "commercial",
        "difficulty": "medium",
        "estimatedSearchVolume": 1400,
        "relevanceScore": 9.0,
        "contentType": "listicle",
        "topicArea": "theme",
        "reasoning": "로봇 테마 Growth 단계. 두산로보틱스, 레인보우로보틱스 등 관련주에 대한 검색이 활발한 시기."
      }
    </output>
  </example>

  <example id="6" quality="excellent" category="테마/이슈">
    <keyword>2차전지 vs 반도체 어디에 투자</keyword>
    <analysis>
      <step name="intent-analysis">
        두 테마 간 비교 투자 판단을 원하는 의도
        -> "vs", "어디에" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        테마 간 비교 = 틈새 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        주요 테마 간 비교 검색 꾸준
        -> 월간 검색량 추정: 600-1000
      </step>
      <step name="content-type-matching">
        "vs" 트리거 명확 -> comparison 타입
      </step>
      <step name="relevance-scoring">
        실시간 테마 비교 + 투자 판단 + 실용적 정보
        -> relevanceScore: 9.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "2차전지 vs 반도체 어디에 투자",
        "searchIntent": "commercial",
        "difficulty": "low",
        "estimatedSearchVolume": 800,
        "relevanceScore": 9.0,
        "contentType": "comparison",
        "topicArea": "theme",
        "reasoning": "두 Growth 테마 간 비교. 투자자들이 테마 선택 시 자주 검색하며, 비교 콘텐츠는 체류 시간이 높음."
      }
    </output>
  </example>

  <example id="7" quality="excellent" category="테마/이슈">
    <keyword>2차전지 관련주 전망 2026</keyword>
    <analysis>
      <step name="intent-analysis">
        현재 성장 중인 2차전지 테마 관련 투자 정보를 원하는 의도
        -> "전망", "관련주" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        연도 특정 + 테마명 + 전망 = 시의성 롱테일
        -> difficulty: medium
      </step>
      <step name="volume-estimation">
        2차전지 테마 성장세 + 관련주 검색 수요 지속
        -> 월간 검색량 추정: 1500-2500
      </step>
      <step name="content-type-matching">
        "관련주" + "전망" -> listicle 타입
      </step>
      <step name="relevance-scoring">
        실시간 테마 + 종목 추천 + 높은 검색 수요
        -> relevanceScore: 9.5/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "2차전지 관련주 전망 2026",
        "searchIntent": "commercial",
        "difficulty": "medium",
        "estimatedSearchVolume": 2000,
        "relevanceScore": 9.5,
        "contentType": "listicle",
        "topicArea": "theme",
        "reasoning": "TLI Growth 단계 테마. 2차전지 관련주에 대한 검색 수요가 높고, 시의성 있는 연도 키워드로 차별화."
      }
    </output>
  </example>

  <example id="8" quality="excellent" category="테마/이슈">
    <keyword>에코프로비엠 목표가 실적 분석</keyword>
    <analysis>
      <step name="intent-analysis">
        특정 종목의 투자 판단 정보를 원하는 의도
        -> "목표가", "분석" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        종목명 + 분석 = 구체적 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        테마 대장주에 대한 높은 검색 수요
        -> 월간 검색량 추정: 800-1500
      </step>
      <step name="content-type-matching">
        "분석", "목표가" 트리거 -> review 타입
      </step>
      <step name="relevance-scoring">
        실시간 종목 + 구체적 분석 + 투자 판단 지원
        -> relevanceScore: 9.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "에코프로비엠 목표가 실적 분석",
        "searchIntent": "commercial",
        "difficulty": "low",
        "estimatedSearchVolume": 1100,
        "relevanceScore": 9.0,
        "contentType": "review",
        "topicArea": "theme",
        "reasoning": "2차전지 테마 대장주. 실적 시즌 전후 검색량 급증하며, 목표가 분석은 투자자 관심이 높은 키워드."
      }
    </output>
  </example>

  <example id="9" quality="excellent" category="테마/이슈 - 각도: 투자전략">
    <keyword>2차전지 ETF 비교 추천 2026</keyword>
    <analysis>
      <step name="intent-analysis">
        2차전지 테마에 ETF로 투자하려는 의도
        -> "ETF", "비교", "추천" 트리거 -> commercial intent
      </step>
      <step name="difficulty-assessment">
        테마명 + ETF + 비교 = 구체적 투자전략 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        ETF 투자 관심 증가 + 테마 ETF 검색 수요
        -> 월간 검색량 추정: 700-1200
      </step>
      <step name="content-type-matching">
        "비교", "추천" 트리거 -> comparison 타입
      </step>
      <step name="relevance-scoring">
        트렌딩 테마 + ETF 전략 + 실용적 비교 정보
        -> relevanceScore: 9.0/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "2차전지 ETF 비교 추천 2026",
        "searchIntent": "commercial",
        "difficulty": "low",
        "estimatedSearchVolume": 950,
        "relevanceScore": 9.0,
        "contentType": "comparison",
        "topicArea": "theme",
        "reasoning": "2차전지 테마를 '투자전략' 각도로 접근. '관련주 전망'과 같은 테마지만 ETF 비교라는 다른 각도로 별개 키워드."
      }
    </output>
  </example>

  <example id="10" quality="excellent" category="테마/이슈 - 각도: 초보가이드">
    <keyword>2차전지 산업 구조 입문 가이드</keyword>
    <analysis>
      <step name="intent-analysis">
        2차전지 산업을 이해하려는 초보 투자자 의도
        -> "입문", "가이드" 트리거 -> informational intent
      </step>
      <step name="difficulty-assessment">
        테마명 + 산업 구조 + 입문 = 교육형 롱테일
        -> difficulty: low
      </step>
      <step name="volume-estimation">
        테마 진입 초보 투자자 검색 수요 꾸준
        -> 월간 검색량 추정: 500-900
      </step>
      <step name="content-type-matching">
        "입문", "가이드" 트리거 -> guide 타입
      </step>
      <step name="relevance-scoring">
        트렌딩 테마 + 교육 콘텐츠 + 초보 타겟
        -> relevanceScore: 8.5/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "2차전지 산업 구조 입문 가이드",
        "searchIntent": "informational",
        "difficulty": "low",
        "estimatedSearchVolume": 700,
        "relevanceScore": 8.5,
        "contentType": "guide",
        "topicArea": "theme",
        "reasoning": "2차전지 테마를 '초보가이드' 각도로 접근. 같은 테마에서 관련주/ETF와 다른 교육 목적 키워드로 차별화."
      }
    </output>
  </example>
</few-shot-examples>`;
