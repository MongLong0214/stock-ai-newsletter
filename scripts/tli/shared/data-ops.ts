import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery, groupByThemeId, batchUpsert } from '@/scripts/tli/shared/supabase-batch'
import { getKSTDateString } from '@/lib/tli/date-utils'
import {
  planMembershipHistoryDiff,
  type MembershipHistoryRow,
  type ObservedThemeStock,
} from '@/scripts/tli/themes/theme-membership-history'
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
 * anchor_scaled_value는 테마별 최신 수집일 행에만 이번 scaleFactor로 기록한다.
 * Naver DataLab은 약 1일 지연되어 calendar-today와 최신 data.period가 다를 수 있으므로
 * 기준일은 배치 실행일이 아니라 metrics 데이터 안의 themeId별 max(date)로 계산한다.
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
) {
  const maxDateByThemeId = new Map<string, string>()
  for (const m of metrics) {
    const currentMaxDate = maxDateByThemeId.get(m.themeId)
    if (currentMaxDate === undefined || m.date > currentMaxDate) {
      maxDateByThemeId.set(m.themeId, m.date)
    }
  }

  const buildBaseRow = (m: (typeof metrics)[number]) => ({
    theme_id: m.themeId,
    time: m.date,
    source: 'naver_datalab',
    raw_value: Number.isFinite(m.rawValue) ? Math.round(m.rawValue) : 0,
    normalized: m.normalized,
  })

  const newestRows = metrics
    .filter(m => m.date === maxDateByThemeId.get(m.themeId))
    .map(m => ({ ...buildBaseRow(m), anchor_scaled_value: m.anchorScaledValue ?? null }))
  const pastRows = metrics
    .filter(m => m.date !== maxDateByThemeId.get(m.themeId))
    .map(buildBaseRow)

  const newestFailed = await batchUpsert('interest_metrics', newestRows, 'theme_id,time,source', '관심도 메트릭(최신 수집일)')
  const pastFailed = await batchUpsert('interest_metrics', pastRows, 'theme_id,time,source', '관심도 메트릭(과거 재수집)')
  return newestFailed + pastFailed
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

const MEMBERSHIP_SOURCE = 'naver'
const MEMBERSHIP_RELEVANCE = 1.0
const MEMBERSHIP_HISTORY_TABLE = 'theme_stock_membership_history'
const MEMBERSHIP_HISTORY_COLUMNS =
  'id, theme_id, symbol, valid_from, valid_to, recorded_at, superseded_at, source, collection_run_id, relevance, market'

/**
 * 테마-종목 매핑을 bitemporal history에 기록한다 (append-only).
 *
 * 신규는 open version append, 제거/속성 변경은 열린 version을 superseded_at으로 한 번 닫고
 * 대체 version을 append한다. 기존 행의 다른 field는 절대 수정하지 않으므로 확정된 as-of 결과는
 * 이후 수집이나 theme_stocks.is_active 변경으로 바뀌지 않는다.
 *
 * 관측하지 못한 테마는 diff 대상에서 제외한다 — 스크래핑 실패를 "매핑 제거"로 오판하면
 * 존재하지 않았던 membership 종료 사실을 조작하게 된다.
 * 과거 구간을 created_at으로 추정 backfill하지 않는다. 관측 이전은 absent가 정답이다.
 *
 * DB RPC가 전체 diff를 한 transaction에서 lock/validate/close/append한다. stale target, unique conflict,
 * replacement 오류 중 하나라도 발생하면 모든 변경이 rollback된다.
 */
export async function recordThemeStockMembershipHistory(input: {
  observed: readonly ObservedThemeStock[]
  observedDate: string
  recordedAt?: string
  collectionRunId?: string | null
}): Promise<{ opened: number; closed: number; appended: number }> {
  const observedThemeIds = [...new Set(input.observed.map(s => s.themeId))]
  if (observedThemeIds.length === 0) return { opened: 0, closed: 0, appended: 0 }

  // orderBy: 이 읽기는 append-only 원장의 diff 기준점이다. 페이지 간 순서가 흔들려 열린 version을
  // 하나라도 놓치면 이미 존재하는 매핑을 '신규'로 오판해 없던 membership 시작을 조작하게 된다.
  const openRows = await batchQuery<MembershipHistoryRow>(
    MEMBERSHIP_HISTORY_TABLE, MEMBERSHIP_HISTORY_COLUMNS, observedThemeIds,
    q => q.is('valid_to', null).is('superseded_at', null).eq('source', MEMBERSHIP_SOURCE),
    'theme_id', { failOnError: true, orderBy: { column: 'id' } },
  )

  const diff = planMembershipHistoryDiff({
    observed: input.observed,
    observedThemeIds,
    openRows,
    observedDate: input.observedDate,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    source: MEMBERSHIP_SOURCE,
    collectionRunId: input.collectionRunId ?? null,
  })

  const opened = diff.opens.length
  const closed = diff.transitions.length
  const appended = opened + diff.transitions.reduce(
    (total, transition) => total + transition.replacements.length,
    0,
  )

  if (opened > 0 || closed > 0) {
    const { data, error } = await supabaseAdmin.rpc(
      'apply_theme_stock_membership_history_diff',
      {
        p_diff: {
          opens: diff.opens,
          transitions: diff.transitions.map((transition) => ({
            close_id: transition.close.id,
            theme_id: transition.themeId,
            symbol: transition.symbol,
            superseded_at: transition.close.superseded_at,
            replacements: transition.replacements,
          })),
        },
      },
    )
    if (error) {
      throw new Error(`테마-종목 membership history transaction 실패: ${error.message}`)
    }

    const result = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined
    if (
      result?.opened !== opened
      || result.closed !== closed
      || result.appended !== appended
    ) {
      throw new Error('테마-종목 membership history transaction 결과 불일치')
    }
  }

  console.log(
    `   🧬 membership history: open ${opened}건, close ${closed}건, append ${appended}건`,
  )
  return { opened, closed, appended }
}

/** 테마-종목 매핑 저장 + 미출현 종목 비활성화 (+ bitemporal history 기록) */
export async function upsertThemeStocks(
  stocks: Array<{
    themeId: string;
    symbol: string;
    name: string;
    market: string;
    currentPrice: number | null;
    priceChangePct: number | null;
    volume: number | null;
  }>,
  observedDate: string = getKSTDateString(),
) {
  // history를 current cache보다 먼저 확정한다. cache 실패가 확정된 PIT 기록을 훼손하지 못한다.
  await recordThemeStockMembershipHistory({
    observed: stocks.map(s => ({
      themeId: s.themeId,
      symbol: s.symbol,
      relevance: MEMBERSHIP_RELEVANCE,
      market: s.market,
    })),
    observedDate,
  })

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
    const existing = await batchQuery<{ id: string; theme_id: string; symbol: string }>(
      'theme_stocks', 'id, theme_id, symbol', themeIds,
      q => q.eq('is_active', true).eq('source', 'naver'),
      'theme_id', { failOnError: true, orderBy: { column: 'id' } },
    )

    const toDeactivate: Array<{ id: string; theme_id: string; symbol: string }> = []
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
          const { error } = await supabaseAdmin
            .from('theme_stocks')
            .update({ is_active: false })
            .eq('id', item.id)

          if (error) {
            throw new Error(
              `theme_stocks 비활성화 실패 (${item.theme_id}/${item.symbol}): ${error.message}`,
            )
          }
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

/** theme_news_articles 기본 보존기간(일). display 전용 테이블 — 상세는 최신 50건, blog는 7일창만 사용 */
export const NEWS_ARTICLE_RETENTION_DAYS = 30

/**
 * 보존기간을 넘은 theme_news_articles를 정리한다 (DB 크기·egress 관리).
 *
 * 이 테이블은 UI display 전용이고 과학 PIT 입력(news_metrics·tli_news_observations)과 무관하므로
 * 오래된 행 삭제가 예측·라벨·평가에 영향을 주지 않는다. 매 full run에서 호출해 재증식을 막는다.
 */
export async function pruneStaleNewsArticles(
  retentionDays: number = NEWS_ARTICLE_RETENTION_DAYS,
): Promise<number> {
  const cutoff = getKSTDateString(-retentionDays)
  const { count, error } = await supabaseAdmin
    .from('theme_news_articles')
    .delete({ count: 'exact' })
    .lt('pub_date', cutoff)

  if (error) throw new Error(`오래된 뉴스 기사 정리 실패: ${error.message}`)
  return count ?? 0
}
