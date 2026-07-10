import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  assertScientificM1AvailabilityReceipt,
  buildExpectedScientificM1AvailabilityReceipt,
  buildScientificM1AvailabilitySidecar,
} from '../scientific-m1-availability'
import { buildScientificM1EvaluationPlan } from '../offline-eval-scientific-m1'
import { parseScientificM1StudyInput } from '../scientific-m1-input'
import { buildScientificM1Fixture, ORIGINS } from './offline-eval-scientific-m1-fixture'

const sha256 = (payload: string): string => createHash('sha256').update(payload).digest('hex')

describe('scientific M1 inner-fold point-in-time availability', () => {
  it('excludes future, finalized, and source rows only at the inner cutoff where each is unavailable', () => {
    // Given: three outer-eligible rows whose labels are unavailable at the first inner validation cutoff only.
    const plan = buildScientificM1EvaluationPlan(parseScientificM1StudyInput(buildScientificM1Fixture()))
    const fold = plan.outerFolds.at(0)
    const firstInner = fold?.innerOof.folds.at(0)
    const firstOrigin = ORIGINS.find((origin) => origin.originDate === firstInner?.validationOrigin)
    if (fold === undefined || firstInner === undefined || firstOrigin === undefined) {
      throw new RangeError('fixture must contain the first outer and inner folds')
    }
    const rows = plan.rows.map((row) => {
      if (row.id === 'label-03-0') return { ...row, futureDates: [firstInner.validationOrigin] }
      if (row.id === 'label-04-0') return { ...row, labelFinalizedAt: firstOrigin.forecastCutoff.replace('.000Z', '.001Z') }
      if (row.id === 'label-05-0') {
        return { ...row, labelSourceRunCompletedAt: firstOrigin.forecastCutoff.replace('.000Z', '.001Z') }
      }
      return row
    })

    // When: the exact Python sidecar and TS reference receipt are derived for that outer fit.
    const sidecar = buildScientificM1AvailabilitySidecar({
      trainingInputSha256: 'a'.repeat(64),
      dataset: fold.trainingDataset,
      joinedRows: rows,
      studyOrigins: ORIGINS,
      innerOof: fold.innerOof,
    })
    const sidecarBytes = `${JSON.stringify(sidecar, null, 2)}\n`
    const receipt = buildExpectedScientificM1AvailabilityReceipt({
      sidecar,
      sidecarSha256: sha256(sidecarBytes),
    })

    // Then: each condition has its exact reason at inner-01 and every sentinel is eligible thereafter.
    expect(receipt.folds.at(0)?.purged_rows).toEqual([
      { row_id: 'label-03-0', reasons: ['future_window_not_before_validation_origin'] },
      { row_id: 'label-04-0', reasons: ['label_finalized_after_validation_cutoff'] },
      { row_id: 'label-05-0', reasons: ['label_source_run_completed_after_validation_cutoff'] },
    ])
    expect(receipt.folds.slice(1).every((inner) => (
      inner.purged_rows.every((row) => !['label-03-0', 'label-04-0', 'label-05-0'].includes(row.row_id))
    ))).toBe(true)
  })

  it('hard-fails when the Python receipt changes one eligible row set', () => {
    // Given: an expected receipt and a Python-shaped copy with one eligible row removed.
    const plan = buildScientificM1EvaluationPlan(parseScientificM1StudyInput(buildScientificM1Fixture()))
    const fold = plan.outerFolds.at(0)
    if (fold === undefined) throw new RangeError('fixture must contain an outer fold')
    const sidecar = buildScientificM1AvailabilitySidecar({
      trainingInputSha256: 'a'.repeat(64),
      dataset: fold.trainingDataset,
      joinedRows: plan.rows,
      studyOrigins: ORIGINS,
      innerOof: fold.innerOof,
    })
    const expected = buildExpectedScientificM1AvailabilityReceipt({
      sidecar,
      sidecarSha256: sha256(`${JSON.stringify(sidecar, null, 2)}\n`),
    })
    const first = expected.folds.at(0)
    if (first === undefined) throw new RangeError('fixture must contain an inner fold')
    const tampered = {
      ...expected,
      folds: [{ ...first, eligible_row_ids: first.eligible_row_ids.slice(1) }, ...expected.folds.slice(1)],
    }

    // When/Then: the TS boundary rejects the parsed but semantically tampered receipt.
    expect(() => assertScientificM1AvailabilityReceipt({ expected, actual: tampered, fitId: fold.foldId }))
      .toThrow(/python_inner_pit_receipt_mismatch/)
  })
})
