import { describe, expect, it } from 'vitest'
import { resolveEvalWindow } from '../offline-eval-window'

describe('offline eval window defaults', () => {
  it('respects explicit start and end args', () => {
    const window = resolveEvalWindow({
      startArg: '2026-03-01',
      endArg: '2026-04-01',
      dataMinDate: '2026-01-10',
      dataMaxDate: '2026-07-01',
    })

    expect(window).toEqual({ startDate: '2026-03-01', endDate: '2026-04-01' })
  })

  it('uses data min and max when args are absent', () => {
    const window = resolveEvalWindow({
      startArg: null,
      endArg: null,
      dataMinDate: '2026-02-03',
      dataMaxDate: '2026-07-06',
    })

    expect(window).toEqual({ startDate: '2026-02-03', endDate: '2026-07-06' })
  })

  it('falls back to the start-date floor when data is empty', () => {
    const window = resolveEvalWindow({
      startArg: null,
      endArg: null,
      dataMinDate: null,
      dataMaxDate: null,
    })

    expect(window).toEqual({ startDate: '2026-01-07', endDate: '2026-01-07' })
  })
})
