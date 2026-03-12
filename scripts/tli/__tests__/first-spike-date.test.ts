import { describe, expect, it } from 'vitest'
import {
  buildDiscoveredThemeInsert,
  buildInitialStateHistoryInput,
  buildFirstSpikeDateBackfillRows,
} from '../first-spike-date'

describe('first spike date handling', () => {
  it('creates newly discovered themes without a synthetic first_spike_date', () => {
    const row = buildDiscoveredThemeInsert({
      name: '로봇',
      naverThemeId: '123',
      today: '2026-03-12',
      discoveredAt: '2026-03-12T00:00:00.000Z',
    })

    expect(row.first_spike_date).toBeNull()
    expect(row.last_seen_on_naver).toBe('2026-03-12')
    expect(row.naver_seen_streak).toBe(1)
  })

  it('initial inactive state history starts without a first spike date', () => {
    const input = buildInitialStateHistoryInput({
      themeId: 'theme-1',
      changeDate: '2026-03-12',
    })

    expect(input.firstSpikeDate).toBeNull()
    expect(input.newIsActive).toBe(false)
  })

  it('backfills missing first_spike_date from inferred interest history instead of today', () => {
    const rows = buildFirstSpikeDateBackfillRows(
      [
        {
          id: 'theme-1',
          first_spike_date: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      new Map([
        ['theme-1', [
          { time: '2026-01-02', normalized: 12 },
          { time: '2026-01-03', normalized: 35 },
          { time: '2026-01-04', normalized: 28 },
        ]],
      ]),
      new Date('2026-03-12T00:00:00.000Z'),
    )

    expect(rows).toEqual([
      { id: 'theme-1', first_spike_date: '2026-01-03' },
    ])
  })
})
