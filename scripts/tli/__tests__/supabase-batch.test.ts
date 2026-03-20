import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          range: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
        })),
      })),
    })),
  },
}))

describe('supabase batch query strict mode', () => {
  it('throws after retries when strict mode is enabled', async () => {
    const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')

    await expect(
      batchQuery('themes', '*', ['theme-1'], undefined, 'id', { failOnError: true }),
    ).rejects.toThrow(/boom/)
  })
})
