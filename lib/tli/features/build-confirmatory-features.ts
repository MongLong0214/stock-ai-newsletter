import { canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json'
import { avg, linearRegressionSlope } from '@/lib/tli/normalize'

import {
  resolveBablSource,
  resolveInterestSource,
  resolveNewsSource,
} from './confirmatory-feature-sources'
import {
  CONFIRMATORY_FEATURE_NAMES,
  type ConfirmatoryFeatureInput,
  type ConfirmatoryFeatureProvenance,
  type ConfirmatoryFeatureSnapshot,
} from './confirmatory-feature-types'

export * from './confirmatory-feature-types'

type FormulaSlot = {
  readonly value: number
  readonly missing: boolean
}

const missingSlot = (): FormulaSlot => ({ value: 0, missing: true })

const finiteSlot = (value: number | null): FormulaSlot =>
  value === null || !Number.isFinite(value)
    ? missingSlot()
    : { value, missing: false }

const readFiniteWindow = (
  values: readonly (number | null)[],
  start: number,
  end: number,
): number[] | null => {
  const window = values.slice(start, end)
  if (window.length !== end - start) return null

  const finiteValues: number[] = []
  for (const value of window) {
    if (value === null || !Number.isFinite(value)) return null
    finiteValues.push(value)
  }
  return finiteValues
}

const calculateDvi = (values: number[] | null): number | null => {
  if (values === null || values.length !== 8) return null

  let upTotal = 0
  let downTotal = 0
  for (let index = 1; index < values.length; index++) {
    const currentValue = values.at(index)
    const previousValue = values.at(index - 1)
    if (currentValue === undefined || previousValue === undefined) return null
    const delta = currentValue - previousValue
    if (delta > 0) upTotal += delta
    if (delta < 0) downTotal += Math.abs(delta)
  }

  const averageUp = upTotal / 7
  const averageDown = downTotal / 7
  if (averageUp === 0 && averageDown === 0) return 0.5
  if (averageDown === 0) return 1
  return averageUp / (averageUp + averageDown)
}

const calculateDrawdown = (values: number[] | null): number | null => {
  if (values === null || values.length !== 20) return null
  const maximum = Math.max(...values)
  if (maximum === 0) return null
  const latestValue = values.at(-1)
  if (latestValue === undefined) return null
  return (maximum - latestValue) / maximum
}

const calculateInterestSlots = (
  rawValues: readonly (number | null)[],
): readonly FormulaSlot[] => {
  const lastTwenty = readFiniteWindow(rawValues, 0, 20)
  const priorReturnWindow = readFiniteWindow(rawValues, 7, 10)
  const lastEight = readFiniteWindow(rawValues, 12, 20)
  const lastSeven = readFiniteWindow(rawValues, 13, 20)
  const lastThree = readFiniteWindow(rawValues, 17, 20)

  const sevenDaySlope = lastSeven === null
    ? null
    : linearRegressionSlope(lastSeven) / Math.max(avg(lastSeven), 1)
  const interestAcceleration = lastThree === null || sevenDaySlope === null
    ? null
    : linearRegressionSlope(lastThree) / Math.max(avg(lastThree), 1)
      - sevenDaySlope
  const interestReturn = lastThree === null || priorReturnWindow === null
    ? null
    : Math.log((avg(lastThree) + 1) / (avg(priorReturnWindow) + 1))

  return [
    finiteSlot(sevenDaySlope),
    finiteSlot(interestAcceleration),
    finiteSlot(calculateDvi(lastEight)),
    finiteSlot(interestReturn),
    finiteSlot(calculateDrawdown(lastTwenty)),
  ]
}

const calculateNewsSlots = (
  articleCounts: readonly (number | null)[],
): readonly FormulaSlot[] => {
  const previousSeven = readFiniteWindow(articleCounts, 0, 7)
  const currentSeven = readFiniteWindow(articleCounts, 7, 14)
  if (previousSeven === null || currentSeven === null) {
    return [missingSlot(), missingSlot()]
  }

  const previousTotal = previousSeven.reduce((sum, value) => sum + value, 0)
  const currentTotal = currentSeven.reduce((sum, value) => sum + value, 0)
  return [
    finiteSlot(Math.log(1 + currentTotal)),
    finiteSlot((currentTotal - previousTotal) / Math.max(previousTotal, 1)),
  ]
}

const buildProvenance = (
  input: ConfirmatoryFeatureInput,
  interestSource: ReturnType<typeof resolveInterestSource>,
  newsSource: ReturnType<typeof resolveNewsSource>,
): ConfirmatoryFeatureProvenance => ({
  studyOriginManifestId: input.studyOriginManifestId,
  studyOriginManifestSha256: input.studyOriginManifestSha256,
  studyContractId: input.studyContractId,
  studyContractSha256: input.studyContractSha256,
  featureContractVersion: input.featureContractVersion,
  featureContractSha256: input.featureContractSha256,
  forecastOriginManifestId: input.forecastOriginManifestId,
  forecastOriginManifestSha256: input.forecastOriginManifestSha256,
  themeId: input.themeId,
  baseDate: input.baseDate,
  cutoffAt: input.cutoffAt,
  interestRunId: interestSource.runId,
  interestResponseSha256: interestSource.responseSha256,
  interestSourceMaxDate: interestSource.sourceMaxDate,
  interestSourceAgeDays: interestSource.sourceAgeDays,
  newsObservationIds: [...input.newsObservationIds],
  newsInputSha256: input.newsInputSha256,
  newsSourceMaxDate: newsSource.sourceMaxDate,
  newsSourceAgeDays: newsSource.sourceAgeDays,
  newsRunIds: [...newsSource.runIds],
  newsRunResponseSha256s: [...newsSource.runResponseSha256s],
  bablObservationId: input.bablObservationId,
  bablInputSha256: input.bablInputSha256,
  bablCandidatePool: input.bablCandidatePool,
})

export function buildConfirmatoryFeatureVector(
  input: ConfirmatoryFeatureInput,
): ConfirmatoryFeatureSnapshot {
  const interestSource = resolveInterestSource(input)
  const newsSource = resolveNewsSource(input)
  const bablSource = resolveBablSource(input)
  const slots = [
    ...calculateInterestSlots(interestSource.rawValues),
    ...calculateNewsSlots(newsSource.articleCounts),
    bablSource,
    finiteSlot(interestSource.sourceAgeDays),
    finiteSlot(newsSource.sourceAgeDays),
  ]
  const abstainReasons = [
    ...interestSource.abstainReasons,
    ...newsSource.abstainReasons,
  ]
  const snapshotBody = {
    featureNames: CONFIRMATORY_FEATURE_NAMES,
    values: slots.map((slot) => slot.value),
    missingFlags: slots.map((slot) => slot.missing),
    abstain: abstainReasons.length > 0,
    abstainReasons,
    provenance: buildProvenance(input, interestSource, newsSource),
  }

  return {
    ...snapshotBody,
    featureSnapshotSha256: canonicalJsonV1Sha256(snapshotBody),
  }
}
