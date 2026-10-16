import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import { estimateRoundTripCost, krxTickSize, reconstructExitPrice, sellTaxBps } from '@/scripts/stock-picks/trading-cost'

const TICK_CASES = [
  [1, 1], [1_000, 1], [1_999, 1],
  [2_000, 5], [3_000, 5], [4_999, 5],
  [5_000, 10], [10_000, 10], [19_999, 10],
  [20_000, 50], [30_000, 50], [49_999, 50],
  [50_000, 100], [100_000, 100], [199_999, 100],
  [200_000, 500], [300_000, 500], [499_999, 500],
  [500_000, 1_000], [700_000, 1_000], [1_000_000, 1_000],
] as const
const TAX_CASES = [
  ['2023-12-27', 18], ['2024-12-26', 18], ['2024-12-27', 15],
  ['2025-12-28', 15], ['2025-12-29', 20], ['2026-01-02', 20],
] as const

describe('realistic round-trip cost', () => {
  it.each(TICK_CASES)('uses the unified KRX tick at price %s', (price, tick) => {
    expect(krxTickSize(price)).toBe(tick)
  })

  it.each(TAX_CASES)('uses the settlement-year tax for sell trade date %s', (date, tax) => {
    expect(sellTaxBps(date)).toBe(tax)
  })

  it('weights sell-side costs by exit/entry and uses each price\'s own tick band', () => {
    const cost = estimateRoundTripCost({ entryPrice: 1_999, exitPrice: 2_000, sellDate: '2025-12-29' })
    // Commission: 1.5bps on each notional, tax: 20bps on 2,000, slippage: .5*(1+5) won.
    expect(cost.costBps).toBeCloseTo((.00015 * (1_999 + 2_000) + .002 * 2_000 + 3) / 1_999 * 10_000, 12)
    expect(cost.sellTaxBps).toBeCloseTo(20 * 2_000 / 1_999, 12)
    expect(cost.costBps).toBeCloseTo(cost.sellTaxBps + cost.commissionBps + cost.slippageBps, 12)
    expect(estimateRoundTripCost({
      entryPrice: 10_000, exitPrice: 9_000, sellDate: '2024-12-27',
      commissionBpsPerSide: 0, slippageTicksPerSide: 0,
    })).toEqual({ costBps: 13.5, sellTaxBps: 13.5, commissionBps: 0, slippageBps: 0 })
  })

  it('normalizes a reconstructed 20,000 exit before selecting its tick band', () => {
    const exitPrice = reconstructExitPrice(17_630, 20_000 / 17_630 - 1)
    expect(exitPrice).toBe(20_000)
    expect(krxTickSize(exitPrice)).toBe(50)
    expect(estimateRoundTripCost({ entryPrice: 17_630, exitPrice, sellDate: '2026-01-02' }).costBps)
      .toBeCloseTo(42.906693136698806, 12)
    for (const grossReturn of [-1, -2, NaN, Infinity, -Infinity]) {
      expect(() => reconstructExitPrice(17_630, grossReturn)).toThrow()
    }
    expect(() => reconstructExitPrice(0.0000001, 0)).toThrow()
  })

  it('rejects invalid prices, dates and overrides', () => {
    const valid = { entryPrice: 10_000, exitPrice: 11_000, sellDate: '2026-01-02' }
    for (const price of [0, -1, NaN, Infinity, -Infinity]) {
      expect(() => krxTickSize(price)).toThrow()
      expect(() => estimateRoundTripCost({ ...valid, entryPrice: price })).toThrow()
      expect(() => estimateRoundTripCost({ ...valid, exitPrice: price })).toThrow()
    }
    for (const date of ['', '2026-1-02', '2026-01-02T00:00:00Z', '2025-02-29', '2024-02-30',
      '2026-13-01', '2026-01-00', '0000-01-01', '2023-12-26']) {
      expect(() => sellTaxBps(date)).toThrow()
      expect(() => estimateRoundTripCost({ ...valid, sellDate: date })).toThrow()
    }
    expect(sellTaxBps('2024-02-29')).toBe(18)
    for (const value of [-1, NaN, Infinity]) {
      expect(() => estimateRoundTripCost({ ...valid, commissionBpsPerSide: value })).toThrow()
      expect(() => estimateRoundTripCost({ ...valid, slippageTicksPerSide: value })).toThrow()
    }
  })

  it('matches Python to 1e-9 bps across tick bands, tax boundaries and overrides', () => {
    const fixtures = TICK_CASES.flatMap(([entryPrice]) => TICK_CASES.flatMap(([exitPrice]) => (
      TAX_CASES.flatMap(([sellDate]) => [
        { entryPrice, exitPrice, sellDate },
        { entryPrice, exitPrice, sellDate, commissionBpsPerSide: 0, slippageTicksPerSide: 0 },
        { entryPrice, exitPrice, sellDate, commissionBpsPerSide: 2.25, slippageTicksPerSide: 1 },
      ])
    )))
    fixtures.push({ entryPrice: 17_630, exitPrice: 20_000, sellDate: '2026-01-02' })
    const result = spawnSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'scripts/stock-picks')
from trading_cost import estimate_round_trip_cost, krx_tick_size, reconstruct_exit_price, sell_tax_bps
print(json.dumps([dict(
    exitPrice=reconstruct_exit_price(r['entryPrice'], r['exitPrice']/r['entryPrice']-1),
    cost=estimate_round_trip_cost(r['entryPrice'],
        reconstruct_exit_price(r['entryPrice'], r['exitPrice']/r['entryPrice']-1), r['sellDate'],
        r.get('commissionBpsPerSide', 1.5), r.get('slippageTicksPerSide', .5)),
    entryTick=krx_tick_size(r['entryPrice']), exitTick=krx_tick_size(reconstruct_exit_price(r['entryPrice'], r['exitPrice']/r['entryPrice']-1)),
    tax=sell_tax_bps(r['sellDate'])) for r in json.load(sys.stdin)], allow_nan=False))
`], { encoding: 'utf8', input: JSON.stringify(fixtures), maxBuffer: 16 * 1024 * 1024 })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    const actual = JSON.parse(result.stdout) as {
      cost: ReturnType<typeof estimateRoundTripCost>; exitPrice: number; entryTick: number; exitTick: number; tax: number
    }[]
    expect(actual).toHaveLength(fixtures.length)
    for (const [index, fixture] of fixtures.entries()) {
      const exitPrice = reconstructExitPrice(fixture.entryPrice, fixture.exitPrice / fixture.entryPrice - 1)
      const expected = estimateRoundTripCost({ ...fixture, exitPrice })
      const row = actual[index]!
      for (const key of ['costBps', 'sellTaxBps', 'commissionBps', 'slippageBps'] as const) {
        expect(Math.abs(row.cost[key] - expected[key]), `${index}:${key}`).toBeLessThanOrEqual(1e-9)
      }
      expect(row.exitPrice).toBe(exitPrice)
      expect(row.entryTick).toBe(krxTickSize(fixture.entryPrice))
      expect(row.exitTick).toBe(krxTickSize(exitPrice))
      expect(row.tax).toBe(sellTaxBps(fixture.sellDate))
    }
  })
})
