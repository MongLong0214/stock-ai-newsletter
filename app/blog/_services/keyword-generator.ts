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
 * 두 키워드 간 유사도 계산 (Jaccard Similarity)
 * @returns 0-1 사이 값 (1에 가까울수록 유사)
 */
function calculateKeywordSimilarity(keyword1: string, keyword2: string): number {
  // 불용어 제거 (의미 없는 조사/접속사)
  const stopWords = new Set(['은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '로', '으로', '에서', '부터', '까지', '하는', '하기', '되는', '된', '인', '및', '그리고', '또는']);

  const normalize = (text: string) =>
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word));

  const words1 = new Set(normalize(keyword1));
  const words2 = new Set(normalize(keyword2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * 키워드 중복 검사 (엔터프라이즈급)
 */
function isDuplicateKeyword(
  newKeyword: string,
  existingKeywords: string[],
  similarityThreshold = 0.7
): { isDuplicate: boolean; reason?: string; similarTo?: string } {
  const normalized = newKeyword.toLowerCase().trim();

  // 1. 완전 일치 체크
  if (existingKeywords.includes(normalized)) {
    return { isDuplicate: true, reason: '완전 일치', similarTo: normalized };
  }

  // 2. 부분 문자열 체크 (한쪽이 다른 쪽을 포함하는 경우)
  for (const existing of existingKeywords) {
    if (normalized.includes(existing) || existing.includes(normalized)) {
      if (Math.abs(normalized.length - existing.length) <= 3) {
        // 길이 차이가 3자 이내면 거의 동일한 키워드로 간주
        return { isDuplicate: true, reason: '부분 포함', similarTo: existing };
      }
    }
  }

  // 3. 의미 유사도 체크 (Jaccard Similarity)
  for (const existing of existingKeywords) {
    const similarity = calculateKeywordSimilarity(normalized, existing);
    if (similarity >= similarityThreshold) {
      return {
        isDuplicate: true,
        reason: `유사도 ${(similarity * 100).toFixed(0)}%`,
        similarTo: existing,
      };
    }
  }

  return { isDuplicate: false };
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

    // 중복 제거 (엔터프라이즈급)
    const validKeywords: KeywordMetadata[] = [];
    const rejected: Array<{ keyword: string; reason: string; similarTo?: string }> = [];

    for (const kw of keywords) {
      // 기본 필수 필드 체크
      if (!kw.keyword || !kw.searchIntent || !kw.difficulty || !kw.contentType) {
        rejected.push({ keyword: kw.keyword || '(empty)', reason: '필수 필드 누락' });
        continue;
      }

      // 중복 검사 (기존 키워드 대비)
      const duplicateCheck = isDuplicateKeyword(kw.keyword, usedKeywords);
      if (duplicateCheck.isDuplicate) {
        rejected.push({
          keyword: kw.keyword,
          reason: duplicateCheck.reason!,
          similarTo: duplicateCheck.similarTo,
        });
        continue;
      }

      // 중복 검사 (이번 배치 내 키워드 대비)
      const batchDuplicateCheck = isDuplicateKeyword(
        kw.keyword,
        validKeywords.map((k) => k.keyword)
      );
      if (batchDuplicateCheck.isDuplicate) {
        rejected.push({
          keyword: kw.keyword,
          reason: `배치 내 ${batchDuplicateCheck.reason}`,
          similarTo: batchDuplicateCheck.similarTo,
        });
        continue;
      }

      validKeywords.push(kw);
    }

    console.log(`✅ 생성: ${keywords.length}개, 유효: ${validKeywords.length}개`);

    if (rejected.length > 0) {
      console.log(`❌ 제외: ${rejected.length}개`);
      rejected.slice(0, 5).forEach((r, i) => {
        const similar = r.similarTo ? ` (← "${r.similarTo}")` : '';
        console.log(`   ${i + 1}. "${r.keyword}" - ${r.reason}${similar}`);
      });
      if (rejected.length > 5) {
        console.log(`   ... 외 ${rejected.length - 5}개 더`);
      }
    }

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