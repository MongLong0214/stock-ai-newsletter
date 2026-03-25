import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('TTL Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns cached value within TTL', async () => {
    const { createCache } = await import('../cache.js')
    const cache = createCache()
    cache.set('key1', { data: 'test' }, 60_000)
    expect(cache.get('key1')).toEqual({ data: 'test' })
  })

  it('returns undefined after TTL expires', async () => {
    const { createCache } = await import('../cache.js')
    const cache = createCache()
    cache.set('key1', { data: 'test' }, 60_000)
    vi.advanceTimersByTime(60_001)
    expect(cache.get('key1')).toBeUndefined()
  })

  it('returns cached at TTL-1ms and undefined at TTL+1ms', async () => {
    const { createCache } = await import('../cache.js')
    const cache = createCache()
    cache.set('key1', 'val', 10_000)
    vi.advanceTimersByTime(9_999)
    expect(cache.get('key1')).toBe('val')
    vi.advanceTimersByTime(2)
    expect(cache.get('key1')).toBeUndefined()
  })

  it('evicts oldest entry when max size reached', async () => {
    const { createCache } = await import('../cache.js')
    const cache = createCache(3)
    cache.set('a', 1, 60_000)
    cache.set('b', 2, 60_000)
    cache.set('c', 3, 60_000)
    cache.set('d', 4, 60_000)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('d')).toBe(4)
  })

  it('tracks size correctly', async () => {
    const { createCache } = await import('../cache.js')
    const cache = createCache()
    cache.set('a', 1, 60_000)
    cache.set('b', 2, 60_000)
    expect(cache.size).toBe(2)
  })
})
