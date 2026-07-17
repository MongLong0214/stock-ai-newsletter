import { beforeEach, describe, expect, it, vi } from 'vitest'

interface PageResponse {
  readonly data: Record<string, unknown>[] | null
  readonly count: number | null
  readonly error?: { readonly message: string }
}

const supabaseBatchMocks = vi.hoisted(() => {
  const upsertResults: Array<{ readonly error: { readonly message: string } | null }> = []
  const pages: unknown[] = []
  const rangeCalls: Array<{ readonly from: number; readonly to: number }> = []
  const orderCalls: Array<{ readonly column: string; readonly ascending?: boolean }> = []
  return { upsertResults, pages, rangeCalls, orderCalls }
})

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {}
    chain.in = vi.fn(() => chain)
    chain.order = vi.fn((column: string, opts?: { ascending?: boolean }) => {
      supabaseBatchMocks.orderCalls.push({ column, ascending: opts?.ascending })
      return chain
    })
    chain.range = vi.fn(async (from: number, to: number) => {
      supabaseBatchMocks.rangeCalls.push({ from, to })
      return supabaseBatchMocks.pages.shift() ?? { data: null, count: null, error: { message: 'boom' } }
    })
    return chain
  }

  return {
    supabaseAdmin: {
      from: vi.fn(() => ({
        upsert: vi.fn(async () => supabaseBatchMocks.upsertResults.shift() ?? { error: null }),
        select: vi.fn(() => builder()),
      })),
    },
  }
})

const rows = (count: number, offset = 0): Record<string, unknown>[] => Array.from(
  { length: count },
  (_, index) => ({ id: `row-${offset + index}` }),
)

const page = (data: Record<string, unknown>[], count: number): PageResponse => ({ data, count })

const buildRows = (count: number): Record<string, unknown>[] => Array.from(
  { length: count },
  (_, index) => ({ id: `row-${index}` }),
)

beforeEach(() => {
  supabaseBatchMocks.upsertResults.length = 0
  supabaseBatchMocks.pages.length = 0
  supabaseBatchMocks.rangeCalls.length = 0
  supabaseBatchMocks.orderCalls.length = 0
})

describe('supabase batch query strict mode', () => {
  it('throws after retries when strict mode is enabled', async () => {
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    await expect(
      batchQuery('themes', '*', ['theme-1'], undefined, 'id', { failOnError: true }),
    ).rejects.toThrow(/boom/)
  })
})

// 2026-07-16 TLI 수집 실패 회귀: PostgREST max-rows가 PAGE_SIZE와 같아 모든 페이지가 상한에 걸려
// 있었고, 서버가 상한보다 적게 돌려준 페이지를 '데이터 끝'으로 단정해 열린 membership version을
// 통째로 놓쳤다. 그 결과 기존 매핑이 신규로 오판되어 uniq_theme_stock_membership_history_open 위반.
describe('supabase batch query pagination completeness', () => {
  it('keeps paging when a page returns fewer rows than requested', async () => {
    supabaseBatchMocks.pages.push(
      page(rows(500), 1200),
      page(rows(700, 500), 1200),
    )
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    const result = await batchQuery('theme_stock_membership_history', '*', ['theme-1'], undefined, 'theme_id', {
      failOnError: true,
    })

    expect(result).toHaveLength(1200)
    // 커서는 PAGE_SIZE가 아니라 실제 수신 행 수만큼 전진해야 행을 건너뛰지 않는다
    expect(supabaseBatchMocks.rangeCalls).toEqual([{ from: 0, to: 999 }, { from: 500, to: 1499 }])
  })

  it('throws instead of silently truncating when paging stalls', async () => {
    supabaseBatchMocks.pages.push(
      page(rows(500), 1200),
      page([], 1200),
    )
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    await expect(
      batchQuery('theme_stock_membership_history', '*', ['theme-1'], undefined, 'theme_id', { failOnError: true }),
    ).rejects.toThrow(/잘렸습니다|정체/)
  })

  it('throws when the server never reports an exact count', async () => {
    supabaseBatchMocks.pages.push({ data: rows(10), count: null })
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    await expect(
      batchQuery('theme_stocks', '*', ['theme-1'], undefined, 'theme_id', { failOnError: true }),
    ).rejects.toThrow(/완전성/)
  })

  it('stops exactly at the reported total without requesting an out-of-range page', async () => {
    supabaseBatchMocks.pages.push(page(rows(1000), 1000))
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    const result = await batchQuery('theme_stocks', '*', ['theme-1'], undefined, 'theme_id', { failOnError: true })

    expect(result).toHaveLength(1000)
    expect(supabaseBatchMocks.rangeCalls).toHaveLength(1)
  })

  it('applies a deterministic order key when the caller requires an exact snapshot', async () => {
    supabaseBatchMocks.pages.push(page(rows(3), 3))
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    await batchQuery('theme_stock_membership_history', '*', ['theme-1'], undefined, 'theme_id', {
      failOnError: true,
      orderBy: { column: 'id' },
    })

    expect(supabaseBatchMocks.orderCalls).toEqual([{ column: 'id', ascending: true }])
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
