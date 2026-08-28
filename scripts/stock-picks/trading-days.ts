import { KOSPI_INDEX_SYMBOL } from '@/scripts/tli/prices/stock-daily-prices'

interface TradingDayRow {
  readonly trade_date: string
}

/**
 * 실제 적재된 KOSPI 거래일을 인덱싱한다.
 *
 * `lib/utils/korean-trading-calendar.ts`와 `lib/tli/trading-calendar.ts`의 공휴일 기반
 * 캘린더는 아직 관측되지 않은 미래 수집 구간을 계산할 때 사용한다. 라벨·백테스트는
 * 임시 휴장까지 반영해야 하므로 stock_daily_prices의 실측 거래일만 사용한다.
 */
export class TradingDayIndex {
  readonly tradingDays: readonly string[]
  readonly indexByDate: ReadonlyMap<string, number>

  constructor(dates: readonly string[]) {
    this.tradingDays = [...new Set(dates.filter(Boolean))].sort()
    this.indexByDate = new Map(this.tradingDays.map((date, index) => [date, index]))
  }

  get firstDate(): string | null {
    return this.tradingDays[0] ?? null
  }

  get lastDate(): string | null {
    return this.tradingDays[this.tradingDays.length - 1] ?? null
  }

  nextTradingDay(date: string, offset: number): string | null {
    if (!Number.isInteger(offset)) throw new Error(`거래일 offset은 정수여야 합니다: ${offset}`)
    const index = this.indexByDate.get(date)
    if (index === undefined) return null
    return this.tradingDays[index + offset] ?? null
  }

  firstTradingDayOnOrAfter(date: string): string | null {
    let low = 0
    let high = this.tradingDays.length

    while (low < high) {
      const middle = low + Math.floor((high - low) / 2)
      const middleDate = this.tradingDays[middle]
      if (middleDate !== undefined && middleDate < date) low = middle + 1
      else high = middle
    }

    return this.tradingDays[low] ?? null
  }

  tradingDaysBetween(startDate: string, endDate: string): string[] {
    if (startDate > endDate) return []
    const startIndex = this.indexByDate.get(startDate)
    const endIndex = this.indexByDate.get(endDate)
    if (startIndex === undefined || endIndex === undefined) return []
    return this.tradingDays.slice(startIndex, endIndex + 1)
  }
}

export async function loadTradingDayIndex(): Promise<TradingDayIndex> {
  const { fetchAllRows } = await import('@/lib/supabase/paginate')
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const rows = await fetchAllRows<TradingDayRow>((from, to) => supabaseAdmin
    .from('stock_daily_prices')
    .select('trade_date')
    .eq('symbol', KOSPI_INDEX_SYMBOL)
    .order('trade_date', { ascending: true })
    .range(from, to))

  return new TradingDayIndex(rows.map((row) => row.trade_date))
}
