import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPrevScoreMap, buildRecentSmoothedMap, loadPrevScores } from '@/scripts/tli/scoring/calculate-scores'
import type { PrevScoreRecord } from '@/scripts/tli/scoring/calculate-scores'

const rpcMocks = vi.hoisted(() => ({
  responses: [] as Array<{ data: unknown[] | null; count: number | null; error: { message: string } | null }>,
  orders: [] as Array<[string, { ascending?: boolean } | undefined]>,
  ranges: [] as Array<[number, number]>,
  rpc: vi.fn(() => ({
    order(column: string, options?: { ascending?: boolean }) {
      rpcMocks.orders.push([column, options])
      return this
    },
    async range(from: number, to: number) {
      rpcMocks.ranges.push([from, to])
      return rpcMocks.responses.shift() ?? { data: null, count: null, error: { message: 'missing mock page' } }
    },
  })),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: { rpc: rpcMocks.rpc } }))

beforeEach(() => {
  rpcMocks.responses.length = 0
  rpcMocks.orders.length = 0
  rpcMocks.ranges.length = 0
  rpcMocks.rpc.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const score = (themeId: string, day: number): PrevScoreRecord => ({
  theme_id: themeId,
  stage: 'Growth',
  score: 50 + day,
  smoothed_score: 50 + day,
  raw_score: 50 + day,
  components: null,
  calculated_at: `2026-09-${String(day).padStart(2, '0')}`,
})

describe('calculate-scores helpers', () => {
  it('keeps up to five historical score records per theme for smoothing', () => {
    const records = Array.from({ length: 6 }, (_, index) => ({
      theme_id: 'theme-1',
      stage: 'Growth',
      score: 90 - index,
      smoothed_score: 90 - index,
      raw_score: 90 - index,
      components: null,
      calculated_at: `2026-03-0${index + 1}`,
    }))

    const prevScoreMap = buildPrevScoreMap(records)

    expect(prevScoreMap.get('theme-1')).toHaveLength(5)
  })

  it('builds a smoothing window from the latest five smoothed scores', () => {
    const records = Array.from({ length: 5 }, (_, index) => ({
      theme_id: 'theme-1',
      stage: 'Growth',
      score: 0,
      smoothed_score: 100 - index * 5,
      raw_score: 0,
      components: null,
      calculated_at: `2026-03-0${index + 1}`,
    }))

    const smoothedMap = buildRecentSmoothedMap(buildPrevScoreMap(records))

    expect(smoothedMap.get('theme-1')).toEqual([100, 95, 90, 85, 80])
  })
})

describe('loadPrevScores RPC', () => {
  it('sends 300-theme chunks with the date and five-record limit, including all capped rows', async () => {
    const ids = Array.from({ length: 301 }, (_, i) => `theme-${String(i).padStart(3, '0')}`)
    const expected = ids.flatMap(id => Array.from({ length: 5 }, (_, day) => score(id, 27 - day)))
    rpcMocks.responses.push(
      { data: expected.slice(0, 1000), count: 1500, error: null },
      { data: expected.slice(1000, 1500), count: 1500, error: null },
      { data: expected.slice(1500), count: 5, error: null },
    )

    const rows = await loadPrevScores(ids, '2026-09-28')

    expect(new Set(expected.map(row => `${row.theme_id}:${row.calculated_at}`)).size).toBe(expected.length)
    expect(rows).toEqual(expected)
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(3)
    expect(rpcMocks.rpc).toHaveBeenNthCalledWith(1, 'tli_latest_lifecycle_scores', {
      p_theme_ids: ids.slice(0, 300), p_before: '2026-09-28', p_limit: 5,
    }, { count: 'exact' })
    expect(rpcMocks.rpc).toHaveBeenNthCalledWith(3, 'tli_latest_lifecycle_scores', {
      p_theme_ids: ids.slice(300), p_before: '2026-09-28', p_limit: 5,
    }, { count: 'exact' })
    expect(rpcMocks.ranges).toEqual([[0, 999], [1000, 1999], [0, 999]])
    expect(rpcMocks.orders).toEqual(Array.from({ length: 6 }, (_, i) => i % 2 === 0
      ? ['theme_id', undefined]
      : ['calculated_at', { ascending: false }]))
  })

  it('retries a failed RPC page and returns the successful result', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const expected = [score('theme-1', 27)]
    rpcMocks.responses.push(
      { data: null, count: null, error: { message: 'statement timeout' } },
      { data: expected, count: 1, error: null },
    )

    const pending = loadPrevScores(['theme-1'], '2026-09-28')
    await vi.advanceTimersByTimeAsync(999)
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    expect(await pending).toEqual(expected)
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(2)
    expect(rpcMocks.ranges).toEqual([[0, 999], [0, 999]])
  })

  it('throws after three failed attempts on the same RPC page', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMocks.responses.push(...Array.from({ length: 3 }, () => ({
      data: null, count: null, error: { message: 'statement timeout' },
    })))

    const pending = expect(loadPrevScores(['theme-1'], '2026-09-28'))
      .rejects.toThrow(/청크 0~1 조회 실패: statement timeout/)
    await vi.advanceTimersByTimeAsync(1000)
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await pending

    expect(rpcMocks.rpc).toHaveBeenCalledTimes(3)
    expect(rpcMocks.ranges).toEqual([[0, 999], [0, 999], [0, 999]])
  })

  it('throws with the chunk range on an incomplete response', async () => {
    rpcMocks.responses.push({ data: [], count: 1, error: null })
    await expect(loadPrevScores(['theme-1'], '2026-09-28'))
      .rejects.toThrow(/청크 0~1 결과 잘림: 0\/1행/)

    rpcMocks.responses.push({ data: [], count: null, error: null })
    await expect(loadPrevScores(['theme-1'], '2026-09-28'))
      .rejects.toThrow(/청크 0~1 count\(exact\) 누락/)
  })

  it('stops after a successful empty page when rows shrink between pages', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `theme-${i}`)
    rpcMocks.responses.push(
      { data: Array.from({ length: 1000 }, () => score('theme-1', 27)), count: 1500, error: null },
      { data: [], count: 1000, error: null },
    )

    await expect(loadPrevScores(ids, '2026-09-28'))
      .rejects.toThrow(/청크 0~300 결과 잘림: 1000\/1500행/)
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(2)
    expect(rpcMocks.ranges).toEqual([[0, 999], [1000, 1999]])
  })

  it('rejects a changed count between nonempty pages', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `theme-${i}`)
    rpcMocks.responses.push(
      { data: Array.from({ length: 1000 }, () => score('theme-1', 27)), count: 1500, error: null },
      { data: [score('theme-2', 27)], count: 1499, error: null },
    )

    await expect(loadPrevScores(ids, '2026-09-28'))
      .rejects.toThrow(/청크 0~300 count 변경: 1000\/1500행, 현재 count 1499/)
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('skips the RPC for an empty theme list', async () => {
    expect(await loadPrevScores([], '2026-09-28')).toEqual([])
    expect(rpcMocks.rpc).not.toHaveBeenCalled()
  })

  it('uses the DB contract of each theme’s latest five records, newest first, for map and smoothing inputs', async () => {
    const fullHistory = [
      ...Array.from({ length: 6 }, (_, i) => score('theme-1', 27 - i)),
      ...Array.from({ length: 6 }, (_, i) => score('theme-2', 27 - i)),
    ].sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))
    const latestPerTheme = ['theme-1', 'theme-2']
      .flatMap(id => fullHistory.filter(row => row.theme_id === id).slice(0, 5))
    rpcMocks.responses.push({ data: latestPerTheme, count: 10, error: null })

    const loaded = await loadPrevScores(['theme-1', 'theme-2'], '2026-09-28')

    expect(buildPrevScoreMap(loaded)).toEqual(buildPrevScoreMap(fullHistory))
    expect(buildRecentSmoothedMap(buildPrevScoreMap(loaded)))
      .toEqual(buildRecentSmoothedMap(buildPrevScoreMap(fullHistory)))
  })
})

describe('066 latest lifecycle scores migration', () => {
  const sql = readFileSync('supabase/migrations/066_tli_latest_lifecycle_scores_rpc.sql', 'utf8')
  const normalized = sql.replace(/\s+/g, ' ').trim()

  it('adds a private, stable read RPC with bounded lateral index lookups', () => {
    expect(normalized).toMatch(/^BEGIN;/)
    expect(normalized).toMatch(/COMMIT;$/)
    expect(normalized).toContain('CREATE FUNCTION public.tli_latest_lifecycle_scores( p_theme_ids UUID[], p_before DATE, p_limit INTEGER )')
    expect(normalized).toContain('RETURNS TABLE ( theme_id UUID, stage VARCHAR, score INTEGER, smoothed_score INTEGER, raw_score INTEGER, components JSONB, calculated_at DATE )')
    expect(normalized).toContain('LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public')
    expect(normalized).toContain('FROM unnest(p_theme_ids) AS t(theme_id) CROSS JOIN LATERAL')
    expect(normalized).toContain('WHERE score.theme_id = t.theme_id AND score.calculated_at < p_before ORDER BY score.calculated_at DESC LIMIT p_limit')
    expect(normalized).toContain('ORDER BY s.theme_id, s.calculated_at DESC')
    expect(normalized).toContain('REVOKE EXECUTE ON FUNCTION public.tli_latest_lifecycle_scores(UUID[], DATE, INTEGER) FROM PUBLIC, anon, authenticated')
    expect(normalized).toContain('GRANT EXECUTE ON FUNCTION public.tli_latest_lifecycle_scores(UUID[], DATE, INTEGER) TO service_role')
    expect(normalized).toContain('COMMENT ON FUNCTION public.tli_latest_lifecycle_scores(UUID[], DATE, INTEGER) IS')
  })

  it('rejects null or out-of-range limits and null or oversized theme arrays', () => {
    expect(normalized).toContain('p_limit IS NULL OR p_limit < 1 OR p_limit > 50')
    expect(normalized).toContain('p_theme_ids IS NULL OR cardinality(p_theme_ids) > 300')
    expect(normalized).toMatch(/RAISE EXCEPTION 'p_limit must be between 1 and 50' USING ERRCODE = '22023'/)
    expect(normalized).toMatch(/RAISE EXCEPTION 'p_theme_ids must contain at most 300 themes' USING ERRCODE = '22023'/)
  })
})
