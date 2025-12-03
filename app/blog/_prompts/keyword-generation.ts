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
  minimumRelevanceScore: 7.5,
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
    <triggers>후기, 리뷰, 사용기, 경험, 실제, 평가, 분석</triggers>
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
  <example id="1" quality="excellent">
    <keyword>AI 주식 분석 무료 서비스 비교</keyword>
    <analysis>
      <step name="intent-analysis">
        사용자가 여러 AI 주식 분석 서비스를 비교하려는 의도
        → "비교" 트리거 존재 → commercial intent (구매/선택 전 정보 수집)
      </step>
      <step name="difficulty-assessment">
        "AI 주식 분석" + "무료" + "서비스" + "비교" = 4개 수식어
        → 롱테일 키워드로 경쟁도 낮음 → difficulty: low
      </step>
      <step name="volume-estimation">
        AI 투자 트렌드 상승 + 무료 서비스 수요 높음
        → 월간 검색량 추정: 800-1200 (optimal zone)
      </step>
      <step name="content-type-matching">
        "비교" 트리거 명확 → comparison 타입
        여러 서비스를 표/차트로 비교하는 콘텐츠에 적합
      </step>
      <step name="relevance-scoring">
        Stock Matrix 서비스와 직접 연관 (AI + 무료 + 주식)
        → relevanceScore: 9.5/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "AI 주식 분석 무료 서비스 비교",
        "searchIntent": "commercial",
        "difficulty": "low",
        "estimatedSearchVolume": 950,
        "relevanceScore": 9.5,
        "contentType": "comparison",
        "reasoning": "AI 투자 서비스 선택 전 비교 분석 수요. Stock Matrix의 무료 AI 분석 강점을 부각할 수 있는 고가치 키워드."
      }
    </output>
  </example>

  <example id="2" quality="excellent">
    <keyword>주식 기술적 분석 지표 보는 방법 초보</keyword>
    <analysis>
      <step name="intent-analysis">
        초보자가 기술적 분석을 배우려는 교육적 의도
        → "방법", "초보" 트리거 → informational intent
      </step>
      <step name="difficulty-assessment">
        6개 키워드 조합 = 매우 구체적인 롱테일
        → 경쟁도 낮음 → difficulty: low
      </step>
      <step name="volume-estimation">
        주식 입문자 상시 수요 + 기술적 분석 관심 증가
        → 월간 검색량 추정: 600-900
      </step>
      <step name="content-type-matching">
        "방법", "초보" 트리거 → guide 타입
        단계별 설명이 필요한 교육 콘텐츠에 적합
      </step>
      <step name="relevance-scoring">
        뉴스레터의 기술적 분석 콘텐츠와 연관
        → relevanceScore: 8.8/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "주식 기술적 분석 지표 보는 방법 초보",
        "searchIntent": "informational",
        "difficulty": "low",
        "estimatedSearchVolume": 720,
        "relevanceScore": 8.8,
        "contentType": "guide",
        "reasoning": "초보 투자자 대상 기술적 분석 교육 콘텐츠. 뉴스레터 구독 유도를 위한 입문 가이드로 활용 가능."
      }
    </output>
  </example>

  <example id="3" quality="excellent">
    <keyword>2024년 코스피 저평가 우량주 TOP 10</keyword>
    <analysis>
      <step name="intent-analysis">
        투자 대상 종목 리스트를 원하는 의도
        → "TOP 10" 트리거 → commercial intent (투자 결정 참고)
      </step>
      <step name="difficulty-assessment">
        연도 특정 + "저평가" + "우량주" + 숫자 = 구체적 롱테일
        → 중간 경쟁도 (시즈널 키워드) → difficulty: medium
      </step>
      <step name="volume-estimation">
        연초/분기별 검색 급증 패턴
        → 월간 검색량 추정: 1200-1800 (시즌별 변동)
      </step>
      <step name="content-type-matching">
        "TOP 10" 트리거 명확 → listicle 타입
        순위 기반 큐레이션 콘텐츠에 적합
      </step>
      <step name="relevance-scoring">
        AI 분석 기반 종목 추천과 직접 연관
        → relevanceScore: 9.2/10
      </step>
    </analysis>
    <output>
      {
        "keyword": "2024년 코스피 저평가 우량주 TOP 10",
        "searchIntent": "commercial",
        "difficulty": "medium",
        "estimatedSearchVolume": 1450,
        "relevanceScore": 9.2,
        "contentType": "listicle",
        "reasoning": "AI 분석 기반 종목 추천 역량을 보여주는 핵심 키워드. 시즌별 업데이트로 지속적 트래픽 확보 가능."
      }
    </output>
  </example>
</few-shot-examples>`;

// ============================================================================
// Main Prompt Builder
// ============================================================================

/**
 * Builds enterprise-grade keyword generation prompt for Gemini 3 Pro Preview
 *
 * @param count - Number of keywords to generate (recommended: 5-15)
 * @param usedKeywords - Previously used keywords to exclude (deduplication)
 * @returns Optimized prompt string for AI keyword generation
 *
 * Prompt Engineering Techniques:
 * - Persona Definition: Expert role with specific domain knowledge
 * - Chain-of-Thought: 5-step systematic analysis framework
 * - Few-Shot Learning: 3 high-quality examples with reasoning
 * - Constraint Anchoring: Explicit rules with validation criteria
 * - Constitutional AI: Self-check requirements before output
 * - Output Schema Enforcement: Strict JSON structure specification
 */
export function buildKeywordGenerationPrompt(count: number, usedKeywords: string[]): string {
  // Prepare excluded keywords list (limit to 50 for context efficiency)
  const excludedKeywordsList = usedKeywords.length > 0
    ? usedKeywords.slice(0, 50).map((kw, i) => `${i + 1}. ${kw}`).join('\n')
    : '(없음 - 첫 생성)';

  // Calculate dynamic constraints based on count
  const diversityRequirement = count >= 5
    ? `최소 ${Math.ceil(count * 0.6)}개는 서로 다른 contentType을 가져야 합니다.`
    : '가능한 다양한 contentType을 포함하세요.';

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
서비스 유형: AI 기반 무료 주식 뉴스레터
핵심 가치: AI 기술적 분석, 무료 제공, 일일 인사이트
타겟 오디언스: 한국 주식 투자자 (초보~중급)
콘텐츠 영역: 기술적 분석, AI 예측, 시장 동향, 투자 교육
</service-context>
</system>

<task>
Stock Matrix 블로그를 위한 고품질 SEO 키워드 ${count}개를 생성하세요.
각 키워드는 체계적인 분석 프레임워크를 거쳐 생성되어야 합니다.
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
- Stock Matrix 서비스와의 연관성 (0-10점)
- 최소 기준: 7.5점 이상만 생성
- 평가 기준:
  - AI/기술적 분석 연관: +2점
  - 무료 서비스 연관: +1.5점
  - 뉴스레터 구독 유도 가능: +1점
  - 한국 시장 특화: +1점
  - 초보-중급 투자자 타겟: +0.5점
</analysis-framework>

<few-shot-learning>
다음 예시들의 분석 패턴과 출력 품질을 참고하세요:
${FEW_SHOT_EXAMPLES}
</few-shot-learning>

<constraints>
## 필수 준수 사항 (Mandatory)
1. 정확히 ${count}개의 키워드를 생성할 것
2. 모든 키워드의 relevanceScore >= 7.5
3. 모든 키워드는 한국어 기반 (영문 약어 허용: AI, RSI, PER 등)
4. JSON 배열 형식만 출력 (설명 텍스트 없음)
5. ${diversityRequirement}

## 금지 사항 (Prohibited)
1. 아래 제외 키워드와 동일하거나 유사한 키워드 생성 금지
2. 단일 단어 키워드 금지 (최소 2개 이상 조합)
3. 브랜드명 단독 사용 금지 (삼성전자만, 네이버만 등)
4. 검색량 100 미만 추정 키워드 금지
5. 추상적/모호한 키워드 금지

## 품질 기준 (Quality Gates)
- 롱테일 비율: 70% 이상 (3개+ 단어 조합)
- 검색 의도 명확성: 각 키워드에서 의도 추론 가능해야 함
- contentType 근거: 트리거 단어 기반 매칭 필수
</constraints>

<excluded-keywords>
다음 키워드들은 이미 사용되었으므로 제외하세요:
${excludedKeywordsList}
</excluded-keywords>

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
☐ 모든 relevanceScore가 7.5 이상인가?
☐ 제외 키워드와 중복되는 것이 없는가?
☐ 각 contentType에 매칭 근거(트리거)가 있는가?
☐ estimatedSearchVolume이 100-3000 범위인가?
☐ reasoning이 구체적이고 50자 이상인가?
☐ JSON 형식이 올바른가?
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
    // Check relevance score minimum
    if (kw.relevanceScore < SEO_SCORING_WEIGHTS.minimumRelevanceScore) {
      errors.push(`키워드 ${index + 1}: relevanceScore ${kw.relevanceScore} < 최소 기준 ${SEO_SCORING_WEIGHTS.minimumRelevanceScore}`);
    }

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