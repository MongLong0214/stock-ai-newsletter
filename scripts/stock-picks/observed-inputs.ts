import type { GuardedStockDataHandler } from '@/scripts/stock-picks/data-handler'
import { hasValidResearchOhlc } from '@/scripts/stock-picks/data-contract'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import type { TechnicalContext } from '@/scripts/stock-picks/technical-context'
import { KOSPI_INDEX_SYMBOL, type StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

export const OBSERVED_INPUT_VERSION = 'observed-50-v1-2026-09-30'
export const MODEL_MARKET_SOURCE_VERSION = 'kis-market-21-20-v1'
export const OBSERVED_INPUT_NAMES = [
  'atrPercent14', 'volumeRatio20', 'chaikinMoneyFlow21', 'distanceFromPriorHigh20Percent',
  'bollingerWidth20Percent', 'signalCloseCloseReturnPercent', 'gapFromPreviousClosePercent',
  'signalIntradayReturnPercent', 'rsi14', 'sma20DistancePercent', 'sma60DistancePercent',
  'return5Percent', 'return20Percent', 'return60Percent', 'closeLocation', 'upperWickPercent',
  'kospiReturn20Percent', 'breadthAboveSma20Percent',
  'return1Percent', 'return2Percent', 'return3Percent', 'return10Percent', 'return40Percent', 'return120Percent',
  'closeSma5DistancePercent', 'sma5ToSma20Ratio', 'return20ExcludingRecent5Percent',
  'distanceFromPriorHigh5Percent', 'distanceFromPriorHigh10Percent', 'distanceFromPriorHigh60Percent', 'distanceFromPriorHigh120Percent',
  'atr5ToAtr20Ratio', 'returnVolatility5To20Ratio', 'normalizedRange5To20Ratio', 'todayTrToPrior20MeanRatio',
  'volumeMean3ToPrevious20Ratio', 'volumeMean5ToPrevious20Ratio', 'todayVolumeToPrior5MeanRatio',
  'bullishVolumeShare5', 'upCloseVolumeShare10', 'todayTurnoverToPrior20MeanRatio', 'logAverageTurnover20',
  'clvMean3', 'clvMean5', 'candleBodyMean3Percent', 'candleBodyMean5Percent', 'upperWickMean5',
  'positiveCloseDays5', 'priorHigh20AgeSessions', 'drawdownFromPrior60ClosePeakPercent',
] as const

type Value = number | null
type Bar = { open: number; high: number; low: number; close: number; volume: Value }
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nullable = (v: unknown): Value => finite(v) ? v : null
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)
const ratio = (a: Value, b: Value): Value => a !== null && b !== null && b > 0 ? nullable(a / b) : null

/** 모델의 KOSPI 20일 수익률과 시장 폭에 실제로 기여하는 창만 KIS 원천을 요구한다. */
export function validateModelMarketSources(input: {
  readonly handler: GuardedStockDataHandler
  readonly symbols: readonly string[]
  readonly dates: readonly string[]
}): void {
  const { handler, dates } = input
  if (dates.at(-1) !== handler.simDate
    || dates.some((date, index) => date > handler.simDate || (index > 0 && date <= dates[index - 1]!))) {
    throw new Error('종합 점수 시장 피처 기준일 불일치')
  }
  const validateWindow = (symbol: string, length: number, valid: (row: StockDailyPriceRow) => boolean) => {
    const window = dates.slice(-length).map(date => ({ date, row: handler.get(symbol, date) }))
    // 기존 기술 관측값과 동일하게 불완전·무효 창은 결측으로 남긴다.
    if (window.length !== length || !window.every(({ row }) => row && valid(row))) return
    for (const { date, row } of window) if (row!.source !== 'kis') {
      throw new Error(`종합 점수 시장 시세 원천 불일치: ${symbol}/${date}`)
    }
  }
  validateWindow(KOSPI_INDEX_SYMBOL, 21, row => finite(row.close) && row.close > 0)
  for (const symbol of new Set(input.symbols)) if (symbol !== KOSPI_INDEX_SYMBOL) {
    validateWindow(symbol, 20, row => hasValidResearchOhlc(row) && finite(row.volume) && row.volume > 0)
  }
}

/** 기존 18개는 실제 TS 관측값을 사용하고, 추가 32개는 과거 거래량 0도 보존한다. */
export function buildObservedInputs50(input: {
  readonly feature: StockFeatureVector
  readonly context: TechnicalContext
  readonly handler: GuardedStockDataHandler
  readonly dates: readonly string[]
}): readonly Value[] {
  const { feature: f, context: c, handler } = input
  const dates = input.dates.slice(-320)
  if (handler.simDate !== f.simDate || dates.at(-1) !== f.simDate
    || dates.some((d, i) => d > f.simDate || (i > 0 && d <= dates[i - 1]!))) {
    throw new Error(`종합 점수 피처 기준일 불일치: ${f.symbol}`)
  }
  const bars: Array<Bar | null> = dates.map((date) => {
    const row = handler.get(f.symbol, date)
    if (!row) return null
    if (row.source !== 'kis') throw new Error(`종합 점수 시세 원천 불일치: ${f.symbol}/${date}`)
    if (!hasValidResearchOhlc(row)) return null
    return { open: row.open!, high: row.high!, low: row.low!, close: row.close,
      volume: finite(row.volume) && row.volume >= 0 ? row.volume : null }
  })
  const t = bars.length - 1
  const closes = bars.map((b) => b?.close ?? null)
  const highs = bars.map((b) => b?.high ?? null)
  const volumes = bars.map((b) => b?.volume ?? null)
  const total = (v: readonly Value[], n: number, end = t): Value => {
    const start = end - n + 1
    if (start < 0 || end >= v.length) return null
    const window = v.slice(start, end + 1)
    return window.every((x) => x !== null) ? nullable(sum(window as number[])) : null
  }
  const mean = (v: readonly Value[], n: number, end = t): Value => {
    const vtotal = total(v, n, end)
    return vtotal === null ? null : vtotal / n
  }
  const sd = (v: readonly Value[], n: number): Value => {
    const average = mean(v, n)
    return average === null ? null : Math.sqrt(sum((v.slice(-n) as number[]).map((x) => (x - average) ** 2)) / (n - 1))
  }
  const returns = (n: number, end = t): Value => {
    if (total(closes, n + 1, end) === null) return null
    return nullable((closes[end]! / closes[end - n]! - 1) * 100)
  }
  const maximum = (v: readonly Value[], n: number, end = t - 1): { value: number; index: number } | null => {
    if (total(v, n, end) === null) return null
    let index = end - n + 1
    for (let i = index + 1; i <= end; i++) if (v[i]! >= v[index]!) index = i
    return { value: v[index]!, index }
  }
  const tr: Value[] = [], strictTr: Value[] = [], logReturns: Value[] = []
  const ranges: Value[] = [], clv: Value[] = [], bodies: Value[] = [], wicks: Value[] = []
  const bullVolume: Value[] = [], upVolume: Value[] = [], upDays: Value[] = [], turnovers: Value[] = []
  bars.forEach((b, i) => {
    const prev = bars[i - 1]
    const spread = b ? b.high - b.low : null
    const trueRange = b ? prev ? Math.max(spread!, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close)) : spread : null
    tr.push(trueRange); strictTr.push(prev ? trueRange : null)
    logReturns.push(b && prev ? Math.log(b.close / prev.close) : null)
    ranges.push(b ? spread! / b.close : null)
    clv.push(b && spread! > 0 ? (2 * b.close - b.low - b.high) / spread! : null)
    bodies.push(b ? (b.close / b.open - 1) * 100 : null)
    wicks.push(b && spread! > 0 ? (b.high - Math.max(b.open, b.close)) / spread! : null)
    bullVolume.push(b && b.volume !== null ? b.volume * Number(b.close > b.open) : null)
    upVolume.push(b && prev && b.volume !== null ? b.volume * Number(b.close > prev.close) : null)
    upDays.push(b && prev ? Number(b.close > prev.close) : null)
    turnovers.push(b && b.volume !== null ? b.close * b.volume : null)
  })
  let suffixStart = 0
  for (let i = t; i >= 0; i--) if (bars[i] === null) { suffixStart = i + 1; break }
  const suffixTr = tr.slice(suffixStart) as number[]
  if (suffixTr.length) suffixTr[0] = bars[suffixStart]!.high - bars[suffixStart]!.low
  const atr = (period: number): Value => {
    if (suffixTr.length < period) return null
    let value = sum(suffixTr.slice(0, period)) / period
    for (const r of suffixTr.slice(period)) value = ((period - 1) * value + r) / period
    return value
  }
  const close = closes[t] ?? null
  const ma5 = mean(closes, 5), ma20 = mean(closes, 20)
  const priorHigh20 = maximum(highs, 20), priorClosePeak60 = maximum(closes, 60)
  const turnover20 = mean(turnovers, 20)
  const validPrices = finite(f.close) && f.close > 0 && finite(f.open) && f.open > 0
  const original = [
    f.atrPercent14, f.volumeRatio20, c.chaikinMoneyFlow21, c.distanceFromPriorHigh20Percent,
    c.bollingerWidth20Percent, validPrices && finite(f.gapFromPreviousClosePercent)
      ? ((1 + f.gapFromPreviousClosePercent / 100) * (f.close! / f.open!) - 1) * 100 : null,
    f.gapFromPreviousClosePercent, validPrices ? (f.close! / f.open! - 1) * 100 : null,
    f.rsi14, f.sma20DistancePercent, finite(f.close) && finite(f.sma60) && f.sma60 > 0 ? (f.close / f.sma60 - 1) * 100 : null,
    c.return5Percent, c.return20Percent, c.return60Percent, c.closeLocation,
    finite(c.upperWickRatio) ? c.upperWickRatio * 100 : null, c.benchmarkReturn20Percent,
    finite(c.breadthAboveSma20) ? c.breadthAboveSma20 * 100 : null,
  ]
  const extra = [
    ...[1, 2, 3, 10, 40, 120].map((n) => returns(n)),
    close !== null && ma5 !== null && ma5 > 0 ? (close / ma5 - 1) * 100 : null,
    ratio(ma5, ma20), returns(15, t - 5),
    ...[5, 10, 60, 120].map((n) => {
      const prior = maximum(highs, n)
      return close !== null && prior && prior.value > 0 ? (close / prior.value - 1) * 100 : null
    }),
    ratio(atr(5), atr(20)), ratio(sd(logReturns, 5), sd(logReturns, 20)),
    ratio(mean(ranges, 5), mean(ranges, 20)), ratio(strictTr[t] ?? null, mean(strictTr, 20, t - 1)),
    ratio(mean(volumes, 3), mean(volumes, 20, t - 3)), ratio(mean(volumes, 5), mean(volumes, 20, t - 5)),
    ratio(volumes[t] ?? null, mean(volumes, 5, t - 1)),
    ratio(total(bullVolume, 5), total(volumes, 5)), ratio(total(upVolume, 10), total(volumes, 10)),
    ratio(turnovers[t] ?? null, mean(turnovers, 20, t - 1)),
    turnover20 !== null && turnover20 > 0 ? Math.log(turnover20) : null,
    mean(clv, 3), mean(clv, 5), mean(bodies, 3), mean(bodies, 5), mean(wicks, 5),
    total(upDays, 5), priorHigh20 ? t - priorHigh20.index : null,
    close !== null && priorClosePeak60 && priorClosePeak60.value > 0 ? Math.min(0, (close / priorClosePeak60.value - 1) * 100) : null,
  ]
  return [...original, ...extra].map(nullable)
}
