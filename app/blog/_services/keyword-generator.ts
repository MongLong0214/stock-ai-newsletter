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
  // 조사
  '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '까지', '부터',
  // 동사형 어미
  '하는', '하기', '위한', '대한', '있는', '없는', '되는', '보는', '알아보는',
  // 일반적인 수식어
  '방법', '가이드', '추천', '비교', '분석', '정리', '완벽', '총정리', '핵심', '필수',
  '실전', '쉬운', '간단한', '자세한', '상세', '기초', '기본', '중요한', '꼭',
  // 숫자 관련
  '가지', '단계', '개', '초', '분', '위', '선',
]);

/** 핵심 단어 추출 (명사/지표/전략 등) */
function extractCoreTerms(keyword: string): string[] {
  const normalized = keyword.toLowerCase().trim();
  // 공백 분리 + 숫자 제거 + 스탑워드 제거
  const words = normalized
    .split(/\s+/)
    .map((w) => w.replace(/\d+/g, '').trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return words;
}

/** 2-gram 생성 */
function generateNgrams(text: string, n: number = 2): Set<string> {
  const cleaned = text.toLowerCase().replace(/\s+/g, '');
  const ngrams = new Set<string>();
  for (let i = 0; i <= cleaned.length - n; i++) {
    ngrams.add(cleaned.slice(i, i + n));
  }
  return ngrams;
}

/** 핵심 지표/개념 추출 (가장 중요한 단어만) */
function extractKeyIndicators(keyword: string): Set<string> {
  const indicators = new Set<string>();
  const text = keyword.toLowerCase();

  // 기술적 지표
  const technicalPatterns = [
    /rsi/g, /macd/g, /볼린저/g, /스토캐스틱/g, /이동평균/g, /골든크로스/g, /데드크로스/g,
    /다이버전스/g, /obv/g, /adx/g, /atr/g, /캔들/g, /패턴/g, /피보나치/g,
  ];
  // 가치 지표
  const valuePatterns = [
    /per/g, /pbr/g, /psr/g, /roe/g, /roa/g, /배당/g, /저평가/g, /고평가/g, /밸류에이션/g,
  ];
  // 전략
  const strategyPatterns = [
    /분할매수/g, /분할매도/g, /물타기/g, /불타기/g, /손절/g, /익절/g, /리밸런싱/g,
  ];
  // 시장
  const marketPatterns = [
    /코스피/g, /코스닥/g, /외국인/g, /기관/g, /수급/g, /공매도/g, /금리/g, /환율/g,
  ];
  // 심리
  const psychPatterns = [
    /fomo/g, /뇌동매매/g, /멘탈/g, /감정매매/g, /손실회피/g, /공포/g, /탐욕/g,
  ];
  // 실행
  const execPatterns = [
    /단타/g, /스윙/g, /호가창/g, /체결/g, /돌파/g, /눌림목/g, /추세/g,
  ];

  const allPatterns = [
    ...technicalPatterns, ...valuePatterns, ...strategyPatterns,
    ...marketPatterns, ...psychPatterns, ...execPatterns,
  ];

  for (const pattern of allPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((m) => indicators.add(m));
    }
  }

  return indicators;
}

/** 중복 키워드 검사 (5중 검사: 완전일치 + 부분포함 + 핵심지표 + 단어유사도 + n-gram) */
function isDuplicate(newKw: string, existingKws: string[]): boolean {
  const newKwLower = newKw.toLowerCase().trim();
  const newTerms = new Set(extractCoreTerms(newKw));
  const newNgrams = generateNgrams(newKw);
  const newIndicators = extractKeyIndicators(newKw);

  if (newTerms.size === 0) return false;

  for (const existing of existingKws) {
    const existingLower = existing.toLowerCase().trim();

    // 1. 완전 일치
    if (existingLower === newKwLower) {
      console.log(`  🚫 완전일치: "${newKw}" = "${existing}"`);
      return true;
    }

    // 2. 부분 문자열 포함 (한쪽이 다른 쪽을 포함)
    const newNoSpace = newKwLower.replace(/\s+/g, '');
    const existNoSpace = existingLower.replace(/\s+/g, '');
    if (existNoSpace.includes(newNoSpace) || newNoSpace.includes(existNoSpace)) {
      if (Math.min(newNoSpace.length, existNoSpace.length) >= 4) {
        console.log(`  🚫 부분포함: "${newKw}" ⊃⊂ "${existing}"`);
        return true;
      }
    }

    // 3. 핵심 지표 일치 (동일 지표가 있으면 중복 가능성 높음)
    const existingIndicators = extractKeyIndicators(existing);
    if (newIndicators.size > 0 && existingIndicators.size > 0) {
      const indicatorOverlap = [...newIndicators].filter((i) => existingIndicators.has(i));
      if (indicatorOverlap.length >= 1) {
        // 동일 지표가 있으면 추가 검사 필요
        const existingTerms = new Set(extractCoreTerms(existing));
        const termOverlap = [...newTerms].filter((t) => existingTerms.has(t)).length;
        // 핵심 지표가 같고, 다른 단어도 25% 이상 겹치면 중복
        if (existingTerms.size > 0 && termOverlap / Math.min(newTerms.size, existingTerms.size) >= 0.25) {
          console.log(`  🚫 동일지표+유사(${indicatorOverlap.join(',')}): "${newKw}" ↔ "${existing}"`);
          return true;
        }
      }
    }

    // 4. 핵심 단어 유사도 (30% 이상이면 중복) - 더 엄격하게
    const existingTerms = new Set(extractCoreTerms(existing));
    if (existingTerms.size > 0 && newTerms.size > 0) {
      const intersection = [...newTerms].filter((t) => existingTerms.has(t)).length;
      const similarity = intersection / Math.min(newTerms.size, existingTerms.size);
      if (similarity >= 0.30) {
        console.log(`  🚫 단어유사(${Math.round(similarity * 100)}%): "${newKw}" ↔ "${existing}"`);
        return true;
      }
    }

    // 5. N-gram 유사도 (40% 이상이면 중복) - 더 엄격하게
    const existingNgrams = generateNgrams(existing);
    if (existingNgrams.size > 0 && newNgrams.size > 0) {
      const ngramIntersection = [...newNgrams].filter((ng) => existingNgrams.has(ng)).length;
      const ngramSimilarity = ngramIntersection / Math.min(newNgrams.size, existingNgrams.size);
      if (ngramSimilarity >= 0.40) {
        console.log(`  🚫 n-gram유사(${Math.round(ngramSimilarity * 100)}%): "${newKw}" ↔ "${existing}"`);
        return true;
      }
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
