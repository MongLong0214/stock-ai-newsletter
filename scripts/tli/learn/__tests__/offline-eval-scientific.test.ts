import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildOfflineEvalReport } from '../offline-eval'
import type { ScientificBaselineEvalRow } from '../offline-eval-baselines'
import { computeStudyOriginScheduleSha256 } from '../offline-eval-study-lock'

const STUDY_ID = 'study-todo-10'
const STUDY_SHA256 = 'a'.repeat(64)

const weeklyOrigin = (index: number): string => {
  const date = new Date(Date.UTC(2026, 0, 5 + index * 7))
  return date.toISOString().slice(0, 10)
}

const scientificOrigins = Array.from({ length: 30 }, (_unused, index) => ({
  originDate: weeklyOrigin(index),
  forecastCutoff: `${weeklyOrigin(index)}T09:00:00.000Z`,
}))
const STUDY_ORIGIN_SCHEDULE_SHA256 = computeStudyOriginScheduleSha256({
  studyContractId: STUDY_ID,
  studyContractSha256: STUDY_SHA256,
  studyOriginSchedule: scientificOrigins,
})
const STUDY_LOCK = {
  studyContractId: STUDY_ID,
  studyContractSha256: STUDY_SHA256,
  studyOriginScheduleSha256: STUDY_ORIGIN_SCHEDULE_SHA256,
}

const scientificRows: ScientificBaselineEvalRow[] = scientificOrigins.flatMap((origin) => ([
  {
    id: `rising|${origin.originDate}`,
    themeId: 'rising',
    baseDate: origin.originDate,
    futureDates: [origin.originDate],
    labelFinalizedAt: `${origin.originDate}T00:00:00.000Z`,
    labelSourceRunCompletedAt: `${origin.originDate}T00:00:00.000Z`,
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    bablPhase: 'rising',
    interestReturn10d: 0.5,
    interestSlope7d: 0.25,
    newsMomentum: 1.5,
    y: true,
  },
  {
    id: `cooling|${origin.originDate}`,
    themeId: 'cooling',
    baseDate: origin.originDate,
    futureDates: [origin.originDate],
    labelFinalizedAt: `${origin.originDate}T00:00:00.000Z`,
    labelSourceRunCompletedAt: `${origin.originDate}T00:00:00.000Z`,
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    bablPhase: 'cooling',
    interestReturn10d: -0.5,
    interestSlope7d: -0.25,
    newsMomentum: 0.5,
    y: false,
  },
  {
    id: `other|${origin.originDate}`,
    themeId: 'other',
    baseDate: origin.originDate,
    futureDates: [origin.originDate],
    labelFinalizedAt: `${origin.originDate}T00:00:00.000Z`,
    labelSourceRunCompletedAt: `${origin.originDate}T00:00:00.000Z`,
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    bablPhase: 'sideways',
    interestReturn10d: null,
    interestSlope7d: 0.1,
    newsMomentum: 1,
    y: true,
  },
  {
    id: `missing|${origin.originDate}`,
    themeId: 'missing',
    baseDate: origin.originDate,
    futureDates: [origin.originDate],
    labelFinalizedAt: `${origin.originDate}T00:00:00.000Z`,
    labelSourceRunCompletedAt: `${origin.originDate}T00:00:00.000Z`,
    studyContractId: STUDY_ID,
    studyContractSha256: STUDY_SHA256,
    bablPhase: null,
    interestReturn10d: 0,
    interestSlope7d: null,
    newsMomentum: null,
    y: false,
  },
]))

const buildScientificReport = (
  rows: readonly ScientificBaselineEvalRow[] = scientificRows,
  origins = scientificOrigins,
) => buildOfflineEvalReport({
  startDate: scientificOrigins[0].originDate,
  endDate: scientificOrigins[29].originDate,
  labels: rows.map((row) => ({ themeId: row.themeId, baseDate: row.baseDate, y: row.y })),
  snapshots: [],
  featureRows: [],
  labelStatusCounts: { final: rows.length, censored: 0, excluded: 0, pending: 0 },
  scientificBaseline: {
    datasetManifest: {
      study_contract_id: STUDY_ID,
      study_contract_sha256: STUDY_SHA256,
    },
    origins,
    rows,
  },
}, STUDY_LOCK)

describe('TLI v3 scientific offline baseline integration', () => {
  it('binds forecast cutoffs into the immutable study-origin schedule hash', () => {
    const original = {
      studyContractId: STUDY_ID,
      studyContractSha256: STUDY_SHA256,
      studyOriginSchedule: scientificOrigins,
    }
    const changed = {
      ...original,
      studyOriginSchedule: scientificOrigins.map((origin, index) => (
        index === 0 ? { ...origin, forecastCutoff: `${origin.originDate}T08:00:00.000Z` } : origin
      )),
    }

    expect(computeStudyOriginScheduleSha256(changed)).not.toBe(computeStudyOriginScheduleSha256(original))
    expect(() => buildScientificReport(scientificRows, changed.studyOriginSchedule))
      .toThrow(/externally frozen study-origin schedule/)
  })

  it('integrates exact Jeffreys baselines into every evaluation artifact', () => {
    const report = buildScientificReport()

    expect(report.reportVersion).toBe('tli-offline-eval-report-v2')
    expect(report.baselines?.outerFolds).toHaveLength(17)
    expect(report.baselines?.outerFolds[0].primary.artifact.strata.rising.probability).toBeCloseTo(13.5 / 14, 15)
    expect(report.baselines?.outerFolds[0].primary.artifact.strata.cooling.probability).toBeCloseTo(0.5 / 14, 15)
    expect(report.baselines?.outerFolds[0].primary.artifact.strata.other.probability).toBeCloseTo(13.5 / 14, 15)
    expect(report.baselines?.outerFolds[0].primary.artifact.strata.missing.probability).toBeCloseTo(0.5 / 14, 15)
    expect(report.baselines?.outerFolds[0].secondaryDiagnostics.persistence.artifact.strata.positive.probability)
      .toBeCloseTo(13.5 / 14, 15)
    expect(report.baselines?.outerFolds[0].secondaryDiagnostics.persistence.artifact.strata.nonpositive.probability)
      .toBeCloseTo(0.5 / 27, 15)
    expect(report.baselines?.outerFolds[0].secondaryDiagnostics.persistence.artifact.strata.missing.probability)
      .toBeCloseTo(13.5 / 14, 15)
    expect(report.baselines?.prospectiveCycle.primary.artifact.studyContractId).toBe(STUDY_ID)
    expect(report.baselines?.prospectiveCycle.primary.artifact.studyContractSha256).toBe(STUDY_SHA256)
    expect(report.baselines?.prospectiveCycle.secondaryDiagnostics.climatology.artifact?.trainOriginsUsed)
      .toEqual(scientificOrigins.slice(-26).map((origin) => origin.originDate))
  })

  it('locks train-fitted baseline artifacts to immutable study identity', () => {
    const changedTestRows = scientificRows.flatMap<ScientificBaselineEvalRow>((row) => {
      if (row.baseDate !== scientificOrigins[29].originDate) return [row]
      if (row.themeId === 'cooling') return []
      return [{ ...row, y: !row.y, bablPhase: null, interestReturn10d: null }]
    })

    const beforeFold = buildScientificReport().baselines?.outerFolds[16]
    const afterFold = buildScientificReport(changedTestRows).baselines?.outerFolds[16]

    expect(beforeFold).toBeDefined()
    expect(beforeFold?.primary.predictions).toHaveLength(4)
    expect(afterFold?.primary.predictions).toHaveLength(3)
    expect(afterFold?.primary.artifact.artifactSha256).toBe(beforeFold?.primary.artifact.artifactSha256)
    expect(afterFold?.secondaryDiagnostics.persistence.artifact.artifactSha256)
      .toBe(beforeFold?.secondaryDiagnostics.persistence.artifact.artifactSha256)
    expect(afterFold?.secondaryDiagnostics.climatology.artifact?.artifactSha256)
      .toBe(beforeFold?.secondaryDiagnostics.climatology.artifact?.artifactSha256)
    expect(beforeFold?.primary.artifact.studyContractId).toBe(STUDY_ID)
    expect(beforeFold?.primary.artifact.studyContractSha256).toBe(STUDY_SHA256)
    const probabilities = [
      ...(beforeFold?.primary.predictions ?? []),
      ...(beforeFold?.secondaryDiagnostics.persistence.predictions ?? []),
      ...(beforeFold?.secondaryDiagnostics.climatology.predictions ?? []),
    ].map((row) => row.probability)
    expect(probabilities.length).toBeGreaterThan(0)
    expect(probabilities.every((probability) => (
      probability !== null && probability > 0 && probability < 1
    ))).toBe(true)
  })

  it('rejects a row whose study identity differs from the dataset manifest', () => {
    const mixedRows = scientificRows.map((row, index) => (
      index === 0 ? { ...row, studyContractId: 'study-other' } : row
    ))

    expect(() => buildScientificReport(mixedRows)).toThrow(/mixed-study row/)
  })

  it('keeps the authoritative expanding prefix when an origin is fully purged from fitting', () => {
    const purgedOrigin = scientificOrigins[12].originDate
    const firstTestOrigin = scientificOrigins[13].originDate
    const rowsWithPurgedOrigin = scientificRows.map((row) => (
      row.baseDate === purgedOrigin ? { ...row, futureDates: [firstTestOrigin] } : row
    ))
    const firstFold = buildScientificReport(rowsWithPurgedOrigin).baselines.outerFolds[0]

    expect(firstFold.trainOrigins).toEqual(scientificOrigins.slice(0, 13).map((origin) => origin.originDate))
    expect(firstFold.trainOriginRowCounts[purgedOrigin]).toBe(0)
    expect(firstFold.primary.artifact.trainRowCount).toBe(48)
  })

  it('retires legacy baselines and exposes the two-feature secondary stub', () => {
    const source = readFileSync(new URL('../offline-eval.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/buildM0Predictions|buildBAblEvalRows|phase === 'rising' \? 1 : 0/)
    const stub = buildScientificReport().baselines?.outerFolds[0].secondaryDiagnostics.twoFeatureLogistic
    expect(stub).toMatchObject({
      baselineId: 'logistic-two-feature-v1',
      role: 'secondary_diagnostic',
      status: 'interface_stub',
      featureNames: ['interest_slope_7d', 'news_momentum'],
      preprocessingContract: 'same-fold-train-only-median-mad-v1',
      cSelectionContract: 'same-inner-oof-precalibration-brier-v1',
      calibrationContract: 'same-time-blocked-oof-platt-v1',
      implementationOwner: 'todo-11-python-core',
    })
    expect(stub).not.toHaveProperty('predictions')
  })
})
