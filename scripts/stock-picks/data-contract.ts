import type { PriceBook } from '@/scripts/stock-picks/data-handler'
import {
  findMissingTradingDays,
  type TradingDayIndex,
} from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const PHANTOM_DEFECT_START_DATE = '2026-08-01'

export interface ResearchDatasetValidation {
  readonly ok: boolean
  readonly missingTradingDays: string[]
  readonly phantomRows: number
  readonly invalidOhlcRows: number
  readonly symbolsWithGaps: number
}

const finitePositive = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

export function hasValidResearchOhlc(row: StockDailyPriceRow): boolean {
  return finitePositive(row.open)
    && finitePositive(row.high)
    && finitePositive(row.low)
    && finitePositive(row.close)
    && row.high >= row.low
    && row.open >= row.low
    && row.open <= row.high
    && row.close >= row.low
    && row.close <= row.high
}

const isPhantomRow = (row: StockDailyPriceRow): boolean => (
  // WHY: pre-market flat-row pollution began with the v2 ingestion pipeline after 2026-08-01.
  row.trade_date > PHANTOM_DEFECT_START_DATE
  && row.volume === 0
  && row.open !== null
  && row.high !== null
  && row.low !== null
  && row.open === row.high
  && row.high === row.low
  && row.low === row.close
)

export function validateResearchDataset(input: {
  readonly tradingDays: TradingDayIndex
  readonly prices: PriceBook
  readonly fromDate: string
  readonly toDate: string
}): ResearchDatasetValidation {
  const missingTradingDays = findMissingTradingDays(
    input.tradingDays,
    input.fromDate,
    input.toDate,
  )
  const expectedDates = input.tradingDays.tradingDays.filter((date) => (
    date >= input.fromDate && date <= input.toDate
  ))
  let phantomRows = 0
  let invalidOhlcRows = 0
  let symbolsWithGaps = 0

  for (const symbolRows of input.prices.values()) {
    const rows = [...symbolRows.values()].filter((row) => (
      row.trade_date >= input.fromDate && row.trade_date <= input.toDate
    ))
    const dates = new Set(rows.map((row) => row.trade_date))
    if (expectedDates.some((date) => !dates.has(date))) symbolsWithGaps++
    for (const row of rows) {
      if (isPhantomRow(row)) phantomRows++
      if (!hasValidResearchOhlc(row)) invalidOhlcRows++
    }
  }

  return {
    ok: missingTradingDays.length === 0 && invalidOhlcRows === 0,
    missingTradingDays,
    phantomRows,
    invalidOhlcRows,
    symbolsWithGaps,
  }
}
