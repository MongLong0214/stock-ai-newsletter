import { readFileSync } from 'node:fs'

import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'
import { buildConfirmatoryFeatureVector } from '../../../lib/tli/features/build-confirmatory-features'
import type { M1ModelArtifactV2 } from '../../../lib/tli/model/m1'
import { loadM1ArtifactFromJsonFile } from '../../../lib/tli/model/predict'
import { runScientificM1OfflineEvaluation } from '../learn/run-scientific-m1-eval'
import { buildScientificM1EvaluationPlan } from '../learn/offline-eval-scientific-m1'
import { parseScientificM1StudyInput } from '../learn/scientific-m1-input'
import { computeStudyOriginScheduleSha256 } from '../learn/offline-eval-study-lock'
import type { FixtureOriginStack } from './fixture-origins'
import { CYCLE_ID, STUDY_CONTRACT_ID } from './fixture-identities'
import type { TrainingFixtureData } from './fixture-study-data'

export interface TrainingRun {
  readonly artifact: M1ModelArtifactV2
  readonly artifactJson: string
  readonly artifactSha256: string
  readonly calibrationArtifactSha256: string
  readonly intervalEnsembleSha256: string
  readonly featureSnapshotCount: number
  readonly featureAbstainCount: number
  readonly futureLeakageCount: number
  readonly report: ReturnType<typeof runScientificM1OfflineEvaluation>['report']
}

export async function trainAndEvaluate(input: {
  readonly stack: FixtureOriginStack
  readonly data: TrainingFixtureData
  readonly workDir: string
}): Promise<TrainingRun> {
  const origins = input.stack.trainingOrigins.map((origin) => ({
    originDate: origin.originDate,
    forecastCutoff: origin.forecastCutoff,
  }))
  const study = parseScientificM1StudyInput({
    cycleId: CYCLE_ID,
    dataset: input.data.dataset,
    origins,
    featureInputs: input.data.featureInputs,
  })
  const studyLock = {
    studyContractId: STUDY_CONTRACT_ID,
    studyContractSha256: input.stack.studyContractSha256,
    studyOriginScheduleSha256: computeStudyOriginScheduleSha256({
      studyContractId: STUDY_CONTRACT_ID,
      studyContractSha256: input.stack.studyContractSha256,
      studyOriginSchedule: origins,
    }),
  }
  const plan = buildScientificM1EvaluationPlan(study)
  const futureLeakageCount = plan.outerFolds.reduce((total, fold) => total + fold.trainingDataset.rows.filter((row) => {
    const joined = plan.rows.find((candidate) => (
      candidate.themeId === row.theme_id && candidate.baseDate === row.base_date
    ))
    const maximumFuture = joined === undefined ? undefined : [...joined.futureDates].sort().at(-1)
    return maximumFuture === undefined || maximumFuture >= fold.testOrigin.originDate
  }).length, 0)
  const result = runScientificM1OfflineEvaluation({
    study,
    studyLock,
    workDir: input.workDir,
    trainedAt: input.data.cutoff.slice(0, 10),
  })
  const artifactPath = `${input.workDir}/training/prospective/artifact.json`
  const artifact = await loadM1ArtifactFromJsonFile(artifactPath)
  const artifactJson = readFileSync(artifactPath, 'utf8')
  const snapshots = input.data.featureInputs.map(buildConfirmatoryFeatureVector)
  return {
    artifact,
    artifactJson,
    artifactSha256: result.report.prospective.artifactSha256,
    calibrationArtifactSha256: canonicalJsonV1Sha256({
      sourceArtifactSha256: result.report.prospective.artifactSha256,
      calibrator: artifact.calibrator,
      calibrationContract: artifact.calibration_contract,
    }),
    intervalEnsembleSha256: canonicalJsonV1Sha256(result.report.intervalEnsemble),
    featureSnapshotCount: snapshots.length,
    featureAbstainCount: snapshots.filter((snapshot) => snapshot.abstain).length,
    futureLeakageCount,
    report: result.report,
  }
}
