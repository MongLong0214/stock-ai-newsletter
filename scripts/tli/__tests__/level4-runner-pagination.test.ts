import { describe, expect, it } from 'vitest'
import {
  buildPagedRanges,
  dedupePreserveOrder,
} from '../level4/runner-pagination'

describe('level4 runner pagination helpers', () => {
  it('builds deterministic page ranges that cover all requested rows', () => {
    expect(buildPagedRanges(0, 1000)).toEqual([])
    expect(buildPagedRanges(1, 1000)).toEqual([{ from: 0, to: 0 }])
    expect(buildPagedRanges(2501, 1000)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2500 },
    ])
  })

  it('dedupes ids without losing first-seen order', () => {
    expect(dedupePreserveOrder(['r2', 'r1', 'r2', 'r3', 'r1'])).toEqual(['r2', 'r1', 'r3'])
  })
})
