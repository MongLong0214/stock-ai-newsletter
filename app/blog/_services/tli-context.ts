/** TLI 데이터를 블로그 키워드 생성 프롬프트용으로 가공 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { getKSTDateString } from '@/lib/tli/date-utils';
import type { Stage } from '@/lib/tli/types/db';
import { QUALITY_GATE } from '@/lib/tli/constants/quality-gate';

/** Dormant 제외 활성 스테이지 */
export type ActiveStage = Exclude<Stage, 'Dormant'>;

export interface StageConfig {
  priority: number;
  limit: number;
  label: string;
}

/** OCP: 새 스테이지 추가 시 이 1곳만 수정 */
export const STAGE_CONFIG: Record<ActiveStage, StageConfig> = {
  Growth: { priority: 1, limit: 8, label: '성장 중 - 키워드 최우선' },
  Emerging: { priority: 2, limit: 5, label: '초기 포착 - 선점 기회' },
  Peak: { priority: 3, limit: 5, label: '정점 - 검색량 높음' },
  Decline: { priority: 4, limit: 3, label: '하락세 - 제한적 사용' },
};

const VALID_ACTIVE_STAGES = Object.keys(STAGE_CONFIG) as ActiveStage[];

const isActiveStage = (value: string): value is ActiveStage =>
  (VALID_ACTIVE_STAGES as string[]).includes(value);

export interface TLIThemeContext {
  name: string;
  score: number;
  stage: ActiveStage;
  isReigniting: boolean;
  topStocks: string[];
  recentNews: string[];
  keywords: string[];
}

export interface TLIContext {
  themes: TLIThemeContext[];
  fetchedAt: string;
  isEmpty: boolean;
}

/** .in() URL 길이 한계를 피하는 id 청크 크기 */
const ID_CHUNK = 100;

/**
 * theme_id 목록으로 전량 조회.
 *
 * .range() 없는 select는 PostgREST max_rows(1000)에서 **에러 없이** 잘린다.
 * theme_stocks는 활성 테마 241개 × 종목 여러 개라 이미 1000을 넘고, 잘린 뒤로는
 * 뒤쪽 테마의 종목·뉴스가 통째로 비어 그 빈 컨텍스트로 키워드가 만들어졌다.
 */
async function fetchByThemeIds<T>(
  ids: string[],
  build: (chunk: string[]) => (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    rows.push(...(await fetchAllRows<T>(build(ids.slice(i, i + ID_CHUNK)))));
  }
  return rows;
}

/** TLI DB에서 트렌딩 테마 데이터를 가져와 프롬프트용으로 가공 */
export async function fetchTLIContext(): Promise<TLIContext> {
  const now = getKSTDateString();

  try {
    const supabase = getServerSupabaseClient();

    // 1) 활성 테마 + 최신 lifecycle_scores 조회
    const themes = await fetchAllRows<{ id: string; name: string }>((from, to) =>
      supabase.from('themes').select('id, name').eq('is_active', true).order('id').range(from, to),
    );

    if (themes.length === 0) {
      return { themes: [], fetchedAt: now, isEmpty: true };
    }

    const themeIds = themes.map((t) => t.id);

    // 2) 최신 점수 조회 (3일 이내)
    const threeDaysAgo = getKSTDateString(-3);
    type ScoreRow = { calculated_at: string; is_reigniting: boolean; score: number; stage: string; theme_id: string };
    const scores = await fetchByThemeIds<ScoreRow>(themeIds, (chunk) => (from, to) =>
      supabase
        .from('lifecycle_scores')
        .select('theme_id, score, stage, is_reigniting, calculated_at')
        .in('theme_id', chunk)
        .gte('calculated_at', threeDaysAgo)
        // calculated_at만으로는 동점 시 페이지 경계에서 순서가 흔들린다 — theme_id로 고정한다
        .order('calculated_at', { ascending: false })
        .order('theme_id')
        .range(from, to),
    );

    if (scores.length === 0) {
      return { themes: [], fetchedAt: now, isEmpty: true };
    }

    // 테마별 최신 점수만 추출
    const latestScoreMap = new Map<string, (typeof scores)[0]>();
    for (const s of scores) {
      if (!latestScoreMap.has(s.theme_id)) {
        latestScoreMap.set(s.theme_id, s);
      }
    }

    // 품질 게이트: Dormant + score<=0 + minScore (자체 STAGE_CONFIG caps가 v3 caps보다 엄격하므로 minScore만 적용)
    const activeThemes = themes.filter((t) => {
      const s = latestScoreMap.get(t.id);
      if (!s) return false;
      if (s.stage === 'Dormant' || s.score <= 0) return false;
      if (s.score < QUALITY_GATE.minScore) return false;
      return true;
    });

    if (activeThemes.length === 0) {
      return { themes: [], fetchedAt: now, isEmpty: true };
    }

    const activeIds = activeThemes.map((t) => t.id);

    // 3) 종목, 뉴스, 키워드 병렬 조회 (전량 페이지네이션)
    const [stocks, news, keywords] = await Promise.all([
      fetchByThemeIds<{ name: string; theme_id: string }>(activeIds, (chunk) => (from, to) =>
        supabase
          .from('theme_stocks')
          .select('theme_id, name')
          .in('theme_id', chunk)
          .eq('is_active', true)
          .order('relevance', { ascending: false })
          .order('name')
          .range(from, to),
      ),
      fetchByThemeIds<{ pub_date: string; theme_id: string; title: string }>(activeIds, (chunk) => (from, to) =>
        supabase
          .from('theme_news_articles')
          .select('theme_id, title, pub_date')
          .in('theme_id', chunk)
          .gte('pub_date', getKSTDateString(-7))
          .order('pub_date', { ascending: false })
          .order('title')
          .range(from, to),
      ),
      fetchByThemeIds<{ keyword: string; theme_id: string }>(activeIds, (chunk) => (from, to) =>
        supabase
          .from('theme_keywords')
          .select('theme_id, keyword')
          .in('theme_id', chunk)
          .eq('is_primary', true)
          .order('keyword')
          .range(from, to),
      ),
    ]);

    // 테마별 데이터 그룹핑
    const stocksByTheme = groupBy(stocks, 'theme_id');
    const newsByTheme = groupBy(news, 'theme_id');
    const keywordsByTheme = groupBy(keywords, 'theme_id');

    // 4) 테마별 컨텍스트 구성 (런타임 stage 검증 + non-null 가드)
    const themeContexts: TLIThemeContext[] = [];
    for (const t of activeThemes) {
      const s = latestScoreMap.get(t.id);
      if (!s) continue;
      if (!isActiveStage(s.stage)) continue;

      themeContexts.push({
        name: t.name,
        score: s.score,
        stage: s.stage,
        isReigniting: s.is_reigniting,
        topStocks: (stocksByTheme[t.id] ?? []).slice(0, 3).map((st) => st.name),
        recentNews: (newsByTheme[t.id] ?? []).slice(0, 2).map((n) => n.title),
        keywords: (keywordsByTheme[t.id] ?? []).slice(0, 3).map((k) => k.keyword),
      });
    }

    // 5) 스테이지별 우선순위 정렬 + 제한
    const reigniting = themeContexts
      .filter((t) => t.isReigniting)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const reignitingNames = new Set(reigniting.map((t) => t.name));

    const byStage = themeContexts
      .filter((t) => !t.isReigniting)
      .sort((a, b) => {
        const pa = STAGE_CONFIG[a.stage]?.priority ?? 99;
        const pb = STAGE_CONFIG[b.stage]?.priority ?? 99;
        if (pa !== pb) return pa - pb;
        return b.score - a.score;
      });

    const stageCounts: Record<string, number> = {};
    const selected: TLIThemeContext[] = [...reigniting];

    for (const t of byStage) {
      if (reignitingNames.has(t.name)) continue;
      const limit = STAGE_CONFIG[t.stage]?.limit ?? 0;
      const count = stageCounts[t.stage] ?? 0;
      if (count >= limit) continue;
      selected.push(t);
      stageCounts[t.stage] = count + 1;
      if (selected.length >= 25) break;
    }

    return { themes: selected, fetchedAt: now, isEmpty: selected.length === 0 };
  } catch (error) {
    console.error('[TLI Context] 데이터 조회 실패:', error);
    return { themes: [], fetchedAt: now, isEmpty: true };
  }
}

function groupBy<T extends Record<string, unknown>>(
  arr: T[],
  key: keyof T & string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const k = String(item[key]);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
