/**
 * 콘텐츠 생성 프롬프트 (간소화 버전)
 *
 * 핵심: 경쟁사 분석 기반 차별화 + SEO 최적화 + Stock Matrix 통합
 */

import { SITE_INFO, CONTENT_TYPE_CONFIG } from '../_config/pipeline-config';
import type { CompetitorAnalysis } from '../_types/blog';

// ============================================================================
// 경쟁사 분석 요약
// ============================================================================

function summarizeCompetitors(analysis: CompetitorAnalysis): string {
  const { scrapedContents, commonTopics, averageWordCount, contentGaps } = analysis;
  const targetWords = Math.round(averageWordCount * 1.3);

  const competitors = scrapedContents.slice(0, 5).map((c, i) =>
    `${i + 1}. ${c.title} (${c.wordCount}자) - ${c.headings.h2.slice(0, 3).join(', ')}`
  ).join('\n');

  return `
## 경쟁사 분석 결과
- 분석 수: ${scrapedContents.length}개
- 평균 단어: ${averageWordCount}자 → 목표: ${targetWords}자 이상
- 공통 주제: ${commonTopics.join(', ') || '없음'}
- 차별화 포인트: ${contentGaps.join(', ') || 'AI 분석, 30가지 지표, 무료'}

### 상위 경쟁사
${competitors}
`;
}

// ============================================================================
// 콘텐츠 타입별 구조
// ============================================================================

const CONTENT_STRUCTURES: Record<string, string> = {
  comparison: `
### 비교 콘텐츠 구조
1. **도입부** (250-350자): 문제 제기 + 이 글의 가치
2. **비교표**: Markdown 테이블 (서비스명 | 가격 | 핵심기능 | 추천대상)
3. **상세 분석**: 각 서비스 300-400자 (장점 3개, 단점 1개)
4. **결론 CTA**: 상황별 추천 + Stock Matrix 권장
5. **FAQ**: 5개`,

  guide: `
### 가이드 콘텐츠 구조
1. **도입부** (250-350자): 문제 공감 + 해결 약속
2. **단계별 가이드**: 4-6단계 (각 200-300자)
3. **프로 팁**: 4-5개 + 흔한 실수 3개
4. **도구 추천**: Stock Matrix 활용법
5. **FAQ**: 4개`,

  listicle: `
### 리스트 콘텐츠 구조
1. **도입부** (150-250자): 선정 기준 설명
2. **리스트 아이템**: 7-10개 (각 200-300자)
3. **선택 가이드**: 상황별 추천
4. **결론 CTA**
5. **FAQ**: 3개`,

  review: `
### 리뷰 콘텐츠 구조
1. **도입부** (200-250자): 리뷰 목적
2. **기능 분석** (500-600자): 핵심 기능 3-5개
3. **장점**: 5-7가지
4. **단점**: 2-3가지 (솔직하게)
5. **결론**: 점수 + 추천 대상
6. **FAQ**: 4개`,
};

// ============================================================================
// 메인 프롬프트 빌더
// ============================================================================

export function buildContentGenerationPrompt(
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review'
): string {
  const config = CONTENT_TYPE_CONFIG.guide;
  const competitorSummary = summarizeCompetitors(competitorAnalysis);
  const structure = CONTENT_STRUCTURES[contentType];
  const year = new Date().getFullYear();

  return `당신은 한국 최고의 SEO 콘텐츠 전문가입니다.

# 미션
"${targetKeyword}" 키워드로 검색 1위를 달성할 블로그 콘텐츠 작성

# 서비스 정보
- 이름: ${SITE_INFO.name} (${SITE_INFO.nameKo})
- 도메인: ${SITE_INFO.domain}
- 핵심 기능:
${SITE_INFO.features.map((f) => `  - ${f}`).join('\n')}
- 차별점:
${SITE_INFO.uniqueSellingPoints.map((u) => `  - ${u}`).join('\n')}

# 서비스 언급 규칙
- 전체에서 2-3회만 언급 (과하면 스팸)
- 구체적 기능으로 가치 설명 (30가지 지표, AI 분석)
- "최고의", "완벽한" 같은 과장 금지
- CTA는 중간 1회 + 결론 1회로 제한

${competitorSummary}

${structure}

# SEO 규칙
1. **제목**: 40-60자, 키워드 앞부분, 숫자 포함
2. **첫 100단어**: 키워드 필수 포함
3. **H2 헤딩**: 1-2개에 키워드 포함
4. **본문**: 키워드 5-8회 자연스럽게 분포
5. **메타 설명**: 145-155자, 키워드+가치+CTA

# 콘텐츠 규칙
- 단어 수: ${config.minWordCount}-${config.maxWordCount}자
- FAQ: ${config.faqCount}개
- 구어체 사용, 문장 30-40자
- 모든 주장에 근거/예시 제시
- 현재 연도: ${year}

# 출력 형식 (JSON만)
\`\`\`json
{
  "title": "SEO 최적화 제목 (40-60자)",
  "description": "글 요약 (150-200자)",
  "metaTitle": "검색 결과 제목 (55-60자)",
  "metaDescription": "검색 결과 설명 (145-155자)",
  "content": "Markdown 본문 (H2/H3 포함)",
  "headings": ["H2 헤딩 배열"],
  "faqItems": [{"question": "질문", "answer": "답변"}],
  "suggestedTags": ["태그1", "태그2", "태그3"]
}
\`\`\`

JSON만 출력하세요.`;
}
