/** Gemini 기반 블로그 콘텐츠 생성 서비스 */

import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_CONFIG } from '@/lib/llm/_config/pipeline-config';
import { PIPELINE_CONFIG } from '../_config/pipeline-config';
import { buildContentGenerationPrompt } from '../_prompts/content-generation';
import { ALL_PATTERNS } from '../_config/clickbait-patterns';
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

/**
 * 런타임 GeneratedContent 타입 가드.
 *
 * faqItems는 Array.isArray만 보면 `["질문1","질문2"]` 같은 문자열 배열이 통과한다.
 * 그 배열은 FAQ 아코디언(item.question/item.answer)과 FAQPage JSON-LD로 그대로 흘러가
 * 빈 FAQ와 잘못된 구조화 데이터를 만든다. 원소 형태까지 본다.
 */
function isFaqItem(v: unknown): v is { answer: string; question: string } {
  if (!v || typeof v !== 'object') return false;
  const item = v as Record<string, unknown>;
  return typeof item.question === 'string' && item.question.trim().length > 0
    && typeof item.answer === 'string' && item.answer.trim().length > 0;
}

function isGeneratedContent(obj: unknown): obj is GeneratedContent {
  if (!obj || typeof obj !== 'object') return false;
  const content = obj as Record<string, unknown>;
  return (
    typeof content.title === 'string' &&
    typeof content.content === 'string' &&
    typeof content.metaTitle === 'string' &&
    typeof content.metaDescription === 'string' &&
    typeof content.description === 'string' &&
    Array.isArray(content.suggestedTags) &&
    content.suggestedTags.every((t) => typeof t === 'string') &&
    Array.isArray(content.faqItems) &&
    content.faqItems.every(isFaqItem)
  );
}

/** Gemini 응답에서 JSON 추출 및 타입 검증 */
/**
 * 이미지 플레이스홀더 제거.
 * 파이프라인에 실제 이미지 삽입 단계가 없으므로 `[이미지: ...]` / `![이미지: ...]` 마커는
 * 영원히 죽은 텍스트로 남아 그대로 발행된다. 프롬프트로 1차 차단하되 여기서 최종 제거한다.
 */
export function stripImagePlaceholders(md: string): string {
  const KW = '이미지|사진|그림|스크린샷|image|screenshot';
  return md
    // 마커만 있는 줄 전체 제거 (선택적 ! 및 뒤따르는 (url))
    .replace(new RegExp(`^[ \\t]*!?\\[\\s*(?:${KW})[^\\]\\n]*\\][ \\t]*(?:\\([^)\\n]*\\))?[ \\t]*$`, 'gim'), '')
    // 인라인 잔여 제거
    .replace(new RegExp(`!?\\[\\s*(?:${KW})[^\\]\\n]*\\](?:\\([^)\\n]*\\))?`, 'gi'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

  parsed.content = stripImagePlaceholders(parsed.content);

  return parsed;
}


/**
 * 제목의 미래 연월 표기를 찾는다. 없으면 null.
 *
 * 지원 표기: `(2027.01)` `[2027.1]` `2027년 1월` `2027-01` `2027.01` 그리고 연도 단독(`2027년`).
 * 월이 1~12를 벗어나면 연월로 보지 않는다.
 */
export function findFutureDateClaim(title: string, now: Date = new Date()): string | null {
  const current = now.getFullYear() * 100 + (now.getMonth() + 1);

  const withMonth = /(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*월?/g;
  for (const m of title.matchAll(withMonth)) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) continue;
    if (Number(m[1]) * 100 + month > current) return `${m[1]}.${String(month).padStart(2, '0')}`;
  }

  // 연도만 표기된 경우 — "년"이 없어도 잡는다. "반도체 관련주 2027 전망"도 미래 표기다.
  for (const m of title.matchAll(/\b(20\d{2})\b/g)) {
    if (Number(m[1]) > now.getFullYear()) return m[1];
  }

  return null;
}

/** SEO 기준 콘텐츠 유효성 검증 — 가산식 점수가 보상할 수 없는 필수 축은 여기서 하드 게이트 */
export function validateContent(content: GeneratedContent, targetKeyword?: string): void {
  const errors: string[] = [];

  if (!content.title || content.title.length < 10) errors.push('제목이 너무 짧습니다.');
  // 기존 하한 500자는 뼈대만 있는 글(실측 559자, 65점)도 통과시켰다.
  // CONTENT_CONFIG.minWordCount(1500단어)는 프롬프트에만 있었고 코드 게이트가 아니었다.
  if (!content.content || content.content.length < 2000) errors.push(`본문이 너무 짧습니다 (${content.content?.length ?? 0}자 < 2000자).`);

  // 본문에 타겟 키워드가 한 번도 없으면 주제 이탈이다 — 점수의 다른 축이 이를 보상하면 안 된다
  if (targetKeyword && content.content) {
    const bodyHits = content.content.toLowerCase().split(targetKeyword.toLowerCase()).length - 1;
    if (bodyHits === 0) errors.push(`본문에 타겟 키워드("${targetKeyword}")가 없습니다.`);
  }

  // 미래 시점 제목 금지 — 라이브에서 8월 발행 글 7개가 "(2026.10)"을 달고 나갔다.
  // 존재하지 않는 시점의 데이터를 가진 것처럼 읽히는 YMYL 신뢰 결함.
  // 괄호 점 표기만 잡던 것을 "2027년 1월", "[2027.01]", "2027-01", 연도 단독까지 넓혔다.
  const futureClaim = findFutureDateClaim(content.title ?? '');
  if (futureClaim) errors.push(`제목이 미래 시점(${futureClaim})을 표기합니다.`);
  if (!content.metaTitle || content.metaTitle.length > 70) errors.push('메타 제목이 없거나 70자를 초과합니다.');
  if (!content.metaDescription || content.metaDescription.length > 160) errors.push('메타 설명이 없거나 160자를 초과합니다.');
  if (!content.faqItems || content.faqItems.length < 2) errors.push('FAQ 항목이 부족합니다 (최소 2개).');

  const banned = ALL_PATTERNS.find((re) => re.test(content.title || ''));
  if (banned) errors.push(`제목에 낚시성 금지 표현 포함 (패턴: ${banned.source}). 사실형 제목으로 재생성 필요.`);

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
 *
 * 본문을 후처리(윤문)한 뒤에도 다시 불러 점수를 갱신해야 한다.
 * 길이·키워드·헤딩 항목이 전부 `content.content`에서 파생되기 때문이다.
 *
 * @param content - 생성된 콘텐츠
 * @param targetKeyword - SEO 타겟 키워드
 * @param competitorAnalysis - 경쟁사 분석 결과
 * @returns 0~100 품질 점수
 */
export function calculateQualityScore(
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

    // 타임아웃이 요청을 취소하지 않으면 재시도가 겹쳐 같은 프롬프트가 동시에 세 번 과금된다
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;

    try {
      const response = await Promise.race([
        genAI.models.generateContent({
          model: GEMINI_API_CONFIG.MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            abortSignal: controller.signal,
            maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
            temperature: GEMINI_API_CONFIG.TEMPERATURE,
            topP: GEMINI_API_CONFIG.TOP_P,
            topK: GEMINI_API_CONFIG.TOP_K,
            responseMimeType: GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
          },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Timeout after 120000ms'));
          }, 120000);
        }),
      ]);

      const responseText = response.text || '';
      if (!responseText) throw new Error('빈 응답을 받았습니다.');

      const content = parseJsonResponse(responseText);
      validateContent(content, targetKeyword);

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
    } finally {
      // 성공했을 때 타이머를 남기면 120초 뒤 abort가 걸린다(다음 시도까지 끊는다)
      clearTimeout(timer);
      controller.abort();
    }
  }

  throw lastError || new Error('콘텐츠 생성 실패 (모든 재시도 소진)');
}
