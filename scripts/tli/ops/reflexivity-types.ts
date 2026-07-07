export type ExposureSource = 'newsletter_content_text_match' | 'fixture'
export type ReflexivityStatus = 'ready' | 'insufficient_data'
export type ReflexivityAction = 'none' | 'propose_exposure_suspect_issue'

export interface ExposureEvent {
  readonly themeId: string
  readonly exposureDate: string
  readonly source: ExposureSource
  readonly newsletterId?: string
  readonly matchedName?: string
  readonly subscriberCount?: number | null
}

export interface InterestMetricRow {
  readonly themeId: string
  readonly date: string
  readonly rawValue: number | null
}

export interface ThemeLabelRow {
  readonly themeId: string
  readonly baseDate: string
  readonly yBinary: boolean | null
  readonly labelStatus?: string
  readonly gLogRatio?: number | null
}

export interface ReflexivityReportInput {
  readonly asOfDate: string
  readonly quarterStart: string
  readonly quarterEnd: string
  readonly allThemeIds: readonly string[]
  readonly exposureEvents: readonly ExposureEvent[]
  readonly interestRows: readonly InterestMetricRow[]
  readonly labelRows: readonly ThemeLabelRow[]
  readonly eventWindowDays?: number
  readonly minComparableEvents?: number
  readonly liftThreshold?: number
  readonly labelLiftThreshold?: number
  readonly extractionMode?: ExposureSource
}

export interface ChangeGroupSummary {
  readonly comparableCount: number
  readonly meanRelativeChange: number | null
}

export interface EventStudySummary {
  readonly windowDays: number
  readonly status: ReflexivityStatus
  readonly reason: string | null
  readonly exposed: ChangeGroupSummary
  readonly control: ChangeGroupSummary
  readonly netLift: number | null
  readonly significantLift: boolean
  readonly pValue: number | null
  readonly statisticallySignificant: boolean
  readonly permutationIterations: number
}

export interface LabelGroupSummary {
  readonly labelCount: number
  readonly positiveCount: number
  readonly positiveRate: number | null
}

export interface LabelDistributionSummary {
  readonly status: ReflexivityStatus
  readonly reason: string | null
  readonly exposed: LabelGroupSummary
  readonly unexposed: LabelGroupSummary
  readonly lift: number | null
  readonly significantLift: boolean
  readonly pValue: number | null
  readonly statisticallySignificant: boolean
  readonly permutationIterations: number
}

export interface ReflexivityIssueProposal {
  readonly title: string
  readonly labels: readonly string[]
  readonly body: string
  readonly evidence: {
    readonly eventStudySignificant: boolean
    readonly labelDistributionSignificant: boolean
    readonly eventStudyNetLift: number | null
    readonly labelDistributionLift: number | null
  }
}

export interface ReflexivityReport {
  readonly reportVersion: 'tli-reflexivity-report-v2'
  readonly asOfDate: string
  readonly quarter: {
    readonly start: string
    readonly end: string
  }
  readonly extractionMode: ExposureSource
  readonly thresholds: {
    readonly minComparableEvents: number
    readonly eventWindowDays: number
    readonly rawValueNetLift: number
    readonly labelPositiveRateLift: number
    readonly alpha: number
    readonly permutationIterations: number
  }
  readonly exposureSummary: {
    readonly exposureEventCount: number
    readonly exposedThemeCount: number
    readonly unexposedThemeCount: number
  }
  readonly eventStudy: EventStudySummary
  readonly labelDistribution: LabelDistributionSummary
  readonly issueProposal: ReflexivityIssueProposal | null
  readonly recommendedAction: ReflexivityAction
}
