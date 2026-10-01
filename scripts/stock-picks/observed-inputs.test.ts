import { describe, expect, it, vi } from 'vitest'

import frozenFixture from '@/scripts/stock-picks/fixtures/composite-observed-v1-parity.json'
import { buildPriceBook, StockDataHandler } from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries, type StockFeatureVector } from '@/scripts/stock-picks/features'
import { buildObservedInputs50, OBSERVED_INPUT_NAMES, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'
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
const handlerFor = (w: Witness, rows = w.rawPrices320, dates = w.calendar320) => (
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
      expect(buildSignals(feature), w.symbol).toEqual(w.sourceSignals)
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
