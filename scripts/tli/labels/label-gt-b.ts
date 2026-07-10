import { batchQuery, batchUpsert } from '../shared/supabase-batch'
import { supabaseAdmin } from '../shared/supabase-admin'
import {
  GTB_HORIZON_DAYS,
  labelGtB,
} from '../../../lib/tli/labels/gt-b'
import { addKoreanTradingDays } from '../../../lib/tli/trading-calendar'
import {
  KOSPI_INDEX_SYMBOL,
  selectTopThemeStockSymbols,
  type ThemeStockSelectionRow,
} from '../prices/stock-daily-prices'

interface ThemeRow {
  readonly id: string
}

interface PriceRow {
  readonly symbol: string
  readonly trade_date: string
  readonly close: number
}

export interface GtBLabelGenerationResult {
  readonly baseDate: string
  readonly totalThemes: number
  readonly finalCount: number
  readonly pendingCount: number
  readonly excludedCount: number
  readonly coverageRate: number
}

const priceKey = (symbol: string, tradeDate: string): string => `${symbol}|${tradeDate}`

async function loadActiveThemeRows(): Promise<ThemeRow[]> {
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('id')
    .eq('is_active', true)

  if (error) throw new Error(`GT-B 테마 로딩 실패: ${error.message}`)
  return data ?? []
}

async function loadPriceRows(symbols: readonly string[], dates: readonly string[]): Promise<PriceRow[]> {
  if (symbols.length === 0 || dates.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('stock_daily_prices')
    .select('symbol, trade_date, close')
    .in('symbol', symbols)
    .in('trade_date', dates)

  if (error) throw new Error(`GT-B 일봉 로딩 실패: ${error.message}`)
  return data ?? []
}

export function buildGtBLabelRow(input: {
  readonly themeId: string
  readonly baseDate: string
  readonly result: ReturnType<typeof labelGtB>
}): Record<string, unknown> {
  return {
    theme_id: input.themeId,
    base_date: input.baseDate,
    label_type: 'gt_b',
    horizon_days: GTB_HORIZON_DAYS,
    basket_excess_return: input.result.basketExcessReturn,
    basket_size: input.result.basketSize,
    label_status: input.result.status,
    exclude_reason: input.result.excludeReason,
    labeler_version: input.result.labelerVersion,
    finalized_at: input.result.status === 'final' || input.result.status === 'excluded'
      ? new Date().toISOString()
      : null,
  }
}

export async function generateGtBLabelsForBaseDate(baseDate: string): Promise<GtBLabelGenerationResult> {
  const themes = await loadActiveThemeRows()
  const themeIds = themes.map((theme) => theme.id)
  if (themeIds.length === 0) {
    return { baseDate, totalThemes: 0, finalCount: 0, pendingCount: 0, excludedCount: 0, coverageRate: 0 }
  }

  // 읽기 실패가 excluded 라벨로 영구 박제되는 것을 막기 위해 라벨 런을 중단한다.
  const stockRows = await batchQuery<ThemeStockSelectionRow>(
    'theme_stocks',
    'theme_id, symbol, relevance, is_active',
    themeIds,
    (query) => query.eq('is_active', true),
    'theme_id',
    { failOnError: true },
  )
  const futureDate = addKoreanTradingDays(baseDate, GTB_HORIZON_DAYS)
  const allSymbols = [KOSPI_INDEX_SYMBOL, ...selectTopThemeStockSymbols(stockRows, 5)]
  const prices = await loadPriceRows([...new Set(allSymbols)], [baseDate, futureDate])
  const pricesByKey = new Map(prices.map((row) => [priceKey(row.symbol, row.trade_date), row.close]))

  const rows: Record<string, unknown>[] = []
  let finalCount = 0
  let pendingCount = 0
  let excludedCount = 0

  for (const theme of themes) {
    const themeSymbols = selectTopThemeStockSymbols(
      stockRows.filter((row) => row.theme_id === theme.id),
      5,
    )
    const result = labelGtB({
      stocks: themeSymbols.map((symbol) => ({
        symbol,
        baseClose: pricesByKey.get(priceKey(symbol, baseDate)) ?? null,
        futureClose: pricesByKey.get(priceKey(symbol, futureDate)) ?? null,
      })),
      kospiBaseClose: pricesByKey.get(priceKey(KOSPI_INDEX_SYMBOL, baseDate)) ?? null,
      kospiFutureClose: pricesByKey.get(priceKey(KOSPI_INDEX_SYMBOL, futureDate)) ?? null,
    })
    rows.push(buildGtBLabelRow({ themeId: theme.id, baseDate, result }))
    if (result.status === 'final') finalCount++
    if (result.status === 'pending') pendingCount++
    if (result.status === 'excluded') excludedCount++
  }

  await batchUpsert('theme_labels', rows, 'theme_id,base_date,label_type,horizon_days,labeler_version', 'GT-B 라벨')
  return {
    baseDate,
    totalThemes: themes.length,
    finalCount,
    pendingCount,
    excludedCount,
    coverageRate: themes.length > 0 ? finalCount / themes.length : 0,
  }
}
