import type { DriftBaselineMaturityAssessment } from './drift-baseline'

interface AutoHoldMetricSnapshot {
  relevanceBaseRate: number
  ece: number
  censoringRatio: number
  candidateConcentrationGini: number
  supportBucketPrecision: {
    high: number
    medium: number
    low: number
  }
}

export interface AutoHoldDecision {
  shouldHold: boolean
  holdState: 'active' | 'inactive' | 'observation_only'
  triggeredRules: string[]
  holdReportDate: string
}

export function evaluateAutoHoldDecision(input: {
  baselineMaturity: DriftBaselineMaturityAssessment
  calibrationArtifactPresent: boolean
  current: AutoHoldMetricSnapshot
  baseline: AutoHoldMetricSnapshot
  reportDate: string
}): AutoHoldDecision {
  if (!input.baselineMaturity.autoHoldEnabled) {
    return {
      shouldHold: false,
      holdState: 'observation_only',
      triggeredRules: [],
      holdReportDate: input.reportDate,
    }
  }

  const triggeredRules: string[] = []
  const absoluteBaseRateShift = Math.abs(input.current.relevanceBaseRate - input.baseline.relevanceBaseRate)
  const relativeBaseRateShift = input.baseline.relevanceBaseRate === 0
    ? (absoluteBaseRateShift > 0 ? Number.POSITIVE_INFINITY : 0)
    : absoluteBaseRateShift / input.baseline.relevanceBaseRate

  if (!input.calibrationArtifactPresent) triggeredRules.push('missing_calibration_artifact')
  if (input.current.ece > input.baseline.ece + 0.03) triggeredRules.push('ece_threshold')
  if (absoluteBaseRateShift > 0.02 && relativeBaseRateShift > 0.5) triggeredRules.push('base_rate_shift')
  if (input.current.censoringRatio > input.baseline.censoringRatio + 0.10) triggeredRules.push('censoring_ratio_threshold')
  if (input.current.candidateConcentrationGini > input.baseline.candidateConcentrationGini + 0.05) {
    triggeredRules.push('candidate_concentration_gini_threshold')
  }
  if (input.current.supportBucketPrecision.low < input.baseline.supportBucketPrecision.low - 0.05) {
    triggeredRules.push('low_support_bucket_precision')
  }

  return {
    shouldHold: triggeredRules.length > 0,
    holdState: triggeredRules.length > 0 ? 'active' : 'inactive',
    triggeredRules,
    holdReportDate: input.reportDate,
  }
}
