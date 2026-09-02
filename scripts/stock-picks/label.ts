import { getRawPrice, type PriceBook } from '@/scripts/stock-picks/data-handler'
import type { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const PRODUCT_HOLDING_DAYS = 5

export type StockPickLabelStatus = 'hit' | 'miss' | 'unexpected_untradeable' | 'data_error'

export interface StockPickLabel {
  readonly entryDate: string
  readonly entry: number | null
  readonly entryVolume: number | null
  readonly maxHigh: number | null
  readonly touched: boolean
  readonly status: StockPickLabelStatus
  readonly return5d: number | null
  readonly maxDrawdown: number | null
}

const finitePositive = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

const hasValidOhlc = (row: StockDailyPriceRow | undefined): row is StockDailyPriceRow & {
  readonly open: number
  readonly high: number
  readonly low: number
} => Boolean(
  row
  && finitePositive(row.open)
  && finitePositive(row.high)
  && finitePositive(row.low)
  && finitePositive(row.close)
  && row.high >= row.low
  && row.open >= row.low
  && row.open <= row.high
  && row.close >= row.low
  && row.close <= row.high
)

const dataErrorLabel = (
  entryDate: string,
  entryRow: StockDailyPriceRow | undefined,
  windowRows: readonly (StockDailyPriceRow | undefined)[],
): StockPickLabel => {
  const validHighs = windowRows.flatMap((row) => finitePositive(row?.high) ? [row.high] : [])
  return {
    entryDate,
    entry: finitePositive(entryRow?.open) ? entryRow.open : null,
    entryVolume: typeof entryRow?.volume === 'number' && Number.isFinite(entryRow.volume)
      ? entryRow.volume
      : null,
    maxHigh: validHighs.length > 0 ? Math.max(...validHighs) : null,
    touched: false,
    status: 'data_error',
    return5d: null,
    maxDrawdown: null,
  }
}

/**
 * 사후 정답을 만드는 라벨러라 미래 가격을 의도적으로 읽는다. 피처·전략 코드에는
 * PriceBook을 넘기지 않고 Clock 가드가 적용된 GuardedStockDataHandler만 넘겨야 한다.
 * 기본 보유 기간은 진입일 포함 5보유일이며, D1=entryDate부터 D5=entryDate+4거래일까지다.
 * 확장 호라이즌에서도 return5d와 maxDrawdown은 제품 기준 D1~D5 의미를 유지한다.
 */
export function labelPick(
  symbol: string,
  signalDate: string,
  prices: PriceBook,
  tradingDays: TradingDayIndex,
  holdingDays = PRODUCT_HOLDING_DAYS,
): StockPickLabel | null {
  if (!Number.isInteger(holdingDays) || holdingDays < PRODUCT_HOLDING_DAYS) {
    throw new Error(`holdingDays는 ${PRODUCT_HOLDING_DAYS} 이상의 정수여야 합니다: ${holdingDays}`)
  }
  const entryDate = tradingDays.nextTradingDay(signalDate, 1)
  if (!entryDate) return null

  const windowDates: string[] = []
  for (let offset = 0; offset < holdingDays; offset++) {
    const date = tradingDays.nextTradingDay(entryDate, offset)
    if (!date) return null
    windowDates.push(date)
  }

  const windowRows = windowDates.map((date) => getRawPrice(prices, symbol, date))
  const entryRow = windowRows[0]
  if (!hasValidOhlc(entryRow) || windowRows.some((row) => !hasValidOhlc(row))) {
    return dataErrorLabel(entryDate, entryRow, windowRows)
  }

  const entry = entryRow.open
  const entryVolume = entryRow.volume
  if (typeof entryVolume !== 'number' || !Number.isFinite(entryVolume) || entryVolume < 0) {
    return dataErrorLabel(entryDate, entryRow, windowRows)
  }
  const entryIsFlat = entryRow.open === entryRow.high
    && entryRow.high === entryRow.low
    && entryRow.low === entryRow.close
  const followedByNormalRows = windowRows.slice(1).some((row) => (
    hasValidOhlc(row) && typeof row.volume === 'number' && row.volume > 0
  ))
  if (entryVolume === 0 && entryIsFlat && followedByNormalRows) {
    return dataErrorLabel(entryDate, entryRow, windowRows)
  }

  const highs = windowRows.map((row) => row.high)
  const maxHigh = Math.max(...highs)
  const productWindowRows = windowRows.slice(0, PRODUCT_HOLDING_DAYS)
  const close5d = productWindowRows[PRODUCT_HOLDING_DAYS - 1]?.close as number

  if (entryVolume === 0) {
    return {
      entryDate,
      entry,
      entryVolume,
      maxHigh,
      touched: false,
      status: 'unexpected_untradeable',
      return5d: close5d / entry - 1,
      maxDrawdown: Math.min(0, Math.min(...productWindowRows.map((row) => row.low)) / entry - 1),
    }
  }

  // KRX 가격은 원 단위 정수 호가다. EPSILON 보정 대신 양쪽을 원 단위 정수로
  // 반올림한 뒤 100:110 정수 비율로 비교해 정확히 +10%인 경계를 포함한다.
  const entryWon = Math.round(entry)
  const maxHighWon = Math.round(maxHigh)
  const touched = maxHighWon * 100 >= entryWon * 110

  const lows = productWindowRows.map((row) => row.low)
  const maxDrawdown = Math.min(0, Math.min(...lows) / entry - 1)

  return {
    entryDate,
    entry,
    entryVolume,
    maxHigh,
    touched,
    status: touched ? 'hit' : 'miss',
    return5d: close5d / entry - 1,
    maxDrawdown,
  }
}
