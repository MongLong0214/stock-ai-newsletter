import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'
import type { TradingDayIndex } from '@/scripts/stock-picks/trading-days'

export type SymbolPriceRows = ReadonlyMap<string, StockDailyPriceRow>
export type PriceBook = ReadonlyMap<string, SymbolPriceRows>

export class LookaheadError extends Error {
  constructor(simDate: string, requestedDate: string) {
    super(`룩어헤드 접근 차단: simDate=${simDate}, requestedDate=${requestedDate}`)
    this.name = 'LookaheadError'
  }
}

export function buildPriceBook(rows: readonly StockDailyPriceRow[]): PriceBook {
  const mutableBook = new Map<string, Map<string, StockDailyPriceRow>>()
  for (const row of rows) {
    const symbolRows = mutableBook.get(row.symbol) ?? new Map<string, StockDailyPriceRow>()
    symbolRows.set(row.trade_date, row)
    mutableBook.set(row.symbol, symbolRows)
  }
  return mutableBook
}

/** 라벨 산출처럼 정의상 미래 가격을 읽는 코드에서만 사용하는 원시 접근자다. */
export function getRawPrice(
  prices: PriceBook,
  symbol: string,
  date: string,
): StockDailyPriceRow | undefined {
  return prices.get(symbol)?.get(date)
}

export interface GuardedStockDataHandler {
  readonly simDate: string
  get(symbol: string, date: string): StockDailyPriceRow | undefined
  previousTradingDay(date: string, offset?: number): string | null
  tradingDaysBetween(startDate: string, endDate: string): readonly string[]
}

class PointInTimeStockDataHandler implements GuardedStockDataHandler {
  constructor(
    private readonly prices: PriceBook,
    private readonly tradingDays: TradingDayIndex,
    readonly simDate: string,
  ) {}

  private assertNotFuture(date: string): void {
    // YYYY-MM-DD는 사전식 순서와 시간 순서가 같아 Date/타임존 변환 없이 비교한다.
    if (date > this.simDate) throw new LookaheadError(this.simDate, date)
  }

  get(symbol: string, date: string): StockDailyPriceRow | undefined {
    this.assertNotFuture(date)
    return getRawPrice(this.prices, symbol, date)
  }

  previousTradingDay(date: string, offset = 1): string | null {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error(`이전 거래일 offset은 0 이상의 정수여야 합니다: ${offset}`)
    }
    this.assertNotFuture(date)
    const previousDate = this.tradingDays.nextTradingDay(date, -offset)
    if (previousDate) this.assertNotFuture(previousDate)
    return previousDate
  }

  tradingDaysBetween(startDate: string, endDate: string): readonly string[] {
    this.assertNotFuture(startDate)
    this.assertNotFuture(endDate)
    return this.tradingDays.tradingDaysBetween(startDate, endDate)
  }
}

/**
 * 피처 계산용 데이터 핸들러. 전략에는 `at(simDate)`가 반환한 가드 타입만 전달한다.
 * 미래 관측이 필요한 라벨러는 이 타입을 우회하지 않고 별도의 PriceBook을 명시적으로 받는다.
 */
export class StockDataHandler {
  constructor(
    private readonly prices: PriceBook,
    private readonly tradingDays: TradingDayIndex,
  ) {}

  at(simDate: string): GuardedStockDataHandler {
    return new PointInTimeStockDataHandler(this.prices, this.tradingDays, simDate)
  }
}

const PRICE_BOOK_PAGE_SIZE = 1000

/**
 * keyset 커서 → PostgREST or 조건.
 *
 * OFFSET 페이지네이션은 1.1M행에서 깊어질수록 매 페이지 앞행 전체를 스캔해
 * statement timeout(57014)으로 죽는다(실측). PK (symbol, trade_date) 시크로 대체:
 * "symbol > s OR (symbol = s AND trade_date > d)" — 페이지당 인덱스 시크 O(1).
 */
export function buildKeysetCondition(cursor: { symbol: string; tradeDate: string }): string {
  // symbol에 콜론이 포함되므로(KOSPI:005930) PostgREST 예약문자 회피를 위해 쌍따옴표 인용
  const s = `"${cursor.symbol}"`
  return `symbol.gt.${s},and(symbol.eq.${s},trade_date.gt.${cursor.tradeDate})`
}

export async function loadPriceBook(input: {
  readonly startDate?: string
  readonly endDate?: string
} = {}): Promise<PriceBook> {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')

  const rows: StockDailyPriceRow[] = []
  let cursor: { symbol: string; tradeDate: string } | null = null
  let pageCount = 0

  for (;;) {
    let query = supabaseAdmin
      .from('stock_daily_prices')
      .select('symbol, trade_date, open, high, low, close, volume, source')
      .order('symbol', { ascending: true })
      .order('trade_date', { ascending: true })
      .limit(PRICE_BOOK_PAGE_SIZE)
    if (input.startDate) query = query.gte('trade_date', input.startDate)
    if (input.endDate) query = query.lte('trade_date', input.endDate)
    if (cursor) query = query.or(buildKeysetCondition(cursor))

    const { data, error } = await query
    if (error) throw new Error(`stock_daily_prices keyset 조회 실패 (${pageCount + 1}페이지): ${error.message}`)
    if (!data || data.length === 0) break

    rows.push(...(data as StockDailyPriceRow[]))
    pageCount += 1
    if (pageCount % 100 === 0) console.log(`   ⏳ PriceBook 로딩 중… ${rows.length.toLocaleString()}행 (${pageCount}페이지)`)

    if (data.length < PRICE_BOOK_PAGE_SIZE) break
    const last = data[data.length - 1] as StockDailyPriceRow
    cursor = { symbol: last.symbol, tradeDate: last.trade_date }
  }

  console.log(`   ✅ PriceBook 로딩 완료: ${rows.length.toLocaleString()}행 (${pageCount}페이지)`)
  return buildPriceBook(rows)
}
