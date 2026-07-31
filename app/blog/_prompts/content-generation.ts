// 콘텐츠 생성 프롬프트 빌더

import { SITE_INFO, CONTENT_CONFIG } from '../_config/pipeline-config';
import type { CompetitorAnalysis } from '../_types/blog';
import { getContentStructureGuide } from './content-structure-templates';
import {
  getFewShotExamples,
  getKoreanSeoGuidelines,
  getChainOfThoughtGuide,
  getQualityChecklist,
} from './seo-guidelines';

/** 경쟁사 분석 결과를 구조화된 인사이트로 변환 */
function summarizeCompetitorAnalysis(analysis: CompetitorAnalysis): string {
  const { scrapedContents, commonTopics, averageWordCount, contentGaps } =
    analysis;

  const competitorDetails = scrapedContents
    .map((content, idx) => {
      const allHeadings = [
        ...content.headings.h1,
        ...content.headings.h2.slice(0, 7),
      ];
      const contentPreview = content.paragraphs
        .slice(0, 4)
        .join(' ')
        .slice(0, 600);

      return `
<competitor rank="${idx + 1}">
  <title>${content.title}</title>
  <url>${content.url}</url>
  <word_count>${content.wordCount}</word_count>
  <heading_structure>${allHeadings.join(' | ') || '구조 없음'}</heading_structure>
  <content_sample>${contentPreview}...</content_sample>
  <strengths>분석 필요: 이 콘텐츠가 상위 랭킹인 이유</strengths>
  <weaknesses>분석 필요: 개선 가능한 영역</weaknesses>
</competitor>`;
    })
    .join('\n');

  const targetWordCount = Math.max(
    Math.round(averageWordCount * 1.3),
    averageWordCount + 500
  );

  return `
<competitor_intelligence>
  <summary>
    <total_analyzed>${scrapedContents.length}</total_analyzed>
    <avg_word_count>${averageWordCount}</avg_word_count>
    <target_word_count>${targetWordCount}</target_word_count>
    <common_topics>${commonTopics.join(', ') || '공통 토픽 없음'}</common_topics>
    <content_gaps>${contentGaps.join(', ') || 'AI 분석, 30가지 지표, 무료 서비스'}</content_gaps>
  </summary>

  <competitors>
${competitorDetails}
  </competitors>

  <strategic_directives>
    - 평균 대비 30% 이상 긴 콘텐츠 작성 (${targetWordCount}+ 단어)
    - 모든 공통 토픽을 더 깊이 있게 다룰 것
    - 콘텐츠 갭을 차별화 포인트로 활용
    - 경쟁사의 약점을 우리의 강점으로 전환
  </strategic_directives>
</competitor_intelligence>`;
}

/** 콘텐츠 생성 프롬프트 빌더 */
export function buildContentGenerationPrompt(
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review'
): string {
  const config = CONTENT_CONFIG;
  const competitorSummary = summarizeCompetitorAnalysis(competitorAnalysis);
  const structureGuide = getContentStructureGuide(contentType);
  const fewShotExamples = getFewShotExamples();
  const koreanSeoGuide = getKoreanSeoGuidelines();
  const cotGuide = getChainOfThoughtGuide(targetKeyword);
  const qualityChecklist = getQualityChecklist(config, targetKeyword);

  return `
<system_context>
당신은 한국 최고의 SEO 콘텐츠 전문가입니다. 당신의 글은 항상 Google/Naver 검색 1페이지에 노출되며, 독자들의 높은 참여율을 기록합니다.

당신의 전문 분야:
- 한국어 SEO 콘텐츠 작성 10년 경력
- 금융/투자 분야 콘텐츠 마케팅 전문
- 전환율 최적화 (CRO) 전문가
- Google E-E-A-T 기준 충족 콘텐츠 제작

당신의 작성 원칙:
1. 독자에게 실질적 가치를 제공하는 콘텐츠만 작성
2. 모든 주장에는 근거(통계, 예시, 경험)를 제시
3. 과장이나 허위 정보 절대 금지
4. 서비스 홍보는 자연스럽고 가치 중심으로
</system_context>

<mission>
타겟 키워드 "${targetKeyword}"로 검색 1위를 달성할 수 있는 최고 품질의 한국어 블로그 콘텐츠를 작성하세요.
경쟁사 콘텐츠를 분석하여 더 깊이 있고, 더 실용적이며, 더 차별화된 콘텐츠를 생성해야 합니다.
</mission>

<target_keyword priority="high">
${targetKeyword}
</target_keyword>

<our_service>
  <name>${SITE_INFO.name}</name>
  <name_ko>${SITE_INFO.nameKo}</name_ko>
  <domain>${SITE_INFO.domain}</domain>
  <highlights>
${SITE_INFO.highlights.map((h) => `    - ${h}`).join('\n')}
  </highlights>
  <integration_guidelines>
    - 콘텐츠 전체에서 2-3회만 언급 (과하면 스팸으로 인식)
    - 항상 독자에게 제공하는 가치 관점에서 설명
    - "최고의", "완벽한" 같은 과장 표현 금지
    - 구체적 기능(30가지 지표, AI 분석 등)으로 차별화
    - CTA는 중간 1회 + 결론 1회로 제한
  </integration_guidelines>
</our_service>

${competitorSummary}

${cotGuide}

${fewShotExamples}

${structureGuide}

${koreanSeoGuide}

<content_requirements>
  <word_count>
    <min>${config.minWordCount}</min>
    <max>${config.maxWordCount}</max>
    <target>${Math.round((config.minWordCount + config.maxWordCount) / 2)}</target>
  </word_count>
  <faq_count>${config.faqCount}</faq_count>
  <language>한국어 (자연스러운 구어체, 존칭 사용)</language>
  <tone>전문적이면서도 친근한, 신뢰감 있는 톤</tone>
  <current_year>${new Date().getFullYear()}</current_year>
</content_requirements>

${qualityChecklist}

<output_specification>
반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트 없이 JSON만 출력합니다.

**제목(title) 최종 점검:**
- 이 제목을 보고 "클릭 안 하면 손해"라는 느낌이 드는가?
- 심리 트리거(손실회피/호기심/공포/구체성/대비) 중 1개 이상 있는가?
- 대괄호 레이블, AI 티나는 표현 없는가?
- 유튜브 썸네일에 써도 될 만큼 임팩트 있는가?

\`\`\`json
{
  "title": "클릭 안 하면 손해인 제목 (예: '이 신호 무시했다가 300만원 날린 썰')",
  "description": "글의 핵심 가치를 요약 (150-200자)",
  "metaTitle": "검색 결과 제목 (50-60자, 키워드 앞부분 + 후킹 요소)",
  "metaDescription": "검색 결과 설명 (145-155자, 키워드+가치+CTA)",
  "content": "전체 본문 (Markdown 형식, H2/H3 헤딩 포함, 이미지 위치 표시)",
  "headings": ["H2 헤딩 배열 (순서대로)"],
  "faqItems": [
    {
      "question": "실제 검색될 만한 질문 형태",
      "answer": "구체적이고 유용한 답변 (2-4문장)"
    }
  ],
  "suggestedTags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}
\`\`\`
</output_specification>

<final_instruction>
위의 모든 가이드라인을 철저히 따라 최고 품질의 SEO 콘텐츠를 생성하세요.
특히 Chain of Thought 프로세스를 내부적으로 수행한 후 콘텐츠를 작성하고,
작성 완료 후 Quality Checklist로 자가 검증을 수행하세요.
오직 JSON 형식으로만 응답하세요.
</final_instruction>
`;
}
