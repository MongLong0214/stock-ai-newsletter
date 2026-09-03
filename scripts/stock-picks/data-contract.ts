import type { PriceBook } from '@/scripts/stock-picks/data-handler'
import {
  findMissingTradingDays,
  type TradingDayIndex,
} from '@/scripts/stock-picks/trading-days'
import {
  KOSPI_INDEX_SYMBOL,
  type StockDailyPriceRow,
} from '@/scripts/tli/prices/stock-daily-prices'

const PHANTOM_DEFECT_START_DATE = '2026-08-01'
const RESEARCH_SYMBOL_PATTERN = /^KOS(?:PI|DAQ):/
export const SPARSE_DATE_MIN_RATIO = 0.8

export interface SparseResearchDate {
  readonly date: string
  readonly symbolsWithRow: number
  readonly symbolsWithVolume: number
  readonly ratio: number
}

export interface ResearchGapDate {
  readonly date: string
  readonly missingSymbols: number
}

export interface ResearchDatasetValidation {
  readonly ok: boolean
  readonly missingTradingDays: string[]
  readonly phantomRows: number
  readonly invalidOhlcRows: number
  readonly symbolsWithGaps: number
  readonly sparseDates: SparseResearchDate[]
  readonly gapDatesTop: ResearchGapDate[]
  readonly skippedSymbols: number
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
  let skippedSymbols = 0
  let researchSymbols = 0
  const symbolsWithRowByDate = new Map(expectedDates.map((date) => [date, 0]))
  const symbolsWithVolumeByDate = new Map(expectedDates.map((date) => [date, 0]))
  const missingSymbolsByDate = new Map(expectedDates.map((date) => [date, 0]))

  for (const [symbol, symbolRows] of input.prices) {
    if (symbol === KOSPI_INDEX_SYMBOL || !RESEARCH_SYMBOL_PATTERN.test(symbol)) {
      skippedSymbols++
      continue
    }
    researchSymbols++
    const rows = [...symbolRows.values()].filter((row) => (
      row.trade_date >= input.fromDate && row.trade_date <= input.toDate
    ))
    let hasGap = false
    for (const date of expectedDates) {
      const row = symbolRows.get(date)
      if (!row) {
        hasGap = true
        missingSymbolsByDate.set(date, (missingSymbolsByDate.get(date) ?? 0) + 1)
        continue
      }
      symbolsWithRowByDate.set(date, (symbolsWithRowByDate.get(date) ?? 0) + 1)
      if ((row.volume ?? 0) > 0) {
        symbolsWithVolumeByDate.set(date, (symbolsWithVolumeByDate.get(date) ?? 0) + 1)
      }
    }
    if (hasGap) symbolsWithGaps++
    for (const row of rows) {
      if (isPhantomRow(row)) phantomRows++
      if (!hasValidResearchOhlc(row)) invalidOhlcRows++
    }
  }

  const sparseDates = expectedDates.flatMap((date): SparseResearchDate[] => {
    const symbolsWithRow = symbolsWithRowByDate.get(date) ?? 0
    const symbolsWithVolume = symbolsWithVolumeByDate.get(date) ?? 0
    const ratio = researchSymbols > 0 ? symbolsWithVolume / researchSymbols : 0
    return ratio < SPARSE_DATE_MIN_RATIO
      ? [{ date, symbolsWithRow, symbolsWithVolume, ratio }]
      : []
  })
  const gapDatesTop = [...missingSymbolsByDate]
    .filter(([, missingSymbols]) => missingSymbols > 0)
    .map(([date, missingSymbols]) => ({ date, missingSymbols }))
    .sort((left, right) => (
      right.missingSymbols - left.missingSymbols || left.date.localeCompare(right.date)
    ))
    .slice(0, 10)

  return {
    ok: missingTradingDays.length === 0 && invalidOhlcRows === 0 && sparseDates.length === 0,
    missingTradingDays,
    phantomRows,
    invalidOhlcRows,
    symbolsWithGaps,
    sparseDates,
    gapDatesTop,
    skippedSymbols,
  }
}
