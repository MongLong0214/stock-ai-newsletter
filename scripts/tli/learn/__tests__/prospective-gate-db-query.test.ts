import { describe, expect, it } from 'vitest'

const largeUuidSet = (count: number): string[] => Array.from({ length: count }, (_, index) => (
  `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
))

const encodedInPredicateLength = (ids: readonly string[]): number => encodeURIComponent(
  `(${ids.map((id) => JSON.stringify(id)).join(',')})`,
).length

const loadQueryHelpers = () => import('../prospective-gate-db-query')

describe('prospective gate bounded ID queries', () => {
  it.each([43_232, 140_504])(
    'chunks %i UUIDs without changing their order',
    async (count) => {
      const { PROSPECTIVE_IN_FILTER_CHUNK_SIZE, chunkUniqueIds } = await loadQueryHelpers()
      const ids = largeUuidSet(count)
      const chunks = chunkUniqueIds(ids)

      expect(PROSPECTIVE_IN_FILTER_CHUNK_SIZE).toBe(150)
      expect(chunks.flat()).toEqual(ids)
      expect(chunks.every((chunk) => chunk.length <= PROSPECTIVE_IN_FILTER_CHUNK_SIZE)).toBe(true)
      expect(chunks.every((chunk) => encodedInPredicateLength(chunk) < 8_192)).toBe(true)
    },
  )

  it('deduplicates IDs stably before query assembly', async () => {
    const { chunkUniqueIds } = await loadQueryHelpers()

    expect(chunkUniqueIds(['b', 'a', 'b', 'c', 'a'])).toEqual([['b', 'a', 'c']])
  })
})
