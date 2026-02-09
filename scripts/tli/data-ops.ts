import { supabaseAdmin } from './supabase-admin';
import type { Theme } from '../../lib/tli/types';

export interface ThemeWithKeywords extends Theme {
  keywords: string[];
  naverKeywords: string[];
}

/** 활성화된 테마 및 키워드 로딩 */
export async function loadActiveThemes(): Promise<ThemeWithKeywords[]> {
  console.log('📚 활성 테마 로딩 중...');

  const { data: themes, error: themesError } = await supabaseAdmin
    .from('themes')
    .select('*')
    .eq('is_active', true);

  if (themesError) {
    throw new Error(`테마 로딩 실패: ${themesError.message}`);
  }

  if (!themes || themes.length === 0) {
    throw new Error('활성 테마가 없습니다');
  }

  console.log(`   ✅ ${themes.length}개 테마 로딩 완료\n`);

  // Batch: 모든 키워드를 한 번에 로딩 (Supabase 1000행 limit 대응 페이지네이션)
  const themeIds = themes.map(t => t.id)
  const allKeywords: Array<{ theme_id: string; keyword: string; source: string; is_primary: boolean }> = []
  const KW_PAGE_SIZE = 1000

  // .in() 300개 제한 대응
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300)
    let from = 0
    while (true) {
      const { data, error: kwError } = await supabaseAdmin
        .from('theme_keywords')
        .select('theme_id, keyword, source, is_primary')
        .in('theme_id', chunk)
        .range(from, from + KW_PAGE_SIZE - 1)

      if (kwError) {
        console.error(`   ⚠️ 키워드 배치 로딩 실패:`, kwError.message)
        break
      }
      if (!data || data.length === 0) break
      allKeywords.push(...data)
      if (data.length < KW_PAGE_SIZE) break
      from += KW_PAGE_SIZE
    }
  }

  // theme_id별 그룹화
  const keywordsByTheme = new Map<string, typeof allKeywords>()
  for (const kw of allKeywords) {
    const arr = keywordsByTheme.get(kw.theme_id) || []
    arr.push(kw)
    keywordsByTheme.set(kw.theme_id, arr)
  }

  const themesWithKeywords: ThemeWithKeywords[] = []

  for (const theme of themes) {
    const keywords = keywordsByTheme.get(theme.id) || []

    const allKw = keywords.map(k => k.keyword)
    const naverSourceKeywords = keywords.filter(k => k.source === 'naver').map(k => k.keyword)
    const enrichedKeywords = keywords.filter(k => k.source === 'auto_enriched').map(k => k.keyword)
    const primaryKeywords = keywords.filter(k => k.is_primary).map(k => k.keyword)
    const naverKeywords = naverSourceKeywords.length > 0
      ? [...naverSourceKeywords, ...enrichedKeywords]
      : primaryKeywords.length > 0
        ? [...primaryKeywords, ...enrichedKeywords]
        : enrichedKeywords

    themesWithKeywords.push({
      ...theme,
      keywords: allKw,
      naverKeywords,
    })
  }

  return themesWithKeywords;
}

/** 관심도 메트릭 저장 (배치 upsert) */
export async function upsertInterestMetrics(
  metrics: Array<{ themeId: string; date: string; rawValue: number; normalized: number }>
) {
  console.log('\n💾 관심도 메트릭 저장 중...');

  const rows = metrics.map(m => ({
    theme_id: m.themeId,
    time: m.date,
    source: 'naver_datalab',
    raw_value: Math.round(m.rawValue * 10) / 10,
    normalized: m.normalized,
  }))

  // 500건씩 배치 처리
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabaseAdmin
      .from('interest_metrics')
      .upsert(batch, { onConflict: 'theme_id,time,source' })

    if (error) {
      console.error(`   ⚠️ 배치 ${i}~${i + batch.length} 저장 실패:`, error.message)
    }
  }

  console.log(`   ✅ ${metrics.length}개 관심도 메트릭 저장 완료`);
}

/** 뉴스 메트릭 저장 (배치 upsert) */
export async function upsertNewsMetrics(
  metrics: Array<{ themeId: string; date: string; articleCount: number }>
) {
  console.log('\n💾 뉴스 메트릭 저장 중...');

  const rows = metrics.map(m => ({
    theme_id: m.themeId,
    time: m.date,
    article_count: m.articleCount,
    growth_rate: null,
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabaseAdmin
      .from('news_metrics')
      .upsert(batch, { onConflict: 'theme_id,time' })

    if (error) {
      console.error(`   ⚠️ 배치 ${i}~${i + batch.length} 저장 실패:`, error.message)
    }
  }

  console.log(`   ✅ ${metrics.length}개 뉴스 메트릭 저장 완료`);
}

/** 테마-종목 매핑 저장 (배치 upsert) */
export async function upsertThemeStocks(
  stocks: Array<{
    themeId: string;
    symbol: string;
    name: string;
    market: string;
    currentPrice: number | null;
    priceChangePct: number | null;
    volume: number | null;
  }>
) {
  console.log('\n💾 테마 종목 저장 중...');

  const rows = stocks.map(s => ({
    theme_id: s.themeId,
    symbol: s.symbol,
    name: s.name,
    market: s.market as 'KOSPI' | 'KOSDAQ',
    source: 'naver',
    is_curated: false,
    relevance: 1.0,
    is_active: true,
    current_price: s.currentPrice,
    price_change_pct: s.priceChangePct,
    volume: s.volume,
    updated_at: new Date().toISOString(),
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabaseAdmin
      .from('theme_stocks')
      .upsert(batch, { onConflict: 'theme_id,symbol' })

    if (error) {
      console.error(`   ⚠️ 배치 ${i}~${i + batch.length} 저장 실패:`, error.message)
    }
  }

  console.log(`   ✅ ${stocks.length}개 테마 종목 저장 완료`);
}

/** 뉴스 기사 저장 (배치 upsert) */
export async function upsertNewsArticles(
  articles: Array<{
    themeId: string;
    title: string;
    link: string;
    source: string | null;
    pubDate: string;
    sentimentScore: number | null;
  }>
) {
  if (articles.length === 0) return;

  console.log('\n💾 뉴스 기사 저장 중...');

  const rows = articles.map(a => ({
    theme_id: a.themeId,
    title: a.title,
    link: a.link,
    source: a.source,
    pub_date: a.pubDate,
    sentiment_score: a.sentimentScore,
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabaseAdmin
      .from('theme_news_articles')
      .upsert(batch, { onConflict: 'theme_id,link' })

    if (error) {
      console.error(`   ⚠️ 배치 ${i}~${i + batch.length} 저장 실패:`, error.message)
    }
  }

  console.log(`   ✅ ${articles.length}개 뉴스 기사 저장 완료`);
}
