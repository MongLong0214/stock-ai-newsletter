import type { ConfirmatoryFeatureSnapshot } from '../../../lib/tli/features/build-confirmatory-features'
import type {
  CycleProbe,
  DryRunFixture,
  DryRunStage,
  ExactFiveAudit,
} from './contracts'
import type { DatasetAuditResult } from './pipeline-audit'
import type { CycleFreezeContract } from './cycle-freeze-contract'
import type { FixtureOriginStack } from './fixture-origins'
import type { TrainingFixtureData } from './fixture-study-data'
import type { ProspectivePanel } from './prospective-panel'
import type { GateRun } from './run-gates'
import type { TrainingRun } from './train-evaluate'
import type { CycleFreezeReceipt, StudyLockReceipt } from './scratch-postgres'

export const studyLockStage = (
  stack: FixtureOriginStack,
  receipt: StudyLockReceipt,
): DryRunStage => {
  const firstOrigin = stack.trainingOrigins.at(0)
  const lockedBeforeFirstOrigin = firstOrigin !== undefined
    && Date.parse(stack.studyLockedAt) < Date.parse(firstOrigin.forecastCutoff)
  return {
    name: 'study_lock',
    status: lockedBeforeFirstOrigin
      && receipt.lockedBeforeFirstOrigin
      && receipt.payloadSha256 === stack.studyContractSha256 ? 'pass' : 'no_go',
    summary: {
      studyContractSha256: stack.studyContractSha256,
      lockedAt: stack.studyLockedAt,
      firstOriginDate: firstOrigin?.originDate ?? null,
      lockedBeforeFirstOrigin,
      postgresReadback: receipt,
    },
  }
}

export const originsStage = (stack: FixtureOriginStack): DryRunStage => ({
  name: 'origins',
  status: 'pass',
  summary: {
    universalCleanMondayOrigins: stack.universalOriginCount,
    retrospectiveOrigins: stack.trainingOrigins.length,
    prospectiveOrigins: stack.prospectiveOrigins.length,
    retrospectiveSelectionRule: stack.trainingSelectionRule,
    expectedThemeCount: 12,
  },
})

export const gtaStage = (exactFive: ExactFiveAudit): DryRunStage => ({
  name: 'gta_v2',
  status: exactFive.rate === 1 ? 'pass' : 'no_go',
  summary: {
    labelerVersion: 'gta-v2',
    exactFiveEligible: exactFive.eligible,
    exactFiveTotal: exactFive.total,
    exactFiveRate: exactFive.rate,
  },
})

export const datasetStage = (input: {
  readonly fixture: DryRunFixture
  readonly data: TrainingFixtureData
  readonly audit: DatasetAuditResult
}): DryRunStage => ({
  name: 'dataset',
  status: input.audit.missing === 0
    && input.audit.duplicate === 0
    && input.audit.repeatBytesEqual
    && input.audit.repeatManifestHashEqual
    && input.audit.mixedStudy === 0
      ? 'pass'
      : input.fixture === 'missing-source' ? 'fail_closed' : 'no_go',
  summary: {
    expectedRows: input.data.expectedRows,
    loadedRows: input.data.dataset.rows.length,
    duplicate: input.audit.duplicate,
    missing: input.audit.missing,
    mixedStudy: input.audit.mixedStudy,
    manifestSha256: input.data.dataset.manifestSha256,
    repeatBytesEqual: input.audit.repeatBytesEqual,
    repeatManifestHashEqual: input.audit.repeatManifestHashEqual,
    cutoff: input.data.cutoff,
  },
})

export const featuresStage = (
  snapshots: readonly ConfirmatoryFeatureSnapshot[],
  audit: DatasetAuditResult,
): DryRunStage => ({
  name: 'features',
  status: snapshots.every((snapshot) => !snapshot.abstain)
    && audit.currentMembershipLeakage === 0
    && audit.postOutcomeSource === 0 ? 'pass' : 'no_go',
  summary: {
    snapshotCount: snapshots.length,
    abstainCount: snapshots.filter((snapshot) => snapshot.abstain).length,
    uniqueSnapshotHashes: new Set(snapshots.map((snapshot) => snapshot.featureSnapshotSha256)).size,
    currentMembershipLeakage: audit.currentMembershipLeakage,
    currentMembershipBasis: 'confirmatory_feature_contract_has_no_current_membership_field',
    postOutcomeSource: audit.postOutcomeSource,
  },
})

export const trainingStage = (training: TrainingRun): DryRunStage => ({
  name: 'train_evaluate',
  status: training.futureLeakageCount === 0 ? 'pass' : 'no_go',
  summary: {
    originCount: training.report.originCount,
    outerFoldCount: training.report.outerFoldCount,
    predictionCount: training.report.predictions.length,
    artifactSha256: training.artifactSha256,
    pairedDeltaBrier: training.report.pairedInference.delta_brier.point,
    pairedUpper99: training.report.pairedInference.delta_brier.upper_99,
    positiveSkill: training.report.promotionDecision.positiveSkill,
    intervalAccepted: training.report.intervalEnsemble.accepted.length,
    futureLeakage: training.futureLeakageCount,
  },
})

export const cycleFreezeStage = (input: {
  readonly stack: FixtureOriginStack
  readonly data: TrainingFixtureData
  readonly training: TrainingRun
  readonly contract: CycleFreezeContract
  readonly receipt: CycleFreezeReceipt
}): DryRunStage => {
  const exact = input.receipt.status === 'frozen'
    && input.receipt.freezeRpc === 'freeze_tli_cycle'
    && input.receipt.evidenceArtifactCount === 4
    && input.receipt.evidenceAttestationCount === 4
    && input.receipt.hashBundleExact
    && input.receipt.cycleId === input.contract.cycleId
    && input.receipt.sourceDatasetManifestSha256 === input.contract.sourceDatasetManifestSha256
    && input.receipt.datasetManifestSha256 === input.contract.datasetManifestSha256
    && input.receipt.modelManifestSha256 === input.contract.modelManifestSha256
    && input.receipt.cycleManifestSha256 === input.contract.cycleManifestSha256
  return {
  name: 'cycle_freeze',
  status: exact ? 'pass' : 'no_go',
  summary: {
    plannedOriginFixtures: [16, 24],
    studyContractSha256: input.stack.studyContractSha256,
    sourceDatasetManifestSha256: input.data.dataset.manifestSha256,
    datasetManifestSha256: input.contract.datasetManifestSha256,
    modelManifestSha256: input.contract.modelManifestSha256,
    cycleManifestSha256: input.contract.cycleManifestSha256,
    candidateModelSha256: input.training.artifactSha256,
    calibrationArtifactSha256: input.training.calibrationArtifactSha256,
    intervalEnsembleSha256: input.training.intervalEnsembleSha256,
    promotionEnabled: process.env.TLI_M1_PROMOTION_ENABLED === 'true',
    exposureEnabled: process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED === 'true',
    postgresReadback: input.receipt,
    localFixtureAttestation: 'content-addressed blob hash; no production Git claim',
  },
  }
}

export const panelStages = (panel: ProspectivePanel): readonly [DryRunStage, DryRunStage] => [{
  name: 'predict',
  status: panel.rolePairViolationCount === 0
    && panel.featureSnapshotMismatchCount === 0
    && panel.replayEnvelopeByteMatch === 'pass'
    && panel.replayEnvelopeChecks === panel.rows.length ? 'pass' : 'no_go',
  summary: {
    originCount: panel.scoredOriginCount,
    themeCount: 12,
    candidatePredictionCount: panel.rows.length,
    comparatorPredictionCount: panel.rows.length,
    roleRowsPerTheme: 2,
    rolePairViolationCount: panel.rolePairViolationCount,
    featureSnapshotMismatchCount: panel.featureSnapshotMismatchCount,
    crossCycleRoleJoinCount: panel.crossCycleRoleJoinCount,
    intervalPolicy: 'block_bootstrap_envelope_v1',
    replayByteMatch: {
      status: panel.replayEnvelopeByteMatch,
      checkedCandidateRows: panel.replayEnvelopeChecks,
      expectedCandidateRows: panel.rows.length,
      criticalIncidentCount: 0,
    },
  },
}, {
  name: 'label_score',
  status: panel.completedFinalizations === panel.plannedFinalizations
    && panel.v1MixCount === 0
    && panel.nullToFalseCount === 0 ? 'pass' : 'no_go',
  summary: {
    gtaV2LabelCount: panel.rows.length,
    plannedFinalizations: panel.plannedFinalizations,
    completedFinalizations: panel.completedFinalizations,
    v1Mix: panel.v1MixCount,
    nullToFalse: panel.nullToFalseCount,
  },
}]

export const gateExpected = (fixture: DryRunFixture, gates: GateRun): boolean => (
  fixture === 'happy'
    ? gates.final16.action === 'would_promote' && gates.final24.action === 'would_promote'
    : gates.final16.action === 'keep_champion' && gates.final24.action === 'keep_champion'
)

export const gateStage = (fixture: DryRunFixture, gates: GateRun): DryRunStage => ({
  name: 'gate',
  status: gateExpected(fixture, gates) && fixture === 'happy' ? 'pass' : 'no_go',
  summary: {
    planned16: { decision: gates.final16.decision, action: gates.final16.action, reasons: gates.final16.reasons },
    planned24: { decision: gates.final24.decision, action: gates.final24.action, reasons: gates.final24.reasons },
    recording16: gates.recording16,
    recording24: gates.recording24,
    registryMutationCount: gates.registryMutationCount,
    primaryCycleId: gates.primaryCycleId,
    primaryIdentityMismatchCount: gates.primaryIdentityMismatchCount,
    completeness: gates.final24.completeness,
    candidateBrier: gates.final24.metrics.candidateBrier,
    comparatorBrier: gates.final24.metrics.comparatorBrier,
  },
})

export const cycleContractsSatisfied = (
  fixture: DryRunFixture,
  probes: readonly CycleProbe[],
): boolean => probes.every((probe) => (
  probe.observedOrigins === probe.plannedOrigins
    ? probe.action === (fixture === 'happy' ? 'would_promote' : 'keep_champion')
    : probe.action !== 'would_promote'
))

export const buildMetrics = (
  training: TrainingRun,
  gates: GateRun,
): Readonly<Record<string, unknown>> => ({
  retrospectiveCandidateBrier: training.report.binaryMetrics.raw.brier,
  retrospectiveDeltaBrier: training.report.pairedInference.delta_brier.point,
  retrospectivePositiveSkill: training.report.promotionDecision.positiveSkill,
  prospectiveCandidateBrier: gates.final24.metrics.candidateBrier,
  prospectiveComparatorBrier: gates.final24.metrics.comparatorBrier,
  coverage: gates.final24.completeness.pooledCoverage,
  completeness: gates.final24.completeness.pooledRatio,
  terminalAccounting: gates.final24.completeness.terminalAccountingRatio,
})
