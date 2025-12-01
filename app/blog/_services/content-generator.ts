/**
 * Gemini 기반 콘텐츠 생성 서비스
 *
 * [이 파일의 역할]
 * - Google Gemini AI를 사용하여 SEO 최적화된 블로그 글 생성
 * - 경쟁사 분석 결과를 바탕으로 차별화된 콘텐츠 작성
 *
 * [Gemini란?]
 * - Google의 최신 대규모 언어 모델 (LLM)
 * - GPT-4와 경쟁하는 성능
 * - Vertex AI를 통해 기업용으로 제공
 *
 * [Vertex AI란?]
 * - Google Cloud의 머신러닝 플랫폼
 * - Gemini 모델을 기업 환경에서 안전하게 사용 가능
 * - 사용량 기반 과금 (종량제)
 *
 * [콘텐츠 생성 흐름]
 * 1. 경쟁사 분석 데이터 준비
 * 2. 프롬프트 생성 (content-generation.ts 사용)
 * 3. Gemini API 호출
 * 4. JSON 응답 파싱
 * 5. 콘텐츠 유효성 검증
 * 6. 선택적 후처리 (refineContent)
 */

import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_CONFIG } from '@/lib/llm/_config/pipeline-config';
import { PIPELINE_CONFIG } from '../_config/pipeline-config';
import { buildContentGenerationPrompt } from '../_prompts/content-generation';
import { withTimeout } from '../_utils/fetch-helpers';
import type { CompetitorAnalysis, GeneratedContent } from '../_types/blog';

/**
 * Gemini 클라이언트 초기화
 *
 * [Vertex AI 설정 요구사항]
 * - GOOGLE_CLOUD_PROJECT 환경변수 필수
 * - Google Cloud 프로젝트에 Vertex AI API 활성화 필요
 * - 서비스 계정 인증 설정 필요
 *
 * [리전 설정]
 * - asia-northeast3: 서울 리전
 * - 한국 사용자에게 가장 빠른 응답 속도
 *
 * @returns GoogleGenAI 클라이언트 인스턴스
 * @throws 환경변수가 설정되지 않은 경우 에러
 */
function initializeGemini(): GoogleGenAI {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT 환경변수가 설정되지 않았습니다.');
  }

  return new GoogleGenAI({
    vertexai: true, // Vertex AI 사용 모드
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: 'global', // 서울 리전
  });
}

/**
 * Gemini 응답에서 JSON 추출 및 파싱
 *
 * [왜 이 함수가 필요한가?]
 * - Gemini는 때때로 JSON을 markdown 코드 블록으로 감쌈
 * - 예: ```json { ... } ```
 * - 순수 JSON만 추출해야 JSON.parse() 가능
 *
 * [처리 과정]
 * 1. ```json 및 ``` 태그 제거
 * 2. 첫 번째 '{' 부터 마지막 '}' 까지 추출
 * 3. JSON.parse()로 파싱
 *
 * @param response - Gemini API 응답 텍스트
 * @returns 파싱된 GeneratedContent 객체
 * @throws 유효한 JSON을 찾을 수 없는 경우 에러
 */
function parseJsonResponse(response: string): GeneratedContent {
  // markdown 코드 블록 태그 제거
  const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  // JSON 객체의 시작과 끝 위치 찾기
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('유효한 JSON을 찾을 수 없습니다.');
  }

  // JSON 부분만 추출하여 파싱
  return JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1)) as GeneratedContent;
}

/**
 * 생성된 콘텐츠 유효성 검증
 *
 * [검증 항목]
 * - 제목: 10자 이상 필수
 * - 본문: 500자 이상 필수 (SEO 최소 기준)
 * - 메타 제목: 70자 이하 (Google 표시 제한)
 * - 메타 설명: 160자 이하 (Google 표시 제한)
 * - FAQ: 최소 2개 (FAQ 스키마 요구사항)
 *
 * [왜 검증이 필요한가?]
 * - AI가 때때로 불완전한 응답을 생성
 * - SEO 요구사항을 충족하지 못하면 검색 노출에 불리
 * - 조기에 문제 발견하여 재생성 요청
 *
 * @param content - 검증할 생성된 콘텐츠
 * @throws 유효성 검증 실패 시 에러 (문제점 목록 포함)
 */
function validateContent(content: GeneratedContent): void {
  const errors: string[] = [];

  // 제목 검증: 최소 10자
  if (!content.title || content.title.length < 10) {
    errors.push('제목이 너무 짧습니다.');
  }

  // 본문 검증: 최소 500자
  if (!content.content || content.content.length < 500) {
    errors.push('본문이 너무 짧습니다.');
  }

  // 메타 제목 검증: 존재 + 70자 이하
  if (!content.metaTitle || content.metaTitle.length > 70) {
    errors.push('메타 제목이 없거나 70자를 초과합니다.');
  }

  // 메타 설명 검증: 존재 + 160자 이하
  if (!content.metaDescription || content.metaDescription.length > 160) {
    errors.push('메타 설명이 없거나 160자를 초과합니다.');
  }

  // FAQ 검증: 최소 2개
  if (!content.faqItems || content.faqItems.length < 2) {
    errors.push('FAQ 항목이 부족합니다 (최소 2개).');
  }

  // 에러가 있으면 모든 문제점을 한번에 throw
  if (errors.length > 0) {
    throw new Error(`콘텐츠 유효성 검증 실패:\n${errors.join('\n')}`);
  }
}

/**
 * 블로그 콘텐츠 생성 (메인 함수)
 *
 * [실행 흐름]
 * 1. Gemini 클라이언트 초기화
 * 2. 프롬프트 생성 (경쟁사 분석 + 콘텐츠 타입)
 * 3. API 호출 (2분 타임아웃)
 * 4. 응답 파싱 및 검증
 * 5. 실패 시 최대 3회 재시도
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

  // 2. 프롬프트 생성
  const prompt = buildContentGenerationPrompt(targetKeyword, competitorAnalysis, contentType);

  // 재시도 로직을 위한 에러 저장
  let lastError: Error | null = null;

  // 3. 최대 3회 재시도
  for (let attempt = 1; attempt <= PIPELINE_CONFIG.retryAttempts; attempt++) {
    try {
      console.log(`   시도 ${attempt}/${PIPELINE_CONFIG.retryAttempts}...`);

      // 4. API 호출 (2분 타임아웃)
      // Gemini는 긴 콘텐츠 생성에 시간이 걸릴 수 있음
      // GEMINI_API_CONFIG: lib/llm/_config/pipeline-config.ts에서 중앙 관리
      const response = await withTimeout(
        genAI.models.generateContent({
          model: GEMINI_API_CONFIG.MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS, // 최대 토큰 수 (64K)
            temperature: GEMINI_API_CONFIG.TEMPERATURE, // 창의성 (1.0 = Gemini 3 권장)
            topP: GEMINI_API_CONFIG.TOP_P, // 다양성 조절 (0.95)
            topK: GEMINI_API_CONFIG.TOP_K, // 후보 토큰 수 (64)
            responseMimeType: GEMINI_API_CONFIG.RESPONSE_MIME_TYPE, // 응답 형식
          },
        }),
        120000 // 2분 타임아웃
      );

      // 5. 응답 텍스트 추출
      const responseText = response.text || '';

      if (!responseText) {
        throw new Error('빈 응답을 받았습니다.');
      }

      // 6. JSON 파싱 및 검증
      const content = parseJsonResponse(responseText);
      validateContent(content);

      return content;
    } catch (error) {
      // 에러 저장 및 로깅
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`   ❌ 시도 ${attempt} 실패: ${lastError.message}`);

      // 마지막 시도가 아니면 대기 후 재시도
      if (attempt < PIPELINE_CONFIG.retryAttempts) {
        // Exponential Backoff: 재시도마다 대기 시간 2배 증가
        const delay = PIPELINE_CONFIG.retryDelay * Math.pow(2, attempt - 1);
        console.log(`   ⏳ ${delay}ms 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 모든 재시도 실패
  throw lastError || new Error('콘텐츠 생성 실패');
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
 * @returns URL-friendly 슬러그
 *
 * @example
 * generateSlug('2024년 최고의 주식 뉴스레터 추천')
 * // 결과: 'stock-newsletter-recommend-2024-01-15'
 */
export function generateSlug(title: string): string {
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

  // 1. 소문자 변환
  let slug = title.toLowerCase();

  // 2. 한글 키워드를 영문으로 변환
  Object.entries(keywordMappings).forEach(([korean, english]) => {
    slug = slug.replace(new RegExp(korean, 'g'), english);
  });

  // 3-4. 특수문자 제거 및 공백 → 하이픈 변환
  slug = slug
    .replace(/[^\w\s-]/g, '') // 영숫자, 공백, 하이픈만 유지
    .replace(/\s+/g, '-') // 공백 → 하이픈
    .replace(/-+/g, '-') // 연속 하이픈 → 단일 하이픈
    .trim()
    .replace(/^-|-$/g, ''); // 앞뒤 하이픈 제거

  // 5. 날짜 추가 (고유성 보장)
  // 같은 제목의 글이 있어도 날짜가 다르면 다른 URL
  const date = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  slug = `${slug}-${date}`;

  return slug;
}

/**
 * 콘텐츠 후처리 (선택적 개선)
 *
 * [수행하는 작업]
 * 1. 메타 제목 길이 조정 (60자 초과 시 자르기)
 * 2. 메타 설명 길이 조정 (155자 초과 시 자르기)
 * 3. Stock Matrix CTA 링크 삽입 (없는 경우)
 *
 * [CTA (Call To Action)란?]
 * - 사용자의 행동을 유도하는 문구/버튼
 * - 예: "지금 바로 무료로 시작하세요!"
 * - 블로그 글에서 서비스 홍보에 활용
 *
 * @param content - 원본 생성 콘텐츠
 * @returns 개선된 콘텐츠
 *
 * @example
 * const refined = await refineContent(originalContent);
 */
export async function refineContent(
  content: GeneratedContent
): Promise<GeneratedContent> {
  console.log(`\n🔄 [Gemini] 콘텐츠 개선 시작...`);

  // 원본을 수정하지 않고 복사본 생성 (불변성)
  const refined = { ...content };

  // 1. 메타 제목 길이 조정
  // Google 검색 결과에서 60자 이후는 잘림
  if (refined.metaTitle.length > 60) {
    refined.metaTitle = refined.metaTitle.slice(0, 57) + '...';
  }

  // 2. 메타 설명 길이 조정
  // Google 검색 결과에서 155자 이후는 잘림
  if (refined.metaDescription.length > 155) {
    refined.metaDescription = refined.metaDescription.slice(0, 152) + '...';
  }

  // 3. Stock Matrix CTA 삽입 (없는 경우에만)
  if (!refined.content.includes('stockmatrix.co.kr')) {
    const ctaSection = `

---

**💡 지금 바로 [Stock Matrix](https://stockmatrix.co.kr)에서 무료로 AI 주식 분석을 받아보세요!**

`;
    // 결론 섹션(마지막 H2) 앞에 CTA 삽입
    const conclusionIndex = refined.content.lastIndexOf('## ');
    if (conclusionIndex > 0) {
      refined.content =
        refined.content.slice(0, conclusionIndex) +
        ctaSection +
        refined.content.slice(conclusionIndex);
    } else {
      // 결론 섹션을 찾지 못하면 맨 끝에 추가
      refined.content += ctaSection;
    }
  }

  console.log(`✅ [Gemini] 콘텐츠 개선 완료`);
  return refined;
}