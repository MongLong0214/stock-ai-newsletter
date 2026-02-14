/**
 * 콘텐츠 생성 — 파싱, 검증, 품질 점수, 재시도 로직
 */

import { buildContentGenerationPrompt } from '@/app/blog/_prompts/content-generation';
import type { Provider, GeneratedContent, CompetitorAnalysis, ContentType } from '../types';
import { RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS, TIMEOUTS, QUALITY_MIN_SCORE } from '../constants';
import { withTimeout, countKoreanWords } from '../utils';
import { callLLMWithFallback } from '../providers/router';

// --- Type Guard ---

function isGeneratedContent(obj: unknown): obj is GeneratedContent {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.title === 'string' &&
    typeof c.content === 'string' &&
    typeof c.metaTitle === 'string' &&
    typeof c.metaDescription === 'string' &&
    Array.isArray(c.faqItems)
  );
}

// --- JSON 파싱 ---

export function parseJsonResponse(response: string): GeneratedContent {
  const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('유효한 JSON을 찾을 수 없습니다.');

  const parsed: unknown = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
  if (!isGeneratedContent(parsed)) throw new Error('응답 형식이 GeneratedContent 스키마와 일치하지 않습니다.');
  return parsed;
}

// --- 콘텐츠 유효성 검증 ---

export function validateContent(content: GeneratedContent): void {
  const errors: string[] = [];
  if (!content.title || content.title.length < 10) errors.push('제목이 너무 짧습니다.');
  if (!content.content || content.content.length < 500) errors.push('본문이 너무 짧습니다.');
  if (!content.metaTitle || content.metaTitle.length > 70) errors.push('메타 제목이 없거나 70자를 초과합니다.');
  if (!content.metaDescription || content.metaDescription.length > 160) errors.push('메타 설명이 없거나 160자를 초과합니다.');
  if (!content.faqItems || content.faqItems.length < 2) errors.push('FAQ 항목이 부족합니다 (최소 2개).');
  if (errors.length > 0) throw new Error(`콘텐츠 유효성 검증 실패:\n${errors.join('\n')}`);
}

// --- 품질 점수 (100점 만점) ---

export function calculateQualityScore(
  content: GeneratedContent,
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
): number {
  const keywordLower = targetKeyword.toLowerCase();
  let score = 0;

  // 길이 (30점)
  const targetWordCount = Math.floor(competitorAnalysis.averageWordCount * 1.3) || 3000;
  const lengthRatio = countKoreanWords(content.content) / targetWordCount;
  if (lengthRatio >= 1.0) score += 30;
  else if (lengthRatio >= 0.8) score += 25;
  else if (lengthRatio >= 0.6) score += 20;
  else score += 10;

  // 구조 (25점)
  if (content.title && content.title.length >= 10) score += 8;
  if (content.metaTitle && content.metaTitle.length <= 70) score += 7;
  if (content.metaDescription && content.metaDescription.length <= 160) score += 5;
  if (content.faqItems && content.faqItems.length >= 3) score += 5;

  // SEO (25점)
  const escapedKeyword = targetKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keywordRegex = new RegExp(escapedKeyword, 'gi');
  if (content.title.toLowerCase().includes(keywordLower)) score += 10;
  if (content.metaDescription.toLowerCase().includes(keywordLower)) score += 8;
  if ((content.content.match(keywordRegex) || []).length >= 3) score += 7;

  // 가독성 (20점)
  if ((content.content.match(/^##\s/gm) || []).length >= 3) score += 8;
  if (content.content.includes('-') || content.content.includes('1.')) score += 7;
  if (content.content.split('\n\n').length >= 5) score += 5;

  return Math.min(score, 100);
}

// --- 콘텐츠 생성 (재시도 + 폴백 체인) ---

export async function generateBlogContent(
  providers: Provider[],
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: ContentType = 'guide',
): Promise<GeneratedContent> {
  console.log(`[MultiLLM] 콘텐츠 생성 시작: "${targetKeyword}" (${contentType})`);
  const prompt = buildContentGenerationPrompt(targetKeyword, competitorAnalysis, contentType);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const attemptStartTime = Date.now();
    try {
      const responseText = await withTimeout(
        callLLMWithFallback(providers, prompt),
        TIMEOUTS.llmCall,
        'LLM call',
      );
      if (!responseText) throw new Error('빈 응답을 받았습니다.');

      const content = parseJsonResponse(responseText);
      validateContent(content);

      const qualityScore = calculateQualityScore(content, targetKeyword, competitorAnalysis);
      if (qualityScore < QUALITY_MIN_SCORE) {
        throw new Error(`품질 점수 미달 (${qualityScore}/100 < ${QUALITY_MIN_SCORE})`);
      }

      console.log(`[MultiLLM] 생성 완료 (${Date.now() - attemptStartTime}ms, Q=${qualityScore})`);
      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[MultiLLM] 시도 ${attempt} 실패: ${lastError.message}`);
      if (attempt < RETRY_ATTEMPTS) {
        const baseDelay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * baseDelay;
        await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      }
    }
  }

  throw lastError || new Error('콘텐츠 생성 실패 (모든 재시도 소진)');
}
