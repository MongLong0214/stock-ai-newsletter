import type { ReflexivityReport, ReflexivityReportInput } from './reflexivity-types'
import {
  DEFAULT_REFLEXIVITY_ALPHA,
  DEFAULT_REFLEXIVITY_PERMUTATION_ITERATIONS,
} from './reflexivity-statistics'
import {
  buildEventStudy,
  buildIssueProposal,
  buildLabelDistribution,
  uniqueExposureEvents,
  uniqueSorted,
} from './reflexivity-study'

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
export { shiftDate } from './reflexivity-study'

const DEFAULT_EVENT_WINDOW_DAYS = 3
const DEFAULT_MIN_COMPARABLE_EVENTS = 5
const DEFAULT_RAW_VALUE_NET_LIFT = 0.15
const DEFAULT_LABEL_LIFT = 0.10

export function buildReflexivityReport(input: ReflexivityReportInput): ReflexivityReport {
  const exposureEvents = uniqueExposureEvents(input.exposureEvents)
  const eventWindowDays = input.eventWindowDays ?? DEFAULT_EVENT_WINDOW_DAYS
  const minComparableEvents = input.minComparableEvents ?? DEFAULT_MIN_COMPARABLE_EVENTS
  const rawValueNetLift = input.liftThreshold ?? DEFAULT_RAW_VALUE_NET_LIFT
  const labelPositiveRateLift = input.labelLiftThreshold ?? DEFAULT_LABEL_LIFT
  const alpha = DEFAULT_REFLEXIVITY_ALPHA
  const permutationIterations = DEFAULT_REFLEXIVITY_PERMUTATION_ITERATIONS
  const exposedThemeIds = uniqueSorted(exposureEvents.map((event) => event.themeId))
  const eventStudy = buildEventStudy({
    allThemeIds: input.allThemeIds,
    exposureEvents,
    interestRows: input.interestRows,
    windowDays: eventWindowDays,
    minComparableEvents,
    liftThreshold: rawValueNetLift,
    alpha,
    permutationIterations,
  })
  const labelDistribution = buildLabelDistribution({
    allThemeIds: input.allThemeIds,
    exposureEvents,
    labelRows: input.labelRows,
    quarterStart: input.quarterStart,
    quarterEnd: input.quarterEnd,
    minComparableEvents,
    labelLiftThreshold: labelPositiveRateLift,
    alpha,
    permutationIterations,
  })
  const issueProposal = buildIssueProposal({ eventStudy, labelDistribution })

  return {
    reportVersion: 'tli-reflexivity-report-v2',
    asOfDate: input.asOfDate,
    quarter: { start: input.quarterStart, end: input.quarterEnd },
    extractionMode: input.extractionMode ?? 'newsletter_content_text_match',
    thresholds: {
      minComparableEvents,
      eventWindowDays,
      rawValueNetLift,
      labelPositiveRateLift,
      alpha,
      permutationIterations,
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
