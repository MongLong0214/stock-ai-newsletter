import { hasValidResearchOhlc } from '@/scripts/stock-picks/data-contract'
import type { GuardedStockDataHandler } from '@/scripts/stock-picks/data-handler'
import { KOSPI_INDEX_SYMBOL, type StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

/** 확률이 아닌 관측값. 비율은 0..1, Percent 접미사는 % 단위다. */
export interface TechnicalContext {
  readonly version: 'technical-context-v1'
  readonly benchmarkSymbol: string
  readonly return5Percent: number | null
  readonly return20Percent: number | null
  readonly return60Percent: number | null
  readonly relativeReturn20PercentagePoints: number | null
  readonly relativeReturn60PercentagePoints: number | null
  readonly realizedVolatility20Percent: number | null
  readonly bollingerWidth20Percent: number | null
  readonly closeLocation: number | null
  readonly upperWickRatio: number | null
  readonly chaikinMoneyFlow21: number | null
  readonly distanceFromPriorHigh20Percent: number | null
  readonly benchmarkReturn20Percent: number | null
  readonly benchmarkSma20DistancePercent: number | null
  /** 현재 마스터 universe 중 해당일 유효한 20일 창을 가진 종목만 분모에 포함한다. */
  readonly breadthAboveSma20: number | null
  readonly breadthEligibleSymbols: number
  readonly breadthUniverseSymbols: number
}

type Row = StockDailyPriceRow | undefined
const validClose = (row: Row): number | null => (
  row && Number.isFinite(row.close) && row.close > 0 ? row.close : null
)
const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length
const closes = (rows: readonly Row[], length: number): number[] | null => {
  const values = rows.slice(-length).map(validClose)
  return values.length === length && values.every((value) => value !== null) ? values as number[] : null
}
const priceReturn = (rows: readonly Row[], days: number): number | null => {
  const window = closes(rows, days + 1)
  return window ? (window.at(-1)! / window[0]! - 1) * 100 : null
}
const smaDistance = (rows: readonly Row[], days: number): number | null => {
  const window = closes(rows, days)
  return window ? (window.at(-1)! / mean(window) - 1) * 100 : null
}
const stockRow = (row: Row): Row => row && hasValidResearchOhlc(row)
  && row.volume !== null && Number.isFinite(row.volume) && row.volume > 0 ? row : undefined
const difference = (left: number | null, right: number | null): number | null => (
  left === null || right === null ? null : left - right
)

function buildContext(rows: readonly Row[], benchmark: readonly Row[]): TechnicalContext {
  const current = rows.at(-1)
  const range = current ? current.high! - current.low! : 0
  const window20 = closes(rows, 20)
  const window21 = closes(rows, 21)
  const mean20 = window20 ? mean(window20) : null
  const variance20 = window20 && mean20 !== null
    ? mean(window20.map((close) => (close - mean20) ** 2)) : null
  const logReturns = window21?.slice(1).map((close, index) => Math.log(close / window21[index]!))
  const logMean = logReturns ? mean(logReturns) : null
  const flowRows = rows.slice(-21)
  const hasFlowWindow = flowRows.length === 21 && flowRows.every((row) => row !== undefined)
  const flowVolume = hasFlowWindow ? flowRows.reduce((sum, row) => sum + row!.volume!, 0) : 0
  const priorRows = rows.slice(-21, -1)
  const priorHigh = priorRows.length === 20 && priorRows.every((row) => row !== undefined)
    ? Math.max(...priorRows.map((row) => row!.high!)) : null
  const return20 = priceReturn(rows, 20)
  const return60 = priceReturn(rows, 60)
  const benchmarkReturn20 = priceReturn(benchmark, 20)
  return {
    version: 'technical-context-v1',
    // KOSDAQ에도 KOSPI를 공통 시장 기준으로 사용한다. KOSDAQ 지수라고 표기하지 않는다.
    benchmarkSymbol: KOSPI_INDEX_SYMBOL,
    return5Percent: priceReturn(rows, 5),
    return20Percent: return20,
    return60Percent: return60,
    relativeReturn20PercentagePoints: difference(return20, benchmarkReturn20),
    relativeReturn60PercentagePoints: difference(return60, priceReturn(benchmark, 60)),
    realizedVolatility20Percent: logReturns && logMean !== null
      ? Math.sqrt(logReturns.reduce((sum, value) => sum + (value - logMean) ** 2, 0) / 19) * Math.sqrt(252) * 100
      : null,
    // Bollinger 20일, ±2 모집단 표준편차: (upper-lower)/SMA * 100.
    bollingerWidth20Percent: variance20 !== null && mean20 !== null ? 4 * Math.sqrt(variance20) / mean20 * 100 : null,
    closeLocation: current && range > 0 ? (current.close - current.low!) / range : null,
    upperWickRatio: current && range > 0 ? (current.high! - Math.max(current.open!, current.close)) / range : null,
    // CMF는 실제 투자자별 순매수 금액이 아닌 OHLCV 대용 지표다. 무변동 봉의 multiplier는 0.
    chaikinMoneyFlow21: flowVolume > 0 ? flowRows.reduce((sum, row) => {
      const spread = row!.high! - row!.low!
      return sum + (spread > 0 ? (2 * row!.close - row!.low! - row!.high!) / spread : 0) * row!.volume!
    }, 0) / flowVolume : null,
    distanceFromPriorHigh20Percent: current && priorHigh !== null ? (current.close / priorHigh - 1) * 100 : null,
    benchmarkReturn20Percent: benchmarkReturn20,
    benchmarkSma20DistancePercent: smaDistance(benchmark, 20),
    breadthAboveSma20: null,
    breadthEligibleSymbols: 0,
    breadthUniverseSymbols: 0,
  }
}

/** 각 날짜까지의 prefix만 계산한다. 결측·거래정지 봉을 건너뛰어 거래일 간격을 압축하지 않는다. */
export function buildTechnicalContextMap(input: {
  readonly handler: GuardedStockDataHandler
  readonly symbols: readonly string[]
  readonly dates: readonly string[]
  readonly includeFromDate?: string
}): ReadonlyMap<string, ReadonlyMap<string, TechnicalContext>> {
  const dates = [...new Set(input.dates)].sort()
  const symbols = [...new Set(input.symbols)].filter((symbol) => symbol !== KOSPI_INDEX_SYMBOL)
  const benchmarkRows = dates.map((date) => input.handler.get(KOSPI_INDEX_SYMBOL, date))
  const output = new Map<string, Map<string, TechnicalContext>>()
  const breadth = new Map<string, { eligible: number; above: number }>()
  for (const symbol of symbols) {
    const rows: Row[] = []
    dates.forEach((date, index) => {
      rows.push(stockRow(input.handler.get(symbol, date)))
      if (rows.length > 61) rows.shift()
      if (input.includeFromDate && date < input.includeFromDate) return
      const context = buildContext(rows, benchmarkRows.slice(Math.max(0, index - 60), index + 1))
      const distance = smaDistance(rows, 20)
      const dayBreadth = breadth.get(date) ?? { eligible: 0, above: 0 }
      if (distance !== null) {
        dayBreadth.eligible++
        if (distance > 0) dayBreadth.above++
      }
      breadth.set(date, dayBreadth)
      const day = output.get(date) ?? new Map<string, TechnicalContext>()
      day.set(symbol, context)
      output.set(date, day)
    })
  }
  for (const [date, day] of output) {
    const counts = breadth.get(date)!
    for (const [symbol, context] of day) day.set(symbol, {
      ...context,
      breadthAboveSma20: counts.eligible > 0 ? counts.above / counts.eligible : null,
      breadthEligibleSymbols: counts.eligible,
      breadthUniverseSymbols: symbols.length,
    })
  }
  return output
}
