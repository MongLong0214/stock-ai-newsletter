import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { GTB_LABELER_VERSION, labelGtB } from '@/lib/tli/labels/gt-b'

describe('labelGtB', () => {
  it('computes basket excess return against KOSPI', () => {
    const result = labelGtB({
      stocks: [
        { symbol: '005930', baseClose: 100, futureClose: 110 },
        { symbol: '000660', baseClose: 100, futureClose: 120 },
        { symbol: '035420', baseClose: 100, futureClose: 100 },
      ],
      kospiBaseClose: 100,
      kospiFutureClose: 105,
    })

    expect(result.status).toBe('final')
    expect(result.basketExcessReturn).toBeCloseTo(0.05, 10)
    expect(result.basketSize).toBe(3)
    expect(result.labelerVersion).toBe(GTB_LABELER_VERSION)
  })

  it('keeps the label pending when KOSPI prices are missing', () => {
    const result = labelGtB({
      stocks: [{ symbol: '005930', baseClose: 100, futureClose: 110 }],
      kospiBaseClose: null,
      kospiFutureClose: 105,
    })

    expect(result.status).toBe('pending')
    expect(result.basketExcessReturn).toBeNull()
  })

  it('excludes labels when more than two top stocks are missing prices', () => {
    const result = labelGtB({
      stocks: [
        { symbol: '005930', baseClose: 100, futureClose: 110 },
        { symbol: '000660', baseClose: null, futureClose: 120 },
        { symbol: '035420', baseClose: 100, futureClose: null },
        { symbol: '051910', baseClose: null, futureClose: null },
      ],
      kospiBaseClose: 100,
      kospiFutureClose: 105,
    })

    expect(result.status).toBe('excluded')
    expect(result.excludeReason).toBe('insufficient_prices')
    expect(result.basketSize).toBe(1)
  })

  it('keeps the theme_labels final payload check compatible with GT-B rows', async () => {
    const migration = await readFile(
      'supabase/migrations/034_fix_theme_labels_gt_b_final_check.sql',
      'utf8',
    )

    expect(migration).toContain('theme_labels_final_payload_check')
    expect(migration).toContain("label_type = 'gt_b'")
    expect(migration).toContain('basket_excess_return IS NOT NULL')
    expect(migration).toContain('basket_size IS NOT NULL')
  })
})
