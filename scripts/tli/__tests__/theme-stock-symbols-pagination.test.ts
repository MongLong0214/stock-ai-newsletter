import { describe, expect, it, vi } from 'vitest'

const ROWS = Array.from({ length: 2500 }, (_, index) => ({
  theme_id: `theme-${String(Math.floor(index / 5)).padStart(4, '0')}`,
  symbol: `S${String(index).padStart(5, '0')}`,
  relevance: 1,
  is_active: true,
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        // PostgREST max_rows=1000: 한 번에 최대 1000행만 돌려준다
        range: async (from: number, to: number) => ({ data: ROWS.slice(from, Math.min(to + 1, from + 1000)), error: null }),
      }
      return chain
    },
  },
}))

describe('loadActiveThemeStockSymbols pagination', () => {
  it('reads every active theme_stocks row past the 1000-row PostgREST cap', async () => {
    const { loadActiveThemeStockSymbols } = await import('@/scripts/tli/prices/stock-daily-prices')
    const symbols = await loadActiveThemeStockSymbols(5)
    expect(symbols).toHaveLength(2500)
  })
})
