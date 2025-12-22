/**
 * AI 기반 동적 키워드 생성 서비스
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import {
  buildKeywordGenerationPrompt,
  validateKeywordMetadata,
  calculateSEOScore,
} from '../_prompts/keyword-generation';
import type { KeywordMetadata } from '../_types/blog';

interface KeywordGenerationResult {
  success: boolean;
  keywords: KeywordMetadata[];
  totalGenerated: number;
  totalFiltered: number;
  error?: string;
}

async function getUsedKeywords(): Promise<string[]> {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('target_keyword, secondary_keywords, tags')
    .not('target_keyword', 'is', null);

  if (error) {
    console.error('[KeywordGenerator] 조회 실패:', error);
    return [];
  }

  // target_keyword + secondary_keywords + tags를 모두 합침
  const allKeywords = new Set<string>();

  data.forEach((post) => {
    // target_keyword 추가
    allKeywords.add(post.target_keyword.toLowerCase().trim());

    // secondary_keywords 추가 (배열인 경우)
    if (Array.isArray(post.secondary_keywords)) {
      post.secondary_keywords.forEach((kw: string) => {
        if (kw && typeof kw === 'string') {
          allKeywords.add(kw.toLowerCase().trim());
        }
      });
    }

    // tags 추가 (배열인 경우)
    if (Array.isArray(post.tags)) {
      post.tags.forEach((tag: string) => {
        if (tag && typeof tag === 'string') {
          allKeywords.add(tag.toLowerCase().trim());
        }
      });
    }
  });

  return Array.from(allKeywords);
}

/**
 * 키워드 중복 검사
 */
function isDuplicate(newKeyword: string, existingKeywords: string[]): boolean {
  const normalized = newKeyword.toLowerCase().trim();

  // 1. 완전 일치
  if (existingKeywords.includes(normalized)) return true;

  // 2. 의미 유사도 (Jaccard Similarity ≥ 70%)
  const stopWords = new Set(['은', '는', '이', '가', '을', '를', '의', '에']);

  for (const existing of existingKeywords) {
    const words1 = new Set(
      normalized.split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w))
    );
    const words2 = new Set(
      existing.split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w))
    );

    if (words1.size === 0 || words2.size === 0) continue;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const similarity = intersection.size / Math.max(words1.size, words2.size);

    if (similarity >= 0.7) return true;
  }

  return false;
}

async function generateKeywordsWithAI(
  count: number,
  usedKeywords: string[]
): Promise<KeywordMetadata[]> {
  console.log(`🤖 AI 키워드 생성 중... (제외: ${usedKeywords.length}개)`);

  const prompt = buildKeywordGenerationPrompt(count, usedKeywords);
  const response = await generateText({ prompt });

  try {
    const jsonText = response.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const keywords = JSON.parse(jsonText) as KeywordMetadata[];

    // 엔터프라이즈 품질 검증
    const validation = validateKeywordMetadata(keywords);
    if (!validation.isValid) {
      console.warn('⚠️ 품질 검증 경고:', validation.errors.slice(0, 3).join(', '));
    }

    // 중복 제거
    const validKeywords: KeywordMetadata[] = [];
    const allExisting = [...usedKeywords];

    for (const kw of keywords) {
      if (!kw.keyword || !kw.searchIntent || !kw.difficulty || !kw.contentType) continue;
      if (isDuplicate(kw.keyword, allExisting)) continue;

      validKeywords.push(kw);
      allExisting.push(kw.keyword.toLowerCase().trim());
    }

    console.log(`✅ 생성: ${keywords.length}개, 유효: ${validKeywords.length}개`);

    return validKeywords;
  } catch (error) {
    console.error('[KeywordGenerator] JSON 파싱 실패:', error);
    console.error('응답:', response.substring(0, 300));
    throw new Error('AI 응답 파싱 실패');
  }
}

export async function generateKeywords(
  requestedCount: number = 5,
  options: { maxRetries?: number } = {}
): Promise<KeywordGenerationResult> {
  const { maxRetries = 3 } = options;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 AI 키워드 생성: ${requestedCount}개`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const usedKeywords = await getUsedKeywords();
    console.log(`📊 기존 키워드: ${usedKeywords.length}개`);

    let allKeywords: KeywordMetadata[] = [];
    let attempt = 0;

    while (allKeywords.length < requestedCount && attempt < maxRetries) {
      attempt++;
      const remainingCount = requestedCount - allKeywords.length;
      console.log(`\n🔄 시도 ${attempt}/${maxRetries}: ${remainingCount}개 생성 중...`);

      const newKeywords = await generateKeywordsWithAI(
        Math.ceil(remainingCount * 1.5),
        usedKeywords
      );

      allKeywords.push(...newKeywords);
      allKeywords = Array.from(
        new Map(allKeywords.map((kw) => [kw.keyword.toLowerCase(), kw])).values()
      );
    }

    const scoredKeywords = allKeywords
      .map((kw) => ({ ...kw, finalScore: calculateSEOScore(kw) }))
      .sort((a, b) => b.finalScore - a.finalScore);

    const selectedKeywords = scoredKeywords.slice(0, requestedCount);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ 완료: 생성 ${allKeywords.length}개 → 선택 ${selectedKeywords.length}개`);
    console.log(`${'='.repeat(80)}\n`);

    selectedKeywords.forEach((kw, idx) => {
      console.log(
        `${idx + 1}. "${kw.keyword}" (${kw.finalScore}점, ${kw.difficulty}, ~${kw.estimatedSearchVolume})`
      );
    });

    return {
      success: true,
      keywords: selectedKeywords,
      totalGenerated: allKeywords.length,
      totalFiltered: selectedKeywords.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ 키워드 생성 실패: ${errorMessage}`);

    return {
      success: false,
      keywords: [],
      totalGenerated: 0,
      totalFiltered: 0,
      error: errorMessage,
    };
  }
}