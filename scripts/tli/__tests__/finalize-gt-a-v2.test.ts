import { describe, expect, it } from 'vitest'
import { canonicalJsonV1 } from '@/lib/tli/canonical-json'
import {
  buildGtAV2PendingRow,
  resolveGtAV2Finalize,
  type GtAV2ForecastChild,
  type GtAV2SourceObservation,
  type GtAV2SourceRun,
} from '@/scripts/tli/labels/finalize-gt-a-v2'

const PAST_DATES = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'] as const
const FUTURE_DATES = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16'] as const
const THEME_ID = '11111111-1111-4111-8111-111111111111'
const MANIFEST_ID = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '33333333-3333-4333-8333-333333333333'
const AS_OF = '2026-01-26T09:00:00.000Z'

const usableChild: GtAV2ForecastChild = {
  inputStatus: 'usable',
  keywordGroupSha256: 'a'.repeat(64),
  forecastInterestRunId: '44444444-4444-4444-8444-444444444444',
}

const observations = (
  pastValues: readonly number[],
  futureValues: readonly number[],
): GtAV2SourceObservation[] => [
  ...pastValues.map((value, index) => ({ tradingDate: PAST_DATES[index], normalized: value })),
  ...futureValues.map((value, index) => ({ tradingDate: FUTURE_DATES[index], normalized: value })),
]

const sourceRun = (
  pastValues: readonly number[],
  futureValues: readonly number[],
): GtAV2SourceRun => ({
  id: RUN_ID,
  requestSha256: 'b'.repeat(64),
  responseSha256: 'c'.repeat(64),
  observations: observations(pastValues, futureValues),
})

const call = (overrides: Partial<Parameters<typeof resolveGtAV2Finalize>[0]>) =>
  resolveGtAV2Finalize({
    themeId: THEME_ID,
    baseDate: '2026-01-09',
    forecastOriginManifestId: MANIFEST_ID,
    asOf: AS_OF,
    child: usableChild,
    sourceRun: null,
    pastDates: PAST_DATES,
    futureDates: FUTURE_DATES,
    graceExpired: false,
    ...overrides,
  })

describe('resolveGtAV2Finalize', () => {
  it('excludes an abstain child (spec_mismatch) with no source run', () => {
    const outcome = call({ child: { ...usableChild, inputStatus: 'abstain' } })
    expect(outcome.kind).toBe('finalize')
    if (outcome.kind !== 'finalize') return
    expect(outcome.payload.label_source_run_id).toBeNull()
    expect(outcome.payload.g_log_ratio).toBeNull()
    expect(outcome.payload.y_binary).toBeNull()
  })

  it('keeps pending while the source is missing inside the grace window', () => {
    const outcome = call({ sourceRun: null, graceExpired: false })
    expect(outcome).toEqual({ kind: 'keep_pending', reason: 'no_source_yet' })
  })

  it('excludes (source_gap_sla) when the source is still missing after grace', () => {
    const outcome = call({ sourceRun: null, graceExpired: true })
    expect(outcome.kind).toBe('finalize')
    if (outcome.kind !== 'finalize') return
    expect(outcome.payload.label_source_run_id).toBeNull()
    expect(outcome.payload.g_log_ratio).toBeNull()
  })

  it('finalizes a positive label from the exact 5+5 single response', () => {
    const outcome = call({ sourceRun: sourceRun([10, 10, 10, 10, 10], [11, 11, 11, 11, 11]) })
    expect(outcome.kind).toBe('finalize')
    if (outcome.kind !== 'finalize') return
    expect(outcome.payload.label_source_run_id).toBe(RUN_ID)
    expect(outcome.payload.label_response_sha256).toBe('c'.repeat(64))
    expect(outcome.payload.y_binary).toBe(true)
    expect(outcome.payload.g_log_ratio).not.toBeNull()
  })

  it('passes null outcome fields for a zero-denominator response (server derives it)', () => {
    const outcome = call({ sourceRun: sourceRun([0, 0, 0, 0, 0], [50, 50, 50, 50, 50]) })
    expect(outcome.kind).toBe('finalize')
    if (outcome.kind !== 'finalize') return
    expect(outcome.payload.label_source_run_id).toBe(RUN_ID)
    expect(outcome.payload.g_log_ratio).toBeNull()
    expect(outcome.payload.y_binary).toBeNull()
  })

  it('keeps pending when the future window is incomplete within grace', () => {
    const run: GtAV2SourceRun = {
      ...sourceRun([10, 10, 10, 10, 10], []),
      observations: observations([10, 10, 10, 10, 10], [11, 11, 11]),
    }
    const outcome = call({ sourceRun: run, graceExpired: false })
    expect(outcome).toEqual({ kind: 'keep_pending', reason: 'future_window_incomplete' })
  })

  it('excludes (source_gap_sla) for an incomplete future window past grace', () => {
    const run: GtAV2SourceRun = {
      ...sourceRun([10, 10, 10, 10, 10], []),
      observations: observations([10, 10, 10, 10, 10], [11, 11, 11]),
    }
    const outcome = call({ sourceRun: run, graceExpired: true })
    expect(outcome.kind).toBe('finalize')
    if (outcome.kind !== 'finalize') return
    expect(outcome.payload.label_source_run_id).toBe(RUN_ID)
    expect(outcome.payload.g_log_ratio).toBeNull()
    expect(outcome.payload.y_binary).toBeNull()
  })

  it('builds a foundation pending row as exploratory_only/pending_gta_v2 with only the manifest FK', () => {
    const row = buildGtAV2PendingRow({
      themeId: THEME_ID,
      baseDate: '2026-01-09',
      forecastOriginManifestId: MANIFEST_ID,
    })
    expect(row).toMatchObject({
      label_type: 'gt_a',
      horizon_days: 5,
      labeler_version: 'gta-v2',
      label_status: 'pending',
      scientific_use_status: 'exploratory_only',
      scientific_use_reason: 'pending_gta_v2',
      forecast_origin_manifest_id: MANIFEST_ID,
    })
    // no source foreign keys or outcome are set at pending time.
    expect(row).not.toHaveProperty('forecast_interest_run_id')
    expect(row).not.toHaveProperty('label_source_run_id')
    expect(row).not.toHaveProperty('g_log_ratio')
  })

  it('never stitches responses: exactly one source run id and the 9 canonical keys', () => {
    const outcome = call({ sourceRun: sourceRun([10, 10, 10, 10, 10], [11, 11, 11, 11, 11]) })
    if (outcome.kind !== 'finalize') throw new Error('expected finalize')
    expect(Object.keys(outcome.payload).sort()).toEqual(
      [
        'as_of',
        'base_date',
        'forecast_origin_manifest_id',
        'g_log_ratio',
        'label_request_sha256',
        'label_response_sha256',
        'label_source_run_id',
        'theme_id',
        'y_binary',
      ].sort(),
    )
    // canonical bytes are stable for RPC transport.
    expect(canonicalJsonV1(outcome.payload)).toContain(`"label_source_run_id":"${RUN_ID}"`)
  })
})
