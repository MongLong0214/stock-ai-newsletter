import { describe, expect, it } from 'vitest'
import {
  buildBacktestEnrichedTheme,
  buildBacktestKeywordSupportCounts,
} from '../research/backtest-comparisons'

describe('backtest-comparisons helpers', () => {
  it('builds keyword support counts case-insensitively', () => {
    const counts = buildBacktestKeywordSupportCounts([
      ['HBM', 'AI'],
      ['hbm', 'GPU'],
    ])

    expect(counts.get('hbm')).toBe(2)
    expect(counts.get('ai')).toBe(1)
    expect(counts.get('gpu')).toBe(1)
  })

  it('builds backtest themes with sector-aware and keyword-aware features', () => {
    const enriched = buildBacktestEnrichedTheme({
      theme: {
        id: 'theme-1',
        name: 'HBM Theme',
        first_spike_date: '2026-01-01',
        created_at: '2026-01-01T00:00:00.000Z',
        is_active: false,
      },
      interest: [
        { theme_id: 'theme-1', time: '2026-01-01', normalized: 30 },
        { theme_id: 'theme-1', time: '2026-01-02', normalized: 40 },
        { theme_id: 'theme-1', time: '2026-01-03', normalized: 55 },
        { theme_id: 'theme-1', time: '2026-01-04', normalized: 70 },
        { theme_id: 'theme-1', time: '2026-01-05', normalized: 60 },
        { theme_id: 'theme-1', time: '2026-01-06', normalized: 75 },
        { theme_id: 'theme-1', time: '2026-01-07', normalized: 90 },
        { theme_id: 'theme-1', time: '2026-01-08', normalized: 85 },
        { theme_id: 'theme-1', time: '2026-01-09', normalized: 95 },
        { theme_id: 'theme-1', time: '2026-01-10', normalized: 88 },
        { theme_id: 'theme-1', time: '2026-01-11', normalized: 92 },
        { theme_id: 'theme-1', time: '2026-01-12', normalized: 98 },
        { theme_id: 'theme-1', time: '2026-01-13', normalized: 94 },
        { theme_id: 'theme-1', time: '2026-01-14', normalized: 100 },
      ],
      keywords: ['HBM', 'DRAM'],
      stocks: [{ price_change_pct: 12, volume: 50_000_000 }],
      keywordSupportCounts: new Map([['hbm', 2], ['dram', 3], ['테마', 100]]),
      kstNow: new Date('2026-03-12T00:00:00.000Z'),
    })

    expect(enriched).not.toBeNull()
    expect(enriched?.sector).toBe('반도체')
    expect(enriched?.sectorConfidence).toBeGreaterThan(0.7)
    expect(enriched?.features.keywordSpecificity).toBeGreaterThan(0.4)
  })
})
