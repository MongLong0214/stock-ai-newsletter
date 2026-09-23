import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchAllRows: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}))

vi.mock('@/lib/supabase/paginate', () => ({ fetchAllRows: mocks.fetchAllRows }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { loadRecentPublishedSymbols } from '@/scripts/stock-picks/generate-picks'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'

const dates = Array.from({ length: 26 }, (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`)
const input = { signalDate: dates[24]!, tradingDays: new TradingDayIndex(dates), lookbackTradingDays: 20 }
const row = (date: string, analysis: string, isSent = false) => ({
  newsletter_date: date, gemini_analysis: analysis, picks_source: 'code', is_sent: isSent,
})

describe('recent published symbol loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ gte: mocks.gte })
    mocks.gte.mockReturnValue({ lte: mocks.lte })
    mocks.lte.mockReturnValue({ order: mocks.order })
    mocks.order.mockReturnValue({ range: mocks.range })
  })

  it('reads 20 publication dates including signal day, even without snapshots or is_sent', async () => {
    mocks.fetchAllRows.mockImplementation(async (query: (from: number, to: number) => unknown) => {
      query(0, 999)
      return [
        row(dates[5]!, JSON.stringify([{ ticker: 'KOSPI:005930' }])),
        row(dates[24]!, JSON.stringify([{ ticker: 'KOSPI:000660' }]), true),
      ]
    })
    const result = await loadRecentPublishedSymbols(input)
    expect(mocks.from).toHaveBeenCalledWith('newsletter_content')
    expect(mocks.select).toHaveBeenCalledWith('newsletter_date, gemini_analysis, picks_source')
    expect(mocks.gte).toHaveBeenCalledWith('newsletter_date', dates[5])
    expect(mocks.lte).toHaveBeenCalledWith('newsletter_date', dates[24])
    expect(mocks.order).toHaveBeenCalledWith('newsletter_date', { ascending: true })
    expect(mocks.range).toHaveBeenCalledWith(0, 999)
    expect([...result].sort()).toEqual(['KOSPI:000660', 'KOSPI:005930'])
  })

  it('excludes the current publication date by ending the query at signal day', async () => {
    mocks.fetchAllRows.mockImplementation(async (query: (from: number, to: number) => unknown) => {
      query(0, 999)
      return [row(dates[24]!, JSON.stringify([{ ticker: 'KOSPI:005930' }]))]
    })
    await loadRecentPublishedSymbols(input)
    expect(mocks.lte).toHaveBeenCalledWith('newsletter_date', input.signalDate)
    expect(mocks.lte).not.toHaveBeenCalledWith('newsletter_date', dates[25])
  })

  it('treats crash alerts and empty stock arrays as empty sets', async () => {
    mocks.fetchAllRows.mockResolvedValue([
      row(dates[20]!, '{"type":"crash_alert"}'),
      row(dates[21]!, '[]'),
    ])
    await expect(loadRecentPublishedSymbols(input)).resolves.toEqual(new Set())
  })

  it.each(['not json', '{"unexpected":true}', '[{"name":"missing ticker"}]'])(
    'propagates an unparseable publication row: %s', async (analysis) => {
      mocks.fetchAllRows.mockResolvedValue([row(dates[20]!, analysis)])
      await expect(loadRecentPublishedSymbols(input)).rejects.toThrow(/발행 종목 파싱 실패/)
    },
  )

  it('propagates query failures', async () => {
    mocks.fetchAllRows.mockRejectedValue(new Error('database unavailable'))
    await expect(loadRecentPublishedSymbols(input)).rejects.toThrow('database unavailable')
  })
})
