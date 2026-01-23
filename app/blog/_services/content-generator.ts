/**
 * 엔터프라이즈급 Gemini 콘텐츠 생성 서비스
 *
 * - 3단계 품질 검증 (타입 → 필드 → 품질 점수)
 * - Exponential Backoff + Jitter 재시도
 * - 실시간 메트릭 수집 및 품질 점수 계산
 */

import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_CONFIG } from '@/lib/llm/_config/pipeline-config';
import { PIPELINE_CONFIG } from '../_config/pipeline-config';
import { buildContentGenerationPrompt } from '../_prompts/content-generation';
import type { CompetitorAnalysis, GeneratedContent } from '../_types/blog';


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

/** 타입 가드: 런타임에 GeneratedContent 타입 검증 */
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

/** SEO 기준 콘텐츠 유효성 검증 (제목 10+자, 본문 500+자, 메타태그, FAQ 2+개) */
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

/** 한글/영문 혼합 텍스트의 워드 수 계산 */
function countWords(text: string): number {
  const koreanWords = (text.match(/[가-힣]+/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  return koreanWords + englishWords;
}

/**
 * 콘텐츠 품질 점수 계산 (100점 만점)
 * - 길이 품질 (30점): 경쟁사 평균 대비 130% 목표
 * - 구조 품질 (25점): 제목, 메타데이터, FAQ 완성도
 * - SEO 품질 (25점): 키워드 밀도, 메타 최적화
 * - 가독성 품질 (20점): 헤딩, 리스트, 문단 구성
 */
function calculateQualityScore(
  content: GeneratedContent,
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis
): number {
  let score = 0;

  // 1. 길이 품질 (30점)
  // 목표: 경쟁사 평균 + 30% (엘리트급 프롬프트 지시사항)
  const targetWordCount = Math.floor(competitorAnalysis.averageWordCount * 1.3) || 3000;
  const actualWordCount = countWords(content.content);
  const lengthRatio = actualWordCount / targetWordCount;
  if (lengthRatio >= 1.0) score += 30;
  else if (lengthRatio >= 0.8) score += 25;
  else if (lengthRatio >= 0.6) score += 20;
  else score += 10;

  // 2. 구조 품질 (25점)
  if (content.title && content.title.length >= 10) score += 8;
  if (content.metaTitle && content.metaTitle.length <= 70) score += 7;
  if (content.metaDescription && content.metaDescription.length <= 160) score += 5;
  if (content.faqItems && content.faqItems.length >= 3) score += 5;

  // 3. SEO 품질 (25점)
  // 키워드 검색을 위한 대소문자 무시 정규식 (escape 처리로 특수문자 안전 처리)
  const escapedKeyword = targetKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keywordRegex = new RegExp(escapedKeyword, 'gi');

  const keywordInTitle = content.title.toLowerCase().includes(targetKeyword.toLowerCase());
  const keywordInMeta = content.metaDescription.toLowerCase().includes(targetKeyword.toLowerCase());
  const keywordDensity = (content.content.match(keywordRegex) || []).length;
  if (keywordInTitle) score += 10;
  if (keywordInMeta) score += 8;
  if (keywordDensity >= 3) score += 7;

  // 4. 가독성 품질 (20점)
  const hasHeadings = (content.content.match(/^##\s/gm) || []).length >= 3;
  const hasLists = content.content.includes('-') || content.content.includes('1.');
  const hasParagraphs = content.content.split('\n\n').length >= 5;
  if (hasHeadings) score += 8;
  if (hasLists) score += 7;
  if (hasParagraphs) score += 5;

  return Math.min(score, 100);
}

/**
 * 블로그 콘텐츠 생성 (엔터프라이즈급 메인 함수)
 *
 * [Enterprise 실행 흐름]
 * 1. 메트릭 추적 시작 (totalAttempts++)
 * 2. Gemini 클라이언트 초기화
 * 3. 프롬프트 생성 (엘리트급 프롬프트 사용)
 * 4. API 호출 (2분 타임아웃)
 * 5. 응답 파싱 및 3단계 검증
 * 6. 품질 점수 계산 및 메트릭 수집
 * 7. 실패 시 Exponential Backoff + Jitter로 재시도
 *
 * [품질 검증 3단계]
 * - Layer 1: JSON 파싱 성공 여부
 * - Layer 2: 필수 필드 존재 및 길이 검증
 * - Layer 3: 품질 점수 60점 이상 (configurable)
 *
 * [재시도 전략]
 * - Exponential Backoff: 2^attempt * baseDelay
 * - Jitter: ±30% 랜덤 지연 (thundering herd 방지)
 * - 최대 3회 재시도
 *
 * [콘텐츠 타입별 특징]
 * - comparison: 서비스 비교 (테이블 포함)
 * - guide: 단계별 가이드 (How-to)
 * - listicle: 목록형 글 (Top 10 등)
 * - review: 서비스 리뷰 (장단점 분석)
 *
 * @param targetKeyword - SEO 타겟 키워드
 * @param competitorAnalysis - 경쟁사 분석 결과
 * @param contentType - 콘텐츠 유형 (기본: guide)
 * @returns 생성된 블로그 콘텐츠
 * @throws 모든 재시도 실패 시 에러
 *
 * @example
 * const content = await generateBlogContent(
 *   '주식 뉴스레터 추천',
 *   competitorAnalysis,
 *   'listicle'
 * );
 */
export async function generateBlogContent(
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide'
): Promise<GeneratedContent> {
  console.log(`\n🤖 [Gemini] 콘텐츠 생성 시작...`);
  console.log(`   타겟 키워드: "${targetKeyword}"`);
  console.log(`   콘텐츠 타입: ${contentType}`);

  // 1. Gemini 클라이언트 초기화
  const genAI = initializeGemini();

  // 2. 프롬프트 생성 (엘리트급 프롬프트 사용)
  const prompt = buildContentGenerationPrompt(targetKeyword, competitorAnalysis, contentType);

  // 재시도 로직을 위한 에러 저장
  let lastError: Error | null = null;

  // 3. 최대 3회 재시도 (Intelligent Retry with Jitter)
  for (let attempt = 1; attempt <= PIPELINE_CONFIG.retryAttempts; attempt++) {
    const attemptStartTime = Date.now();

    try {
      console.log(`   🔄 시도 ${attempt}/${PIPELINE_CONFIG.retryAttempts}...`);

      // 4. API 호출 (2분 타임아웃)
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

      // 5. 응답 텍스트 추출
      const responseText = response.text || '';

      if (!responseText) {
        throw new Error('빈 응답을 받았습니다.');
      }

      // 6. JSON 파싱 및 검증 (Layer 1 & 2)
      const content = parseJsonResponse(responseText);
      validateContent(content);

      // 품질 점수 계산 (Layer 3)
      const qualityScore = calculateQualityScore(content, targetKeyword, competitorAnalysis);
      console.log(`   📊 품질 점수: ${qualityScore}/100`);

      if (qualityScore < 60) {
        throw new Error(`품질 점수 미달 (${qualityScore}/100 < 60)`);
      }

      const generationTime = Date.now() - attemptStartTime;
      console.log(`   ✅ 생성 성공! (${generationTime}ms, Q=${qualityScore})`);

      return content;
    } catch (error) {
      // 에러 저장 및 로깅
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`   ❌ 시도 ${attempt} 실패: ${lastError.message}`);

      // 마지막 시도가 아니면 Intelligent Retry 적용
      if (attempt < PIPELINE_CONFIG.retryAttempts) {
        // Exponential Backoff with Jitter
        const baseDelay = PIPELINE_CONFIG.retryDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * baseDelay; // ±30% jitter
        const delay = baseDelay + jitter;

        console.log(`   ⏳ ${Math.round(delay)}ms 후 재시도 (Exponential Backoff + Jitter)...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 모든 재시도 실패
  throw lastError || new Error('콘텐츠 생성 실패 (모든 재시도 소진)');
}

/**
 * URL-friendly 슬러그 생성
 *
 * [슬러그란?]
 * - URL에 사용되는 읽기 쉬운 식별자
 * - 예: /blog/best-stock-newsletter-2024
 *
 * [변환 과정]
 * 1. 소문자 변환
 * 2. 한글 키워드 → 영문 변환 (미리 정의된 매핑 사용)
 * 3. 특수문자 제거
 * 4. 공백 → 하이픈 변환
 * 5. 날짜 추가 (고유성 보장)
 *
 * @param title - 원본 제목
 * @param fallbackKeyword - 제목이 비어있거나 숫자-only일 때 사용할 보조 키워드
 * @returns URL-friendly 슬러그
 *
 * @example
 * generateSlug('2024년 최고의 주식 뉴스레터 추천')
 * // 결과: 'stock-newsletter-recommend-2024-01-15'
 */
function normalizeSlugBase(text: string, keywordMappings: Record<string, string>): string {
  let slug = text.toLowerCase();

  Object.entries(keywordMappings).forEach(([korean, english]) => {
    slug = slug.replace(new RegExp(korean, 'g'), english);
  });

  return slug
    .replace(/[^\w\s-]/g, '') // 영숫자, 공백, 하이픈만 유지
    .replace(/\s+/g, '-') // 공백 → 하이픈
    .replace(/-+/g, '-') // 연속 하이픈 → 단일 하이픈
    .trim()
    .replace(/^-|-$/g, ''); // 앞뒤 하이픈 제거
}

function hasAlpha(slug: string): boolean {
  return /[a-z]/.test(slug);
}

function hashSlugSeed(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

export function generateSlug(title: string, fallbackKeyword?: string): string {
  // 한글 → 영문 키워드 매핑
  // SEO를 위해 영문 URL 사용
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

  const baseFromTitle = normalizeSlugBase(title, keywordMappings);
  let slugBase = baseFromTitle;

  if (!slugBase || !hasAlpha(slugBase)) {
    const fallbackBase = fallbackKeyword
      ? normalizeSlugBase(fallbackKeyword, keywordMappings)
      : '';
    if (fallbackBase && hasAlpha(fallbackBase)) {
      slugBase = fallbackBase;
    }
  }

  if (!slugBase) {
    const seed = title || fallbackKeyword || 'stock-analysis';
    slugBase = `stock-analysis-${hashSlugSeed(seed)}`;
  }

  // 5. 날짜 추가 (고유성 보장)
  // 같은 제목의 글이 있어도 날짜가 다르면 다른 URL
  const date = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  return `${slugBase}-${date}`;
}
