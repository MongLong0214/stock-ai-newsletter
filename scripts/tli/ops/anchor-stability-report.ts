import {
  ANCHOR_CANDIDATES,
  ANCHOR_KEYWORD,
  computeCoefficientOfVariation,
} from '@/scripts/tli/collectors/datalab-anchor'

export type AnchorObservationSource =
  | 'primary_anchor_scale_inference'
  | 'candidate_sampling'
  | 'manual_observation'

export interface AnchorObservation {
  readonly candidate: string
  readonly date: string
  readonly value: number
  readonly source: AnchorObservationSource
}

export interface InterestMetricAnchorScaleRow {
  readonly time: string
  readonly raw_value: number | null
  readonly anchor_scaled_value: number | null
}

export interface AnchorCandidateReport {
  readonly candidate: string
  readonly status: 'ready' | 'insufficient_data'
  readonly observationCount: number
  readonly uniqueDateCount: number
  readonly coefficientOfVariation: number | null
  readonly minValue: number | null
  readonly maxValue: number | null
}

export interface AnchorReplacementIssueProposal {
  readonly title: string
  readonly labels: readonly string[]
  readonly candidate: string
  readonly candidateCv: number
  readonly primaryAnchor: string
  readonly primaryCv: number
}

export type AnchorStabilityDecision =
  | 'insufficient_data'
  | 'primary_only_report'
  | 'confirm_primary_anchor'
  | 'replacement_review_required'

export interface AnchorStabilityReport {
  readonly reportVersion: 'tli-anchor-stability-report-v1'
  readonly asOfDate: string
  readonly windowStart: string
  readonly windowEnd: string
  readonly windowDays: number
  readonly primaryAnchor: string
  readonly candidates: readonly AnchorCandidateReport[]
  readonly comparisonStatus:
    | 'insufficient_primary'
    | 'primary_only'
    | 'partial_comparison'
    | 'complete_comparison'
  readonly decision: AnchorStabilityDecision
  readonly issueProposal: AnchorReplacementIssueProposal | null
}

export interface BuildAnchorStabilityReportInput {
  readonly asOfDate: string
  readonly observations: readonly AnchorObservation[]
  readonly windowDays?: number
  readonly candidates?: readonly string[]
  readonly primaryAnchor?: string
}

const DEFAULT_WINDOW_DAYS = 14
const CV_PRECISION = 6

const parseIsoDateAsUtc = (date: string): Date => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`)
  return parsed
}

const formatIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

const addUtcDays = (date: string, days: number): string => {
  const parsed = parseIsoDateAsUtc(date)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return formatIsoDate(parsed)
}

const roundMetric = (value: number): number => Number(value.toFixed(CV_PRECISION))

const median = (values: readonly number[]): number | null => {
  const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (finiteValues.length === 0) return null
  const middle = Math.floor(finiteValues.length / 2)
  return finiteValues.length % 2 === 0
    ? (finiteValues[middle - 1] + finiteValues[middle]) / 2
    : finiteValues[middle]
}

export function getAnchorStabilityWindow(asOfDate: string, windowDays = DEFAULT_WINDOW_DAYS) {
  if (!Number.isInteger(windowDays) || windowDays < 2) {
    throw new Error(`windowDays는 2 이상의 정수여야 합니다: ${windowDays}`)
  }
  return {
    startDate: addUtcDays(asOfDate, -(windowDays - 1)),
    endDate: asOfDate,
  }
}

export function inferPrimaryAnchorObservationsFromInterestRows(
  rows: readonly InterestMetricAnchorScaleRow[],
  candidate = ANCHOR_KEYWORD,
): AnchorObservation[] {
  return rows.flatMap((row) => {
    const rawValue = row.raw_value
    const scaledValue = row.anchor_scaled_value
    if (
      rawValue === null ||
      scaledValue === null ||
      !Number.isFinite(rawValue) ||
      !Number.isFinite(scaledValue) ||
      rawValue <= 0 ||
      scaledValue <= 0
    ) {
      return []
    }

    return [{
      candidate,
      date: row.time,
      value: rawValue / scaledValue,
      source: 'primary_anchor_scale_inference' as const,
    }]
  })
}

function aggregateDailyCandidateValues(
  observations: readonly AnchorObservation[],
  candidate: string,
  startDate: string,
  endDate: string,
): number[] {
  const valuesByDate = new Map<string, number[]>()
  for (const observation of observations) {
    if (observation.candidate !== candidate) continue
    if (observation.date < startDate || observation.date > endDate) continue
    if (!Number.isFinite(observation.value) || observation.value <= 0) continue

    const values = valuesByDate.get(observation.date) ?? []
    values.push(observation.value)
    valuesByDate.set(observation.date, values)
  }

  return [...valuesByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, values]) => {
      const dailyMedian = median(values)
      return dailyMedian === null ? [] : [dailyMedian]
    })
}

function buildCandidateReport(
  observations: readonly AnchorObservation[],
  candidate: string,
  startDate: string,
  endDate: string,
  requiredDays: number,
): AnchorCandidateReport {
  const dailyValues = aggregateDailyCandidateValues(observations, candidate, startDate, endDate)
  const cv = computeCoefficientOfVariation(dailyValues)

  return {
    candidate,
    status: dailyValues.length >= requiredDays && cv !== null ? 'ready' : 'insufficient_data',
    observationCount: observations.filter((observation) => (
      observation.candidate === candidate &&
      observation.date >= startDate &&
      observation.date <= endDate &&
      Number.isFinite(observation.value) &&
      observation.value > 0
    )).length,
    uniqueDateCount: dailyValues.length,
    coefficientOfVariation: cv === null ? null : roundMetric(cv),
    minValue: dailyValues.length === 0 ? null : roundMetric(Math.min(...dailyValues)),
    maxValue: dailyValues.length === 0 ? null : roundMetric(Math.max(...dailyValues)),
  }
}

function chooseDecision(
  reports: readonly AnchorCandidateReport[],
  primaryAnchor: string,
): Pick<AnchorStabilityReport, 'comparisonStatus' | 'decision' | 'issueProposal'> {
  const primary = reports.find((report) => report.candidate === primaryAnchor)
  if (!primary || primary.status !== 'ready' || primary.coefficientOfVariation === null) {
    return { comparisonStatus: 'insufficient_primary', decision: 'insufficient_data', issueProposal: null }
  }

  const readyReports = reports.filter((report) => (
    report.status === 'ready' && report.coefficientOfVariation !== null
  ))
  const best = readyReports.reduce((winner, report) => (
    report.coefficientOfVariation !== null &&
    winner.coefficientOfVariation !== null &&
    report.coefficientOfVariation < winner.coefficientOfVariation
      ? report
      : winner
  ), primary)

  if (best.candidate !== primaryAnchor && best.coefficientOfVariation !== null) {
    return {
      comparisonStatus: readyReports.length === reports.length ? 'complete_comparison' : 'partial_comparison',
      decision: 'replacement_review_required',
      issueProposal: {
        title: `TLI 앵커 후보 재검토: ${best.candidate}`,
        labels: ['tli', 'anchor-review'],
        candidate: best.candidate,
        candidateCv: best.coefficientOfVariation,
        primaryAnchor,
        primaryCv: primary.coefficientOfVariation,
      },
    }
  }

  if (readyReports.length === reports.length) {
    return { comparisonStatus: 'complete_comparison', decision: 'confirm_primary_anchor', issueProposal: null }
  }

  return {
    comparisonStatus: readyReports.length === 1 ? 'primary_only' : 'partial_comparison',
    decision: 'primary_only_report',
    issueProposal: null,
  }
}

export function buildAnchorStabilityReport(
  input: BuildAnchorStabilityReportInput,
): AnchorStabilityReport {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS
  const primaryAnchor = input.primaryAnchor ?? ANCHOR_KEYWORD
  const candidates = input.candidates ?? ANCHOR_CANDIDATES
  const { startDate, endDate } = getAnchorStabilityWindow(input.asOfDate, windowDays)
  const candidateReports = candidates.map((candidate) => (
    buildCandidateReport(input.observations, candidate, startDate, endDate, windowDays)
  ))
  const decision = chooseDecision(candidateReports, primaryAnchor)

  return {
    reportVersion: 'tli-anchor-stability-report-v1',
    asOfDate: input.asOfDate,
    windowStart: startDate,
    windowEnd: endDate,
    windowDays,
    primaryAnchor,
    candidates: candidateReports,
    ...decision,
  }
}
