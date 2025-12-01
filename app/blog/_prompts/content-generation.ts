/**
 * 블로그 콘텐츠 생성 프롬프트
 *
 * [이 파일의 역할]
 * - Gemini AI에게 전달할 프롬프트(지시문)를 생성
 * - 경쟁사 분석 결과를 바탕으로 더 나은 콘텐츠를 만들도록 안내
 *
 * [프롬프트 엔지니어링이란?]
 * - AI에게 원하는 결과물을 얻기 위해 지시문을 잘 작성하는 기술
 * - 구체적인 요구사항, 예시, 형식 등을 포함하면 더 좋은 결과물 생성
 *
 * [사용 흐름]
 * 1. 경쟁사 콘텐츠 분석 결과 입력
 * 2. 콘텐츠 타입(비교/가이드/리스트/리뷰) 선택
 * 3. AI에게 전달할 상세 프롬프트 생성
 */

import { SITE_INFO, CONTENT_TYPE_CONFIG } from '../_config/pipeline-config';
import type { CompetitorAnalysis } from '../_types/blog';

/**
 * 경쟁사 분석 결과를 AI가 이해하기 쉬운 텍스트로 변환
 *
 * @param analysis - 경쟁사 웹사이트에서 수집한 정보
 * @returns AI에게 전달할 경쟁사 요약 텍스트
 */
function summarizeCompetitorAnalysis(analysis: CompetitorAnalysis): string {
  const { scrapedContents, commonTopics, averageWordCount } = analysis;

  const competitorSummaries = scrapedContents
    .map((content, idx) => {
      const headings = [
        ...content.headings.h1,
        ...content.headings.h2.slice(0, 5),
      ].join(', ');

      const contentPreview = content.paragraphs.slice(0, 3).join(' ').slice(0, 500);

      return `
### 경쟁사 ${idx + 1}: ${content.title}
- URL: ${content.url}
- 단어 수: ${content.wordCount}
- 주요 헤딩: ${headings || '없음'}
- 콘텐츠 미리보기: ${contentPreview}...
`;
    })
    .join('\n');

  return `
## 경쟁사 분석 요약

- 분석된 경쟁사 수: ${scrapedContents.length}개
- 평균 콘텐츠 길이: ${averageWordCount}단어
- 공통 토픽: ${commonTopics.join(', ') || '없음'}

${competitorSummaries}
`;
}

/**
 * 콘텐츠 타입별 글 구조 템플릿 반환
 *
 * [왜 구조 가이드가 필요한가?]
 * - AI가 일관된 형식의 글을 작성하도록 유도
 * - SEO에 최적화된 구조로 검색 순위 향상
 * - 독자가 읽기 쉬운 형태로 구성
 *
 * @param contentType - 콘텐츠 타입 (comparison/guide/listicle/review)
 * @returns 해당 타입에 맞는 구조 가이드 텍스트
 */
function getContentStructureGuide(
  contentType: 'comparison' | 'guide' | 'listicle' | 'review'
): string {
  const structures: Record<typeof contentType, string> = {
    comparison: `
## 콘텐츠 구조 (비교 글)

1. **서론** (200-300단어)
   - 훅: 독자의 관심을 끄는 질문 또는 통계
   - 문제 정의: 왜 이 비교가 필요한지
   - 미리보기: 무엇을 비교할 것인지

2. **비교 테이블** (Markdown 테이블)
   - 주요 기능 비교
   - 가격 비교
   - 장단점 요약

3. **상세 비교 분석** (각 항목 300-400단어)
   - 각 서비스/제품 개별 분석
   - Stock Matrix의 차별점 강조

4. **추천 결론** (200-300단어)
   - 상황별 추천
   - Stock Matrix CTA

5. **FAQ 섹션** (5개 질문)
`,
    guide: `
## 콘텐츠 구조 (가이드 글)

1. **서론** (200-300단어)
   - 문제/니즈 정의
   - 이 가이드가 해결할 것
   - 대상 독자

2. **단계별 가이드** (각 단계 200-300단어)
   - Step 1: ...
   - Step 2: ...
   - Step 3: ...
   - 각 단계마다 구체적인 액션

3. **팁과 주의사항** (300단어)
   - 프로 팁 3-5개
   - 흔한 실수 피하기

4. **Stock Matrix 활용법** (200-300단어)
   - 가이드와 연계한 서비스 소개
   - CTA

5. **FAQ 섹션** (4개 질문)
`,
    listicle: `
## 콘텐츠 구조 (리스트 글)

1. **서론** (150-200단어)
   - 리스트 주제 소개
   - 선정 기준 설명

2. **리스트 항목들** (각 200-300단어)
   - 1. [항목명]
     - 설명
     - 장점
     - 단점 (있다면)
   - 2. [항목명]
   - ... (총 5-10개 항목)
   - Stock Matrix는 상위권에 자연스럽게 배치

3. **선택 가이드** (200단어)
   - 상황별 추천
   - Stock Matrix 강조

4. **결론 및 CTA** (150단어)

5. **FAQ 섹션** (3개 질문)
`,
    review: `
## 콘텐츠 구조 (리뷰 글)

1. **서론** (200단어)
   - 리뷰 대상 소개
   - 리뷰 목적

2. **주요 기능 소개** (500단어)
   - 핵심 기능 설명
   - 스크린샷/예시 설명

3. **장점** (300단어)
   - 구체적인 장점 나열
   - 실제 사용 경험

4. **단점 및 개선점** (200단어)
   - 솔직한 단점 (신뢰도 확보)
   - 개선 희망 사항

5. **가격 및 가치** (150단어)
   - 무료/유료 분석
   - 가성비 평가

6. **결론** (200단어)
   - 총평
   - 추천 대상
   - CTA

7. **FAQ 섹션** (4개 질문)
`,
  };

  return structures[contentType];
}

/**
 * 메인 콘텐츠 생성 프롬프트 빌더
 *
 * [이 함수가 하는 일]
 * 1. 경쟁사 분석 결과를 요약
 * 2. 콘텐츠 타입에 맞는 구조 가이드 선택
 * 3. 모든 정보를 조합하여 완성된 프롬프트 생성
 *
 * [프롬프트에 포함되는 내용]
 * - 타겟 키워드 (SEO 목표)
 * - 우리 서비스 정보 (홍보용)
 * - 경쟁사 분석 요약 (차별화 전략)
 * - 글 구조 가이드 (형식 통일)
 * - SEO 요구사항 (검색 최적화)
 * - 출력 형식 (JSON)
 *
 * @param targetKeyword - SEO 목표 키워드 (예: "주식 뉴스레터 추천")
 * @param competitorAnalysis - 경쟁사 분석 결과
 * @param contentType - 생성할 콘텐츠 타입
 * @returns Gemini AI에게 전달할 완성된 프롬프트 문자열
 */
export function buildContentGenerationPrompt(
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review'
): string {
  const config = CONTENT_TYPE_CONFIG[contentType];
  const competitorSummary = summarizeCompetitorAnalysis(competitorAnalysis);
  const structureGuide = getContentStructureGuide(contentType);

  return `
# SEO 최적화 블로그 콘텐츠 생성

당신은 한국어 SEO 콘텐츠 전문가입니다. 아래 경쟁사 분석을 바탕으로, 검색 상위 노출을 목표로 하는 고품질 블로그 포스트를 작성하세요.

## 타겟 키워드
**"${targetKeyword}"**

## 우리 서비스 정보
- 서비스명: ${SITE_INFO.name} (${SITE_INFO.nameKo})
- 웹사이트: ${SITE_INFO.domain}
- 주요 기능:
${SITE_INFO.features.map((f) => `  - ${f}`).join('\n')}
- 차별점:
${SITE_INFO.uniqueSellingPoints.map((u) => `  - ${u}`).join('\n')}

${competitorSummary}

${structureGuide}

## 콘텐츠 요구사항

### 기본 요구사항
- **단어 수**: ${config.minWordCount} ~ ${config.maxWordCount} 단어
- **FAQ 수**: ${config.faqCount}개
- **언어**: 한국어 (자연스러운 구어체)
- **톤**: 전문적이면서도 친근한 톤

### SEO 요구사항
1. **타겟 키워드** "${targetKeyword}"를 자연스럽게 포함:
   - 제목 (H1)에 반드시 포함
   - 첫 100단어 내에 포함
   - 본문에 3-5회 자연스럽게 분포
   - H2 헤딩 중 1-2개에 포함

2. **메타 정보**:
   - 메타 제목: 60자 이내, 키워드 포함
   - 메타 설명: 155자 이내, 키워드 포함, CTA 포함

3. **내부 링크**:
   - Stock Matrix 홈페이지 링크 1-2회 삽입
   - 자연스러운 CTA로 연결

### 경쟁사 대비 차별화
1. 경쟁사 콘텐츠에서 다루는 공통 토픽은 반드시 커버
2. 경쟁사가 놓친 "콘텐츠 갭"을 채우기:
   - AI 기반 분석의 장점
   - 30가지 기술적 지표의 가치
   - 무료 서비스의 접근성
3. 경쟁사보다 더 상세하고 실용적인 정보 제공
4. 최신 정보 반영 (2024-2025년 기준)

### Stock Matrix 자연스러운 홍보
- 과도한 홍보 금지 (신뢰도 하락)
- 객관적 비교 속에서 자연스럽게 장점 부각
- 실제 사용 가치 중심으로 설명
- CTA는 글 중간 1회 + 결론 1회

## 출력 형식

아래 JSON 형식으로 출력하세요:

\`\`\`json
{
  "title": "SEO 최적화된 제목 (H1)",
  "description": "글 요약 설명 (200자 이내)",
  "metaTitle": "메타 제목 (60자 이내)",
  "metaDescription": "메타 설명 (155자 이내)",
  "content": "전체 본문 (Markdown 형식)",
  "headings": ["H2 헤딩 목록"],
  "faqItems": [
    {"question": "질문1", "answer": "답변1"},
    {"question": "질문2", "answer": "답변2"}
  ],
  "suggestedTags": ["태그1", "태그2", "태그3"],
  "estimatedReadTime": 5
}
\`\`\`

이제 위 요구사항에 맞는 고품질 SEO 콘텐츠를 생성하세요.
`;
}
