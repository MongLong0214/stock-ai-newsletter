import { describe, expect, it } from 'vitest'

import { assertFiniteMarketMovement } from '@/lib/market-data/kis-market-assessment'

describe('KIS market movement validation', () => {
  it.each([
    [Number.NaN, 1],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 1],
    [1, Number.NEGATIVE_INFINITY],
  ])('rejects malformed required movement values (%s, %s)', (change, changePct) => {
    expect(() => assertFiniteMarketMovement(change, changePct, 'test indicator'))
      .toThrow(/invalid change\/changePct/)
  })

  it('accepts real zero as a valid unchanged market state', () => {
    expect(() => assertFiniteMarketMovement(0, 0, 'test indicator')).not.toThrow()
  })

  it('accepts finite signed movement values', () => {
    expect(() => assertFiniteMarketMovement(-12.5, -1.25, 'test indicator')).not.toThrow()
  })
})
