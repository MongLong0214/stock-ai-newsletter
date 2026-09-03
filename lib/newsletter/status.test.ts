import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { countDeliveriesByStatus } from '@/lib/newsletter/status'

const TARGET_DATE = '2026-09-02'
const STATUS_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
}

describe('countDeliveriesByStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pages past PostgREST max_rows and orders by subscriber_id', async () => {
    const ranges: Array<[number, number]> = []
    const orders: Array<[string, { ascending: boolean }]> = []
    const firstPage = Array.from({ length: 1_000 }, () => ({ status: 'pending' as const }))
    const secondPage = Array.from({ length: 5 }, () => ({ status: 'accepted' as const }))
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn((column: string, options: { ascending: boolean }) => {
        orders.push([column, options])
        return query
      }),
      range: vi.fn(async (from: number, to: number) => {
        ranges.push([from, to])
        return { data: from === 0 ? firstPage : secondPage, error: null }
      }),
    }
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => query),
    })

    await expect(countDeliveriesByStatus(TARGET_DATE, STATUS_ENV)).resolves.toEqual({
      pending: 1_000,
      sending: 0,
      accepted: 5,
      failedRetryable: 0,
      failedTerminal: 0,
      unknown: 0,
    })

    expect(query.eq).toHaveBeenCalledWith('newsletter_date', TARGET_DATE)
    expect(orders).toEqual([
      ['subscriber_id', { ascending: true }],
      ['subscriber_id', { ascending: true }],
    ])
    expect(ranges).toEqual([[0, 999], [1_000, 1_999]])
  })
})
