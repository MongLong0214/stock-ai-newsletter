/** AI 기반 동적 키워드 생성 서비스 */

import { z } from 'zod';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import { buildKeywordGenerationPrompt } from '../_prompts/keyword-generation';
import { validateKeywordMetadata, calculateSEOScore } from '../_prompts/keyword-validation';
import { isDuplicate } from './keyword-similarity';
import { findClusterCollision } from './cluster-guard';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { credentialsFromEnv, fetchKeywordVolumes, HINT_KEYWORD_LIMIT } from '@/lib/naver-searchad';
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
    'psychology', 'education', 'execution', 'theme', 'event',
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
  /** 전 기간 target_keyword — 관련주 클러스터 가드용 (기간 만료 없음) */
  allTimeKeywords: string[];
  keywords: string[];
  titles: string[];
}

/** 네이버 실측 월간 검색량 하한. 이 미만은 아무도 검색하지 않는 키워드다.
 * 기본 200 — e2e나 운영 조정은 BLOG_MIN_SEARCH_VOLUME 환경변수로.
 * 실측(2026-08): 1,306편이 헤드 키워드를 소진한 상태라 통과율이 낮은 것이 정상이며,
 * 그날 통과 0이면 발행 0이 맞다. 하한을 낮춰 채우는 것은 게이트를 끄는 것과 같다. */
export const MIN_SEARCH_VOLUME = Number(process.env.BLOG_MIN_SEARCH_VOLUME) || 200;

/** 롤링 윈도우 기반 사용 키워드/제목 조회 (고갈 방지) */
async function getUsedContent(): Promise<UsedContent> {
  const supabase = getServerSupabaseClient();

  // 제목: 전체 조회 (중복 방지)
  // 키워드: target_keyword 90일, secondary_keywords 30일, tags 제외
  const now = new Date();
  const days90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // .limit(5000)은 PostgREST max_rows=1000에 잘린다(사이트맵과 같은 잘림) — 페이지네이션 필수
  const [titles, allTime, recent, shortTerm] = await Promise.all([
    fetchAllRows<{ title: string | null }>((from, to) =>
      supabase.from('blog_posts').select('title').not('title', 'is', null).range(from, to)),
    // 전 기간 target_keyword — 관련주 클러스터는 기간 만료 없이 차단한다
    fetchAllRows<{ target_keyword: string | null }>((from, to) =>
      supabase.from('blog_posts').select('target_keyword').not('target_keyword', 'is', null).range(from, to)),
    fetchAllRows<{ target_keyword: string | null }>((from, to) =>
      supabase.from('blog_posts').select('target_keyword').not('target_keyword', 'is', null)
        .gte('created_at', days90Ago).range(from, to)),
    fetchAllRows<{ secondary_keywords: string[] | null }>((from, to) =>
      supabase.from('blog_posts').select('secondary_keywords').gte('created_at', days30Ago).range(from, to)),
  ]);
  const titlesRes = { data: titles };
  const recentRes = { data: recent };
  const shortTermRes = { data: shortTerm };

  const allKeywords = new Set<string>();
  const allTitles: string[] = [];

  (titlesRes.data ?? []).forEach((post) => {
    if (post.title) allTitles.push(post.title.trim());
  });

  (recentRes.data ?? []).forEach((post) => {
    if (post.target_keyword) {
      allKeywords.add(post.target_keyword.toLowerCase().trim());
    }
  });

  (shortTermRes.data ?? []).forEach((post) => {
    if (Array.isArray(post.secondary_keywords)) {
      post.secondary_keywords.forEach((kw: string) => {
        if (kw) allKeywords.add(kw.toLowerCase().trim());
      });
    }
  });

  const allTimeKeywords = allTime
    .map((row) => row.target_keyword?.toLowerCase().trim())
    .filter((k): k is string => !!k);

  return { allTimeKeywords, keywords: Array.from(allKeywords), titles: allTitles };
}

/** AI로 키워드를 생성하고 중복 제거 후 반환 */
async function generateKeywordsWithAI(
  count: number,
  usedKeywords: string[],
  existingTitles: string[],
  allTimeKeywords: string[],
  tliContext?: TLIContext,
): Promise<KeywordMetadata[]> {
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

      // 관련주 클러스터는 전 기간 대비 차단 — 같은 테마 관련주 글은 새 URL이 아니라 갱신 대상.
      // 같은 run에서 먼저 통과한 키워드도 대조 대상이다 (한 배치에 같은 클러스터 변주가 옴).
      const collision = findClusterCollision(kw.keyword, allTimeKeywords);
      if (collision) {
        console.log(`[KeywordGen] 클러스터 중복 차단: "${kw.keyword}" ≈ 기존 "${collision}"`);
        continue;
      }

      validKeywords.push(kw);
      allExistingKeywords.push(kw.keyword.toLowerCase().trim());
      allTimeKeywords.push(kw.keyword.toLowerCase().trim());
    }

    return validKeywords;
  } catch (error) {
    console.error('[KeywordGenerator] JSON 파싱 실패:', error);
    throw new Error('AI 응답 파싱 실패');
  }
}

/**
 * 네이버 실측 검색량 게이트.
 *
 * AI가 채운 estimatedSearchVolume은 프롬프트가 "100 미만 금지"라고 해서 모델이
 * 지어내는 허수였고, 그 허수가 SEO 점수 정렬 기준으로 쓰였다. 여기서 실측값으로
 * 덮어쓰고, MIN_SEARCH_VOLUME 미만은 탈락시킨다 — 아무도 검색하지 않는 키워드로
 * SerpAPI·스크래핑·생성·윤문 비용을 쓰지 않는다.
 *
 * 자격증명이 없으면 게이트를 생략하고 경고만 남긴다(fail-open) — 게이트는 향상
 * 장치이지 발행을 0으로 만드는 장애 지점이 아니다.
 */
async function applySearchVolumeGate(keywords: KeywordMetadata[]): Promise<KeywordMetadata[]> {
  const creds = credentialsFromEnv();
  if (!creds) {
    console.warn('[KeywordGen] NAVER_AD_* 자격증명 없음 — 검색량 게이트 생략 (estimatedSearchVolume은 AI 허수)');
    return keywords;
  }

  // 네이버는 relKeyword의 ASCII를 대문자로 돌려준다 — 케이스 폴딩 없이는 영문 키워드(RSI·ETF·PER)가 전부 미매칭
  const normalize = (k: string) => k.replace(/\s+/g, '').toUpperCase();
  const passed: KeywordMetadata[] = [];

  for (let i = 0; i < keywords.length; i += HINT_KEYWORD_LIMIT) {
    const batch = keywords.slice(i, i + HINT_KEYWORD_LIMIT);
    try {
      const volumes = await fetchKeywordVolumes(creds, batch.map((kw) => kw.keyword));
      for (const kw of batch) {
        const row = volumes.find((v) => normalize(v.keyword) === normalize(kw.keyword));
        const total = row?.total ?? 0;
        if (total < MIN_SEARCH_VOLUME) {
          console.log(`[KeywordGen] 검색량 미달 탈락: "${kw.keyword}" (월 ${total} < ${MIN_SEARCH_VOLUME})`);
          continue;
        }
        // 허수를 실측으로 교체 — 이후 SEO 점수 정렬이 실측 기반이 된다
        passed.push({ ...kw, estimatedSearchVolume: total });
      }
    } catch (error) {
      // API 장애 시 그 배치는 게이트 없이 통과 (fail-open) — 단 허수임을 로그로 남긴다
      console.warn(`[KeywordGen] 검색량 조회 실패(배치 ${i / HINT_KEYWORD_LIMIT + 1}) — 게이트 생략:`, error);
      passed.push(...batch);
    }
    if (i + HINT_KEYWORD_LIMIT < keywords.length) await new Promise((r) => setTimeout(r, 350));
  }

  return passed;
}

/** 키워드 생성 메인 함수 (재시도 + SEO 점수 정렬) */
export async function generateKeywords(
  requestedCount: number = 5,
  options: { maxRetries?: number } = {}
): Promise<KeywordGenerationResult> {
  const { maxRetries = 3 } = options;

  try {
    const [usedContent, tliContext] = await Promise.all([
      getUsedContent(),
      fetchTLIContext(),
    ]);
    const keywordMap = new Map<string, KeywordMetadata>();
    let attempt = 0;

    while (keywordMap.size < requestedCount && attempt < maxRetries) {
      attempt++;
      const remainingCount = requestedCount - keywordMap.size;
      const newKeywords = await generateKeywordsWithAI(
        Math.ceil(remainingCount * 1.5),
        usedContent.keywords,
        usedContent.titles,
        usedContent.allTimeKeywords,
        tliContext,
      );

      // 볼륨 게이트를 루프 안에서 배치별로 적용 — 게이트 탈락이 재생성을 트리거해야
      // 남은 재시도 횟수가 실제로 쓰인다 (루프 밖에 두면 탈락분만큼 그냥 모자란 채 끝난다)
      const passed = await applySearchVolumeGate(newKeywords);
      passed.forEach((kw) => {
        keywordMap.set(kw.keyword.toLowerCase(), kw);
        usedContent.keywords.push(kw.keyword);
      });
      if (passed.length < newKeywords.length) {
        console.log(`[KeywordGen] 시도 ${attempt}: ${newKeywords.length}개 중 ${passed.length}개 게이트 통과`);
      }
    }

    const allKeywords = Array.from(keywordMap.values());
    const scoreMap = new Map(allKeywords.map((kw) => [kw.keyword, calculateSEOScore(kw)]));
    const sortedKeywords = [...allKeywords].sort(
      (a, b) => (scoreMap.get(b.keyword) ?? 0) - (scoreMap.get(a.keyword) ?? 0)
    );

    const selectedKeywords = sortedKeywords.slice(0, requestedCount);

    console.log(`[KeywordGenerator] 완료: 생성 ${allKeywords.length}개 -> 선택 ${selectedKeywords.length}개`);

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
