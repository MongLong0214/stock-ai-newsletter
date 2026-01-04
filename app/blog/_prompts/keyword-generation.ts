/**
 * Enterprise-Grade AI Keyword Generation Prompt
 *
 * Prompt Engineering Techniques Applied:
 * 1. Precise Persona Definition - Domain expert with specific capabilities
 * 2. Chain-of-Thought (CoT) - Systematic analysis framework
 * 3. Few-Shot Learning - High-quality examples with reasoning
 * 4. Structured Output Constraints - Strict JSON schema enforcement
 * 5. Constitutional AI - Self-validation criteria
 * 6. Tree of Thoughts - Multi-dimensional evaluation framework
 * 7. Constraint Anchoring - Explicit rules with penalties
 *
 * Target Model: Gemini 3 Pro Preview (dynamic thinking enabled)
 * Domain: Korean Stock Market SEO (KOSPI, KOSDAQ, AI Newsletter)
 */

import type {
  KeywordMetadata,
  SearchIntent,
  KeywordDifficulty,
  ContentType,
} from '../_types/blog';

// ============================================================================
// Prompt Constants
// ============================================================================

/**
 * SEO scoring weights for keyword evaluation
 * These weights are embedded in the prompt to guide AI scoring decisions
 */
const SEO_SCORING_WEIGHTS = {
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

/**
 * Content type matching rules for systematic assignment
 * Each rule defines trigger patterns and rationale
 */
const CONTENT_TYPE_RULES = `
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

/**
 * Few-shot examples demonstrating ideal keyword generation
 * Each example includes detailed reasoning chain
 */
const FEW_SHOT_EXAMPLES = `
<few-shot-examples>
  <example id="1" quality="excellent" category="가치투자">
    <keyword>PER PBR 낮은 저평가 주식 찾는 방법</keyword>
    <analysis>
      <step name="intent-analysis">
        가치투자를 위해 저평가 주식 발굴 방법을 배우려는 의도
        → "방법", "찾는" 트리거 → informational intent
      </step>
      <step name="difficulty-assessment">
        "PER PBR" + "낮은" + "저평가" + "주식" + "찾는 방법" = 구체적 롱테일
        → 경쟁도 낮음 → difficulty: low
      </step>
      <step name="volume-estimation">
        가치투자 관심 지속적, 투자 입문자 검색 다수
        → 월간 검색량 추정: 800-1200 (optimal zone)
      </step>
      <step name="content-type-matching">
        "방법", "찾는" 트리거 → guide 타입
        단계별 스크리닝 방법 설명에 적합
      </step>
      <step name="relevance-scoring">
        실용적 투자 정보 + 한국 시장 + 초보-중급 타겟
        → relevanceScore: 9.0/10
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
        → "방법" 트리거 → informational intent
      </step>
      <step name="difficulty-assessment">
        구어체 롱테일 키워드로 경쟁도 낮음
        → difficulty: low
      </step>
      <step name="volume-estimation">
        실전 투자 전략에 대한 꾸준한 검색 수요
        → 월간 검색량 추정: 600-900
      </step>
      <step name="content-type-matching">
        "방법" 트리거 + 실전 전략 → guide 타입
      </step>
      <step name="relevance-scoring">
        실용적 투자 전략 + 초보 타겟
        → relevanceScore: 8.5/10
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
        → "TOP 10", "추천" 트리거 → commercial intent
      </step>
      <step name="difficulty-assessment">
        연도 특정 + 숫자 목록 = 시즈널 롱테일
        → difficulty: medium
      </step>
      <step name="volume-estimation">
        배당 시즌 전후 검색 급증
        → 월간 검색량 추정: 1200-1800
      </step>
      <step name="content-type-matching">
        "TOP 10", "목록" 트리거 → listicle 타입
      </step>
      <step name="relevance-scoring">
        종목 추천 + 한국 시장 + 실용적 정보
        → relevanceScore: 9.2/10
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
        → "방법", "극복" 트리거 → informational intent
      </step>
      <step name="difficulty-assessment">
        감성적 롱테일 키워드로 경쟁도 낮음
        → difficulty: low
      </step>
      <step name="volume-estimation">
        투자 실패 후 검색 패턴, 꾸준한 수요
        → 월간 검색량 추정: 500-800
      </step>
      <step name="content-type-matching">
        "방법", "극복" 트리거 → guide 타입
      </step>
      <step name="relevance-scoring">
        투자 교육 + 실용적 정보 + 공감 콘텐츠
        → relevanceScore: 8.0/10
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
        → "영향", "유리" 트리거 → informational intent
      </step>
      <step name="difficulty-assessment">
        구어체 + 복합 질문 = 롱테일
        → difficulty: medium
      </step>
      <step name="volume-estimation">
        금리 변동기 검색 급증, 경제 뉴스 연동
        → 월간 검색량 추정: 800-1200
      </step>
      <step name="content-type-matching">
        분석 요청 + 업종 비교 → guide/comparison 혼합 → guide 선택
      </step>
      <step name="relevance-scoring">
        시장 분석 + 실용적 정보 + 검색 수요 높음
        → relevanceScore: 8.5/10
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
        → "비교", "어디가" 트리거 → commercial intent
      </step>
      <step name="difficulty-assessment">
        연도 특정 + 구어체 = 틈새 롱테일
        → difficulty: low
      </step>
      <step name="volume-estimation">
        신규 투자자 유입 시 검색 급증
        → 월간 검색량 추정: 1000-1500
      </step>
      <step name="content-type-matching">
        "비교" 트리거 명확 → comparison 타입
      </step>
      <step name="relevance-scoring">
        투자 입문 + 실용적 정보 + 검색 수요 높음
        → relevanceScore: 9.0/10
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
        → informational intent
      </step>
      <step name="difficulty-assessment">
        전문 용어 조합 롱테일
        → difficulty: low
      </step>
      <step name="volume-estimation">
        기술적 분석 학습자 꾸준한 수요
        → 월간 검색량 추정: 700-1000
      </step>
      <step name="content-type-matching">
        교육 콘텐츠 → guide 타입
      </step>
      <step name="relevance-scoring">
        기술적 분석 핵심 주제 + 실용적 정보
        → relevanceScore: 9.0/10
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
        → "보는법", "의미" 트리거 → informational intent
      </step>
      <step name="difficulty-assessment">
        초보자 대상 구체적 롱테일
        → difficulty: low
      </step>
      <step name="volume-estimation">
        HTS/MTS 입문자 상시 검색
        → 월간 검색량 추정: 600-900
      </step>
      <step name="content-type-matching">
        "보는법" 트리거 → guide 타입
      </step>
      <step name="relevance-scoring">
        실전 투자 기초 + 초보 타겟
        → relevanceScore: 8.5/10
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

// ============================================================================
// Main Prompt Builder
// ============================================================================

interface CompetitorKeyword {
  keyword: string;
  count: number;
  sources: string[];
}

/** AI 키워드 생성 프롬프트 빌더 */
export function buildKeywordGenerationPrompt(
  count: number,
  usedKeywords: string[],
  competitorKeywords?: CompetitorKeyword[],
  existingTitles?: string[]
): string {
  // Prepare excluded keywords list (limit to 100 for better coverage)
  const excludedKeywordsList = usedKeywords.length > 0
    ? usedKeywords.slice(-100).map((kw, i) => `${i + 1}. ${kw}`).join('\n')
    : '(없음 - 첫 생성)';

  // Prepare existing titles list (critical for avoiding topic overlap) - 모든 제목 표시
  const existingTitlesList = existingTitles && existingTitles.length > 0
    ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : '(없음 - 첫 생성)';

  // Calculate dynamic constraints based on count
  // contentType diversity + topicArea diversity must be enforced to avoid repetitive generations.
  const minDistinctContentTypes = count >= 5 ? Math.min(4, Math.ceil(count * 0.6)) : 2;
  const minDistinctTopicAreas = count >= 5 ? Math.min(6, Math.ceil(count * 0.8)) : 3;

  const diversityRequirement = count >= 5
    ? [
        `최소 ${minDistinctContentTypes}개는 서로 다른 contentType을 가져야 합니다.`,
        `최소 ${minDistinctTopicAreas}개는 서로 다른 topicArea를 가져야 합니다.`,
        `가능하면 (기술적 분석/가치투자/투자전략/시장분석/종목발굴/투자심리/투자교육/실전투자)에서 고르게 분산하세요.`,
      ].join(' ')
    : '가능한 다양한 contentType과 topicArea를 포함하세요.';

  // Prepare competitor keywords section
  const competitorKeywordsSection = competitorKeywords && competitorKeywords.length > 0
    ? `
<competitor-keywords-analysis>
## 경쟁사 콘텐츠에서 발견된 키워드
다음은 경쟁사 블로그/콘텐츠에서 추출한 상위 키워드입니다.
이 키워드들을 참고하여 비슷하지만 더 구체적이고 차별화된 롱테일 키워드를 생성하세요.

${competitorKeywords.slice(0, 15).map((kw, i) => `${i + 1}. "${kw.keyword}" (${kw.sources.length}개 소스)`).join('\n')}

**활용 방법**:
- 위 키워드를 그대로 사용하지 말고, 이를 기반으로 더 구체적인 변형을 만드세요
- 예: "주식 분석" → "주식 기술적 분석 초보자 가이드", "AI 주식 분석 무료 서비스"
- 경쟁사가 놓친 세부 주제나 롱테일 키워드를 발굴하세요
- 유사 키워드가 많이 등장한 주제는 검색 수요가 높다는 의미입니다
</competitor-keywords-analysis>`
    : '';

  return `<system>
당신은 한국 주식 시장 SEO 전문가이자 콘텐츠 전략가입니다.

<expertise>
- 10년+ 한국 금융 시장 SEO 경험
- KOSPI/KOSDAQ 키워드 트렌드 분석 전문
- 롱테일 키워드 발굴 및 검색량 추정 역량
- 콘텐츠-키워드 매칭 최적화 전문성
- Google/Naver 검색 알고리즘 이해
</expertise>

<service-context>
서비스명: Stock Matrix (스톡 매트릭스)
서비스 유형: 주식 투자 정보 블로그
타겟 오디언스: 한국 주식 투자자 (초보~중급)

**주제 버킷(topicArea) 정의** (반드시 여러 버킷에서 키워드 생성 + 출력에 topicArea 필드로 명시):
1. technical: 기술적 분석
   - 지표: RSI, MACD, 스토캐스틱, Williams %R, ADX, ATR, OBV, VWAP, MFI
   - 패턴/구조: 캔들(장악형/망치/도지), 추세(HH/HL, LH/LL), 박스권 돌파/이탈
   - 밴드/채널: 볼린저밴드 스퀴즈·밴드워크, 돈치안/켈트너 채널
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


**버킷 분산 규칙(최우선)**:
- ${count}개 생성 시, 가능한 한 서로 다른 topicArea에서 뽑히도록 설계
- 동일 topicArea는 최대 2개까지만 허용 (count가 5 이상인 경우)
- 기술적 분석에 편중 금지 (count가 5 이상인 경우 technical은 최대 1개 권장)
</service-context>
</system>

<task>
Stock Matrix 블로그를 위한 고품질 SEO 키워드 ${count}개를 생성하세요.
목표는 "검색 유입"이며, 각 키워드는 클릭을 유도할 수 있는 **후킹(hooking) 요소**를 반드시 포함해야 합니다.
단, 과장/낚시성 표현이 아니라 사용자가 실제로 얻을 수 있는 정보가 명확한 "정직한 후킹"이어야 합니다.
</task>

<analysis-framework>
각 키워드 생성 시 다음 5단계 분석을 수행하세요:

## Step 1: 검색 의도 분석 (Search Intent Analysis)
- 사용자가 이 키워드로 무엇을 찾으려 하는가?
- informational: 정보/지식 습득 목적 (가중치: 1.2x)
- commercial: 구매/선택 전 비교 조사 (가중치: 1.1x)
- transactional: 즉각적 행동/구매 의도 (가중치: 0.9x)
- navigational: 특정 사이트/페이지 탐색 (가중치: 0.7x)

## Step 2: 난이도 평가 (Difficulty Assessment)
- 키워드 구성 요소 개수 분석 (3개 이상 = 롱테일)
- 경쟁 콘텐츠 예상 품질 평가
- low: 롱테일, 틈새 키워드 (가중치: 1.3x)
- medium: 적정 경쟁, 기회 존재 (가중치: 1.0x)
- high: 대형 사이트 경쟁 심함 (가중치: 0.7x)

## Step 3: 검색량 추정 (Volume Estimation)
- 한국 시장 특성 고려한 월간 검색량 추정
- optimal zone: 500-1500 (가중치: 1.2x) ← 우선 타겟
- good zone: 100-500 (가중치: 1.0x)
- low zone: <100 (가중치: 0.6x) - 피할 것
- high zone: >3000 (가중치: 0.8x) - 경쟁 과열

## Step 4: 콘텐츠 타입 매칭 (Content Type Matching)
${CONTENT_TYPE_RULES}

## Step 5: 관련성 점수 산정 (Relevance Scoring)
- 주식 투자/분석과의 연관성 (0-10점)
- 평가 기준:
  - 주식 투자/분석 관련: +3점
  - 실용적 정보 제공: +2점
  - 한국 시장 관련: +2점
  - 검색 수요 높음: +2점
  - 초보-중급 투자자 타겟: +1점

**키워드 다양성 + 강력한 후킹 (최우선 - 클릭률 결정 요소)**:
- 다양한 주제 영역에서 키워드를 생성해야 함 (특정 주제 편중 금지)
- ⚠️ 각 키워드는 반드시 아래 "후킹 트리거" 중 **2개 이상 조합**해야 함 (필수 - 미준수시 탈락)

## 🔥 강력한 후킹 트리거 (MUST APPLY - 클릭률 3배 상승)
**후킹 없는 키워드 = 검색 노출되어도 클릭 0 = 무의미**
반드시 아래 패턴 중 2개 이상을 조합하세요.

### 1) 🚨 손실/실패 회피형 (가장 강력 - 최우선 사용)
**인간의 손실 회피 심리 활용 - CTR 400% 상승**
- 패턴: "X% 손실", "99%가 모르는", "하면 망하는", "절대 하지 말아야 할", "피해야 할", "실패하는 이유", "돈 잃는"
- 강력 예시:
  - "개미 투자자 90%가 손실 보는 이동평균선 함정 5가지"
  - "절대 사면 안 되는 저PER 주식 특징 3가지"
  - "주식 초보가 첫 달에 돈 잃는 진짜 이유 7가지"

### 2) 📊 구체적 숫자 + 단계형 (신뢰도 상승)
- 패턴: "3가지", "5단계", "7일 완성", "TOP 10", "단 3분", "3초 판별", "10분 만에"
- 강력 예시:
  - "3분 만에 급등주 찾는 거래량 체크리스트 5가지"
  - "5분 봉만 보고 매수 타이밍 잡는 3단계 공식"

### 3) ❓ 질문형/의사결정 딜레마 (호기심 자극)
- 패턴: "언제 사야", "얼마에 팔아야", "어떤게 정답", "뭐가 맞을까", "왜 안 오를까", "진짜 맞나"
- 강력 예시:
  - "RSI 30에 사야 하나 20까지 기다려야 하나? 정답 공개"
  - "물타기 vs 손절 뭐가 정답일까? 백테스트 결과"

### 4) ⏰ 타이밍/조건 명확화 (실행 가능성)
- 패턴: "정확한 매수 타이밍", "이 조건이면 무조건", "신호 포착법", "진입 기준"
- 강력 예시:
  - "MACD 골든크로스 후 정확히 언제 사야 하나? 3가지 조건"
  - "호가창 이 패턴 보이면 즉시 매수해야 하는 이유"

### 5) ⚔️ 비교/선택 딜레마 (결정 욕구 자극)
- 패턴: "A vs B", "어느 쪽이", "차이점 총정리", "장단점 비교", "뭐가 더 유리"
- 강력 예시:
  - "삼성전자 vs SK하이닉스 지금 사면 5년 후 수익률 비교"
  - "단타 vs 스윙 당신에게 맞는 매매법은? 진단 테스트"

### 6) 💡 반전/비밀 공개형 (독점 정보 느낌)
- 패턴: "아무도 안 알려주는", "숨겨진", "진짜", "비밀", "프로만 아는", "기관이 쓰는"
- 강력 예시:
  - "증권사가 절대 안 알려주는 수수료 함정 3가지"
  - "기관 투자자만 쓰는 거래량 분석 비법 공개"

### 7) 💸 수익/결과 명시형 (기대 심리)
- 패턴: "수익률 N%", "N배 수익", "월 N만원", "이렇게 해서 벌었다"
- 강력 예시:
  - "이 전략으로 월 5% 수익 내는 스윙 매매 루틴"
  - "배당주로 월 50만원 만드는 현실적인 로드맵"

## ⚡ 후킹 조합 공식 (필수 - 2개 이상 조합)

**[손실 회피] + [구체 숫자] = 최강 후킹 (CTR 500%↑)**
- "90%가 모르는 RSI 함정 3가지"
- "절대 피해야 할 저PBR 주식 특징 5가지"

**[질문형] + [비교] = 강력 후킹 (CTR 350%↑)**
- "RSI 30 vs 40 어디서 사야 손해 안 볼까?"
- "분할매수 3회 vs 5회 뭐가 더 유리할까?"

**[타이밍] + [숫자] = 강력 후킹 (CTR 300%↑)**
- "골든크로스 후 정확히 며칠 후 매수해야 하나? 3가지 기준"
- "3분 만에 매수 타이밍 잡는 체크리스트"

**[반전형] + [손실 회피] = 최강 후킹 (CTR 450%↑)**
- "프로도 모르는 이동평균선 함정 3가지"
- "기관이 절대 안 쓰는 RSI 설정값 이유"

**정직한 후킹 규칙**:
- 후킹 요소는 본문에서 실제로 "근거/예시/수치/절차"로 해소 가능해야 함
- 과장은 가능하나 거짓은 금지 ("90% 손실" → 대부분의 의미로 사용 가능)
- 확정 수익 보장 금지 (규제 위반)
</analysis-framework>

<few-shot-learning>
다음 예시들의 분석 패턴과 출력 품질을 참고하세요:
${FEW_SHOT_EXAMPLES}
</few-shot-learning>

<constraints>
## 필수 준수 사항 (Mandatory)
1. 정확히 ${count}개의 키워드를 생성할 것
2. 모든 키워드는 한국어 기반 (영문 약어 허용: AI, RSI, PER 등)
3. JSON 배열 형식만 출력 (설명 텍스트 없음)
4. 모든 항목에 topicArea를 반드시 포함할 것 (아래 스키마 참조)
5. 생성된 ${count}개는 topicArea가 가능한 한 서로 달라야 하며, 동일 topicArea는 최대 2개까지만 허용 (count가 5 이상인 경우)
6. 서로 유사한 문장(표현만 바꾼 반복) 금지: 기존 제외 키워드 및 이번 배치 내 키워드와 의미 유사도가 높으면 탈락
6-1. ⚠️ 각 키워드는 후킹 트리거 **2개 이상 조합** 필수 (예: 손실회피+숫자, 타이밍+질문형)
7. ${diversityRequirement}
8. **다양한 주제 영역**에서 키워드 생성 (특정 주제에 편중 금지)

## 금지 사항 (Prohibited)
1. 아래 제외 키워드와 동일/유사(의미상 유사 포함)한 키워드 생성 금지
   - 예: "FCF 뜻" ↔ "잉여현금흐름 의미" 처럼 표현만 바꾼 반복도 금지
2. 단일 단어 키워드 금지 (최소 2개 이상 조합)
3. 브랜드명 단독 사용 금지 (삼성전자만, 네이버만 등)
4. 검색량 100 미만 추정 키워드 금지
5. 추상적/모호한 키워드 금지
6. 동일한 주제 영역의 키워드만 생성 금지

## 품질 기준 (Quality Gates)
- 롱테일 비율: 70% 이상 (3개+ 단어 조합)
- 검색 의도 명확성: 각 키워드에서 의도 추론 가능해야 함
- contentType 근거: 트리거 단어 기반 매칭 필수
- **주제 다양성**: 최소 3개 이상의 다른 주제 영역 포함
- **후킹 요소**: 각 키워드에 후킹 트리거 1개 이상 포함 (질문형/숫자/실수/타이밍/비교)
- **클릭 기대도**: 제목만 봐도 "궁금증" 또는 "결정 도움"이 생기는 구조
</constraints>

<excluded-keywords>
다음 키워드들은 이미 사용되었으므로 제외하세요:
${excludedKeywordsList}
</excluded-keywords>

<existing-blog-titles>
🚫🚫🚫 **[최우선 규칙] 절대 중복 금지** 🚫🚫🚫

아래는 이미 작성된 모든 블로그 글 제목입니다.
**다음 제목들과 주제, 지표, 전략, 관점이 겹치는 키워드는 절대 생성하지 마세요.**

${existingTitlesList}

**⛔ 중복 판정 기준 (하나라도 해당하면 탈락):**
1. **같은 지표** 다루는 경우 (RSI, MACD, 볼린저밴드 등이 겹치면 무조건 중복)
2. **같은 전략** 다루는 경우 (분할매수, 손절, 물타기 등이 겹치면 중복)
3. **같은 관점** 다루는 경우 ("방법", "활용법", "보는법"은 같은 관점)
4. **같은 대상** 다루는 경우 (같은 지표+같은 상황 = 중복)

**❌ 금지 예시 (표현만 바꾼 것도 중복):**
- 기존: "RSI 다이버전스 매수 신호"
  → 금지: "RSI 다이버전스 활용법", "RSI로 매수 타이밍 잡기", "RSI 30 매수 전략"

- 기존: "볼린저밴드 스퀴즈 돌파 전략"
  → 금지: "볼린저밴드 매매법", "볼린저밴드 진입 시점", "볼린저밴드 활용 가이드"

- 기존: "분할매수 몇 번 나눠서"
  → 금지: "분할매수 비율", "분할매수 방법", "분할매수 전략"

**✅ 허용되는 새로운 키워드 (완전히 다른 주제):**
- 기존에 없는 새로운 지표: ADX, MFI, 윌리엄스 %R 등
- 기존에 없는 새로운 전략: 섹터 로테이션, 모멘텀 스코어링 등
- 기존에 없는 새로운 관점: 세금, 증권사 비교, 계좌 관리 등
- 기존에 없는 새로운 조합: 완전히 새로운 지표 + 새로운 상황

**⚠️ 이 규칙을 어기면 해당 키워드는 자동 탈락됩니다.**
</existing-blog-titles>
${competitorKeywordsSection}

<output-schema>
반드시 다음 JSON 스키마를 준수하세요:

\`\`\`typescript
interface KeywordMetadata {
  keyword: string;           // 한국어 SEO 키워드 (2+ 단어)
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  difficulty: 'low' | 'medium' | 'high';
  estimatedSearchVolume: number;  // 100-3000 범위
  relevanceScore: number;         // 7.5-10.0 범위
  contentType: 'comparison' | 'guide' | 'listicle' | 'review';
  topicArea: 'technical' | 'value' | 'strategy' | 'market' | 'discovery' | 'psychology' | 'education' | 'execution';
  reasoning: string;              // 50자 이상 근거 설명
}
\`\`\`

출력 형식:
\`\`\`json
[
  { ... },
  { ... }
]
\`\`\`
</output-schema>

<self-validation>
출력 전 다음을 확인하세요:
☐ 정확히 ${count}개의 키워드가 있는가?
☐ 제외 키워드와 중복되는 것이 없는가?
☐ 각 contentType에 매칭 근거(트리거)가 있는가?
☐ estimatedSearchVolume이 100-3000 범위인가?
☐ reasoning이 구체적이고 50자 이상인가?
☐ JSON 형식이 올바른가?
☐ 키워드들이 다양한 주제 영역을 포함하는가?
☐ 각 키워드에 후킹 트리거가 1개 이상 포함되어 있는가?
☐ 후킹 요소가 과장/낚시가 아니라 본문에서 실제로 해소 가능한가?
☐ topicArea가 누락되지 않았는가?
</self-validation>

**JSON 배열만 출력하세요. 다른 텍스트는 포함하지 마세요.**`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates generated keyword metadata against quality criteria
 *
 * @param keywords - Array of generated keyword metadata
 * @returns Validation result with any errors found
 */
export function validateKeywordMetadata(keywords: KeywordMetadata[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  keywords.forEach((kw, index) => {
    // Check search volume range
    if (kw.estimatedSearchVolume < 100 || kw.estimatedSearchVolume > 5000) {
      errors.push(`키워드 ${index + 1}: 검색량 ${kw.estimatedSearchVolume}이 유효 범위(100-5000) 벗어남`);
    }

    // Check keyword length (must be 2+ words)
    const wordCount = kw.keyword.split(/\s+/).length;
    if (wordCount < 2) {
      errors.push(`키워드 ${index + 1}: "${kw.keyword}"는 단일 단어 키워드 (최소 2단어 필요)`);
    }

    // Check reasoning length
    if (kw.reasoning.length < 20) {
      errors.push(`키워드 ${index + 1}: reasoning이 너무 짧음 (${kw.reasoning.length}자 < 20자)`);
    }

    // Validate enum values
    const validIntents: SearchIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];
    if (!validIntents.includes(kw.searchIntent)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 searchIntent "${kw.searchIntent}"`);
    }

    const validDifficulties: KeywordDifficulty[] = ['low', 'medium', 'high'];
    if (!validDifficulties.includes(kw.difficulty)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 difficulty "${kw.difficulty}"`);
    }

    const validContentTypes: ContentType[] = ['comparison', 'guide', 'listicle', 'review'];
    if (!validContentTypes.includes(kw.contentType)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 contentType "${kw.contentType}"`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculates SEO score for a keyword based on weighted factors
 *
 * @param keyword - Keyword metadata to score
 * @returns Calculated SEO score (0-100)
 */
export function calculateSEOScore(keyword: KeywordMetadata): number {
  const intentWeight = SEO_SCORING_WEIGHTS.intent[keyword.searchIntent];
  const difficultyWeight = SEO_SCORING_WEIGHTS.difficulty[keyword.difficulty];

  // Volume weight calculation
  let volumeWeight: number;
  const vol = keyword.estimatedSearchVolume;
  if (vol >= 500 && vol <= 1500) {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.optimal.weight;
  } else if (vol >= 100 && vol < 500) {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.good.weight;
  } else if (vol < 100) {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.low.weight;
  } else {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.high.weight;
  }

  // Base score from relevance (0-10 → 0-50)
  const relevanceBase = keyword.relevanceScore * 5;

  // Weighted modifiers
  const weightedScore = relevanceBase * intentWeight * difficultyWeight * volumeWeight;

  // Normalize to 0-100 range
  return Math.min(100, Math.round(weightedScore));
}

export default buildKeywordGenerationPrompt;