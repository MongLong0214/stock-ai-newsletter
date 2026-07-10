import { z } from 'zod'

import type { OfflineEvalInput } from './offline-eval'
import type { ScientificM1EvaluationPlan, ScientificM1JoinedRow } from './offline-eval-scientific-m1'
import {
  parseScientificM1StudyInput,
  type ScientificM1StudyInput,
} from './scientific-m1-input'

const scientificM1EnvelopeSchema = z.object({
  scientificM1: z.unknown(),
}).strict()

const featureValue = (row: ScientificM1JoinedRow, index: number): number | null => {
  const value = row.features[index]
  return row.missingFlags[index] || value === undefined || !Number.isFinite(value) ? null : value
}

const bablPhase = (row: ScientificM1JoinedRow): string | null => {
  const signal = featureValue(row, 7)
  if (signal === null) return null
  if (signal === 1) return 'rising'
  if (signal === -1) return 'cooling'
  return 'sideways'
}

export function parseScientificM1Envelope(value: unknown): ScientificM1StudyInput {
  const envelope = scientificM1EnvelopeSchema.parse(value)
  return parseScientificM1StudyInput(envelope.scientificM1)
}

export function isScientificM1Envelope(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && Object.prototype.hasOwnProperty.call(value, 'scientificM1')
}

export function buildOfflineEvalInputFromScientificPlan(input: {
  readonly study: ScientificM1StudyInput
  readonly plan: ScientificM1EvaluationPlan
}): OfflineEvalInput {
  const dates = [...new Set(input.plan.rows.map((row) => row.baseDate))].sort()
  const startDate = dates.at(0)
  const endDate = dates.at(-1)
  if (startDate === undefined || endDate === undefined) {
    throw new Error('scientific M1 study has no evaluation rows')
  }
  const rows = input.plan.rows
  return {
    startDate,
    endDate,
    labels: rows.map((row) => ({
      themeId: row.themeId,
      baseDate: row.baseDate,
      y: row.y,
    })),
    snapshots: [],
    featureRows: rows.map((row) => ({
      themeId: row.themeId,
      baseDate: row.baseDate,
      values: row.features,
      missingFlags: row.missingFlags,
      abstain: row.abstain,
      y: row.y,
    })),
    labelStatusCounts: {
      final: rows.length,
      censored: 0,
      excluded: 0,
      pending: 0,
    },
    scientificBaseline: {
      datasetManifest: {
        study_contract_id: input.plan.studyContractId,
        study_contract_sha256: input.plan.studyContractSha256,
      },
      origins: input.study.origins,
      rows: rows.map((row) => ({
        id: row.id,
        themeId: row.themeId,
        baseDate: row.baseDate,
        futureDates: row.futureDates,
        labelFinalizedAt: row.labelFinalizedAt,
        labelSourceRunCompletedAt: row.labelSourceRunCompletedAt,
        studyContractId: row.studyContractId,
        studyContractSha256: row.studyContractSha256,
        bablPhase: bablPhase(row),
        interestReturn10d: featureValue(row, 3),
        interestSlope7d: featureValue(row, 0),
        newsMomentum: featureValue(row, 6),
        y: row.y,
      })),
    },
  }
}
