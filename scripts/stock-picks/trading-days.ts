import {
  getLastFinalizedTradingDate,
  getKoreanTradingDatesBetween,
  isKoreanTradingDate,
} from '@/lib/tli/trading-calendar'
import { KOSPI_INDEX_SYMBOL } from '@/scripts/tli/prices/stock-daily-prices'

interface TradingDayRow {
  readonly trade_date: string
  readonly symbol?: string
  readonly volume?: number | null
}

export const TRADING_DAY_ANCHOR_SYMBOLS = ['KOSPI:005930', 'KOSPI:000660'] as const

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
  const [kospiRows, anchorRows] = await Promise.all([
    fetchAllRows<TradingDayRow>((from, to) => supabaseAdmin
      .from('stock_daily_prices')
      .select('trade_date')
      .eq('symbol', KOSPI_INDEX_SYMBOL)
      .order('trade_date', { ascending: true })
      .range(from, to)),
    fetchAllRows<TradingDayRow>((from, to) => supabaseAdmin
      .from('stock_daily_prices')
      .select('symbol, trade_date, volume')
      .in('symbol', [...TRADING_DAY_ANCHOR_SYMBOLS])
      .gt('volume', 0)
      .order('trade_date', { ascending: true })
      .order('symbol', { ascending: true })
      .range(from, to)),
  ])

  return buildTradingDayIndex(kospiRows, anchorRows)
}

export function buildTradingDayIndex(
  kospiRows: readonly TradingDayRow[],
  anchorRows: readonly TradingDayRow[],
  finalizedThroughDate = getLastFinalizedTradingDate(),
): TradingDayIndex {
  // WHY: KOSPI 한 번의 수집 실패나 지수 공백이 실제 거래일을 지우지 않도록 매 세션 거래하는
  // 최유동 KOSPI 두 종목을 보강하되, phantom·거래정지는 거래량 조건으로 제외한다.
  const kospiDates = new Set(kospiRows.map((row) => row.trade_date).filter(Boolean))
  const anchorDates = new Set(anchorRows
    .filter((row) => (row.volume ?? 0) > 0)
    .map((row) => row.trade_date)
    .filter(Boolean))
  const allDates = new Set([...kospiDates, ...anchorDates])
  const calendarConflicts = [...anchorDates]
    .filter((date) => date <= finalizedThroughDate && !isKoreanTradingDate(date))
    .sort()
  // WHY: 양수 거래량 앵커는 실제 체결 증거이므로 휴일표보다 우선한다. 캘린더 필터는
  // 실거래 증거가 없는 KOSPI-only 날짜에만 적용하고, 미완결 세션 상한은 양쪽에 강제한다.
  const validDates = [...allDates].filter((date) => (
    date <= finalizedThroughDate
    && (anchorDates.has(date) || isKoreanTradingDate(date))
  ))
  const validDateSet = new Set(validDates)
  const anchorOnlyDates = [...anchorDates]
    .filter((date) => !kospiDates.has(date) && validDateSet.has(date)).length
  const index = new TradingDayIndex(validDates)

  console.log(JSON.stringify({
    event: 'trading_day_index',
    kospiDates: [...kospiDates].filter((date) => validDateSet.has(date)).length,
    anchorOnlyDates,
    droppedNonTradingDates: [...allDates].filter((date) => (
      date <= finalizedThroughDate
      && !anchorDates.has(date)
      && !isKoreanTradingDate(date)
    )).length,
    calendarConflicts,
    droppedUnfinalizedDates: [...allDates].filter((date) => date > finalizedThroughDate).length,
    first: index.firstDate,
    last: index.lastDate,
  }))

  return index
}

export function findMissingTradingDays(
  index: TradingDayIndex,
  fromDate: string,
  toDate: string,
): string[] {
  return getKoreanTradingDatesBetween({ startDate: fromDate, endDate: toDate })
    .filter((date) => !index.indexByDate.has(date))
}
