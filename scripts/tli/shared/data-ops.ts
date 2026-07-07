import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery, groupByThemeId, batchUpsert } from '@/scripts/tli/shared/supabase-batch'
import type { Theme } from '@/lib/tli/types'

export interface ThemeWithKeywords extends Theme {
  keywords: string[]
  naverKeywords: string[]
}

/** 활성화된 테마 및 키워드 로딩 */
export async function loadActiveThemes(): Promise<ThemeWithKeywords[]> {
  console.log('📚 활성 테마 로딩 중...')

  const { data: themes, error: themesError } = await supabaseAdmin
    .from('themes')
    .select('*')
    .eq('is_active', true)

  if (themesError) throw new Error(`테마 로딩 실패: ${themesError.message}`)
  if (!themes?.length) throw new Error('활성 테마가 없습니다')

  console.log(`   ✅ ${themes.length}개 테마 로딩 완료\n`)

  // 키워드 배치 로딩 (자동 .in() 분할 + 페이지네이션)
  const themeIds = themes.map(t => t.id)
  const allKeywords = await batchQuery<{ theme_id: string; keyword: string; source: string; is_primary: boolean }>(
    'theme_keywords', 'theme_id, keyword, source, is_primary', themeIds,
  )
  const keywordsByTheme = groupByThemeId(allKeywords)

  return themes.map(theme => {
    const keywords = keywordsByTheme.get(theme.id) || []
    const allKw = keywords.map(k => k.keyword)
    const naverSource = keywords.filter(k => k.source === 'naver').map(k => k.keyword)
    const enriched = keywords.filter(k => k.source === 'auto_enriched').map(k => k.keyword)
    const primary = keywords.filter(k => k.is_primary).map(k => k.keyword)

    // 폴백 체인: naver → primary → enriched → 전체 상위 5개 (중복 제거)
    const naverKeywords = [...new Set(
      naverSource.length > 0 ? [...naverSource, ...enriched]
        : primary.length > 0 ? [...primary, ...enriched]
          : enriched.length > 0 ? enriched
            : allKw.slice(0, 5)
    )]

    return { ...theme, keywords: allKw, naverKeywords }
  })
}

/**
 * 관심도 메트릭 저장.
 * anchor_scaled_value는 "당일(todayDate)" 신규 행에만 오늘 계산한 scaleFactor로 기록한다.
 * 과거 재수집분(30일 창의 이전 날짜)은 payload에서 anchor_scaled_value 컬럼 자체를 제외해
 * PostgREST upsert가 기존 as-of 값을 보존하도록 한다(walk-forward point-in-time 오염 방지).
 */
export async function upsertInterestMetrics(
  metrics: Array<{
    themeId: string
    date: string
    rawValue: number
    normalized: number
    anchorScaledValue?: number | null
  }>,
  todayDate: string,
) {
  const buildBaseRow = (m: (typeof metrics)[number]) => ({
    theme_id: m.themeId,
    time: m.date,
    source: 'naver_datalab',
    raw_value: Number.isFinite(m.rawValue) ? Math.round(m.rawValue) : 0,
    normalized: m.normalized,
  })

  const todayRows = metrics
    .filter(m => m.date === todayDate)
    .map(m => ({ ...buildBaseRow(m), anchor_scaled_value: m.anchorScaledValue ?? null }))
  const pastRows = metrics
    .filter(m => m.date !== todayDate)
    .map(buildBaseRow)

  const todayFailed = await batchUpsert('interest_metrics', todayRows, 'theme_id,time,source', '관심도 메트릭(당일)')
  const pastFailed = await batchUpsert('interest_metrics', pastRows, 'theme_id,time,source', '관심도 메트릭(과거 재수집)')
  return todayFailed + pastFailed
}

/** 뉴스 메트릭 저장 */
export async function upsertNewsMetrics(
  metrics: Array<{ themeId: string; date: string; articleCount: number }>
) {
  return batchUpsert(
    'news_metrics',
    metrics.map(m => ({
      theme_id: m.themeId,
      time: m.date,
      article_count: m.articleCount,
      growth_rate: null,
    })),
    'theme_id,time',
    '뉴스 메트릭',
  )
}

/** 활성 테마-종목 매핑 총 개수 조회 (수집 붕괴 감지용 직전 기준선) */
export async function countActiveThemeStocks(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('theme_stocks')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  if (error) throw new Error(`활성 테마 종목 개수 조회 실패: ${error.message}`)
  return count ?? 0
}

/** 테마-종목 매핑 저장 + 미출현 종목 비활성화 */
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
  const result = await batchUpsert(
    'theme_stocks',
    stocks.map(s => ({
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
    })),
    'theme_id,symbol',
    '테마 종목',
  )

  // 이번 수집에 없는 종목 비활성화 (테마별)
  const symbolsByTheme = new Map<string, Set<string>>()
  for (const s of stocks) {
    const set = symbolsByTheme.get(s.themeId) ?? new Set()
    set.add(s.symbol)
    symbolsByTheme.set(s.themeId, set)
  }

  const themeIds = [...symbolsByTheme.keys()]
  if (themeIds.length > 0) {
    const existing = await batchQuery<{ theme_id: string; symbol: string }>(
      'theme_stocks', 'theme_id, symbol', themeIds,
      q => q.eq('is_active', true).eq('source', 'naver'),
    )

    const toDeactivate: Array<{ theme_id: string; symbol: string }> = []
    for (const row of existing) {
      const activeSymbols = symbolsByTheme.get(row.theme_id)
      if (activeSymbols && !activeSymbols.has(row.symbol)) {
        toDeactivate.push(row)
      }
    }

    if (toDeactivate.length > 0) {
      for (let i = 0; i < toDeactivate.length; i += 100) {
        const batch = toDeactivate.slice(i, i + 100)
        for (const item of batch) {
          await supabaseAdmin
            .from('theme_stocks')
            .update({ is_active: false })
            .eq('theme_id', item.theme_id)
            .eq('symbol', item.symbol)
        }
      }
      console.log(`   🔕 ${toDeactivate.length}개 미출현 종목 비활성화`)
    }
  }

  return result
}

/** 뉴스 기사 저장 */
export async function upsertNewsArticles(
  articles: Array<{
    themeId: string;
    title: string;
    link: string;
    source: string | null;
    pubDate: string;
  }>
) {
  // (theme_id, link) 중복 제거 — 같은 배치 내 중복 시 PostgreSQL ON CONFLICT 에러 방지
  const deduped = new Map<string, (typeof articles)[number]>()
  for (const a of articles) {
    deduped.set(`${a.themeId}|${a.link}`, a)
  }

  return batchUpsert(
    'theme_news_articles',
    [...deduped.values()].map(a => ({
      theme_id: a.themeId,
      title: a.title,
      link: a.link,
      source: a.source,
      pub_date: a.pubDate,
    })),
    'theme_id,link',
    '뉴스 기사',
  )
}
