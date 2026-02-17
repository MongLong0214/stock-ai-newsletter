/** Gemini 기반 블로그 콘텐츠 생성 서비스 */

import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_CONFIG } from '@/lib/llm/_config/pipeline-config';
import { PIPELINE_CONFIG } from '../_config/pipeline-config';
import { buildContentGenerationPrompt } from '../_prompts/content-generation';
import type { CompetitorAnalysis, GeneratedContent } from '../_types/blog';

// 하위 호환: pipeline.ts에서 이 경로로 import
export { generateSlug } from '../_utils/slug-generator';

/** Gemini Vertex AI 클라이언트 초기화 */
function initializeGemini(): GoogleGenAI {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT 환경변수가 설정되지 않았습니다.');
  }

  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: 'global',
  });
}

/** 런타임 GeneratedContent 타입 가드 */
function isGeneratedContent(obj: unknown): obj is GeneratedContent {
  if (!obj || typeof obj !== 'object') return false;
  const content = obj as Record<string, unknown>;
  return (
    typeof content.title === 'string' &&
    typeof content.content === 'string' &&
    typeof content.metaTitle === 'string' &&
    typeof content.metaDescription === 'string' &&
    Array.isArray(content.faqItems)
  );
}

/** Gemini 응답에서 JSON 추출 및 타입 검증 */
function parseJsonResponse(response: string): GeneratedContent {
  const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('유효한 JSON을 찾을 수 없습니다.');
  }

  const parsed: unknown = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));

  if (!isGeneratedContent(parsed)) {
    throw new Error('응답 형식이 GeneratedContent 스키마와 일치하지 않습니다.');
  }

  return parsed;
}

/** SEO 기준 콘텐츠 유효성 검증 */
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

/** 한글/영문 혼합 텍스트의 단어 수 계산 (한글 어절 + 영문 단어 분리 카운트) */
function countKoreanWords(text: string): number {
  const koreanWords = (text.match(/[가-힣]+/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  return koreanWords + englishWords;
}

/**
 * 콘텐츠 품질 점수 계산 (100점 만점)
 * @param content - 생성된 콘텐츠
 * @param targetKeyword - SEO 타겟 키워드
 * @param competitorAnalysis - 경쟁사 분석 결과
 * @returns 0~100 품질 점수
 */
function calculateQualityScore(
  content: GeneratedContent,
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis
): number {
  const keywordLower = targetKeyword.toLowerCase();
  let score = 0;

  // 길이 품질 (30점): 경쟁사 평균 대비 130% 목표
  const targetWordCount = Math.floor(competitorAnalysis.averageWordCount * 1.3) || 3000;
  const lengthRatio = countKoreanWords(content.content) / targetWordCount;
  if (lengthRatio >= 1.0) score += 30;
  else if (lengthRatio >= 0.8) score += 25;
  else if (lengthRatio >= 0.6) score += 20;
  else score += 10;

  // 구조 품질 (25점)
  if (content.title && content.title.length >= 10) score += 8;
  if (content.metaTitle && content.metaTitle.length <= 70) score += 7;
  if (content.metaDescription && content.metaDescription.length <= 160) score += 5;
  if (content.faqItems && content.faqItems.length >= 3) score += 5;

  // SEO 품질 (25점)
  const escapedKeyword = targetKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keywordRegex = new RegExp(escapedKeyword, 'gi');
  if (content.title.toLowerCase().includes(keywordLower)) score += 10;
  if (content.metaDescription.toLowerCase().includes(keywordLower)) score += 8;
  if ((content.content.match(keywordRegex) || []).length >= 3) score += 7;

  // 가독성 품질 (20점)
  if ((content.content.match(/^##\s/gm) || []).length >= 3) score += 8;
  if (content.content.includes('-') || content.content.includes('1.')) score += 7;
  if (content.content.split('\n\n').length >= 5) score += 5;

  return Math.min(score, 100);
}

/**
 * 블로그 콘텐츠 생성 (Exponential Backoff + 3단계 품질 검증)
 * @param targetKeyword - SEO 타겟 키워드
 * @param competitorAnalysis - 경쟁사 분석 결과
 * @param contentType - 콘텐츠 유형 (기본: guide)
 * @returns 생성된 블로그 콘텐츠
 */
export async function generateBlogContent(
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide'
): Promise<GeneratedContent> {
  console.log(`[Gemini] 콘텐츠 생성 시작: "${targetKeyword}" (${contentType})`);

  const genAI = initializeGemini();
  const prompt = buildContentGenerationPrompt(targetKeyword, competitorAnalysis, contentType);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= PIPELINE_CONFIG.retryAttempts; attempt++) {
    const attemptStartTime = Date.now();

    try {
      const response = await Promise.race([
        genAI.models.generateContent({
          model: GEMINI_API_CONFIG.MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
            temperature: GEMINI_API_CONFIG.TEMPERATURE,
            topP: GEMINI_API_CONFIG.TOP_P,
            topK: GEMINI_API_CONFIG.TOP_K,
            responseMimeType: GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 120000ms')), 120000)
        ),
      ]);

      const responseText = response.text || '';
      if (!responseText) throw new Error('빈 응답을 받았습니다.');

      const content = parseJsonResponse(responseText);
      validateContent(content);

      const qualityScore = calculateQualityScore(content, targetKeyword, competitorAnalysis);
      if (qualityScore < 60) {
        throw new Error(`품질 점수 미달 (${qualityScore}/100 < 60)`);
      }

      content.qualityScore = qualityScore;
      console.log(`[Gemini] 생성 완료 (${Date.now() - attemptStartTime}ms, Q=${qualityScore})`);
      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Gemini] 시도 ${attempt} 실패: ${lastError.message}`);

      if (attempt < PIPELINE_CONFIG.retryAttempts) {
        const baseDelay = PIPELINE_CONFIG.retryDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * baseDelay;
        await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      }
    }
  }

  throw lastError || new Error('콘텐츠 생성 실패 (모든 재시도 소진)');
}
