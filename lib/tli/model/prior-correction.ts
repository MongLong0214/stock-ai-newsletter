const PRIOR_EPSILON = 1e-6
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface TrailingFinalBaseRateOptions {
  readonly windowDays?: number
  readonly lagDays?: number
  readonly minCount?: number
}

export interface TrailingFinalBaseRateWindow {
  readonly startDate: string
  readonly endDate: string
}

const clipOpenUnitInterval = (value: number): number => (
  Math.min(1 - PRIOR_EPSILON, Math.max(PRIOR_EPSILON, value))
)

export const computePriorShiftWeight = (trainRate: number, recentRate: number): number => {
  const clippedTrainRate = clipOpenUnitInterval(trainRate)
  const clippedRecentRate = clipOpenUnitInterval(recentRate)
  return (clippedRecentRate / (1 - clippedRecentRate)) / (clippedTrainRate / (1 - clippedTrainRate))
}

export const applyPriorCorrection = (p: number, trainRate: number, recentRate: number): number => {
  const clippedProbability = clipOpenUnitInterval(p)
  const w = computePriorShiftWeight(trainRate, recentRate)
  return (clippedProbability * w) / ((clippedProbability * w) + (1 - clippedProbability))
}

const validateDayCount = (field: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
}

const validateMinCount = (value: number): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('minCount must be a positive integer')
  }
}

const formatUtcDate = (timeMs: number): string => new Date(timeMs).toISOString().slice(0, 10)

const parseUtcDate = (date: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const yearText = match?.[1]
  const monthText = match?.[2]
  const dayText = match?.[3]
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    throw new Error(`invalid date string: ${date}`)
  }
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const timeMs = Date.UTC(year, month - 1, day)
  if (formatUtcDate(timeMs) !== date) {
    throw new Error(`invalid date string: ${date}`)
  }
  return timeMs
}

export const getTrailingFinalBaseRateWindow = (
  asOfDate: string,
  options?: TrailingFinalBaseRateOptions,
): TrailingFinalBaseRateWindow => {
  const windowDays = options?.windowDays ?? 28
  const lagDays = options?.lagDays ?? 7
  validateDayCount('windowDays', windowDays)
  validateDayCount('lagDays', lagDays)

  const asOfTimeMs = parseUtcDate(asOfDate)
  return {
    startDate: formatUtcDate(asOfTimeMs - ((lagDays + windowDays) * MS_PER_DAY)),
    endDate: formatUtcDate(asOfTimeMs - (lagDays * MS_PER_DAY)),
  }
}

export const computeTrailingFinalBaseRate = (
  labels: readonly { readonly baseDate: string; readonly y: boolean }[],
  asOfDate: string,
  options?: TrailingFinalBaseRateOptions,
): number | null => {
  const minCount = options?.minCount ?? 300
  validateMinCount(minCount)
  const window = getTrailingFinalBaseRateWindow(asOfDate, options)
  const windowLabels = labels.filter((label) => (
    label.baseDate >= window.startDate && label.baseDate <= window.endDate
  ))
  if (windowLabels.length < minCount) return null
  return windowLabels.filter((label) => label.y).length / windowLabels.length
}
