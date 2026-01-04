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

interface UsedContent {
  keywords: string[];
  titles: string[];
}

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

  // target_keyword + secondary_keywords + tags를 모두 합침
  const allKeywords = new Set<string>();
  const allTitles: string[] = [];

  data.forEach((post) => {
    // 제목 추가 (중복 방지용)
    if (post.title && typeof post.title === 'string') {
      allTitles.push(post.title.trim());
    }

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

  return {
    keywords: Array.from(allKeywords),
    titles: allTitles,
  };
}

// 불용어 집합 (조사, 접속사 등)
const STOP_WORDS = new Set([
  '은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '하는', '하기',
  '위한', '대한', '통한', '같은', '있는', '없는', '되는', '된', '할', '한', '수', '것', '때',
  '더', '가장', '정말', '진짜', '완벽', '최고', '최신', '추천', '필수', '쉽게', '빠르게'
]);

// 핵심 주제어 추출 (지표, 전략, 개념 등)
const CORE_TOPIC_WORDS = new Set([
  // 기술적 지표
  'rsi', 'macd', '볼린저밴드', '이동평균선', '스토캐스틱', 'obv', 'atr', 'adx', 'vwap', 'mfi',
  '골든크로스', '데드크로스', '다이버전스', '캔들', '차트', '거래량', '호가창', '체결강도',
  // 가치투자 지표
  'per', 'pbr', 'psr', 'roe', 'roa', 'eps', 'bps', 'fcf', 'ev', 'ebitda', 'peg',
  '배당', '저평가', '고평가', '시가총액', '영업이익', '순이익',
  // 전략/방법
  '분할매수', '물타기', '손절', '익절', '매수', '매도', '진입', '청산', '리밸런싱',
  '단타', '스윙', '중장기', '추세', '역추세', '눌림목', '돌파',
  // 시장/섹터
  '금리', '환율', '유가', '외국인', '기관', '개인', '수급', '섹터', '업종', '코스피', '코스닥',
  // 심리/교육
  '심리', '뇌동매매', 'fomo', '손실회피', '멘탈', '매매일지'
]);

/**
 * 텍스트에서 핵심 주제어 추출
 */
function extractCoreTopics(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);

  const topics = new Set<string>();

  for (const word of words) {
    // 불용어 제외
    if (STOP_WORDS.has(word)) continue;

    // 핵심 주제어 직접 매칭
    if (CORE_TOPIC_WORDS.has(word)) {
      topics.add(word);
      continue;
    }

    // 부분 매칭 (예: "볼린저" → "볼린저밴드")
    for (const coreTopic of CORE_TOPIC_WORDS) {
      if (word.includes(coreTopic) || coreTopic.includes(word)) {
        topics.add(coreTopic);
      }
    }

    // 2자 이상의 일반 명사도 추가
    if (word.length >= 2 && !STOP_WORDS.has(word)) {
      topics.add(word);
    }
  }

  return topics;
}

/**
 * 키워드/제목 유사도 검사 (더 엄격한 기준)
 */
function isSimilar(newText: string, existingTexts: string[], threshold: number = 0.5): boolean {
  const newTopics = extractCoreTopics(newText);
  if (newTopics.size === 0) return false;

  for (const existing of existingTexts) {
    const existingTopics = extractCoreTopics(existing);
    if (existingTopics.size === 0) continue;

    // Jaccard Similarity
    const intersection = new Set([...newTopics].filter((w) => existingTopics.has(w)));
    const union = new Set([...newTopics, ...existingTopics]);
    const jaccardSimilarity = intersection.size / union.size;

    // 핵심 주제어 오버랩 체크 (더 엄격)
    const coreOverlap = [...intersection].filter((w) => CORE_TOPIC_WORDS.has(w));
    const hasCoreOverlap = coreOverlap.length >= 2; // 핵심 주제어 2개 이상 겹치면 중복

    if (jaccardSimilarity >= threshold || hasCoreOverlap) {
      console.log(`  ⚠️ 유사도 감지: "${newText.slice(0, 30)}..." ↔ "${existing.slice(0, 30)}..." (Jaccard: ${(jaccardSimilarity * 100).toFixed(0)}%, 핵심어: ${coreOverlap.join(', ')})`);
      return true;
    }
  }

  return false;
}

/**
 * 키워드 중복 검사 (강화된 버전)
 */
function isDuplicate(
  newKeyword: string,
  existingKeywords: string[],
  existingTitles: string[] = []
): boolean {
  const normalized = newKeyword.toLowerCase().trim();

  // 1. 키워드 완전 일치
  if (existingKeywords.includes(normalized)) {
    console.log(`  ❌ 완전 일치: "${newKeyword}"`);
    return true;
  }

  // 2. 키워드 유사도 검사 (50% 이상이면 중복)
  if (isSimilar(newKeyword, existingKeywords, 0.5)) {
    return true;
  }

  // 3. 기존 제목과의 유사도 검사 (40% 이상이면 중복 - 더 엄격)
  if (existingTitles.length > 0 && isSimilar(newKeyword, existingTitles, 0.4)) {
    return true;
  }

  return false;
}

async function generateKeywordsWithAI(
  count: number,
  usedKeywords: string[],
  existingTitles: string[]
): Promise<KeywordMetadata[]> {
  console.log(`🤖 AI 키워드 생성 중... (제외 키워드: ${usedKeywords.length}개, 기존 글: ${existingTitles.length}개)`);

  const prompt = buildKeywordGenerationPrompt(count, usedKeywords, undefined, existingTitles);
  const response = await generateText({ prompt });

  try {
    const jsonText = response.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const keywords = JSON.parse(jsonText) as KeywordMetadata[];

    // 엔터프라이즈 품질 검증
    const validation = validateKeywordMetadata(keywords);
    if (!validation.isValid) {
      console.warn('⚠️ 품질 검증 경고:', validation.errors.slice(0, 3).join(', '));
    }

    // 중복 제거 (키워드 + 기존 제목 모두 검사)
    const validKeywords: KeywordMetadata[] = [];
    const allExistingKeywords = [...usedKeywords];

    for (const kw of keywords) {
      if (!kw.keyword || !kw.searchIntent || !kw.difficulty || !kw.contentType) continue;
      if (isDuplicate(kw.keyword, allExistingKeywords, existingTitles)) continue;

      validKeywords.push(kw);
      allExistingKeywords.push(kw.keyword.toLowerCase().trim());
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
    const usedContent = await getUsedContent();
    console.log(`📊 기존 키워드: ${usedContent.keywords.length}개, 기존 글: ${usedContent.titles.length}개`);

    let allKeywords: KeywordMetadata[] = [];
    let attempt = 0;

    while (allKeywords.length < requestedCount && attempt < maxRetries) {
      attempt++;
      const remainingCount = requestedCount - allKeywords.length;
      console.log(`\n🔄 시도 ${attempt}/${maxRetries}: ${remainingCount}개 생성 중...`);

      const newKeywords = await generateKeywordsWithAI(
        Math.ceil(remainingCount * 1.5),
        usedContent.keywords,
        usedContent.titles
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