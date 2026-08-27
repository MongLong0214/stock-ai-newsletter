/** AI 기반 동적 키워드 생성 서비스 */

import { z } from 'zod';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import { buildKeywordGenerationPrompt } from '../_prompts/keyword-generation';
import { validateKeywordItem, calculateSEOScore } from '../_prompts/keyword-validation';
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

  // .limit(5000)은 PostgREST max_rows=1000에 잘린다(사이트맵과 같은 잘림) — 페이지네이션 필수.
  // .order('slug')를 붙이는 이유: offset 페이지네이션은 정렬이 고정돼야 한다. 정렬 없이
  // .range()를 반복하면 그 사이 삽입·갱신으로 암묵 순서가 바뀌어 경계 행이 중복·누락된다
  // (누락된 제목은 중복 방지 집합에 안 들어가고, 같은 주제가 또 발행된다).
  const [titles, allTime, recent, shortTerm] = await Promise.all([
    fetchAllRows<{ title: string | null }>((from, to) =>
      supabase.from('blog_posts').select('title').not('title', 'is', null).order('slug').range(from, to)),
    // 전 기간 target_keyword — 관련주 클러스터는 기간 만료 없이 차단한다
    fetchAllRows<{ target_keyword: string | null }>((from, to) =>
      supabase.from('blog_posts').select('target_keyword').not('target_keyword', 'is', null).order('slug').range(from, to)),
    fetchAllRows<{ target_keyword: string | null }>((from, to) =>
      supabase.from('blog_posts').select('target_keyword').not('target_keyword', 'is', null)
        .gte('created_at', days90Ago).order('slug').range(from, to)),
    fetchAllRows<{ secondary_keywords: string[] | null }>((from, to) =>
      supabase.from('blog_posts').select('secondary_keywords').gte('created_at', days30Ago).order('slug').range(from, to)),
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


    const validKeywords: KeywordMetadata[] = [];
    const allExistingKeywords = [...usedKeywords];

    for (const kw of keywords) {
      // Zod z.enum()이 searchIntent/difficulty/contentType/topicArea를 보장
      if (!kw.keyword) continue;
      if (kw.keyword.length > 40) continue;
      // 경고만 하고 통과시키던 검증을 실제 탈락으로 바꿨다 — 거짓 게이트를 없앤다
      const invalid = validateKeywordItem(kw);
      if (invalid) {
        console.log(`[KeywordGen] 메타데이터 미달 탈락: ${invalid}`);
        continue;
      }
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
 * 덮어쓰고, MIN_SEARCH_VOLUME 미만은 탈락시킨다 — 아무도 검색하지 않는 주제로
 * SerpAPI·스크래핑·생성·윤문 비용을 쓰지 않는다.
 *
 * fail-closed다. 자격증명이 없거나 API가 실패하면 그 후보는 탈락시킨다.
 * fail-open이던 때는 게이트가 실제로 필요한 순간(시크릿 누락·429·5xx)에 정확히
 * 꺼졌고, 그때 발행된 글의 정렬 기준이 AI가 지어낸 허수였다. 검증 못 한 키워드로
 * SerpAPI·Gemini 비용을 쓰고 공개까지 하는 것보다 그날 발행 0이 싸다.
 */
/**
 * 검색량 측정 대상 변형.
 *
 * 네이버 `/keywordstool`은 힌트 키워드에서 공백을 지워 하나의 토큰으로 조회한다.
 * AI가 만드는 롱테일 구절은 그렇게 이어붙이면 아무도 검색하지 않는 문자열이 되어
 * **항상 월 0**으로 돌아온다. 실측(2026-08-27):
 *
 *        0  리비안 관련주 HL만도 vs TCC스틸
 *       20  리비안 관련주
 *   12,590  리비안
 *        0  삼성바이오로직스 목표가 전망
 *  236,100  삼성바이오로직스
 *
 * 전체 구절만 재면 헤드 검색량이 23만인 주제도 탈락해 발행이 매일 0건이 된다.
 * 그래서 전체 구절 + 앞 두 어절 + 첫 어절을 함께 조회하고 최댓값을 쓴다.
 * 게이트가 묻는 것은 "이 주제를 검색하는 사람이 있는가"이고, 그 답은 헤드에 있다.
 */
export function volumeProbes(keyword: string): string[] {
  const tokens = keyword.trim().split(/\s+/).filter(Boolean);
  const probes = [keyword, tokens.slice(0, 2).join(' '), tokens[0]]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p) && p.length >= 2);
  return [...new Set(probes)];
}

async function applySearchVolumeGate(keywords: KeywordMetadata[]): Promise<KeywordMetadata[]> {
  const creds = credentialsFromEnv();
  if (!creds) {
    console.error('[KeywordGen] NAVER_AD_* 자격증명 없음 — 검색량을 검증할 수 없어 전부 탈락시킨다');
    return [];
  }

  // 네이버는 relKeyword의 ASCII를 대문자로 돌려준다 — 케이스 폴딩 없이는 영문 키워드(RSI·ETF·PER)가 전부 미매칭
  const normalize = (k: string) => k.replace(/\s+/g, '').toUpperCase();

  // 키워드별 변형을 한 번에 모아 유니크 힌트로 조회한다 — 같은 헤드를 공유하는
  // 키워드가 여러 개면 호출 수가 줄어든다.
  const probesByKeyword = new Map(keywords.map((kw) => [kw.keyword, volumeProbes(kw.keyword)]));
  const hints = [...new Set([...probesByKeyword.values()].flat())];
  const measured = new Map<string, number>();
  const failed = new Set<string>();

  for (let i = 0; i < hints.length; i += HINT_KEYWORD_LIMIT) {
    const batch = hints.slice(i, i + HINT_KEYWORD_LIMIT);
    try {
      const rows = await fetchKeywordVolumes(creds, batch);
      for (const hint of batch) {
        const row = rows.find((v) => normalize(v.keyword) === normalize(hint));
        measured.set(normalize(hint), row?.total ?? 0);
      }
    } catch (error) {
      // 그 배치는 검증되지 않았다. 다른 배치는 계속 시도한다 — 일시적 429가 하루
      // 전체를 죽이지 않으면서, 검증 못 한 힌트가 통과하지도 않는다.
      for (const hint of batch) failed.add(normalize(hint));
      console.error(`[KeywordGen] 검색량 조회 실패(배치 ${Math.floor(i / HINT_KEYWORD_LIMIT) + 1}) — 해당 배치 탈락:`, error);
    }
    if (i + HINT_KEYWORD_LIMIT < hints.length) await new Promise((r) => setTimeout(r, 350));
  }

  const passed: KeywordMetadata[] = [];
  for (const kw of keywords) {
    const probes = probesByKeyword.get(kw.keyword) ?? [kw.keyword];
    const keys = probes.map(normalize);
    // 변형 전부가 조회 실패면 검증 불가 — fail-closed
    if (keys.every((k) => failed.has(k))) {
      console.log(`[KeywordGen] 검색량 확인 불가 탈락: "${kw.keyword}"`);
      continue;
    }
    const best = Math.max(0, ...keys.map((k) => measured.get(k) ?? 0));
    if (best < MIN_SEARCH_VOLUME) {
      console.log(`[KeywordGen] 검색량 미달 탈락: "${kw.keyword}" (월 ${best} < ${MIN_SEARCH_VOLUME}, 변형 ${probes.length}종)`);
      continue;
    }
    // 허수를 실측으로 교체 — 이후 SEO 점수 정렬이 실측 기반이 된다.
    // 이 값은 롱테일 구절이 아니라 **주제(헤드) 수요**의 대리값이다.
    passed.push({ ...kw, estimatedSearchVolume: best });
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
