import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FilterQuery {
  readonly eq: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  batchQuery: vi.fn(),
  batchUpsert: vi.fn(),
  filterEq: vi.fn(),
  finalizeLegacyLabelRows: vi.fn(),
  prices: [] as unknown[],
  themes: [] as unknown[],
}))

function resultQuery(data: readonly unknown[]) {
  const result = Promise.resolve({ data, error: null })
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    select: vi.fn(() => query),
    then: result.then.bind(result),
  }
  return query
}

vi.mock('../shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => resultQuery(table === 'themes' ? mocks.themes : mocks.prices)),
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
    expect(mocks.finalizeLegacyLabelRows).toHaveBeenCalledWith([
      expect.objectContaining({
        id: labelId,
        theme_id: themeId,
        label_status: 'final',
        labeler_version: 'gtb-v1',
      }),
    ])
  })
})
