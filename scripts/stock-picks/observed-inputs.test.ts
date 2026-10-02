import { describe, expect, it, vi } from 'vitest'

import frozenFixture from '@/scripts/stock-picks/fixtures/composite-observed-v1-parity.json'
import { buildPriceBook, StockDataHandler } from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries, type StockFeatureVector } from '@/scripts/stock-picks/features'
import { buildObservedInputs50, OBSERVED_INPUT_NAMES, OBSERVED_INPUT_VERSION, validateModelMarketSources } from '@/scripts/stock-picks/observed-inputs'
import { FROZEN_COMPOSITE_UTILITY_MODEL } from '@/scripts/stock-picks/production-strategy'
import { buildSignals } from '@/scripts/stock-picks/signals'
import { buildTechnicalContextMap, type TechnicalContext } from '@/scripts/stock-picks/technical-context'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import { scoreUtilityModel } from '@/scripts/stock-picks/utility-model'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

type Witness = {
  signalDate: string; symbol: string; calendar320: string[]; rawPrices320: StockDailyPriceRow[]
  feature: StockFeatureVector; context: TechnicalContext; expectedInputs50: Array<number | null>
  expectedPrediction: number; expectedRoundedScore: number; sourceSignals: ReturnType<typeof buildSignals>
}
const witnesses = frozenFixture.witnesses as unknown as Witness[]
const first = witnesses[0]!
const handlerFor = (w: Witness, rows: readonly StockDailyPriceRow[] = w.rawPrices320, dates = w.calendar320) => (
  new StockDataHandler(buildPriceBook(rows), new TradingDayIndex(dates)).at(w.signalDate)
)
const observed = (w: Witness, rows = w.rawPrices320, dates = w.calendar320) => buildObservedInputs50({
  feature: w.feature, context: w.context, handler: handlerFor(w, rows, dates), dates,
})
const assertValues = (actual: readonly (number | null)[], expected: readonly (number | null)[], label: string) => {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((value, i) => {
    if (value === null) expect(actual[i], `${label}/${i}`).toBeNull()
    else expect(Math.abs(actual[i]! - value), `${label}/${i}`).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(value)))
  })
}

describe('production model market sources', () => {
  const benchmark = first.calendar320.map((trade_date): StockDailyPriceRow => ({
    symbol: 'KOSPI', trade_date, open: null, high: null, low: null,
    close: 1_000, volume: 0, source: 'kis',
  }))
  const validate = (rows: readonly StockDailyPriceRow[]) => validateModelMarketSources({
    handler: handlerFor(first, rows), symbols: [first.symbol, first.symbol, 'KOSPI'], dates: first.calendar320,
  })

  it('guards the complete 21-close benchmark and 20-OHLCV breadth windows at their oldest contributing rows', () => {
    expect(() => validate([...first.rawPrices320, ...benchmark])).not.toThrow()
    expect(() => validate([...first.rawPrices320, ...benchmark.map(row => row.trade_date === first.calendar320.at(-21)
      ? { ...row, source: 'naver_backfill' as const } : row)])).toThrow(/시장 시세 원천 불일치: KOSPI\//)
    expect(() => validate([...benchmark, ...first.rawPrices320.map(row => row.trade_date === first.calendar320.at(-20)
      ? { ...row, source: 'naver_backfill' as const } : row)])).toThrow(new RegExp(`시장 시세 원천 불일치: ${first.symbol}/`))
  })

  it('does not read market rows before the used windows or any future suffix', () => {
    const future = '2026-09-21'
    const rows: StockDailyPriceRow[] = [
      ...benchmark.map(row => row.trade_date < first.calendar320.at(-21)! ? { ...row, source: 'naver_backfill' as const } : row),
      ...first.rawPrices320.map(row => row.trade_date < first.calendar320.at(-20)! ? { ...row, source: 'naver_backfill' as const } : row),
      ...[benchmark.at(-1)!, first.rawPrices320.at(-1)!].map(row => ({ ...row, trade_date: future, source: 'naver_backfill' as const })),
    ]
    const handler = handlerFor(first, rows, [...first.calendar320, future])
    const get = vi.spyOn(handler, 'get')
    validateModelMarketSources({ handler, symbols: [first.symbol, first.symbol, 'KOSPI'], dates: first.calendar320 })
    expect(get.mock.calls.filter(([symbol]) => symbol === 'KOSPI').map(([, date]) => date)).toEqual(first.calendar320.slice(-21))
    expect(get.mock.calls.filter(([symbol]) => symbol === first.symbol).map(([, date]) => date)).toEqual(first.calendar320.slice(-20))
    get.mockClear()
    expect(() => validateModelMarketSources({ handler, symbols: [first.symbol], dates: [...first.calendar320, future] }))
      .toThrow(/시장 피처 기준일 불일치/)
    expect(get).not.toHaveBeenCalled()
  })

  it.each(['missing', 'close-zero', 'close-NaN', 'open-null', 'volume-zero', 'volume-NaN'] as const)(
    'preserves native missing market inputs for an incomplete or invalid %s window', (fault) => {
      const missingDate = first.calendar320.at(-10)!
      const benchmarkRows = benchmark.flatMap(row => {
        if (row.trade_date === missingDate && fault === 'missing') return []
        return [{ ...row, source: 'naver_backfill' as const,
          ...(row.trade_date === missingDate ? { close: fault === 'close-NaN' ? Number.NaN : 0 } : {}) }]
      })
      const breadthRows = first.rawPrices320.flatMap(row => {
        if (row.trade_date === missingDate && fault === 'missing') return []
        return [{ ...row, source: 'naver_backfill' as const, ...(row.trade_date === missingDate
          ? fault === 'close-zero' ? { close: 0 } : fault === 'close-NaN' ? { close: Number.NaN }
            : fault === 'open-null' ? { open: null } : fault === 'volume-zero' ? { volume: 0 }
              : fault === 'volume-NaN' ? { volume: Number.NaN } : {} : {}) }]
      })
      const handler = handlerFor(first, [...benchmarkRows, ...breadthRows])
      expect(() => validateModelMarketSources({ handler, symbols: [first.symbol], dates: first.calendar320 })).not.toThrow()
      const context = buildTechnicalContextMap({ handler, symbols: [first.symbol], dates: first.calendar320,
        includeFromDate: first.signalDate }).get(first.signalDate)!.get(first.symbol)!
      expect(context.benchmarkReturn20Percent).toBeNull()
      expect(context.breadthAboveSma20).toBeNull()
      expect(context.breadthEligibleSymbols).toBe(0)
    },
  )
})

describe('causal production observed 50 inputs', () => {
  it('matches actual KIS raw320, source TS indicators/context, frozen Python50 and native predictions', () => {
    expect(frozenFixture.observedInputVersion).toBe(OBSERVED_INPUT_VERSION)
    expect(frozenFixture.featureNames).toEqual(OBSERVED_INPUT_NAMES)
    expect(frozenFixture.sourceModuleSha256).toBe('b35b34b70b3420e5756b4d14883d385e61bb8bf1c1127eb53c71a75ca358786b')
    for (const w of witnesses) {
      const handler = handlerFor(w)
      const feature = buildFeatureSeries({ handler, symbol: w.symbol, dates: w.calendar320,
        includeFromDate: w.signalDate }).at(-1)!
      const localContext = buildTechnicalContextMap({ handler, symbols: [w.symbol], dates: w.calendar320,
        includeFromDate: w.signalDate }).get(w.signalDate)!.get(w.symbol)!
      // These two market observations were exported from the full active master universe.
      const context = { ...localContext, benchmarkReturn20Percent: w.context.benchmarkReturn20Percent,
        breadthAboveSma20: w.context.breadthAboveSma20 }
      const values = buildObservedInputs50({ feature, context, handler, dates: w.calendar320 })
      assertValues(values, w.expectedInputs50, w.symbol)
      // sourceSignals는 동결한 v2 연구 자료다. 원시 50입력/모델 예측과 유지한 5항목을 대조한다.
      const sourceCategories = Object.fromEntries(Object.entries(w.sourceSignals)
        .filter(([key]) => key !== 'volatility_score' && key !== 'overall_score'))
      expect(buildSignals(feature), w.symbol).toMatchObject(sourceCategories)
      const prediction = scoreUtilityModel(FROZEN_COMPOSITE_UTILITY_MODEL, values)
      expect(prediction.utility, w.symbol).toBeCloseTo(w.expectedPrediction, 14)
      expect(prediction.score, w.symbol).toBe(w.expectedRoundedScore)
    }
  })

  it('matches independent Python missing, suspension, flat candle, zero volume and insufficient history witnesses', () => {
    for (const variant of frozenFixture.variantsOfFirstWitness) {
      let dates = [...first.calendar320]
      let rows = first.rawPrices320.map((r) => ({ ...r }))
      if ('historyLength' in variant && variant.historyLength !== undefined) {
        dates = dates.slice(-variant.historyLength); rows = rows.slice(-variant.historyLength)
      } else if ('offset' in variant && variant.offset !== undefined) {
        const index = rows.length + variant.offset
        if (variant.change === null) rows.splice(index, 1)
        else rows[index] = { ...rows[index]!, ...variant.change }
      }
      assertValues(observed(first, rows, dates).slice(18), variant.expectedExtra32, variant.id)
    }
    const zeroVolumeRows = first.rawPrices320.map((r, i) => i === first.rawPrices320.length - 4 ? { ...r, volume: 0 } : r)
    const context = buildTechnicalContextMap({ handler: handlerFor(first, zeroVolumeRows), symbols: [first.symbol],
      dates: first.calendar320, includeFromDate: first.signalDate }).get(first.signalDate)!.get(first.symbol)!
    expect(context.return20Percent).toBeNull()
    expect(observed(first, zeroVolumeRows)[27]).not.toBeNull()
    expect(observed(first, zeroVolumeRows)[35]).not.toBeNull()
  })

  it('has independent simple price/volume oracles and excludes the current high from resistance references', () => {
    const rows = first.rawPrices320.map((r, i) => ({ ...r, open: 100, close: 100, low: 98,
      high: i === first.rawPrices320.length - 1 ? 200 : 104, volume: i === first.rawPrices320.length - 1 ? 200 : 100 }))
    const x = observed(first, rows)
    expect(x[18]).toBe(0)
    expect(x[25]).toBe(1)
    expect(x[27]).toBeCloseTo(-100 / 26, 12)
    expect(x[32]).toBeNull() // Constant returns have no volatility denominator.
    expect(x[35]).toBeCloseTo(4 / 3, 14)
    expect(x[36]).toBeCloseTo(6 / 5, 14)
    expect(x[37]).toBe(2)
    expect(x[38]).toBe(0)
    expect(x[40]).toBe(2)
    expect(x[41]).toBeCloseTo(Math.log(10_500), 14)
    expect(x[47]).toBe(0)
    expect(x[48]).toBe(1) // Most recent tied prior high, never today's high.
    expect(x[49]).toBe(0)
  })

  it('does not read future suffixes or bars older than the bounded320 sessions', () => {
    const past = '2025-05-29', future = '2026-09-21'
    const base = observed(first)
    const rows = [
      { ...first.rawPrices320[0]!, trade_date: past, source: 'naver_backfill' as const, close: 999_999 },
      ...first.rawPrices320,
      { ...first.rawPrices320.at(-1)!, trade_date: future, close: 9_999_999 },
    ]
    const handler = handlerFor(first, rows, [past, ...first.calendar320, future])
    const get = vi.spyOn(handler, 'get')
    expect(buildObservedInputs50({ feature: first.feature, context: first.context, handler,
      dates: [past, ...first.calendar320] })).toEqual(base)
    expect(get).not.toHaveBeenCalledWith(first.symbol, past)
    expect(get).not.toHaveBeenCalledWith(first.symbol, future)
    expect(() => buildObservedInputs50({ feature: first.feature, context: first.context, handler,
      dates: [...first.calendar320, future] })).toThrow(/기준일 불일치/)
    expect(() => handler.get(first.symbol, future)).toThrow(/룩어헤드/)
    expect(() => observed(first, first.rawPrices320.map((r, i) => i === 10
      ? { ...r, source: 'naver_backfill' } : r))).toThrow(/원천 불일치/)
    expect(() => observed(first, first.rawPrices320, [...first.calendar320].reverse())).toThrow(/기준일 불일치/)
  })
})
