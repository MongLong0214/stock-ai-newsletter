import { canonicalJsonV1Sha256, type JsonObject } from '../../../lib/tli/canonical-json'
import type { AttentionStudyContract } from '../collectors/babl-phase-snapshot'
import { buildStudyContractPayload } from '../origins/lock-study-contract'
import type { ForecastThemeSource, StudyBablCandidate } from '../origins/forecast-origin-manifest'
import { runMondayOrigins } from '../origins/run-monday-origins'
import {
  deterministicUuid,
  FEATURE_CONTRACT_SHA256,
  LABEL_CONTRACT_SHA256,
  sha256Identity,
  STUDY_CONTRACT_ID,
  THEME_IDS,
} from './fixture-identities'

export interface FixtureOriginRef {
  readonly originDate: string
  readonly forecastCutoff: string
  readonly forecastManifestId: string
  readonly forecastManifestSha256: string
  readonly studyOriginManifestId: string
  readonly studyOriginManifestSha256: string
}

export interface FixtureOriginStack {
  readonly studyContractPayload: JsonObject
  readonly studyContractSha256: string
  readonly studyLockedAt: string
  readonly universalOriginCount: number
  readonly trainingSelectionRule: 'first_13_then_one_week_embargo_then_next_13'
  readonly trainingOrigins: readonly FixtureOriginRef[]
  readonly prospectiveOrigins: readonly FixtureOriginRef[]
}

const themeSources = (originDate: string): ForecastThemeSource[] => THEME_IDS.map((themeId) => ({
  themeId,
  keywordGroupSpec: { group_name: `fixture-${themeId}`, keywords: [`fixture-${themeId}`] },
  interestRun: {
    id: deterministicUuid('origin-interest-run', `${originDate}:${themeId}`),
    responseSha256: sha256Identity('origin-interest-response', `${originDate}:${themeId}`),
  },
  newsObservationIds: Array.from({ length: 14 }, (_unused, index) => (
    deterministicUuid('origin-news', `${originDate}:${themeId}:${index}`)
  )),
}))

const bablCandidates = (originDate: string): Map<string, StudyBablCandidate[]> => new Map(
  THEME_IDS.map((themeId) => [themeId, [{
    observationId: deterministicUuid('origin-babl', `${originDate}:${themeId}`),
    payloadHash: sha256Identity('origin-babl-payload', `${originDate}:${themeId}`),
    candidatePool: 'archetype',
    sourceRunComplete: true,
    withinCutoff: true,
    poolMatchesSource: true,
  }]]),
)

const withoutOriginRunnerLogs = async <T>(run: () => Promise<T>): Promise<T> => {
  const originalLog = console.log
  console.log = () => undefined
  try {
    return await run()
  } finally {
    console.log = originalLog
  }
}

export async function buildFixtureOriginStack(): Promise<FixtureOriginStack> {
  const studyContractPayload = buildStudyContractPayload({
    studyId: STUDY_CONTRACT_ID,
    firstOriginDate: '2026-07-13',
    bablAlgorithmVersion: 'b-abl-v4',
    bablControlRowId: deterministicUuid('babl-control', 'todo-15'),
    bablControlSha256: sha256Identity('babl-control', 'todo-15'),
    labelContractSha256: LABEL_CONTRACT_SHA256,
    featureContractSha256: FEATURE_CONTRACT_SHA256,
  })
  const studyContractSha256 = canonicalJsonV1Sha256(studyContractPayload)
  const studyLockedAt = '2026-07-01T00:00:00.000Z'
  const study: AttentionStudyContract = {
    id: STUDY_CONTRACT_ID,
    locked_at: studyLockedAt,
    first_origin_date: '2026-07-13',
    babl_algorithm_version: 'b-abl-v4',
    babl_comparison_spec_version: 'comparison-v4-spec-v1',
    babl_evaluation_horizon_days: 14,
  }
  const forecastHashes = new Map<string, string>()
  const studyHashes = new Map<string, string>()
  const report = await withoutOriginRunnerLogs(() => runMondayOrigins('2027-12-20', {
    now: new Date('2027-12-21T00:00:00.000Z'),
    loadExistingForecastOrigins: async () => [],
    loadExistingStudyBindings: async () => [],
    loadThemeSources: async ({ originDate }) => themeSources(originDate),
    loadStudies: async () => [study],
    loadBablCandidates: async ({ originDate }) => bablCandidates(originDate),
    createForecastManifest: async (payload) => {
      const originDate = String(payload.origin_date)
      const id = deterministicUuid('forecast-manifest', originDate)
      forecastHashes.set(id, canonicalJsonV1Sha256(payload))
      return id
    },
    bindStudyOrigin: async (payload) => {
      const forecastId = String(payload.forecast_origin_manifest_id)
      const id = deterministicUuid('study-origin-manifest', forecastId)
      studyHashes.set(id, canonicalJsonV1Sha256(payload))
      return id
    },
  }))
  const refs = report.origins.map((origin): FixtureOriginRef => {
    const studyOriginManifestId = origin.studyOriginManifestIds.at(0)
    const forecastManifestSha256 = forecastHashes.get(origin.forecastManifestId)
    if (studyOriginManifestId === undefined || forecastManifestSha256 === undefined) {
      throw new Error(`origin ${origin.originDate} did not produce both clean manifests`)
    }
    const studyOriginManifestSha256 = studyHashes.get(studyOriginManifestId)
    if (studyOriginManifestSha256 === undefined) throw new Error(`study origin hash missing for ${origin.originDate}`)
    return {
      originDate: origin.originDate,
      forecastCutoff: `${origin.originDate}T09:00:00.000Z`,
      forecastManifestId: origin.forecastManifestId,
      forecastManifestSha256,
      studyOriginManifestId,
      studyOriginManifestSha256,
    }
  })
  const trainingOrigins = [...refs.slice(0, 13), ...refs.slice(14, 27)]
  const lastTraining = trainingOrigins.at(-1)
  if (trainingOrigins.length !== 26 || lastTraining === undefined) {
    throw new Error(`fixture requires 26 predeclared training origins, received ${trainingOrigins.length}`)
  }
  const lastIndex = refs.findIndex((origin) => origin.originDate === lastTraining.originDate)
  const prospectiveOrigins = refs.slice(lastIndex + 2, lastIndex + 26)
  if (prospectiveOrigins.length !== 24) {
    throw new Error(`fixture requires 24 post-training origins, received ${prospectiveOrigins.length}`)
  }
  return {
    studyContractPayload,
    studyContractSha256,
    studyLockedAt,
    universalOriginCount: refs.length,
    trainingSelectionRule: 'first_13_then_one_week_embargo_then_next_13',
    trainingOrigins,
    prospectiveOrigins,
  }
}
