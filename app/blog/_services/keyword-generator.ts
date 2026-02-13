/** AI 기반 동적 키워드 생성 서비스 */

import { z } from 'zod';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import { buildKeywordGenerationPrompt } from '../_prompts/keyword-generation';
import { validateKeywordMetadata, calculateSEOScore } from '../_prompts/keyword-validation';
import { isDuplicate } from './keyword-similarity';
import { fetchTLIContext } from './tli-context';
import type { TLIContext } from './tli-context';
import type { KeywordMetadata } from '../_types/blog';

const keywordMetadataSchema = z.object({
  keyword: z.string(),
  searchIntent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
  difficulty: z.enum(['low', 'medium', 'high']),
  estimatedSearchVolume: z.number(),
  relevanceScore: z.number(),
  contentType: z.enum(['comparison', 'guide', 'listicle', 'review']),
  topicArea: z.enum([
    'technical', 'value', 'strategy', 'market', 'discovery',
    'psychology', 'education', 'execution', 'theme',
  ]),
  reasoning: z.string(),
});

const keywordsArraySchema = z.array(keywordMetadataSchema);

interface KeywordGenerationResult {
  success: boolean;
  keywords: KeywordMetadata[];
  totalGenerated: number;
  totalFiltered: number;
  error?: string;
}

interface UsedContent {
  keywords: string[];
  titles: string[];
}

/** 기존 블로그 포스트에서 사용된 키워드/제목 조회 */
async function getUsedContent(): Promise<UsedContent> {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('title, target_keyword, secondary_keywords, tags')
    .not('target_keyword', 'is', null);

  if (error) {
    console.error('[KeywordGenerator] 조회 실패:', error);
    return { keywords: [], titles: [] };
  }

  const allKeywords = new Set<string>();
  const allTitles: string[] = [];

  data.forEach((post) => {
    if (post.title) {
      allTitles.push(post.title.trim());
    }

    if (post.target_keyword) {
      allKeywords.add(post.target_keyword.toLowerCase().trim());
    }

    if (Array.isArray(post.secondary_keywords)) {
      post.secondary_keywords.forEach((kw: string) => {
        if (kw) allKeywords.add(kw.toLowerCase().trim());
      });
    }

    if (Array.isArray(post.tags)) {
      post.tags.forEach((tag: string) => {
        if (tag) allKeywords.add(tag.toLowerCase().trim());
      });
    }
  });

  return { keywords: Array.from(allKeywords), titles: allTitles };
}

/** AI로 키워드를 생성하고 중복 제거 후 반환 */
async function generateKeywordsWithAI(
  count: number,
  usedKeywords: string[],
  existingTitles: string[],
  tliContext?: TLIContext,
): Promise<KeywordMetadata[]> {
  console.log(`[KeywordGenerator] AI 생성 중 (제외: ${usedKeywords.length}개, 기존 글: ${existingTitles.length}개, TLI: ${tliContext?.themes.length ?? 0}개 테마)`);

  const prompt = buildKeywordGenerationPrompt(count, usedKeywords, undefined, existingTitles, tliContext);
  const response = await generateText({ prompt });

  try {
    const jsonText = response.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = keywordsArraySchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) {
      console.warn('[KeywordGen] AI 응답 Zod 검증 실패:', parsed.error.message);
      return [];
    }
    const keywords: KeywordMetadata[] = parsed.data;

    const validation = validateKeywordMetadata(keywords);
    if (!validation.isValid) {
      console.warn('[KeywordGenerator] 품질 경고:', validation.errors.slice(0, 3).join(', '));
    }

    const validKeywords: KeywordMetadata[] = [];
    const allExistingKeywords = [...usedKeywords];

    for (const kw of keywords) {
      // Zod z.enum()이 searchIntent/difficulty/contentType/topicArea를 보장
      if (!kw.keyword) continue;
      if (kw.keyword.length > 40) continue;
      if (isDuplicate(kw.keyword, allExistingKeywords, existingTitles)) continue;

      validKeywords.push(kw);
      allExistingKeywords.push(kw.keyword.toLowerCase().trim());
    }

    console.log(`[KeywordGenerator] 생성: ${keywords.length}개, 유효: ${validKeywords.length}개`);
    return validKeywords;
  } catch (error) {
    console.error('[KeywordGenerator] JSON 파싱 실패:', error);
    throw new Error('AI 응답 파싱 실패');
  }
}

/** 키워드 생성 메인 함수 (재시도 + SEO 점수 정렬) */
export async function generateKeywords(
  requestedCount: number = 5,
  options: { maxRetries?: number } = {}
): Promise<KeywordGenerationResult> {
  const { maxRetries = 3 } = options;

  console.log(`[KeywordGenerator] ${requestedCount}개 키워드 생성 시작`);

  try {
    const [usedContent, tliContext] = await Promise.all([
      getUsedContent(),
      fetchTLIContext(),
    ]);
    console.log(`[KeywordGenerator] 기존 키워드: ${usedContent.keywords.length}개, 기존 글: ${usedContent.titles.length}개, TLI: ${tliContext.themes.length}개 테마`);

    const keywordMap = new Map<string, KeywordMetadata>();
    let attempt = 0;

    while (keywordMap.size < requestedCount && attempt < maxRetries) {
      attempt++;
      const remainingCount = requestedCount - keywordMap.size;
      console.log(`[KeywordGenerator] 시도 ${attempt}/${maxRetries}: ${remainingCount}개 필요`);

      const newKeywords = await generateKeywordsWithAI(
        Math.ceil(remainingCount * 1.5),
        usedContent.keywords,
        usedContent.titles,
        tliContext,
      );

      newKeywords.forEach((kw) => {
        keywordMap.set(kw.keyword.toLowerCase(), kw);
        usedContent.keywords.push(kw.keyword);
      });
    }

    const allKeywords = Array.from(keywordMap.values());
    const scoreMap = new Map(allKeywords.map((kw) => [kw.keyword, calculateSEOScore(kw)]));
    const sortedKeywords = [...allKeywords].sort(
      (a, b) => (scoreMap.get(b.keyword) ?? 0) - (scoreMap.get(a.keyword) ?? 0)
    );

    const selectedKeywords = sortedKeywords.slice(0, requestedCount);

    console.log(`[KeywordGenerator] 완료: 생성 ${allKeywords.length}개 -> 선택 ${selectedKeywords.length}개`);
    selectedKeywords.forEach((kw, idx) => {
      console.log(`  ${idx + 1}. "${kw.keyword}" (${scoreMap.get(kw.keyword)}점, ${kw.difficulty}, ~${kw.estimatedSearchVolume})`);
    });

    return {
      success: true,
      keywords: selectedKeywords,
      totalGenerated: allKeywords.length,
      totalFiltered: selectedKeywords.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[KeywordGen] 상세 에러:', errorMessage);

    return {
      success: false,
      keywords: [],
      totalGenerated: 0,
      totalFiltered: 0,
      error: '키워드 생성 중 오류가 발생했습니다',
    };
  }
}
