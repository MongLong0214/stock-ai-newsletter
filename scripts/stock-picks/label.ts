import { getRawPrice, type PriceBook } from '@/scripts/stock-picks/data-handler'
import type { TradingDayIndex } from '@/scripts/stock-picks/trading-days'

export interface StockPickLabel {
  readonly entryDate: string
  readonly entry: number
  readonly maxHigh: number
  readonly touched: boolean
  readonly return5d: number
  readonly maxDrawdown: number | null
}

/**
 * 사후 정답을 만드는 라벨러라 미래 가격을 의도적으로 읽는다. 피처·전략 코드에는
 * PriceBook을 넘기지 않고 Clock 가드가 적용된 GuardedStockDataHandler만 넘겨야 한다.
 * 보유 기간은 진입일 포함 5보유일이며, D1=entryDate부터 D5=entryDate+4거래일까지다.
 */
export function labelPick(
  symbol: string,
  signalDate: string,
  prices: PriceBook,
  tradingDays: TradingDayIndex,
): StockPickLabel | null {
  const entryDate = tradingDays.nextTradingDay(signalDate, 1)
  if (!entryDate) return null

  const entry = getRawPrice(prices, symbol, entryDate)?.open
  if (entry === null || entry === undefined) return null

  const windowDates: string[] = []
  for (let offset = 0; offset < 5; offset++) {
    const date = tradingDays.nextTradingDay(entryDate, offset)
    if (!date) return null
    windowDates.push(date)
  }

  const windowRows = windowDates.map((date) => getRawPrice(prices, symbol, date))
  if (windowRows.some((row) => row?.high === null || row?.high === undefined)) return null

  const highs = windowRows.map((row) => row?.high as number)
  const maxHigh = Math.max(...highs)
  const close5d = windowRows[4]?.close
  if (close5d === undefined) return null

  // KRX 가격은 원 단위 정수 호가다. EPSILON 보정 대신 양쪽을 원 단위 정수로
  // 반올림한 뒤 100:110 정수 비율로 비교해 정확히 +10%인 경계를 포함한다.
  const entryWon = Math.round(entry)
  const maxHighWon = Math.round(maxHigh)
  const touched = maxHighWon * 100 >= entryWon * 110

  const lows = windowRows.map((row) => row?.low)
  const maxDrawdown = lows.every((low): low is number => low !== null && low !== undefined)
    ? Math.min(0, Math.min(...lows) / entry - 1)
    : null

  return {
    entryDate,
    entry,
    maxHigh,
    touched,
    return5d: close5d / entry - 1,
    maxDrawdown,
  }
}
