import { beforeEach, describe, expect, it, vi } from 'vitest'

const dataOpsMocks = vi.hoisted(() => ({
  batchUpsert: vi.fn(async () => 0),
}))

vi.mock('@/scripts/tli/shared/supabase-batch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/tli/shared/supabase-batch')>()
  return { ...actual, batchUpsert: dataOpsMocks.batchUpsert }
})

describe('upsertInterestMetrics anchor_scaled_value preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataOpsMocks.batchUpsert.mockResolvedValue(0)
  })

  it('keeps anchor_scaled_value on the newest available data date and omits it from rescanned older dates', async () => {
    // Given: DataLab returns data through 2026-07-06 even though the batch may run on 2026-07-07.
    const { upsertInterestMetrics } = await import('@/scripts/tli/shared/data-ops')
    const metrics = [
      {
        themeId: 'theme-1',
        date: '2026-07-04',
        rawValue: 10,
        normalized: 0.1,
        anchorScaledValue: 10,
      },
      {
        themeId: 'theme-1',
        date: '2026-07-05',
        rawValue: 20,
        normalized: 0.2,
        anchorScaledValue: 20,
      },
      {
        themeId: 'theme-1',
        date: '2026-07-06',
        rawValue: 30,
        normalized: 0.3,
        anchorScaledValue: 30,
      },
    ]

    // When: interest metrics are persisted.
    await upsertInterestMetrics(metrics)

    // Then: only the per-theme max data date writes the newly computed anchor value.
    expect(dataOpsMocks.batchUpsert).toHaveBeenCalledTimes(2)
    const [, newestRows] = dataOpsMocks.batchUpsert.mock.calls[0]
    const [, olderRows] = dataOpsMocks.batchUpsert.mock.calls[1]

    expect(newestRows).toEqual([
      {
        theme_id: 'theme-1',
        time: '2026-07-06',
        source: 'naver_datalab',
        raw_value: 30,
        normalized: 0.3,
        anchor_scaled_value: 30,
      },
    ])
    expect(olderRows).toHaveLength(2)
    expect(olderRows).toEqual([
      {
        theme_id: 'theme-1',
        time: '2026-07-04',
        source: 'naver_datalab',
        raw_value: 10,
        normalized: 0.1,
      },
      {
        theme_id: 'theme-1',
        time: '2026-07-05',
        source: 'naver_datalab',
        raw_value: 20,
        normalized: 0.2,
      },
    ])
    expect(olderRows.every(row => !Object.hasOwn(row, 'anchor_scaled_value'))).toBe(true)
  })
})
