import type {
  ChangeGroupSummary,
  EventStudySummary,
  ExposureEvent,
  InterestMetricRow,
  LabelDistributionSummary,
  LabelGroupSummary,
  ReflexivityIssueProposal,
  ReflexivityReport,
  ReflexivityReportInput,
  ThemeLabelRow,
} from './reflexivity-types'

export type {
  ChangeGroupSummary,
  EventStudySummary,
  ExposureEvent,
  ExposureSource,
  InterestMetricRow,
  LabelDistributionSummary,
  LabelGroupSummary,
  ReflexivityAction,
  ReflexivityIssueProposal,
  ReflexivityReport,
  ReflexivityReportInput,
  ReflexivityStatus,
  ThemeLabelRow,
} from './reflexivity-types'

type SeriesChange = { readonly relativeChange: number }

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_EVENT_WINDOW_DAYS = 3
const DEFAULT_MIN_COMPARABLE_EVENTS = 5
const DEFAULT_RAW_VALUE_NET_LIFT = 0.15
const DEFAULT_LABEL_LIFT = 0.10

export function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setTime(date.getTime() + days * DAY_MS)
  return date.toISOString().slice(0, 10)
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6))
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function metricKey(themeId: string, date: string): string {
  return `${themeId}:${date}`
}

function buildInterestMap(rows: readonly InterestMetricRow[]): ReadonlyMap<string, number | null> {
  return new Map(rows.map((row) => [metricKey(row.themeId, row.date), row.rawValue]))
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function uniqueExposureEvents(events: readonly ExposureEvent[]): ExposureEvent[] {
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

function buildEventStudy(input: {
  readonly allThemeIds: readonly string[]
  readonly exposureEvents: readonly ExposureEvent[]
  readonly interestRows: readonly InterestMetricRow[]
  readonly windowDays: number
  readonly minComparableEvents: number
  readonly liftThreshold: number
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

  return {
    windowDays: input.windowDays,
    status: ready ? 'ready' : 'insufficient_data',
    reason: ready ? null : 'raw_value comparable sample is below minComparableEvents',
    exposed,
    control,
    netLift,
    significantLift: ready && netLift !== null && netLift >= input.liftThreshold,
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

function buildLabelDistribution(input: {
  readonly allThemeIds: readonly string[]
  readonly exposureEvents: readonly ExposureEvent[]
  readonly labelRows: readonly ThemeLabelRow[]
  readonly quarterStart: string
  readonly quarterEnd: string
  readonly minComparableEvents: number
  readonly labelLiftThreshold: number
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

  return {
    status: ready ? 'ready' : 'insufficient_data',
    reason: ready ? null : 'quarterly label sample is below minComparableEvents',
    exposed,
    unexposed,
    lift,
    significantLift: ready && lift !== null && lift >= input.labelLiftThreshold,
  }
}

function buildIssueProposal(input: {
  readonly eventStudy: EventStudySummary
  readonly labelDistribution: LabelDistributionSummary
}): ReflexivityIssueProposal | null {
  if (!input.eventStudy.significantLift && !input.labelDistribution.significantLift) return null

  return {
    title: '[TLI] exposure_suspect flag review recommended',
    labels: ['tli', 'exposure_suspect', 'needs-review'],
    body: [
      'Newsletter exposure reflexivity lift crossed the configured detection threshold.',
      `eventStudyNetLift=${input.eventStudy.netLift ?? 'n/a'}`,
      `labelDistributionLift=${input.labelDistribution.lift ?? 'n/a'}`,
      'No automatic serving action was taken. Review before adding an exposure_suspect flag or holdout policy.',
    ].join('\n'),
    evidence: {
      eventStudySignificant: input.eventStudy.significantLift,
      labelDistributionSignificant: input.labelDistribution.significantLift,
      eventStudyNetLift: input.eventStudy.netLift,
      labelDistributionLift: input.labelDistribution.lift,
    },
  }
}

export function buildReflexivityReport(input: ReflexivityReportInput): ReflexivityReport {
  const exposureEvents = uniqueExposureEvents(input.exposureEvents)
  const eventWindowDays = input.eventWindowDays ?? DEFAULT_EVENT_WINDOW_DAYS
  const minComparableEvents = input.minComparableEvents ?? DEFAULT_MIN_COMPARABLE_EVENTS
  const rawValueNetLift = input.liftThreshold ?? DEFAULT_RAW_VALUE_NET_LIFT
  const labelPositiveRateLift = input.labelLiftThreshold ?? DEFAULT_LABEL_LIFT
  const exposedThemeIds = uniqueSorted(exposureEvents.map((event) => event.themeId))
  const eventStudy = buildEventStudy({
    allThemeIds: input.allThemeIds,
    exposureEvents,
    interestRows: input.interestRows,
    windowDays: eventWindowDays,
    minComparableEvents,
    liftThreshold: rawValueNetLift,
  })
  const labelDistribution = buildLabelDistribution({
    allThemeIds: input.allThemeIds,
    exposureEvents,
    labelRows: input.labelRows,
    quarterStart: input.quarterStart,
    quarterEnd: input.quarterEnd,
    minComparableEvents,
    labelLiftThreshold: labelPositiveRateLift,
  })
  const issueProposal = buildIssueProposal({ eventStudy, labelDistribution })

  return {
    reportVersion: 'tli-reflexivity-report-v1',
    asOfDate: input.asOfDate,
    quarter: { start: input.quarterStart, end: input.quarterEnd },
    extractionMode: input.extractionMode ?? 'newsletter_content_text_match',
    thresholds: {
      minComparableEvents,
      eventWindowDays,
      rawValueNetLift,
      labelPositiveRateLift,
    },
    exposureSummary: {
      exposureEventCount: exposureEvents.length,
      exposedThemeCount: exposedThemeIds.length,
      unexposedThemeCount: Math.max(0, input.allThemeIds.length - exposedThemeIds.length),
    },
    eventStudy,
    labelDistribution,
    issueProposal,
    recommendedAction: issueProposal ? 'propose_exposure_suspect_issue' : 'none',
  }
}
