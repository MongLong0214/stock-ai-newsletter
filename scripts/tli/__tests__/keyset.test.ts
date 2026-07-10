import { describe, expect, it } from 'vitest'

import {
  compareKeysetCursor,
  keysetOrExpression,
  paginateByKeyset,
  type KeysetColumns,
  type KeysetCursor,
} from '@/scripts/tli/shared/keyset'

const COLUMNS: KeysetColumns = { first: 'base_date', second: 'theme_id', third: 'id' }

const cursor = (first: string, second: string, third: string): KeysetCursor => ({ first, second, third })

describe('compareKeysetCursor', () => {
  it('orders by first, then second, then third', () => {
    expect(compareKeysetCursor(cursor('2026-01-01', 'a', 'a'), cursor('2026-01-02', 'a', 'a'))).toBeLessThan(0)
    expect(compareKeysetCursor(cursor('2026-01-02', 'a', 'a'), cursor('2026-01-01', 'z', 'z'))).toBeGreaterThan(0)
    expect(compareKeysetCursor(cursor('2026-01-01', 'a', 'b'), cursor('2026-01-01', 'a', 'a'))).toBeGreaterThan(0)
    expect(compareKeysetCursor(cursor('2026-01-01', 'a', 'a'), cursor('2026-01-01', 'a', 'a'))).toBe(0)
  })

  it('uses UTF-8 byte order to match DB COLLATE "C"', () => {
    // 'Z' (0x5A) < 'a' (0x61) in byte order, unlike locale-aware compare
    expect(compareKeysetCursor(cursor('2026-01-01', 'Z', '1'), cursor('2026-01-01', 'a', '1'))).toBeLessThan(0)
  })
})

describe('keysetOrExpression', () => {
  it('reproduces the row-value (first,second,third) > cursor comparison', () => {
    expect(keysetOrExpression(COLUMNS, cursor('2026-01-05', 'theme-9', 'id-3'))).toBe(
      'base_date.gt.2026-01-05,'
      + 'and(base_date.eq.2026-01-05,theme_id.gt.theme-9),'
      + 'and(base_date.eq.2026-01-05,theme_id.eq.theme-9,id.gt.id-3)',
    )
  })
})

describe('paginateByKeyset', () => {
  const rows = Array.from({ length: 2500 }, (_, index) => ({
    base_date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    theme_id: `theme-${String(index).padStart(6, '0')}`,
    id: `id-${String(index).padStart(6, '0')}`,
  }))
  const sorted = [...rows].sort((left, right) => compareKeysetCursor(
    { first: left.base_date, second: left.theme_id, third: left.id },
    { first: right.base_date, second: right.theme_id, third: right.id },
  ))
  const keyOf = (row: (typeof rows)[number]): KeysetCursor => ({ first: row.base_date, second: row.theme_id, third: row.id })

  it('walks every row exactly once across pages with zero duplicates or gaps', async () => {
    const pageSize = 1000
    const collected = await paginateByKeyset({
      pageSize,
      keyOf,
      fetchPage: async (after) => {
        const remaining = after === null
          ? sorted
          : sorted.filter((row) => compareKeysetCursor(keyOf(row), after) > 0)
        return remaining.slice(0, pageSize)
      },
    })
    expect(collected).toHaveLength(rows.length)
    expect(new Set(collected.map((row) => row.id)).size).toBe(rows.length)
  })

  it('throws on a non-increasing (unordered) page boundary', async () => {
    await expect(paginateByKeyset({
      pageSize: 10,
      keyOf,
      fetchPage: async () => [sorted[1], sorted[0]],
    })).rejects.toThrow('non-increasing or duplicate key')
  })

  it('throws on a duplicated key', async () => {
    await expect(paginateByKeyset({
      pageSize: 10,
      keyOf,
      fetchPage: async () => [sorted[0], sorted[0]],
    })).rejects.toThrow('non-increasing or duplicate key')
  })
})
