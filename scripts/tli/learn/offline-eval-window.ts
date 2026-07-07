export const OFFLINE_EVAL_START_DATE_FLOOR = '2026-01-07'

export interface EvalDataDateBounds {
  readonly dataMinDate: string | null
  readonly dataMaxDate: string | null
}

interface EvalWindowInput extends EvalDataDateBounds {
  readonly startArg: string | null
  readonly endArg: string | null
}

interface EvalWindow {
  readonly startDate: string
  readonly endDate: string
}

interface BaseDateRow {
  readonly baseDate: string
}

const laterDate = (left: string, right: string): string => (
  left.localeCompare(right) >= 0 ? left : right
)

const earlierDate = (left: string, right: string): string => (
  left.localeCompare(right) <= 0 ? left : right
)

export const resolveEvalWindow = (input: EvalWindowInput): EvalWindow => {
  const defaultEndDate = input.dataMaxDate === null
    ? OFFLINE_EVAL_START_DATE_FLOOR
    : laterDate(input.dataMaxDate, OFFLINE_EVAL_START_DATE_FLOOR)
  const defaultStartDate = input.dataMinDate === null
    ? OFFLINE_EVAL_START_DATE_FLOOR
    : earlierDate(laterDate(input.dataMinDate, OFFLINE_EVAL_START_DATE_FLOOR), defaultEndDate)

  return {
    startDate: input.startArg ?? defaultStartDate,
    endDate: input.endArg ?? defaultEndDate,
  }
}

export const resolveEvalInputDateBounds = (input: {
  readonly labels: readonly BaseDateRow[]
  readonly featureRows: readonly BaseDateRow[]
}): EvalDataDateBounds => {
  const dates = [...input.labels, ...input.featureRows].map((row) => row.baseDate).sort()
  return {
    dataMinDate: dates[0] ?? null,
    dataMaxDate: dates[dates.length - 1] ?? null,
  }
}
