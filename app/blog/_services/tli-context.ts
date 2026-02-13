/** TLI 데이터를 블로그 키워드 생성 프롬프트용으로 가공 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import type { Stage } from '@/lib/tli/types/db';

interface TLIThemeContext {
  name: string;
  score: number;
  stage: Stage;
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

const STAGE_PRIORITY: Record<string, number> = {
  Growth: 1,
  Early: 2,
  Peak: 3,
  Decay: 4,
};

const STAGE_LIMITS: Record<string, number> = {
  Growth: 5,
  Early: 3,
  Peak: 3,
  Decay: 1,
};

/** TLI DB에서 트렌딩 테마 데이터를 가져와 프롬프트용으로 가공 */
export async function fetchTLIContext(): Promise<TLIContext> {
  const now = new Date().toISOString().slice(0, 10);

  try {
    const supabase = getServerSupabaseClient();

    // 1) 활성 테마 + 최신 lifecycle_scores 조회
    const { data: themes } = await supabase
      .from('themes')
      .select('id, name')
      .eq('is_active', true);

    if (!themes || themes.length === 0) {
      return { themes: [], fetchedAt: now, isEmpty: true };
    }

    const themeIds = themes.map((t) => t.id);

    // 2) 최신 점수 조회 (3일 이내)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: scores } = await supabase
      .from('lifecycle_scores')
      .select('theme_id, score, stage, is_reigniting, calculated_at')
      .in('theme_id', themeIds)
      .gte('calculated_at', threeDaysAgo)
      .order('calculated_at', { ascending: false });

    if (!scores || scores.length === 0) {
      return { themes: [], fetchedAt: now, isEmpty: true };
    }

    // 테마별 최신 점수만 추출
    const latestScoreMap = new Map<string, (typeof scores)[0]>();
    for (const s of scores) {
      if (!latestScoreMap.has(s.theme_id)) {
        latestScoreMap.set(s.theme_id, s);
      }
    }

    // Dormant 및 score <= 0 필터링
    const activeThemes = themes.filter((t) => {
      const s = latestScoreMap.get(t.id);
      if (!s) return false;
      if (s.stage === 'Dormant' || s.score <= 0) return false;
      return true;
    });

    if (activeThemes.length === 0) {
      return { themes: [], fetchedAt: now, isEmpty: true };
    }

    const activeIds = activeThemes.map((t) => t.id);

    // 3) 종목, 뉴스, 키워드 병렬 조회
    const [stocksRes, newsRes, keywordsRes] = await Promise.all([
      supabase
        .from('theme_stocks')
        .select('theme_id, name')
        .in('theme_id', activeIds)
        .eq('is_active', true)
        .order('relevance', { ascending: false }),
      supabase
        .from('theme_news_articles')
        .select('theme_id, title, pub_date')
        .in('theme_id', activeIds)
        .gte('pub_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order('pub_date', { ascending: false }),
      supabase
        .from('theme_keywords')
        .select('theme_id, keyword')
        .in('theme_id', activeIds)
        .eq('is_primary', true),
    ]);

    // 테마별 데이터 그룹핑
    const stocksByTheme = groupBy(stocksRes.data ?? [], 'theme_id');
    const newsByTheme = groupBy(newsRes.data ?? [], 'theme_id');
    const keywordsByTheme = groupBy(keywordsRes.data ?? [], 'theme_id');

    // 4) 테마별 컨텍스트 구성
    const themeContexts: TLIThemeContext[] = activeThemes.map((t) => {
      const s = latestScoreMap.get(t.id)!;
      return {
        name: t.name,
        score: s.score,
        stage: s.stage as Stage,
        isReigniting: s.is_reigniting,
        topStocks: (stocksByTheme[t.id] ?? []).slice(0, 3).map((st) => st.name),
        recentNews: (newsByTheme[t.id] ?? []).slice(0, 2).map((n) => n.title),
        keywords: (keywordsByTheme[t.id] ?? []).slice(0, 3).map((k) => k.keyword),
      };
    });

    // 5) 스테이지별 우선순위 정렬 + 제한
    const reigniting = themeContexts
      .filter((t) => t.isReigniting)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const reignitingNames = new Set(reigniting.map((t) => t.name));

    const byStage = themeContexts
      .filter((t) => !t.isReigniting)
      .sort((a, b) => {
        const pa = STAGE_PRIORITY[a.stage] ?? 99;
        const pb = STAGE_PRIORITY[b.stage] ?? 99;
        if (pa !== pb) return pa - pb;
        return b.score - a.score;
      });

    const stageCounts: Record<string, number> = {};
    const selected: TLIThemeContext[] = [...reigniting];

    for (const t of byStage) {
      if (reignitingNames.has(t.name)) continue;
      const limit = STAGE_LIMITS[t.stage] ?? 0;
      const count = stageCounts[t.stage] ?? 0;
      if (count >= limit) continue;
      selected.push(t);
      stageCounts[t.stage] = count + 1;
      if (selected.length >= 15) break;
    }

    console.log(`[TLI Context] ${selected.length}개 테마 로드 (${activeThemes.length}개 활성 중)`);

    return { themes: selected, fetchedAt: now, isEmpty: selected.length === 0 };
  } catch (error) {
    console.error('[TLI Context] 데이터 조회 실패:', error);
    return { themes: [], fetchedAt: now, isEmpty: true };
  }
}

/** TLI 컨텍스트를 프롬프트 문자열로 변환 */
export function formatTLIForPrompt(ctx: TLIContext): string {
  if (ctx.isEmpty) return '';

  const stageKo: Record<string, string> = {
    Growth: '성장 중 - 키워드 최우선',
    Early: '초기 포착',
    Peak: '최고조',
    Decay: '하락세',
  };

  const groups: Record<string, TLIThemeContext[]> = {};
  const reigniting = ctx.themes.filter((t) => t.isReigniting);

  for (const t of ctx.themes) {
    if (t.isReigniting) continue;
    const key = t.stage;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  let result = `## 현재 시장 트렌드 (TLI 실시간 데이터, ${ctx.fetchedAt})\n\n`;

  const stageOrder: Stage[] = ['Growth', 'Early', 'Peak', 'Decay'];

  for (const stage of stageOrder) {
    const themes = groups[stage];
    if (!themes || themes.length === 0) continue;
    result += `### ${stage} (${stageKo[stage]})\n`;
    for (const t of themes) {
      result += formatThemeLine(t);
    }
    result += '\n';
  }

  if (reigniting.length > 0) {
    result += `### Reigniting (재점화 - 숨은 기회)\n`;
    for (const t of reigniting) {
      result += formatThemeLine(t);
    }
    result += '\n';
  }

  return result.trim();
}

function formatThemeLine(t: TLIThemeContext): string {
  let line = `- **${t.name}** (점수: ${t.score})`;
  if (t.topStocks.length > 0) {
    line += `\n  종목: ${t.topStocks.join(', ')}`;
  }
  if (t.recentNews.length > 0) {
    line += `\n  최신뉴스: ${t.recentNews.map((n) => `"${n}"`).join(', ')}`;
  }
  return line + '\n';
}

function groupBy<T extends Record<string, unknown>>(
  arr: T[],
  key: string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const k = String(item[key]);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
