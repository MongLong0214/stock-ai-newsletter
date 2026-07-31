import { describe, expect, it } from 'vitest'

import { selectPreviousChangesRow } from '@/app/api/tli/changes/date-selection'

const rows = (...dates: string[]) => dates.map((calculated_at) => ({ calculated_at }))

describe('Changes API baseline date selection', () => {
  it('chooses the exact latest-7-calendar-day row instead of the first >=5-day row', () => {
    const previous = selectPreviousChangesRow(rows(
      '2025-07-15',
      '2025-07-14',
      '2025-07-10',
      '2025-07-08',
      '2025-07-07',
    ), '7d')

    expect(previous?.calculated_at).toBe('2025-07-08')
  })

  it('chooses the eligible row nearest the seven-day target when the exact date is absent', () => {
    const previous = selectPreviousChangesRow(rows(
      '2025-07-15',
      '2025-07-12',
      '2025-07-09',
      '2025-07-05',
    ), '7d')

    expect(previous?.calculated_at).toBe('2025-07-09')
  })

  it('uses the older candidate for equal-distance six/eight-day ties', () => {
    const previous = selectPreviousChangesRow(rows(
      '2025-07-15',
      '2025-07-09',
      '2025-07-07',
    ), '7d')

    expect(previous?.calculated_at).toBe('2025-07-07')
  })

  it('returns undefined when no candidate has the minimum five-day gap', () => {
    expect(selectPreviousChangesRow(rows('2025-07-15', '2025-07-14', '2025-07-11'), '7d'))
      .toBeUndefined()
  })

  it('for 1d skips same-calendar-day timestamps and selects the previous date', () => {
    const previous = selectPreviousChangesRow(rows(
      '2025-07-15T23:00:00+09:00',
      '2025-07-15T09:00:00+09:00',
      '2025-07-14T09:00:00+09:00',
    ), '1d')

    expect(previous?.calculated_at).toBe('2025-07-14T09:00:00+09:00')
  })

  it('fails loudly on malformed calculated_at dates', () => {
    expect(() => selectPreviousChangesRow(rows('not-a-date', '2025-07-08'), '7d'))
      .toThrow(/Invalid calculated_at/)
  })
})
