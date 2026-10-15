export type StockDailyPriceSource = 'kis' | 'naver_backfill'

/** GT-B 분모 데이터로 사용되는 KOSPI 지수의 stock_daily_prices 심볼 표기 */
export const KOSPI_INDEX_SYMBOL = 'KOSPI'

export interface StockDailyPriceInput {
  readonly symbol: string
  readonly tradeDate: string
  readonly open?: number | null
  readonly high?: number | null
  readonly low?: number | null
  readonly close: number
  readonly volume?: number | null
  readonly source?: StockDailyPriceSource
}

export interface StockDailyPriceRow {
  readonly symbol: string
  readonly trade_date: string
  readonly open: number | null
  readonly high: number | null
  readonly low: number | null
  readonly close: number
  readonly volume: number | null
  readonly source: StockDailyPriceSource
}

export interface ThemeStockSelectionRow {
  readonly theme_id: string
  readonly symbol: string
  readonly relevance: number | null
  readonly is_active: boolean
}

export function normalizeStockDailyPriceRow(input: StockDailyPriceInput): StockDailyPriceRow | null {
  if (!input.symbol || !input.tradeDate || input.close <= 0 || !Number.isFinite(input.close)) {
    return null
  }
  for (const price of [input.open, input.high, input.low]) {
    if (price != null && (price <= 0 || !Number.isFinite(price))) {
      return null
    }
  }
  if (input.high != null && input.low != null && input.high < input.low) {
    return null
  }
  if (input.volume != null && (input.volume < 0 || !Number.isFinite(input.volume))) {
    return null
  }

  return {
    symbol: input.symbol,
    trade_date: input.tradeDate,
    open: input.open ?? null,
    high: input.high ?? null,
    low: input.low ?? null,
    close: input.close,
    volume: input.volume ?? null,
    source: input.source ?? 'kis',
  }
}

export function dedupeStockDailyPriceRows(inputs: readonly StockDailyPriceInput[]): StockDailyPriceRow[] {
  const rowsByKey = new Map<string, StockDailyPriceRow>()

  for (const input of inputs) {
    const row = normalizeStockDailyPriceRow(input)
    if (!row) continue
    rowsByKey.set(`${row.symbol}|${row.trade_date}`, row)
  }

  return [...rowsByKey.values()]
}

export function selectTopThemeStockSymbols(
  rows: readonly ThemeStockSelectionRow[],
  limitPerTheme: number,
): string[] {
  const rowsByTheme = new Map<string, ThemeStockSelectionRow[]>()
  for (const row of rows) {
    if (!row.is_active || !row.symbol) continue
    const themeRows = rowsByTheme.get(row.theme_id) ?? []
    themeRows.push(row)
    rowsByTheme.set(row.theme_id, themeRows)
  }

  const symbols = new Set<string>()
  for (const themeRows of rowsByTheme.values()) {
    const selected = [...themeRows]
      .sort((left, right) => {
        const relevanceDiff = (right.relevance ?? 0) - (left.relevance ?? 0)
        return relevanceDiff === 0 ? left.symbol.localeCompare(right.symbol) : relevanceDiff
      })
      .slice(0, limitPerTheme)

    for (const row of selected) {
      symbols.add(row.symbol)
    }
  }

  return [...symbols].sort()
}

export async function loadActiveThemeStockSymbols(limitPerTheme = 5): Promise<string[]> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  // WHY: 활성 theme_stocks는 1000행(PostgREST max_rows)을 넘어 .range 없이 읽으면 테마별 top-N이 잘린 행에서 계산된다.
  const data = await fetchAllRows<ThemeStockSelectionRow>((from, to) => supabaseAdmin
    .from('theme_stocks')
    .select('theme_id, symbol, relevance, is_active')
    .eq('is_active', true)
    .order('theme_id', { ascending: true })
    .order('symbol', { ascending: true })
    .range(from, to))

  return selectTopThemeStockSymbols(data, limitPerTheme)
}

export async function loadActiveStockMasterSymbols(): Promise<string[]> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const rows = await fetchAllRows<{ symbol: string }>((from, to) => supabaseAdmin
    .from('stock_master')
    .select('symbol')
    .eq('is_active', true)
    .order('symbol', { ascending: true })
    .range(from, to))

  return rows.map((row) => row.symbol).filter(Boolean)
}

export async function upsertStockDailyPrices(inputs: readonly StockDailyPriceInput[]): Promise<number> {
  const { batchUpsert } = await import('@/scripts/tli/shared/supabase-batch')
  const rows = dedupeStockDailyPriceRows(inputs)
  const failedCount = await batchUpsert(
    'stock_daily_prices',
    rows.map((row) => ({ ...row })),
    'symbol,trade_date',
    '일봉 주가',
  )

  return rows.length - failedCount
}
