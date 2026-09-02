import {
  canonicalJsonV1Sha256,
  compareUtf8Bytes,
  sha256JsonStringArray,
  type JsonObject,
} from '@/lib/tli/canonical-json'

export const ORIGIN_ELIGIBILITY_RULE_VERSION = 'origin-eligibility-v2'
export const ORIGIN_USABLE_COVERAGE_FLOOR = 0.7
export const ORIGIN_ROSTER_LOOKBACK_DAYS = 7
export const ORIGIN_LABEL_MATURITY_GRACE_TRADING_DAYS = 3
export const ORIGIN_LABEL_SOURCE_GAP_SLA = 0.01

export type OriginEligibilityReason =
  | 'label_accounting_incomplete'
  | 'label_source_gap_above_sla'
  | 'roster_empty'
  | 'unknown_theme_in_manifest'
  | 'usable_coverage_below_floor'

export interface OriginLabelAccounting {
  readonly terminal: number
  readonly pending: number
  readonly sourceGap: number
}

export interface OriginEligibilityInput {
  readonly originDate: string
  readonly forecastCutoff: string
  readonly rosterThemeIds: readonly string[]
  readonly expectedThemeIds: readonly string[]
  readonly usableThemeIds: readonly string[]
  readonly matured: boolean
  readonly labelAccounting: OriginLabelAccounting | null
}

export interface OriginEligibilityEvidence extends JsonObject {
  readonly roster_theme_ids_sha256: string
  readonly expected_theme_ids_sha256: string
  readonly usable_theme_ids_sha256: string
  readonly label_accounting: {
    readonly terminal: number | null
    readonly pending: number | null
    readonly source_gap: number | null
  }
}

export interface OriginEligibilityResult {
  readonly ruleVersion: typeof ORIGIN_ELIGIBILITY_RULE_VERSION
  readonly originDate: string
  readonly forecastCutoff: string
  readonly verdict: 'eligible' | 'ineligible'
  readonly rosterThemeCount: number
  readonly expectedThemeCount: number
  readonly usableThemeCount: number
  readonly usableCoverage: number
  readonly unknownThemeCount: number
  readonly missingThemeCount: number
  readonly matured: boolean
  readonly labelTerminalCount: number | null
  readonly labelPendingCount: number | null
  readonly labelSourceGapCount: number | null
  readonly reasons: readonly OriginEligibilityReason[]
  readonly evidence: OriginEligibilityEvidence
  readonly payloadSha256: string
}

const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareUtf8Bytes)

export const evaluateOriginEligibility = (
  input: OriginEligibilityInput,
): OriginEligibilityResult => {
  const rosterThemeIds = sortedUnique(input.rosterThemeIds)
  const expectedThemeIds = sortedUnique(input.expectedThemeIds)
  const usableThemeIds = sortedUnique(input.usableThemeIds)
  const rosterSet = new Set(rosterThemeIds)
  const expectedSet = new Set(expectedThemeIds)
  const unknownThemeCount = expectedThemeIds.filter((themeId) => !rosterSet.has(themeId)).length
  const missingThemeCount = rosterThemeIds.filter((themeId) => !expectedSet.has(themeId)).length
  const usableCoverage = rosterThemeIds.length === 0 ? 0 : usableThemeIds.length / rosterThemeIds.length
  const reasons: OriginEligibilityReason[] = []

  if (rosterThemeIds.length === 0) reasons.push('roster_empty')
  if (unknownThemeCount > 0) reasons.push('unknown_theme_in_manifest')
  if (usableCoverage < ORIGIN_USABLE_COVERAGE_FLOOR) reasons.push('usable_coverage_below_floor')

  const labelTerminalCount = input.labelAccounting?.terminal ?? null
  const labelPendingCount = input.labelAccounting?.pending ?? null
  const labelSourceGapCount = input.labelAccounting?.sourceGap ?? null

  if (input.matured) {
    if (labelTerminalCount === null || labelTerminalCount < expectedThemeIds.length) {
      reasons.push('label_accounting_incomplete')
    }
    if (
      labelSourceGapCount !== null
      && expectedThemeIds.length > 0
      && labelSourceGapCount / expectedThemeIds.length > ORIGIN_LABEL_SOURCE_GAP_SLA
    ) {
      reasons.push('label_source_gap_above_sla')
    }
  }

  reasons.sort(compareUtf8Bytes)
  const evidence: OriginEligibilityEvidence = {
    roster_theme_ids_sha256: sha256JsonStringArray(rosterThemeIds),
    expected_theme_ids_sha256: sha256JsonStringArray(expectedThemeIds),
    usable_theme_ids_sha256: sha256JsonStringArray(usableThemeIds),
    label_accounting: {
      terminal: labelTerminalCount,
      pending: labelPendingCount,
      source_gap: labelSourceGapCount,
    },
  }
  const verdict = reasons.length === 0 ? 'eligible' : 'ineligible'
  const payload = {
    rule_version: ORIGIN_ELIGIBILITY_RULE_VERSION,
    origin_date: input.originDate,
    forecast_cutoff: input.forecastCutoff,
    verdict,
    roster_theme_count: rosterThemeIds.length,
    expected_theme_count: expectedThemeIds.length,
    usable_theme_count: usableThemeIds.length,
    usable_coverage: usableCoverage,
    unknown_theme_count: unknownThemeCount,
    missing_theme_count: missingThemeCount,
    matured: input.matured,
    label_terminal_count: labelTerminalCount,
    label_pending_count: labelPendingCount,
    label_source_gap_count: labelSourceGapCount,
    reasons,
    evidence,
  } satisfies JsonObject

  return {
    ruleVersion: ORIGIN_ELIGIBILITY_RULE_VERSION,
    originDate: input.originDate,
    forecastCutoff: input.forecastCutoff,
    verdict,
    rosterThemeCount: rosterThemeIds.length,
    expectedThemeCount: expectedThemeIds.length,
    usableThemeCount: usableThemeIds.length,
    usableCoverage,
    unknownThemeCount,
    missingThemeCount,
    matured: input.matured,
    labelTerminalCount,
    labelPendingCount,
    labelSourceGapCount,
    reasons,
    evidence,
    payloadSha256: canonicalJsonV1Sha256(payload),
  }
}
