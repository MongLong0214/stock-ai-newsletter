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

export async function loadPriceBook(input: {
  readonly startDate?: string
  readonly endDate?: string
} = {}): Promise<PriceBook> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const rows = await fetchAllRows<StockDailyPriceRow>((from, to) => {
    let query = supabaseAdmin
      .from('stock_daily_prices')
      .select('symbol, trade_date, open, high, low, close, volume, source')
      .order('symbol', { ascending: true })
      .order('trade_date', { ascending: true })
    if (input.startDate) query = query.gte('trade_date', input.startDate)
    if (input.endDate) query = query.lte('trade_date', input.endDate)
    return query.range(from, to)
  })

  return buildPriceBook(rows)
}
