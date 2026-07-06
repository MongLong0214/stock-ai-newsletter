import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseBatchMocks = vi.hoisted(() => {
  const upsertResults: Array<{ readonly error: { readonly message: string } | null }> = []
  return { upsertResults }
})

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: vi.fn(async () => supabaseBatchMocks.upsertResults.shift() ?? { error: null }),
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          range: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
        })),
      })),
    })),
  },
}))

const buildRows = (count: number): Record<string, unknown>[] => Array.from(
  { length: count },
  (_, index) => ({ id: `row-${index}` }),
)

beforeEach(() => {
  supabaseBatchMocks.upsertResults.length = 0
})

describe('supabase batch query strict mode', () => {
  it('throws after retries when strict mode is enabled', async () => {
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    await expect(
      batchQuery('themes', '*', ['theme-1'], undefined, 'id', { failOnError: true }),
    ).rejects.toThrow(/boom/)
  })
})

describe('supabase batch upsert partial failure policy', () => {
  it('rejects partial failures by default', async () => {
    supabaseBatchMocks.upsertResults.push(
      { error: null },
      { error: { message: 'partial failure' } },
      { error: { message: 'partial failure' } },
      { error: { message: 'partial failure' } },
    )
    const { batchUpsert } = await import('@/scripts/tli/shared/supabase-batch')

    await expect(
      batchUpsert('sample_table', buildRows(501), 'id', 'sample rows'),
    ).rejects.toThrow(/sample rows 부분 저장 실패 \(1\/501건 실패/)
  })

  it('returns the failed count when a caller explicitly handles partial failures', async () => {
    supabaseBatchMocks.upsertResults.push(
      { error: null },
      { error: { message: 'partial failure' } },
      { error: { message: 'partial failure' } },
      { error: { message: 'partial failure' } },
    )
    const { batchUpsert } = await import('@/scripts/tli/shared/supabase-batch')

    await expect(
      batchUpsert('sample_table', buildRows(501), 'id', 'sample rows', { failOnPartial: false }),
    ).resolves.toBe(1)
  })
})

describe('supabase batch upsert completion assertion', () => {
  it('does not throw when no rows failed', async () => {
    const { assertBatchUpsertComplete } = await import('@/scripts/tli/shared/supabase-batch')

    expect(() => assertBatchUpsertComplete({
      label: '뉴스 메트릭',
      rowCount: 0,
      failedCount: 0,
    })).not.toThrow()
  })

  it('throws when a partial failure count is reported', async () => {
    const { assertBatchUpsertComplete } = await import('@/scripts/tli/shared/supabase-batch')

    expect(() => assertBatchUpsertComplete({
      label: '뉴스 메트릭',
      rowCount: 10,
      failedCount: 1,
    })).toThrow(/뉴스 메트릭/)
  })

  it('throws when a failed count is reported for an empty batch', async () => {
    const { assertBatchUpsertComplete } = await import('@/scripts/tli/shared/supabase-batch')

    expect(() => assertBatchUpsertComplete({
      label: 'empty batch',
      rowCount: 0,
      failedCount: 1,
    })).toThrow(/empty batch/)
  })
})
