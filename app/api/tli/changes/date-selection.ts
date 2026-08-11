export type ChangesPeriod = '1d' | '7d'

export interface CalculatedAtRow {
  readonly calculated_at: string
}

export const MIN_7D_GAP_DAYS = 5
const DAY_MS = 86_400_000

function calendarDateMillis(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) throw new Error(`Invalid calculated_at calendar date: ${value}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const millis = Date.UTC(year, month - 1, day)
  const parsed = new Date(millis)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`Invalid calculated_at calendar date: ${value}`)
  }
  return millis
}

/**
 * Selects a baseline from rows whose first element is the latest observation.
 * 7d chooses the candidate nearest latest-7 calendar days after enforcing a
 * minimum 5-day gap. Equal-distance ties choose the older candidate.
 */
export function selectPreviousChangesRow<T extends CalculatedAtRow>(
  rows: readonly T[],
  period: ChangesPeriod,
): T | undefined {
  const latest = rows[0]
  if (!latest) return undefined
  const latestMillis = calendarDateMillis(latest.calculated_at)
  const candidates = rows.slice(1).map((row) => ({
    row,
    millis: calendarDateMillis(row.calculated_at),
  })).filter(({ millis }) => millis < latestMillis)

  if (period === '1d') {
    return candidates[0]?.row
  }

  const targetMillis = latestMillis - 7 * DAY_MS
  return candidates
    .filter(({ millis }) => (latestMillis - millis) / DAY_MS >= MIN_7D_GAP_DAYS)
    .sort((left, right) => {
      const distance = Math.abs(left.millis - targetMillis) - Math.abs(right.millis - targetMillis)
      if (distance !== 0) return distance
      return left.millis - right.millis
    })[0]?.row
}
