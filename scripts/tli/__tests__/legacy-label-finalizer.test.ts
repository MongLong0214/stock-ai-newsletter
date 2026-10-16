import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FilterQuery {
  readonly eq: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  batchQuery: vi.fn(),
  batchUpsert: vi.fn(),
  filterEq: vi.fn(),
  finalizeLegacyLabelRows: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  priceErrorFrom: null as number | null,
  prices: [] as unknown[],
  themes: [] as unknown[],
}))

function resultQuery(table: string) {
  const data = table === 'themes' ? mocks.themes : mocks.prices
  const result = Promise.resolve({ data: data.slice(0, 1000), error: null })
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    select: vi.fn(() => query),
    order: vi.fn((column: string) => {
      mocks.order(table, column)
      return query
    }),
    range: vi.fn(async (from: number, to: number) => {
      mocks.range(table, from, to)
      if (table === 'stock_daily_prices' && from === mocks.priceErrorFrom) {
        return { data: null, error: { message: 'price source unavailable' } }
      }
      return { data: data.slice(from, to + 1), error: null }
    }),
    then: result.then.bind(result),
  }
  return query
}

vi.mock('../shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => resultQuery(table)),
  },
}))

vi.mock('../shared/supabase-batch', () => ({
  batchQuery: mocks.batchQuery,
  batchUpsert: mocks.batchUpsert,
  groupByThemeId: (rows: readonly { readonly theme_id: string }[]) => {
    const grouped = new Map<string, { readonly theme_id: string }[]>()
    for (const row of rows) {
      const values = grouped.get(row.theme_id) ?? []
      values.push(row)
      grouped.set(row.theme_id, values)
    }
    return grouped
  },
}))

vi.mock('../labels/finalize-legacy-labels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../labels/finalize-legacy-labels')>()
  return { ...actual, finalizeLegacyLabelRows: mocks.finalizeLegacyLabelRows }
})

const pendingFilter = (): FilterQuery => {
  const query = { eq: mocks.filterEq }
  mocks.filterEq.mockImplementation(() => query)
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prices.length = 0
  mocks.themes.length = 0
  mocks.priceErrorFrom = null
  mocks.batchUpsert.mockResolvedValue(0)
  mocks.finalizeLegacyLabelRows.mockResolvedValue(1)
})

describe('legacy label finalizer exact-match persistence', () => {
  it('transitions an exact gta-v1 pending row to final and verifies its existing id', async () => {
    const themeId = '54000000-0000-4000-8000-000000000001'
    const labelId = '54000001-0000-4000-8000-000000000001'
    mocks.themes.push({ id: themeId, is_active: true, keyword_epoch: 1 })
    const dates = [
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03',
      '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
    ]
    mocks.batchQuery.mockImplementation(async (
      table: string,
      _select: string,
      _ids: string[],
      filters?: (query: FilterQuery) => FilterQuery,
    ) => {
      if (table === 'theme_labels') {
        filters?.(pendingFilter())
        return [{ id: labelId, theme_id: themeId, keyword_epoch: 1 }]
      }
      if (table === 'interest_metrics') {
        return dates.map((time, index) => ({
          theme_id: themeId,
          time,
          raw_value: index < 5 ? 100 : 120,
        }))
      }
      return []
    })
    const { generateGtALabelsForBaseDate } = await import('../labels/label-gt-a')

    const result = await generateGtALabelsForBaseDate({
      baseDate: '2026-07-03',
      includeInactive: true,
      existingPendingOnly: true,
      today: '2026-07-10',
    })

    expect(result).toMatchObject({ totalThemes: 1, finalCount: 1, pendingCount: 0 })
    expect(mocks.filterEq).toHaveBeenCalledWith('labeler_version', 'gta-v1')
    expect(mocks.batchQuery).toHaveBeenCalledWith(
      'interest_metrics', 'theme_id, time, raw_value', [themeId], expect.any(Function),
      'theme_id', { failOnError: true, orderBy: { column: 'id' } },
    )
    expect(mocks.finalizeLegacyLabelRows).toHaveBeenCalledWith([
      expect.objectContaining({
        id: labelId,
        theme_id: themeId,
        label_status: 'final',
        labeler_version: 'gta-v1',
      }),
    ])
  })

  it('transitions an exact gtb-v1 pending row to final with complete price coverage', async () => {
    const themeId = '54000000-0000-4000-8000-000000000002'
    const labelId = '54000001-0000-4000-8000-000000000002'
    mocks.themes.push({ id: themeId, is_active: true })
    mocks.prices.push(
      { symbol: '005930', trade_date: '2026-07-03', close: 100 },
      { symbol: '005930', trade_date: '2026-07-10', close: 110 },
      { symbol: 'KOSPI', trade_date: '2026-07-03', close: 3000 },
      { symbol: 'KOSPI', trade_date: '2026-07-10', close: 3030 },
    )
    mocks.batchQuery.mockImplementation(async (
      table: string,
      _select: string,
      _ids: string[],
      filters?: (query: FilterQuery) => FilterQuery,
    ) => {
      if (table === 'theme_labels') {
        filters?.(pendingFilter())
        return [{ id: labelId, theme_id: themeId }]
      }
      return [{ theme_id: themeId, symbol: '005930', relevance: 1, is_active: true }]
    })
    const { generateGtBLabelsForBaseDate } = await import('../labels/label-gt-b')

    const result = await generateGtBLabelsForBaseDate('2026-07-03', {
      existingPendingOnly: true,
    })

    expect(result).toMatchObject({ totalThemes: 1, finalCount: 1, pendingCount: 0 })
    expect(mocks.filterEq).toHaveBeenCalledWith('labeler_version', 'gtb-v1')
    expect(mocks.batchQuery).toHaveBeenCalledWith(
      'theme_stocks', 'theme_id, symbol, relevance, is_active', [themeId], expect.any(Function),
      'theme_id', { failOnError: true, orderBy: { column: 'id' } },
    )
    expect(mocks.finalizeLegacyLabelRows).toHaveBeenCalledWith([
      expect.objectContaining({
        id: labelId,
        theme_id: themeId,
        label_status: 'final',
        labeler_version: 'gtb-v1',
      }),
    ])
  })

  it('finalizes GT-B labels using KOSPI prices on the second page of 1,294 price rows', async () => {
    const themes = Array.from({ length: 130 }, (_, index) => ({
      id: `54000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      is_active: true,
    }))
    const stocks = Array.from({ length: 646 }, (_, index) => ({
      theme_id: themes[Math.floor(index / 5)].id,
      symbol: String(index + 1).padStart(6, '0'),
      relevance: 1,
      is_active: true,
    }))
    mocks.themes.push(...themes)
    mocks.prices.push(
      ...stocks.flatMap(({ symbol }) => [
        { symbol, trade_date: '2026-10-06', close: 100 },
        { symbol, trade_date: '2026-10-14', close: 110 },
      ]),
      { symbol: 'KOSPI', trade_date: '2026-10-06', close: 3000 },
      { symbol: 'KOSPI', trade_date: '2026-10-14', close: 3060 },
    )
    mocks.batchQuery.mockImplementation(async (table: string) => table === 'theme_labels'
      ? themes.map(({ id }) => ({ id: id.replace('54000000', '54000001'), theme_id: id }))
      : stocks)
    const { generateGtBLabelsForBaseDate } = await import('../labels/label-gt-b')

    const result = await generateGtBLabelsForBaseDate('2026-10-06', { existingPendingOnly: true })

    expect(result).toMatchObject({ totalThemes: 130, finalCount: 130, pendingCount: 0, excludedCount: 0 })
    expect(mocks.range.mock.calls.filter(([table]) => table === 'stock_daily_prices')).toEqual([
      ['stock_daily_prices', 0, 999],
      ['stock_daily_prices', 1000, 1999],
    ])
    expect(mocks.order.mock.calls.filter(([table]) => table === 'stock_daily_prices')).toEqual([
      ['stock_daily_prices', 'symbol'],
      ['stock_daily_prices', 'trade_date'],
      ['stock_daily_prices', 'symbol'],
      ['stock_daily_prices', 'trade_date'],
    ])
    const [finalizedRows] = mocks.finalizeLegacyLabelRows.mock.calls[0]
    expect(finalizedRows).toHaveLength(130)
    for (const row of finalizedRows) {
      expect(row.label_status).toBe('final')
      expect(row.basket_excess_return).toBeCloseTo(0.08, 10)
    }
  })

  it.each([0, 1000])('keeps the GT-B price error and stops persistence when page %i fails', async (from) => {
    mocks.themes.push({ id: 'theme-1', is_active: true })
    mocks.prices.push(...Array.from({ length: 1000 }, (_, index) => ({
      symbol: String(index).padStart(6, '0'), trade_date: '2026-07-03', close: 100,
    })))
    mocks.priceErrorFrom = from
    mocks.batchQuery.mockImplementation(async (table: string) => table === 'theme_labels'
      ? []
      : [{ theme_id: 'theme-1', symbol: '000001', relevance: 1, is_active: true }])
    const { generateGtBLabelsForBaseDate } = await import('../labels/label-gt-b')

    await expect(generateGtBLabelsForBaseDate('2026-07-03')).rejects.toThrow(
      'GT-B 일봉 로딩 실패: price source unavailable',
    )
    expect(mocks.batchUpsert).not.toHaveBeenCalled()
    expect(mocks.finalizeLegacyLabelRows).not.toHaveBeenCalled()
  })

  it.each(['gt_a', 'gt_b'])('loads more than 1,000 themes before generating %s labels', async (labelType) => {
    mocks.themes.push(...Array.from({ length: 1001 }, (_, index) => ({
      id: `theme-${String(index).padStart(4, '0')}`, is_active: true, keyword_epoch: 1,
    })))
    mocks.batchQuery.mockResolvedValue([])

    if (labelType === 'gt_a') {
      const { generateGtALabelsForBaseDate } = await import('../labels/label-gt-a')
      const result = await generateGtALabelsForBaseDate({ baseDate: '2026-07-03', today: '2026-07-03' })
      expect(result).toMatchObject({ totalThemes: 1001, pendingCount: 1001 })
    } else {
      const { generateGtBLabelsForBaseDate } = await import('../labels/label-gt-b')
      const result = await generateGtBLabelsForBaseDate('2026-07-03')
      expect(result).toMatchObject({ totalThemes: 1001, pendingCount: 1001 })
    }

    expect(mocks.range.mock.calls.filter(([table]) => table === 'themes')).toEqual([
      ['themes', 0, 999],
      ['themes', 1000, 1999],
    ])
    const [, rows] = mocks.batchUpsert.mock.calls[0]
    expect(rows).toHaveLength(1001)
    expect(rows[1000].theme_id).toBe('theme-1000')
  })

  it('retries only missing or pending GT-A identities without rewriting terminal rows', async () => {
    const terminalThemeId = '54000000-0000-4000-8000-000000000003'
    const missingThemeId = '54000000-0000-4000-8000-000000000004'
    mocks.themes.push(
      { id: terminalThemeId, is_active: true, keyword_epoch: 1 },
      { id: missingThemeId, is_active: true, keyword_epoch: 1 },
    )
    const dates = [
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03',
      '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
    ]
    mocks.batchQuery.mockImplementation(async (
      table: string,
      _select: string,
      _ids: string[],
      filters?: (query: FilterQuery) => FilterQuery,
    ) => {
      if (table === 'theme_labels') {
        filters?.(pendingFilter())
        return [{
          id: '54000001-0000-4000-8000-000000000003',
          theme_id: terminalThemeId,
          keyword_epoch: 1,
          label_status: 'final',
        }]
      }
      if (table === 'interest_metrics') {
        return dates.map((time, index) => ({
          theme_id: missingThemeId,
          time,
          raw_value: index < 5 ? 100 : 120,
        }))
      }
      return []
    })
    const { generateGtALabelsForBaseDate } = await import('../labels/label-gt-a')

    const result = await generateGtALabelsForBaseDate({
      baseDate: '2026-07-03',
      includeInactive: true,
      missingOrPendingOnly: true,
      today: '2026-07-10',
    })

    expect(result).toMatchObject({ totalThemes: 1, finalCount: 1 })
    expect(mocks.filterEq).toHaveBeenCalledWith('horizon_days', 5)
    expect(mocks.batchUpsert).toHaveBeenCalledWith(
      'theme_labels',
      [expect.objectContaining({ theme_id: missingThemeId, label_status: 'final' })],
      expect.any(String),
      'GT-A 라벨',
    )
    expect(mocks.finalizeLegacyLabelRows).toHaveBeenCalledWith([])
  })

  it('retries only missing or pending GT-B identities without rewriting terminal rows', async () => {
    const terminalThemeId = '54000000-0000-4000-8000-000000000005'
    const missingThemeId = '54000000-0000-4000-8000-000000000006'
    const inactiveMissingThemeId = '54000000-0000-4000-8000-000000000007'
    const inactivePendingThemeId = '54000000-0000-4000-8000-000000000008'
    mocks.themes.push(
      { id: terminalThemeId, is_active: true },
      { id: missingThemeId, is_active: true },
      { id: inactiveMissingThemeId, is_active: false },
      { id: inactivePendingThemeId, is_active: false },
    )
    mocks.prices.push(
      { symbol: '005930', trade_date: '2026-07-03', close: 100 },
      { symbol: '005930', trade_date: '2026-07-10', close: 110 },
      { symbol: 'KOSPI', trade_date: '2026-07-03', close: 3000 },
      { symbol: 'KOSPI', trade_date: '2026-07-10', close: 3030 },
    )
    mocks.batchQuery.mockImplementation(async (
      table: string,
      _select: string,
      _ids: string[],
      filters?: (query: FilterQuery) => FilterQuery,
    ) => {
      if (table === 'theme_labels') {
        filters?.(pendingFilter())
        return [
          {
            id: '54000001-0000-4000-8000-000000000005',
            theme_id: terminalThemeId,
            label_status: 'final',
          },
          {
            id: '54000001-0000-4000-8000-000000000008',
            theme_id: inactivePendingThemeId,
            label_status: 'pending',
          },
        ]
      }
      return [missingThemeId, inactivePendingThemeId].map((themeId) => ({
        theme_id: themeId,
        symbol: '005930',
        relevance: 1,
        is_active: true,
      }))
    })
    const { generateGtBLabelsForBaseDate } = await import('../labels/label-gt-b')

    const result = await generateGtBLabelsForBaseDate('2026-07-03', {
      missingOrPendingOnly: true,
    })

    expect(result).toMatchObject({ totalThemes: 2, finalCount: 2 })
    expect(mocks.filterEq).toHaveBeenCalledWith('horizon_days', 5)
    expect(mocks.batchUpsert).toHaveBeenCalledWith(
      'theme_labels',
      [expect.objectContaining({ theme_id: missingThemeId, label_status: 'final' })],
      expect.any(String),
      'GT-B 라벨',
    )
    expect(mocks.finalizeLegacyLabelRows).toHaveBeenCalledWith([
      expect.objectContaining({
        id: '54000001-0000-4000-8000-000000000008',
        theme_id: inactivePendingThemeId,
        label_status: 'final',
      }),
    ])
  })
})
