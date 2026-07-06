import { afterEach, describe, expect, it, vi } from 'vitest'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { daysAgo, getKSTDate } from '@/scripts/tli/shared/utils'

describe('TLI KST date utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the shared KST boundary for script date helpers', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-10T14:59:00.000Z').getTime())

    expect(getKSTDateString()).toBe('2026-03-10')
    expect(getKSTDate()).toBe('2026-03-10')

    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-10T15:00:00.000Z').getTime())

    expect(getKSTDateString()).toBe('2026-03-11')
    expect(getKSTDate()).toBe('2026-03-11')
  })

  it('derives script lookback dates from the shared KST helper', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-10T15:00:00.000Z').getTime())

    expect(daysAgo(7)).toBe('2026-03-04')
  })
})
