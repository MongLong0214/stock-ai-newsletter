/** AI 기반 동적 키워드 생성 서비스 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import {
  buildKeywordGenerationPrompt,
  validateKeywordMetadata,
  calculateSEOScore,
} from '../_prompts/keyword-generation';
import { STOP_WORDS, CORE_TOPIC_WORDS } from '../_config/keyword-dictionaries';
import type { KeywordMetadata } from '../_types/blog';

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
    if (post.title && typeof post.title === 'string') {
      allTitles.push(post.title.trim());
    }

    allKeywords.add(post.target_keyword.toLowerCase().trim());

    if (Array.isArray(post.secondary_keywords)) {
      post.secondary_keywords.forEach((kw: string) => {
        if (kw && typeof kw === 'string') allKeywords.add(kw.toLowerCase().trim());
      });
    }

    if (Array.isArray(post.tags)) {
      post.tags.forEach((tag: string) => {
        if (tag && typeof tag === 'string') allKeywords.add(tag.toLowerCase().trim());
      });
    }
  });

  return { keywords: Array.from(allKeywords), titles: allTitles };
}

/** 텍스트에서 핵심 주제어 추출 (불용어 제외, 부분 매칭 포함) */
function extractCoreTopics(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);

  const topics = new Set<string>();

  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;

    if (CORE_TOPIC_WORDS.has(word)) {
      topics.add(word);
      continue;
    }

    // 부분 매칭 (예: "볼린저" -> "볼린저밴드")
    for (const coreTopic of CORE_TOPIC_WORDS) {
      if (word.includes(coreTopic) || coreTopic.includes(word)) {
        topics.add(coreTopic);
      }
    }

    if (word.length >= 2) {
      topics.add(word);
    }
  }

  return topics;
}

/** Jaccard 유사도 + 핵심 주제어 오버랩 기반 유사도 검사 */
function isSimilar(newText: string, existingTexts: string[], threshold: number = 0.5): boolean {
  const newTopics = extractCoreTopics(newText);
  if (newTopics.size === 0) return false;

  for (const existing of existingTexts) {
    const existingTopics = extractCoreTopics(existing);
    if (existingTopics.size === 0) continue;

    const intersection = new Set([...newTopics].filter((w) => existingTopics.has(w)));
    const union = new Set([...newTopics, ...existingTopics]);
    const jaccardSimilarity = intersection.size / union.size;

    // 핵심 주제어 2개 이상 겹치면 중복으로 판정
    const coreOverlap = [...intersection].filter((w) => CORE_TOPIC_WORDS.has(w));

    if (jaccardSimilarity >= threshold || coreOverlap.length >= 2) {
      return true;
    }
  }

  return false;
}

/** 키워드 중복 검사 (완전 일치 + 유사도 + 기존 제목 비교) */
function isDuplicate(
  newKeyword: string,
  existingKeywords: string[],
  existingTitles: string[] = []
): boolean {
  const normalized = newKeyword.toLowerCase().trim();

  if (existingKeywords.includes(normalized)) return true;
  if (isSimilar(newKeyword, existingKeywords, 0.5)) return true;
  if (existingTitles.length > 0 && isSimilar(newKeyword, existingTitles, 0.4)) return true;

  return false;
}

/** AI로 키워드를 생성하고 중복 제거 후 반환 */
async function generateKeywordsWithAI(
  count: number,
  usedKeywords: string[],
  existingTitles: string[]
): Promise<KeywordMetadata[]> {
  console.log(`[KeywordGenerator] AI 생성 중 (제외: ${usedKeywords.length}개, 기존 글: ${existingTitles.length}개)`);

  const prompt = buildKeywordGenerationPrompt(count, usedKeywords, undefined, existingTitles);
  const response = await generateText({ prompt });

  try {
    const jsonText = response.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const keywords = JSON.parse(jsonText) as KeywordMetadata[];

    const validation = validateKeywordMetadata(keywords);
    if (!validation.isValid) {
      console.warn('[KeywordGenerator] 품질 경고:', validation.errors.slice(0, 3).join(', '));
    }

    const validKeywords: KeywordMetadata[] = [];
    const allExistingKeywords = [...usedKeywords];

    for (const kw of keywords) {
      if (!kw.keyword || !kw.searchIntent || !kw.difficulty || !kw.contentType) continue;
      if (kw.keyword.length > 40) {
        console.warn(`[KeywordGenerator] 40자 초과 키워드 필터: "${kw.keyword}" (${kw.keyword.length}자)`);
        continue;
      }
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
    const usedContent = await getUsedContent();
    console.log(`[KeywordGenerator] 기존 키워드: ${usedContent.keywords.length}개, 기존 글: ${usedContent.titles.length}개`);

    const keywordMap = new Map<string, KeywordMetadata>();
    let attempt = 0;

    while (keywordMap.size < requestedCount && attempt < maxRetries) {
      attempt++;
      const remainingCount = requestedCount - keywordMap.size;
      console.log(`[KeywordGenerator] 시도 ${attempt}/${maxRetries}: ${remainingCount}개 필요`);

      const newKeywords = await generateKeywordsWithAI(
        Math.ceil(remainingCount * 1.5),
        usedContent.keywords,
        usedContent.titles
      );

      newKeywords.forEach((kw) => keywordMap.set(kw.keyword.toLowerCase(), kw));
    }

    const allKeywords = Array.from(keywordMap.values());
    const scoredKeywords = allKeywords
      .map((kw) => ({ ...kw, finalScore: calculateSEOScore(kw) }))
      .sort((a, b) => b.finalScore - a.finalScore);

    const selectedKeywords = scoredKeywords.slice(0, requestedCount);

    console.log(`[KeywordGenerator] 완료: 생성 ${allKeywords.length}개 -> 선택 ${selectedKeywords.length}개`);
    selectedKeywords.forEach((kw, idx) => {
      console.log(`  ${idx + 1}. "${kw.keyword}" (${kw.finalScore}점, ${kw.difficulty}, ~${kw.estimatedSearchVolume})`);
    });

    return {
      success: true,
      keywords: selectedKeywords,
      totalGenerated: allKeywords.length,
      totalFiltered: selectedKeywords.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[KeywordGenerator] 실패: ${errorMessage}`);

    return {
      success: false,
      keywords: [],
      totalGenerated: 0,
      totalFiltered: 0,
      error: errorMessage,
    };
  }
}
