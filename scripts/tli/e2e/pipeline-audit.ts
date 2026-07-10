import type { ConfirmatoryFeatureInput } from '../../../lib/tli/features/build-confirmatory-features'
import type { LeakageAudit, ExactFiveAudit } from './contracts'
import { STUDY_CONTRACT_ID } from './fixture-identities'
import type { FixtureOriginStack } from './fixture-origins'
import type { TrainingFixtureData } from './fixture-study-data'
import type { ProspectivePanel } from './prospective-panel'
import type { GateRun } from './run-gates'

export interface DatasetAuditResult {
  readonly exactFive: ExactFiveAudit
  readonly duplicate: number
  readonly missing: number
  readonly repeatBytesEqual: boolean
  readonly repeatManifestHashEqual: boolean
  readonly currentMembershipLeakage: number
  readonly postOutcomeSource: number
  readonly mixedStudy: number
}

const timestampAfterCutoff = (value: string | null, cutoff: number): boolean => (
  value !== null && Date.parse(value) > cutoff
)

const sourceDateAfterOrigin = (value: string | null, originDate: string): boolean => (
  value !== null && value > originDate
)

const hasPostOutcomeFeatureSource = (feature: ConfirmatoryFeatureInput): boolean => {
  const cutoff = Date.parse(feature.cutoffAt)
  return !Number.isFinite(cutoff)
    || timestampAfterCutoff(feature.interestRun?.completedAt ?? null, cutoff)
    || sourceDateAfterOrigin(feature.interestRun?.sourceMaxDate ?? null, feature.baseDate)
    || feature.interestObservations.some((row) => row.tradingDate > feature.baseDate)
    || feature.newsRuns.some((run) => (
      timestampAfterCutoff(run.collectedAt, cutoff)
      || timestampAfterCutoff(run.completedAt, cutoff)
      || sourceDateAfterOrigin(run.sourceMaxDate, feature.baseDate)
    ))
    || feature.newsObservations.some((row) => (
      row.articleDate > feature.baseDate || timestampAfterCutoff(row.collectedAt, cutoff)
    ))
    || timestampAfterCutoff(feature.bablObservation?.computedAt ?? null, cutoff)
    || sourceDateAfterOrigin(feature.bablObservation?.snapshotDate ?? null, feature.baseDate)
}

const containsCurrentMembershipField = (feature: ConfirmatoryFeatureInput): boolean => (
  /"(?:current_?membership|is_active|active_membership)"/i.test(JSON.stringify(feature))
)

export function auditDataset(
  data: TrainingFixtureData,
  stack: FixtureOriginStack,
): DatasetAuditResult {
  const uniqueKeys = new Set(data.dataset.rows.map((row) => (
    `${row.baseDate}|${row.themeId}|${row.horizonDays}`
  ))).size
  const exactFive = {
    eligible: data.exactFiveRows,
    total: data.dataset.rows.length,
    rate: data.dataset.rows.length === 0 ? 0 : data.exactFiveRows / data.dataset.rows.length,
  }
  const bindingByForecast = new Map(stack.trainingOrigins.map((origin) => (
    [origin.forecastManifestId, origin.studyOriginManifestId] as const
  )))
  const mixedRows = data.dataset.rows.filter((row) => (
    bindingByForecast.get(row.forecastOriginManifestId) !== row.studyOriginManifestId
  )).length
  const manifestStudyMismatch = data.dataset.manifest.study_contract_id === STUDY_CONTRACT_ID
    && data.dataset.manifest.study_contract_sha256 === stack.studyContractSha256 ? 0 : 1
  const featureStudyMismatch = data.featureInputs.filter((feature) => (
    feature.studyContractId !== STUDY_CONTRACT_ID
    || feature.studyContractSha256 !== stack.studyContractSha256
  )).length
  return {
    exactFive,
    duplicate: data.dataset.rows.length - uniqueKeys,
    missing: data.missingRows,
    repeatBytesEqual: JSON.stringify(data.dataset) === JSON.stringify(data.repeatedDataset),
    repeatManifestHashEqual: data.dataset.manifestSha256 === data.repeatedDataset.manifestSha256,
    currentMembershipLeakage: data.featureInputs.filter(containsCurrentMembershipField).length,
    postOutcomeSource: data.featureInputs.filter(hasPostOutcomeFeatureSource).length,
    mixedStudy: mixedRows + manifestStudyMismatch + featureStudyMismatch,
  }
}

export const mergeDatasetAudit = (
  audit: LeakageAudit,
  result: DatasetAuditResult,
): LeakageAudit => ({
  ...audit,
  duplicate: result.duplicate,
  missing: result.missing,
  currentMembershipLeakage: result.currentMembershipLeakage,
  postOutcomeSource: result.postOutcomeSource,
  mixedStudy: result.mixedStudy,
})

export const mergeProspectiveAudit = (
  audit: LeakageAudit,
  panel: ProspectivePanel,
  gates: GateRun,
): LeakageAudit => ({
  ...audit,
  crossCycleRoleJoin: panel.crossCycleRoleJoinCount,
  v1Mix: panel.v1MixCount,
  nullToFalse: panel.nullToFalseCount,
  challengerReplacement: gates.registryMutationCount,
})
