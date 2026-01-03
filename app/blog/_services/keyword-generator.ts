/**
 * AI 기반 키워드 생성 서비스 (간소화 버전)
 *
 * 핵심: 중복 방지 + 주제 다양성 + 후킹 검증
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import {
  buildKeywordGenerationPrompt,
  validateKeywordMetadata,
  calculateSEOScore,
} from '../_prompts/keyword-generation';
import type { KeywordMetadata, TopicArea } from '../_types/blog';

// ============================================================================
// 타입 정의
// ============================================================================

interface KeywordGenerationResult {
  success: boolean;
  keywords: KeywordMetadata[];
  totalGenerated: number;
  error?: string;
}

interface TopicAreaStats {
  distribution: Record<TopicArea, number>;
  total: number;
  underrepresented: TopicArea[];
  overrepresented: TopicArea[];
}

// ============================================================================
// 데이터 조회
// ============================================================================

/** 기존 키워드 목록 조회 */
async function getUsedKeywords(): Promise<string[]> {
  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('target_keyword, secondary_keywords, tags')
    .not('target_keyword', 'is', null);

  if (!data) return [];

  const keywords = new Set<string>();
  data.forEach((post) => {
    keywords.add(post.target_keyword.toLowerCase().trim());
    (post.secondary_keywords || []).forEach((k: string) => k && keywords.add(k.toLowerCase().trim()));
    (post.tags || []).forEach((t: string) => t && keywords.add(t.toLowerCase().trim()));
  });

  return Array.from(keywords);
}

/** 주제 분포 분석 */
async function getTopicStats(): Promise<TopicAreaStats> {
  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('target_keyword, tags')
    .not('target_keyword', 'is', null);

  const distribution: Record<TopicArea, number> = {
    technical: 0, value: 0, strategy: 0, market: 0,
    discovery: 0, psychology: 0, education: 0, execution: 0,
  };

  if (!data) {
    return {
      distribution,
      total: 0,
      underrepresented: Object.keys(distribution) as TopicArea[],
      overrepresented: [],
    };
  }

  // 키워드 패턴 기반 분류
  const patterns: Record<TopicArea, RegExp> = {
    technical: /rsi|macd|볼린저|이동평균|차트|지표|캔들|크로스|다이버전스/i,
    value: /per|pbr|roe|가치투자|저평가|배당|재무|fcf/i,
    strategy: /분할매수|손절|익절|포지션|리밸런싱|물타기|전략|매매법/i,
    market: /금리|환율|코스피|코스닥|외국인|기관|수급|시장|업종|섹터/i,
    discovery: /종목|발굴|스크리닝|테마주|관련주|성장주|etf/i,
    psychology: /심리|멘탈|감정|손실|fomo|뇌동매매|공포|탐욕/i,
    education: /초보|입문|기초|뜻|의미|용어|계좌|수수료|세금/i,
    execution: /호가|체결|단타|스윙|타이밍|매수|매도|진입/i,
  };

  data.forEach((post) => {
    const text = `${post.target_keyword} ${(post.tags || []).join(' ')}`;
    for (const [topic, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        distribution[topic as TopicArea]++;
        return;
      }
    }
    distribution.education++; // 기본값
  });

  const total = data.length;
  const avg = total / 8;

  return {
    distribution,
    total,
    underrepresented: (Object.entries(distribution) as [TopicArea, number][])
      .filter(([, count]) => count < avg * 0.5)
      .map(([topic]) => topic),
    overrepresented: (Object.entries(distribution) as [TopicArea, number][])
      .filter(([, count]) => count > avg * 1.5)
      .map(([topic]) => topic),
  };
}

// ============================================================================
// 중복 검사 & 후킹 검증
// ============================================================================

const STOP_WORDS = new Set([
  '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과',
  '하는', '하기', '위한', '대한', '방법', '가이드', '추천', '비교', '분석',
]);

/** 중복 키워드 검사 (유사도 50% 기준) */
function isDuplicate(newKw: string, existingKws: string[]): boolean {
  const normalize = (s: string) =>
    new Set(s.toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w)));

  const words1 = normalize(newKw);
  if (words1.size === 0) return false;

  for (const existing of existingKws) {
    if (existing === newKw.toLowerCase()) return true;

    const words2 = normalize(existing);
    if (words2.size === 0) continue;

    const intersection = [...words1].filter((w) => words2.has(w)).length;
    if (intersection / Math.max(words1.size, words2.size) >= 0.5) {
      console.log(`  ⚠️ 중복: "${newKw}" ↔ "${existing}"`);
      return true;
    }
  }
  return false;
}

/** 후킹 트리거 검증 */
function checkHook(keyword: string): { valid: boolean; triggers: string[] } {
  const patterns = [
    { pattern: /손실|실패|망하|함정|실수|주의|피해|손해|위험/i, name: '손실회피' },
    { pattern: /\d+\s*(가지|단계|개|초|분|%|위|선)/i, name: '구체숫자' },
    { pattern: /언제|얼마|어떤|뭐가|정답|맞|vs|비교/i, name: '질문형' },
    { pattern: /타이밍|시점|때|조건|기준|신호/i, name: '타이밍' },
    { pattern: /절대|반드시|무조건|숨겨진|아무도|진짜|핵심/i, name: '희소성' },
    { pattern: /해결|극복|고치|잡는|찾는|확인/i, name: '해결형' },
  ];

  const triggers = patterns.filter(({ pattern }) => pattern.test(keyword)).map(({ name }) => name);
  return { valid: triggers.length >= 1, triggers };
}

// ============================================================================
// 메인 함수
// ============================================================================

export async function generateKeywords(
  requestedCount: number = 5,
  options: { maxRetries?: number } = {}
): Promise<KeywordGenerationResult> {
  const { maxRetries = 3 } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 키워드 생성: ${requestedCount}개`);
  console.log(`${'='.repeat(60)}`);

  try {
    const [usedKeywords, topicStats] = await Promise.all([
      getUsedKeywords(),
      getTopicStats(),
    ]);

    console.log(`📊 기존: ${usedKeywords.length}개 키워드, ${topicStats.total}개 글`);
    if (topicStats.underrepresented.length > 0) {
      console.log(`🎯 부족한 주제: ${topicStats.underrepresented.join(', ')}`);
    }

    let allKeywords: KeywordMetadata[] = [];
    let attempt = 0;

    while (allKeywords.length < requestedCount && attempt < maxRetries) {
      attempt++;
      const remaining = requestedCount - allKeywords.length;
      console.log(`\n🔄 시도 ${attempt}/${maxRetries}: ${remaining}개 생성...`);

      const prompt = buildKeywordGenerationPrompt(
        Math.ceil(remaining * 1.5),
        usedKeywords,
        undefined,
        topicStats
      );

      const response = await generateText({ prompt });

      try {
        const json = response.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        const keywords = JSON.parse(json) as KeywordMetadata[];

        // 검증
        const validation = validateKeywordMetadata(keywords);
        if (!validation.isValid) {
          console.warn('⚠️ 검증 경고:', validation.errors.slice(0, 2).join(', '));
        }

        // 중복 제거 + 후킹 검증
        const existingKws = [...usedKeywords, ...allKeywords.map((k) => k.keyword.toLowerCase())];

        for (const kw of keywords) {
          if (!kw.keyword || !kw.searchIntent || !kw.contentType) continue;
          if (isDuplicate(kw.keyword, existingKws)) continue;

          const hook = checkHook(kw.keyword);
          if (!hook.valid) {
            kw.relevanceScore = Math.max(5, kw.relevanceScore - 1.5);
            console.log(`  ⚠️ 후킹 약함: "${kw.keyword}"`);
          } else {
            console.log(`  ✓ [${hook.triggers.join('+')}]: "${kw.keyword}"`);
          }

          allKeywords.push(kw);
          existingKws.push(kw.keyword.toLowerCase());
        }

        console.log(`  → 유효: ${allKeywords.length}개`);
      } catch (e) {
        console.error('❌ JSON 파싱 실패:', response.substring(0, 200));
      }
    }

    // 점수 계산 및 정렬
    const scored = allKeywords.map((kw) => {
      let score = calculateSEOScore(kw);

      // 부족한 주제 보너스
      if (kw.topicArea && topicStats.underrepresented.includes(kw.topicArea)) {
        score += 15;
      }
      // 과다 주제 감점
      if (kw.topicArea && topicStats.overrepresented.includes(kw.topicArea)) {
        score -= 10;
      }
      // 강력 후킹 보너스
      const hook = checkHook(kw.keyword);
      if (hook.triggers.length >= 2) score += 10;

      return { ...kw, finalScore: score };
    }).sort((a, b) => b.finalScore - a.finalScore);

    const selected = scored.slice(0, requestedCount);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 완료: ${selected.length}개 선택`);
    console.log(`${'='.repeat(60)}`);

    selected.forEach((kw, i) => {
      const hook = checkHook(kw.keyword);
      console.log(`${i + 1}. "${kw.keyword}" (${kw.finalScore}점, ${kw.topicArea}) ${hook.triggers.length >= 1 ? '🔥' : '⚠️'}`);
    });

    return {
      success: true,
      keywords: selected,
      totalGenerated: allKeywords.length,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ 실패: ${msg}`);
    return { success: false, keywords: [], totalGenerated: 0, error: msg };
  }
}
