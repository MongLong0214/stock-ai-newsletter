import { describe, expect, it } from 'vitest'
import {
  buildDiscoveredThemeInsert,
  buildInitialStateHistoryInput,
  buildFirstSpikeDateBackfillRows,
  buildFirstSpikeDateRepairRows,
  filterSpikeDateBackfillRowsByConcentration,
} from '@/scripts/tli/themes/first-spike-date'

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

  it('blocks anomalous same-day backfill concentration instead of mass-assigning one spike date', () => {
    const filtered = filterSpikeDateBackfillRowsByConcentration([
      { id: 't1', first_spike_date: '2026-02-06' },
      { id: 't2', first_spike_date: '2026-02-06' },
      { id: 't3', first_spike_date: '2026-02-06' },
      { id: 't4', first_spike_date: '2026-02-06' },
      { id: 't5', first_spike_date: '2026-02-06' },
      { id: 't6', first_spike_date: '2026-02-06' },
      { id: 't7', first_spike_date: '2026-02-06' },
      { id: 't8', first_spike_date: '2026-02-06' },
      { id: 't9', first_spike_date: '2026-02-06' },
      { id: 't10', first_spike_date: '2026-02-06' },
      { id: 't11', first_spike_date: '2026-02-10' },
      { id: 't12', first_spike_date: '2026-02-11' },
    ])

    expect(filtered.rows).toEqual([
      { id: 't11', first_spike_date: '2026-02-10' },
      { id: 't12', first_spike_date: '2026-02-11' },
    ])
    expect(filtered.blockedDates).toEqual(['2026-02-06'])
    expect(filtered.blockedCount).toBe(10)
  })

  it('repairs targeted first_spike_date values by re-inferring from interest history', () => {
    const rows = buildFirstSpikeDateRepairRows(
      [
        {
          id: 'theme-1',
          first_spike_date: '2026-02-06',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'theme-2',
          first_spike_date: '2026-02-10',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      new Map([
        ['theme-1', [
          { time: '2026-01-02', normalized: 12 },
          { time: '2026-01-03', normalized: 35 },
          { time: '2026-01-04', normalized: 28 },
        ]],
        ['theme-2', [
          { time: '2026-02-10', normalized: 35 },
        ]],
      ]),
      new Date('2026-03-12T00:00:00.000Z'),
      ['2026-02-06'],
    )

    expect(rows).toEqual([
      { id: 'theme-1', first_spike_date: '2026-01-03' },
    ])
  })
})
