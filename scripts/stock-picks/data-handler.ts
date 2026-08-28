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

const PRICE_BOOK_SYMBOL_CONCURRENCY = 10
/** 심볼당 최대 행 상한 — 2년 일봉 ~500행이라 3,000이면 여유. 초과 시 조용히 자르지 않고 실패. */
const PRICE_BOOK_PER_SYMBOL_LIMIT = 3000

/**
 * 심볼 단위 로딩.
 *
 * OFFSET 페이지네이션은 깊은 페이지에서, keyset(or 조건)은 플래너가 간헐적으로
 * 풀스캔 계획을 태워(1,081페이지째 57014 실측) 둘 다 statement timeout으로 죽었다.
 * 심볼당 1쿼리는 PK(symbol, trade_date) 프리픽스 인덱스 레인지 스캔이라
 * 플래너가 흔들릴 여지가 없다. stock_master + KOSPI 지수만 로드하므로
 * TLI의 구표기(접두사 없는 코드) 행은 자연히 제외된다.
 */
export async function loadPriceBook(input: {
  readonly startDate?: string
  readonly endDate?: string
} = {}): Promise<PriceBook> {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { KOSPI_INDEX_SYMBOL } = await import('@/scripts/tli/prices/stock-daily-prices')

  const masterRows = await fetchAllRows<{ symbol: string }>((from, to) =>
    supabaseAdmin.from('stock_master').select('symbol').order('symbol', { ascending: true }).range(from, to),
  )
  const symbols = [KOSPI_INDEX_SYMBOL, ...masterRows.map((row) => row.symbol)]

  const rows: StockDailyPriceRow[] = []
  let loadedSymbols = 0

  const loadSymbol = async (symbol: string): Promise<void> => {
    let query = supabaseAdmin
      .from('stock_daily_prices')
      .select('symbol, trade_date, open, high, low, close, volume, source')
      .eq('symbol', symbol)
      .order('trade_date', { ascending: true })
      .limit(PRICE_BOOK_PER_SYMBOL_LIMIT)
    if (input.startDate) query = query.gte('trade_date', input.startDate)
    if (input.endDate) query = query.lte('trade_date', input.endDate)

    const { data, error } = await query
    if (error) throw new Error(`stock_daily_prices 심볼 조회 실패 (${symbol}): ${error.message}`)
    if (data && data.length >= PRICE_BOOK_PER_SYMBOL_LIMIT) {
      throw new Error(`심볼 행 수가 상한(${PRICE_BOOK_PER_SYMBOL_LIMIT})에 도달 — 조용한 절단 방지 위해 중단: ${symbol}`)
    }
    if (data) rows.push(...(data as StockDailyPriceRow[]))
    loadedSymbols += 1
    if (loadedSymbols % 500 === 0) {
      console.log(`   ⏳ PriceBook 로딩 중… ${loadedSymbols}/${symbols.length} 심볼, ${rows.length.toLocaleString()}행`)
    }
  }

  for (let i = 0; i < symbols.length; i += PRICE_BOOK_SYMBOL_CONCURRENCY) {
    await Promise.all(symbols.slice(i, i + PRICE_BOOK_SYMBOL_CONCURRENCY).map(loadSymbol))
  }

  console.log(`   ✅ PriceBook 로딩 완료: ${symbols.length}심볼, ${rows.length.toLocaleString()}행`)
  return buildPriceBook(rows)
}
