// AI 키워드 생성 프롬프트 빌더

import {
  CONTENT_TYPE_RULES,
  FEW_SHOT_EXAMPLES,
  MAX_SEARCH_VOLUME,
  TOPIC_BUCKETS,
  SEARCH_QUERY_GUIDELINES,
} from './keyword-prompt-constants';
import type { CompetitorKeyword } from './keyword-validation';
import type { TLIContext } from '../_services/tli-context';
import { formatTLIForPrompt } from '../_services/tli-context';

export { validateKeywordMetadata, calculateSEOScore } from './keyword-validation';
export type { CompetitorKeyword } from './keyword-validation';

/** AI 키워드 생성 프롬프트 빌더 */
export function buildKeywordGenerationPrompt(
  count: number,
  usedKeywords: string[],
  competitorKeywords?: CompetitorKeyword[],
  existingTitles?: string[],
  tliContext?: TLIContext,
): string {
  const excludedKeywordsList = usedKeywords.length > 0
    ? usedKeywords.slice(-100).map((kw, i) => `${i + 1}. ${kw}`).join('\n')
    : '(없음 - 첫 생성)';

  const existingTitlesList = existingTitles && existingTitles.length > 0
    ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : '(없음 - 첫 생성)';

  const minDistinctContentTypes = count >= 5 ? Math.min(4, Math.ceil(count * 0.6)) : 2;
  const minDistinctTopicAreas = count >= 5 ? Math.min(4, Math.ceil(count * 0.5)) : 2;

  const diversityRequirement = count >= 5
    ? [
        `최소 ${minDistinctContentTypes}개는 서로 다른 contentType을 가져야 합니다.`,
        `최소 ${minDistinctTopicAreas}개는 서로 다른 topicArea를 가져야 합니다.`,
        `theme(테마/이슈) topicArea를 최우선으로 사용하세요.`,
      ].join(' ')
    : '가능한 다양한 contentType과 topicArea를 포함하세요.';

  const competitorKeywordsSection = competitorKeywords && competitorKeywords.length > 0
    ? `
<competitor-keywords-analysis>
## 경쟁사 콘텐츠에서 발견된 키워드
다음은 경쟁사 블로그/콘텐츠에서 추출한 상위 키워드입니다.
이 키워드들을 참고하여 비슷하지만 더 구체적이고 차별화된 롱테일 키워드를 생성하세요.

${competitorKeywords.slice(0, 15).map((kw, i) => `${i + 1}. "${kw.keyword}" (${kw.sources.length}개 소스)`).join('\n')}

**활용 방법**:
- 위 키워드를 그대로 사용하지 말고, 이를 기반으로 더 구체적인 변형을 만드세요
- 경쟁사가 놓친 세부 주제나 롱테일 키워드를 발굴하세요
</competitor-keywords-analysis>`
    : '';

  // TLI 컨텍스트 섹션
  const themeCount = Math.ceil(count * 0.8);
  const evergreenCount = count - themeCount;
  const tliSection = tliContext && !tliContext.isEmpty
    ? `
<tli-market-context>
${formatTLIForPrompt(tliContext)}

**TLI 데이터 활용 규칙 (최우선):**
- 전체 ${count}개 중 **최소 ${themeCount}개**는 위 테마/종목을 활용한 키워드를 생성하세요 (topicArea: "theme")
- 나머지 **최대 ${evergreenCount}개**는 일반 투자 주제 (에버그린 콘텐츠)
- 테마명은 그대로 사용 (예: "2차전지 관련주"), 종목명도 그대로 사용 (예: "삼성전자 실적")
- Growth/Reigniting 테마를 우선 활용하세요
- 같은 테마에서 최대 2개 키워드까지만 허용
</tli-market-context>`
    : '';

  return `<system>
당신은 한국 주식 시장 SEO 전문가이자 콘텐츠 전략가입니다.

<service-context>
서비스명: Stock Matrix (스톡 매트릭스)
서비스 유형: 주식 투자 정보 블로그
타겟 오디언스: 한국 주식 투자자 (초보~중급)

**주제 버킷(topicArea) 정의** (반드시 출력에 topicArea 필드로 명시):
${TOPIC_BUCKETS}

**버킷 분산 규칙:**
- theme(테마/이슈) 버킷이 최우선입니다 (전체의 80%)
- 동일 topicArea는 최대 3개까지 허용 (theme 제외, theme은 제한 없음)
- 에버그린 주제(차트 보는법, 증권사 이용법 등)는 이미 포화 → 가급적 피하세요
</service-context>
</system>
${tliSection}

<task>
Stock Matrix 블로그를 위한 고품질 SEO 키워드 ${count}개를 생성하세요.
목표는 "검색 유입"이며, 각 키워드는 사용자가 실제로 검색창에 입력하는 **검색 쿼리** 형태여야 합니다.
현재 시장에서 실제로 관심받는 테마와 종목을 기반으로 시의성 있는 키워드를 생성하세요.
후킹은 키워드가 아닌 콘텐츠 제목에서 처리하므로, 키워드는 검색 가능성에 집중하세요.
</task>

<analysis-framework>
각 키워드 생성 시 다음 5단계 분석을 수행하세요:

## Step 1: 검색 의도 분석
- informational: 정보/지식 습득 목적 (가중치: 1.2x)
- commercial: 구매/선택 전 비교 조사 (가중치: 1.1x)
- transactional: 즉각적 행동/구매 의도 (가중치: 0.9x)
- navigational: 특정 사이트/페이지 탐색 (가중치: 0.7x)

## Step 2: 난이도 평가
- low: 롱테일, 틈새 키워드 (가중치: 1.3x)
- medium: 적정 경쟁, 기회 존재 (가중치: 1.0x)
- high: 대형 사이트 경쟁 심함 (가중치: 0.7x)

## Step 3: 검색량 추정
- optimal zone: 500-1500 (가중치: 1.2x) - 우선 타겟
- good zone: 100-500 (가중치: 1.0x)
- low zone: <100 (가중치: 0.6x) - 피할 것
- high zone: >3000 (가중치: 0.8x) - 경쟁 과열

## Step 4: 콘텐츠 타입 매칭
${CONTENT_TYPE_RULES}

## Step 5: 관련성 점수 산정 (0-10점)
- 주식 투자/분석 관련: +3점
- 실용적 정보 제공: +2점
- 한국 시장 관련: +2점
- 검색 수요 높음: +2점
- 시의성 (트렌딩 테마/종목): +1점 (보너스)

${SEARCH_QUERY_GUIDELINES}
</analysis-framework>

<few-shot-learning>
다음 예시들의 분석 패턴과 출력 품질을 참고하세요:
${FEW_SHOT_EXAMPLES}
</few-shot-learning>

<constraints>
## 필수 준수 사항
1. 정확히 ${count}개의 키워드를 생성할 것
2. 모든 키워드는 한국어 기반 (영문 약어 허용: AI, RSI, PER 등)
3. JSON 배열 형식만 출력 (설명 텍스트 없음)
4. 모든 항목에 topicArea를 반드시 포함할 것
5. 키워드는 40자 이내의 실제 검색 쿼리 형태일 것
6. 서로 유사한 문장(표현만 바꾼 반복) 금지
7. ${diversityRequirement}

## 금지 사항
1. 제외 키워드와 동일/유사(의미상 유사 포함)한 키워드 생성 금지
2. 단일 단어 키워드 금지 (최소 2개 이상 조합)
3. 브랜드명 단독 사용 금지
4. 검색량 100 미만 추정 키워드 금지
5. 추상적/모호한 키워드 금지
6. 후킹/낚시성 블로그 제목 형태 키워드 금지 ("99%가 모르는", "프로만 아는" 등)

## 품질 기준
- 롱테일 비율: 70% 이상 (3개+ 단어 조합)
- contentType 근거: 트리거 단어 기반 매칭 필수
- 테마/종목 비율: 전체의 80% 이상은 실제 테마명/종목명 포함
</constraints>

<excluded-keywords>
다음 키워드들은 이미 사용되었으므로 제외하세요:
${excludedKeywordsList}
</excluded-keywords>

<existing-blog-titles>
**[최우선 규칙] 절대 중복 금지**

아래는 이미 작성된 모든 블로그 글 제목입니다.
**다음 제목들과 주제, 지표, 전략, 관점이 겹치는 키워드는 절대 생성하지 마세요.**

${existingTitlesList}

**중복 판정 기준 (하나라도 해당하면 탈락):**
1. 같은 지표를 다루는 경우
2. 같은 전략을 다루는 경우
3. 같은 관점을 다루는 경우 ("방법", "활용법", "보는법"은 같은 관점)
4. 같은 대상을 다루는 경우 (같은 지표+같은 상황 = 중복)
</existing-blog-titles>
${competitorKeywordsSection}

<output-schema>
반드시 다음 JSON 스키마를 준수하세요:

\`\`\`typescript
interface KeywordMetadata {
  keyword: string;           // 한국어 SEO 키워드 (2+ 단어, 40자 이내)
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  difficulty: 'low' | 'medium' | 'high';
  estimatedSearchVolume: number;  // 100-${MAX_SEARCH_VOLUME} 범위
  relevanceScore: number;         // 7.5-10.0 범위
  contentType: 'comparison' | 'guide' | 'listicle' | 'review';
  topicArea: 'technical' | 'value' | 'strategy' | 'market' | 'discovery' | 'psychology' | 'education' | 'execution' | 'theme';
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
- 정확히 ${count}개의 키워드가 있는가?
- 제외 키워드와 중복되는 것이 없는가?
- estimatedSearchVolume이 100-${MAX_SEARCH_VOLUME} 범위인가?
- reasoning이 구체적이고 50자 이상인가?
- JSON 형식이 올바른가?
- topicArea가 누락되지 않았는가?
- 키워드가 40자 이내의 실제 검색 쿼리 형태인가?
- 80% 이상이 테마/종목 기반 키워드인가?
</self-validation>

**JSON 배열만 출력하세요. 다른 텍스트는 포함하지 마세요.**`;
}
