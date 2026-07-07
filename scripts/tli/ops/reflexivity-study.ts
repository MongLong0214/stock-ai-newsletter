import type {
  ChangeGroupSummary,
  EventStudySummary,
  ExposureEvent,
  InterestMetricRow,
  LabelDistributionSummary,
  LabelGroupSummary,
  ReflexivityIssueProposal,
  ThemeLabelRow,
} from './reflexivity-types'
import { mean, oneSidedPermutationPValue, roundMetric } from './reflexivity-statistics'

type SeriesChange = { readonly relativeChange: number }

const DAY_MS = 24 * 60 * 60 * 1000

export function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setTime(date.getTime() + days * DAY_MS)
  return date.toISOString().slice(0, 10)
}

function metricKey(themeId: string, date: string): string {
  return `${themeId}:${date}`
}

function buildInterestMap(rows: readonly InterestMetricRow[]): ReadonlyMap<string, number | null> {
  return new Map(rows.map((row) => [metricKey(row.themeId, row.date), row.rawValue]))
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

export function uniqueExposureEvents(events: readonly ExposureEvent[]): ExposureEvent[] {
  const byThemeDate = new Map<string, ExposureEvent>()
  for (const event of events) {
    const key = metricKey(event.themeId, event.exposureDate)
    if (!byThemeDate.has(key)) byThemeDate.set(key, event)
  }
  return [...byThemeDate.values()].sort((left, right) => (
    left.exposureDate === right.exposureDate
      ? left.themeId.localeCompare(right.themeId)
      : left.exposureDate.localeCompare(right.exposureDate)
  ))
}

function buildSeriesChange(input: {
  readonly themeId: string
  readonly date: string
  readonly windowDays: number
  readonly interestByThemeDate: ReadonlyMap<string, number | null>
}): SeriesChange | null {
  const baseline = input.interestByThemeDate.get(metricKey(input.themeId, input.date))
  if (baseline === undefined || baseline === null || baseline <= 0) return null

  const futureValues: number[] = []
  for (let offset = 1; offset <= input.windowDays; offset += 1) {
    const rawValue = input.interestByThemeDate.get(metricKey(input.themeId, shiftDate(input.date, offset)))
    if (rawValue !== undefined && rawValue !== null) futureValues.push(rawValue)
  }

  const futureMean = mean(futureValues)
  if (futureMean === null) return null

  return {
    relativeChange: roundMetric((futureMean - baseline) / baseline),
  }
}

function summarizeChanges(changes: readonly SeriesChange[]): ChangeGroupSummary {
  const meanRelativeChange = mean(changes.map((change) => change.relativeChange))
  return {
    comparableCount: changes.length,
    meanRelativeChange: meanRelativeChange === null ? null : roundMetric(meanRelativeChange),
  }
}

export function buildEventStudy(input: {
  readonly allThemeIds: readonly string[]
  readonly exposureEvents: readonly ExposureEvent[]
  readonly interestRows: readonly InterestMetricRow[]
  readonly windowDays: number
  readonly minComparableEvents: number
  readonly liftThreshold: number
  readonly alpha: number
  readonly permutationIterations: number
}): EventStudySummary {
  const interestByThemeDate = buildInterestMap(input.interestRows)
  const exposedThemeIds = new Set(input.exposureEvents.map((event) => event.themeId))
  const exposureDates = uniqueSorted(input.exposureEvents.map((event) => event.exposureDate))
  const exposedChanges = input.exposureEvents.flatMap((event) => {
    const change = buildSeriesChange({
      themeId: event.themeId,
      date: event.exposureDate,
      windowDays: input.windowDays,
      interestByThemeDate,
    })
    return change ? [change] : []
  })
  const controlThemeIds = input.allThemeIds.filter((themeId) => !exposedThemeIds.has(themeId))
  const controlChanges = exposureDates.flatMap((date) => (
    controlThemeIds.flatMap((themeId) => {
      const change = buildSeriesChange({ themeId, date, windowDays: input.windowDays, interestByThemeDate })
      return change ? [change] : []
    })
  ))
  const exposed = summarizeChanges(exposedChanges)
  const control = summarizeChanges(controlChanges)
  const ready = exposed.comparableCount >= input.minComparableEvents
    && control.comparableCount >= input.minComparableEvents
  const netLift = exposed.meanRelativeChange === null || control.meanRelativeChange === null
    ? null
    : roundMetric(exposed.meanRelativeChange - control.meanRelativeChange)
  const pValue = ready && netLift !== null
    ? oneSidedPermutationPValue({
      treatmentValues: exposedChanges.map((change) => change.relativeChange),
      controlValues: controlChanges.map((change) => change.relativeChange),
      observedDifference: netLift,
      iterations: input.permutationIterations,
    })
    : null

  return {
    windowDays: input.windowDays,
    status: ready ? 'ready' : 'insufficient_data',
    reason: ready ? null : 'raw_value comparable sample is below minComparableEvents',
    exposed,
    control,
    netLift,
    significantLift: ready && netLift !== null && netLift >= input.liftThreshold,
    pValue,
    statisticallySignificant: pValue !== null && pValue <= input.alpha,
    permutationIterations: input.permutationIterations,
  }
}

function countLabels(labels: readonly ThemeLabelRow[], themeIds: ReadonlySet<string>): LabelGroupSummary {
  const groupLabels = labels.filter((label) => themeIds.has(label.themeId))
  const positiveCount = groupLabels.filter((label) => label.yBinary === true).length
  return {
    labelCount: groupLabels.length,
    positiveCount,
    positiveRate: groupLabels.length === 0 ? null : roundMetric(positiveCount / groupLabels.length),
  }
}

export function buildLabelDistribution(input: {
  readonly allThemeIds: readonly string[]
  readonly exposureEvents: readonly ExposureEvent[]
  readonly labelRows: readonly ThemeLabelRow[]
  readonly quarterStart: string
  readonly quarterEnd: string
  readonly minComparableEvents: number
  readonly labelLiftThreshold: number
  readonly alpha: number
  readonly permutationIterations: number
}): LabelDistributionSummary {
  const exposedThemeIds = new Set(input.exposureEvents.map((event) => event.themeId))
  const unexposedThemeIds = new Set(input.allThemeIds.filter((themeId) => !exposedThemeIds.has(themeId)))
  const finalLabels = input.labelRows.filter((label) => (
    label.baseDate >= input.quarterStart
    && label.baseDate <= input.quarterEnd
    && label.yBinary !== null
    && (label.labelStatus === undefined || label.labelStatus === 'final')
  ))
  const exposed = countLabels(finalLabels, exposedThemeIds)
  const unexposed = countLabels(finalLabels, unexposedThemeIds)
  const lift = exposed.positiveRate === null || unexposed.positiveRate === null
    ? null
    : roundMetric(exposed.positiveRate - unexposed.positiveRate)
  const ready = exposed.labelCount >= input.minComparableEvents && unexposed.labelCount >= input.minComparableEvents
  const exposedValues = finalLabels
    .filter((label) => exposedThemeIds.has(label.themeId))
    .map((label) => (label.yBinary ? 1 : 0))
  const unexposedValues = finalLabels
    .filter((label) => unexposedThemeIds.has(label.themeId))
    .map((label) => (label.yBinary ? 1 : 0))
  const pValue = ready && lift !== null
    ? oneSidedPermutationPValue({
      treatmentValues: exposedValues,
      controlValues: unexposedValues,
      observedDifference: lift,
      iterations: input.permutationIterations,
    })
    : null

  return {
    status: ready ? 'ready' : 'insufficient_data',
    reason: ready ? null : 'quarterly label sample is below minComparableEvents',
    exposed,
    unexposed,
    lift,
    significantLift: ready && lift !== null && lift >= input.labelLiftThreshold,
    pValue,
    statisticallySignificant: pValue !== null && pValue <= input.alpha,
    permutationIterations: input.permutationIterations,
  }
}

export function buildIssueProposal(input: {
  readonly eventStudy: EventStudySummary
  readonly labelDistribution: LabelDistributionSummary
}): ReflexivityIssueProposal | null {
  const eventStudySignificant = input.eventStudy.significantLift && input.eventStudy.statisticallySignificant
  const labelDistributionSignificant = input.labelDistribution.significantLift
    && input.labelDistribution.statisticallySignificant
  if (!eventStudySignificant && !labelDistributionSignificant) return null

  return {
    title: '[TLI] exposure_suspect flag review recommended',
    labels: ['tli', 'exposure_suspect', 'needs-review'],
    body: [
      'Newsletter exposure reflexivity lift crossed the configured effect-size and statistical detection gates.',
      `eventStudyNetLift=${input.eventStudy.netLift ?? 'n/a'}`,
      `labelDistributionLift=${input.labelDistribution.lift ?? 'n/a'}`,
      'No automatic serving action was taken. Review before adding an exposure_suspect flag or holdout policy.',
    ].join('\n'),
    evidence: {
      eventStudySignificant,
      labelDistributionSignificant,
      eventStudyNetLift: input.eventStudy.netLift,
      labelDistributionLift: input.labelDistribution.lift,
    },
  }
}
