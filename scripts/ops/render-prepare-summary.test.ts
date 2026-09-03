import { describe, expect, it } from 'vitest'

import { renderPrepareSummary, renderPrepareSummaryFile } from './render-prepare-summary'

describe('renderPrepareSummary', () => {
  it('renders operational fields, three picks, counts, durations, and warnings', () => {
    const markdown = renderPrepareSummary({
      targetDate: '2026-09-02',
      signalDate: '2026-09-01',
      verdict: 'normal',
      confidence: 0.91,
      picksSource: 'code',
      picks: [1, 2, 3].map((rank) => ({
        rank,
        ticker: `KOSPI:00000${rank}`,
        name: `종목 ${rank}`,
        close_price: rank * 1_000,
        score: 90 - rank,
      })),
      collection: {
        attemptedCalls: 100,
        successCount: 98,
        failureCount: 2,
        exactDateCoverageRate: 0.98,
        retriedSymbols: ['A', 'B'],
        recoveredSymbols: ['A'],
        indexFailed: false,
      },
      durationsSec: { assessment: 1, collection: 10, total: 12 },
      warnings: ['fixture warning'],
    })

    expect(markdown).toContain('| 2026-09-02 | 2026-09-01 | normal | 0.91 | code |')
    expect(markdown).toContain('| 3 | KOSPI:000003 | 종목 3 | 3000 | 87 |')
    expect(markdown).toContain('| 100 | 98 | 2 | 0.98 | 2 | 1 | false |')
    expect(markdown).toContain('| total | 12 |')
    expect(markdown).toContain('- fixture warning')
  })

  it('reports a missing summary file without throwing', async () => {
    await expect(renderPrepareSummaryFile('/definitely/missing/summary.json'))
      .resolves.toContain('Summary JSON is missing')
  })
})
