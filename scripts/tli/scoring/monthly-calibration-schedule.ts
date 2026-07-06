export type MonthlyCalibrationDecision = 'deferred' | 'executed' | 'skipped'

export const MONTHLY_CALIBRATION_MARKER_TYPE = 'monthly_recalibration_run'

export function getKstMonthStart(kstDate: string): string {
  return `${kstDate.slice(0, 7)}-01`
}

export function hasRunInKstMonth(input: {
  kstDate: string
  runDates: readonly string[]
}): boolean {
  const monthPrefix = input.kstDate.slice(0, 7)
  return input.runDates.some((runDate) => runDate.startsWith(monthPrefix))
}

export function planMonthlyCalibration(input: {
  kstDate: string
  eligibleRun: boolean
  runDates: readonly string[]
}): MonthlyCalibrationDecision {
  if (hasRunInKstMonth({ kstDate: input.kstDate, runDates: input.runDates })) {
    return 'skipped'
  }
  if (!input.eligibleRun) return 'deferred'
  return 'executed'
}
