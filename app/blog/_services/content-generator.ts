/**
 * Gemini 기반 콘텐츠 생성 서비스
 */

import { GoogleGenAI } from '@google/genai';
import { GEMINI_CONTENT_CONFIG, PIPELINE_CONFIG } from '../_config/pipeline-config';
import { buildContentGenerationPrompt } from '../_prompts/content-generation';
import { withTimeout } from '../_utils/fetch-helpers';
import type { CompetitorAnalysis, GeneratedContent } from '../_types/blog';

function initializeGemini(): GoogleGenAI {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT 환경변수가 설정되지 않았습니다.');
  }

  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: 'asia-northeast3',
  });
}

function parseJsonResponse(response: string): GeneratedContent {
  const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('유효한 JSON을 찾을 수 없습니다.');
  }

  return JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1)) as GeneratedContent;
}

function validateContent(content: GeneratedContent): void {
  const errors: string[] = [];

  if (!content.title || content.title.length < 10) errors.push('제목이 너무 짧습니다.');
  if (!content.content || content.content.length < 500) errors.push('본문이 너무 짧습니다.');
  if (!content.metaTitle || content.metaTitle.length > 70) errors.push('메타 제목이 없거나 70자를 초과합니다.');
  if (!content.metaDescription || content.metaDescription.length > 160) errors.push('메타 설명이 없거나 160자를 초과합니다.');
  if (!content.faqItems || content.faqItems.length < 2) errors.push('FAQ 항목이 부족합니다 (최소 2개).');

  if (errors.length > 0) {
    throw new Error(`콘텐츠 유효성 검증 실패:\n${errors.join('\n')}`);
  }
}

/**
 * 블로그 콘텐츠 생성
 */
export async function generateBlogContent(
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide'
): Promise<GeneratedContent> {
  console.log(`\n🤖 [Gemini] 콘텐츠 생성 시작...`);
  console.log(`   타겟 키워드: "${targetKeyword}"`);
  console.log(`   콘텐츠 타입: ${contentType}`);

  const genAI = initializeGemini();
  const prompt = buildContentGenerationPrompt(targetKeyword, competitorAnalysis, contentType);

  // 재시도 로직
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= PIPELINE_CONFIG.retryAttempts; attempt++) {
    try {
      console.log(`   시도 ${attempt}/${PIPELINE_CONFIG.retryAttempts}...`);

      const response = await withTimeout(
        genAI.models.generateContent({
          model: GEMINI_CONTENT_CONFIG.model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            maxOutputTokens: GEMINI_CONTENT_CONFIG.maxOutputTokens,
            temperature: GEMINI_CONTENT_CONFIG.temperature,
            topP: GEMINI_CONTENT_CONFIG.topP,
            topK: GEMINI_CONTENT_CONFIG.topK,
            responseMimeType: 'text/plain',
          },
        }),
        120000 // 2분 타임아웃
      );

      const responseText = response.text || '';

      if (!responseText) {
        throw new Error('빈 응답을 받았습니다.');
      }

      // JSON 파싱
      const content = parseJsonResponse(responseText);

      validateContent(content);
      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`   ❌ 시도 ${attempt} 실패: ${lastError.message}`);

      if (attempt < PIPELINE_CONFIG.retryAttempts) {
        const delay = PIPELINE_CONFIG.retryDelay * Math.pow(2, attempt - 1);
        console.log(`   ⏳ ${delay}ms 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('콘텐츠 생성 실패');
}

/**
 * 슬러그 생성 (URL-friendly)
 */
export function generateSlug(title: string): string {
  // 한글 제목을 영문 슬러그로 변환하는 매핑
  const keywordMappings: Record<string, string> = {
    주식: 'stock',
    뉴스레터: 'newsletter',
    추천: 'recommend',
    분석: 'analysis',
    투자: 'investment',
    무료: 'free',
    사이트: 'site',
    서비스: 'service',
    종목: 'stocks',
    코스피: 'kospi',
    코스닥: 'kosdaq',
    기술적: 'technical',
    'AI': 'ai',
  };

  let slug = title.toLowerCase();

  // 한글 키워드를 영문으로 변환
  Object.entries(keywordMappings).forEach(([korean, english]) => {
    slug = slug.replace(new RegExp(korean, 'g'), english);
  });

  // 특수문자 제거 및 공백을 하이픈으로 변환
  slug = slug
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-|-$/g, '');

  // 현재 날짜 추가 (고유성 보장)
  const date = new Date().toISOString().slice(0, 10);
  slug = `${slug}-${date}`;

  return slug;
}

/**
 * 2차 콘텐츠 개선 (선택적)
 */
export async function refineContent(
  content: GeneratedContent
): Promise<GeneratedContent> {
  console.log(`\n🔄 [Gemini] 콘텐츠 개선 시작...`);

  // 간단한 자동 개선 (Gemini 호출 없이)
  const refined = { ...content };

  // 메타 제목 길이 조정
  if (refined.metaTitle.length > 60) {
    refined.metaTitle = refined.metaTitle.slice(0, 57) + '...';
  }

  // 메타 설명 길이 조정
  if (refined.metaDescription.length > 155) {
    refined.metaDescription = refined.metaDescription.slice(0, 152) + '...';
  }

  // Stock Matrix 링크 삽입 (없는 경우)
  if (!refined.content.includes('stockmatrix.co.kr')) {
    const ctaSection = `

---

**💡 지금 바로 [Stock Matrix](https://stockmatrix.co.kr)에서 무료로 AI 주식 분석을 받아보세요!**

`;
    // 결론 섹션 앞에 CTA 삽입
    const conclusionIndex = refined.content.lastIndexOf('## ');
    if (conclusionIndex > 0) {
      refined.content =
        refined.content.slice(0, conclusionIndex) +
        ctaSection +
        refined.content.slice(conclusionIndex);
    } else {
      refined.content += ctaSection;
    }
  }

  console.log(`✅ [Gemini] 콘텐츠 개선 완료`);
  return refined;
}