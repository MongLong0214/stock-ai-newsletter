import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: {} }))

import { scientificGateExitCode } from '../ops/scientific-gate-exit'
import type { OriginEligibilityResult } from '../origins/origin-eligibility'
import {
  classifyOriginEligibilitySeverity,
  evaluateAndRecordStudyOriginEligibility,
  filterPendingOriginEligibilityBindings,
  shouldAppendOriginEligibility,
  type LatestOriginEligibilityPayload,
  type StudyOriginEligibilityBinding,
} from '../origins/run-origin-eligibility'

const evaluation = (
  originDate: string,
  verdict: OriginEligibilityResult['verdict'],
  action: 'inserted' | 'dry_run' | 'skipped_unchanged' = 'inserted',
  previousVerdict: OriginEligibilityResult['verdict'] | null = null,
) => ({
  originDate,
  result: { verdict },
  action,
  previousVerdict,
})

const binding = (
  studyOriginManifestId: string,
  originDate: string,
): StudyOriginEligibilityBinding => ({
  studyContractId: '11111111-1111-4111-8111-111111111111',
  studyOriginManifestId,
  forecastOriginManifestId: studyOriginManifestId.replace(/^./, 'f'),
  originDate,
  forecastCutoff: `${originDate}T06:20:00.000Z`,
  expectedThemeIds: ['22222222-2222-4222-8222-222222222222'],
  usableThemeIds: ['22222222-2222-4222-8222-222222222222'],
})

const KOSPI_DATES = [
  '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
  '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-20',
  '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-27',
  '2026-07-28', '2026-07-29', '2026-07-30',
]

const evaluateSingleOrigin = async (input: {
  readonly now: Date
  readonly kospiDates?: readonly string[]
  readonly latest?: ReadonlyMap<string, LatestOriginEligibilityPayload>
  readonly labelAccounting?: { readonly terminal: number; readonly pending: number; readonly sourceGap: number }
  readonly dryRun?: boolean
}) => {
  const studyOrigin = binding('31111111-1111-4111-8111-111111111111', '2026-07-20')
  const loadLabelAccounting = vi.fn(async () => (
    input.labelAccounting ?? { terminal: 1, pending: 0, sourceGap: 0 }
  ))
  const loadKospiTradingDates = vi.fn(async () => [...(input.kospiDates ?? KOSPI_DATES)])
  const insertEligibility = vi.fn(async () => undefined)
  const report = await evaluateAndRecordStudyOriginEligibility({
    today: '2026-09-02',
    now: input.now,
    scope: 'pending',
    dryRun: input.dryRun,
    deps: {
      loadStudies: async () => [{
        id: studyOrigin.studyContractId,
        locked_at: '2026-07-01T00:00:00.000Z',
        first_origin_date: studyOrigin.originDate,
        babl_algorithm_version: 'babl-v1',
        babl_comparison_spec_version: 'comparison-v1',
        babl_evaluation_horizon_days: 5,
      }],
      loadBindings: async () => [studyOrigin],
      loadRoster: async () => new Map([[
        studyOrigin.expectedThemeIds[0],
        {
          runId: '41111111-1111-4111-8111-111111111111',
          keywordGroupSpec: { group_name: 'HBM', keywords: ['HBM'] },
        },
      ]]),
      loadLabelAccounting,
      loadKospiTradingDates,
      loadLatestPayloads: async () => input.latest ?? new Map(),
      insertEligibility,
    },
  })
  return { report, studyOrigin, loadLabelAccounting, loadKospiTradingDates, insertEligibility }
}

describe('origin eligibility append dedupe', () => {
  it('latest SHA가 같을 때만 append를 생략한다', () => {
    const sha = 'a'.repeat(64)
    expect(shouldAppendOriginEligibility(undefined, sha)).toBe(true)
    expect(shouldAppendOriginEligibility('b'.repeat(64), sha)).toBe(true)
    expect(shouldAppendOriginEligibility(sha, sha)).toBe(false)
  })
})

describe('pending origin eligibility scope', () => {
  it('최신 verdict 없음, 미성숙, ineligible, 이번 origin date를 재평가한다', () => {
    const noVerdict = binding('31111111-1111-4111-8111-111111111111', '2026-08-03')
    const immature = binding('41111111-1111-4111-8111-111111111111', '2026-08-10')
    const ineligible = binding('51111111-1111-4111-8111-111111111111', '2026-08-17')
    const requested = binding('61111111-1111-4111-8111-111111111111', '2026-08-31')
    const settled = binding('71111111-1111-4111-8111-111111111111', '2026-08-24')
    const sha = 'a'.repeat(64)
    const latest = new Map<string, LatestOriginEligibilityPayload>([
      [immature.studyOriginManifestId, { payloadSha256: sha, matured: false, verdict: 'eligible' }],
      [ineligible.studyOriginManifestId, { payloadSha256: sha, matured: true, verdict: 'ineligible' }],
      [requested.studyOriginManifestId, { payloadSha256: sha, matured: true, verdict: 'eligible' }],
      [settled.studyOriginManifestId, { payloadSha256: sha, matured: true, verdict: 'eligible' }],
    ])

    const selected = filterPendingOriginEligibilityBindings(
      [noVerdict, immature, ineligible, requested, settled],
      latest,
      [requested.originDate],
    )

    expect(selected.map((item) => item.studyOriginManifestId)).toEqual([
      noVerdict.studyOriginManifestId,
      immature.studyOriginManifestId,
      ineligible.studyOriginManifestId,
      requested.studyOriginManifestId,
    ])
  })

  it('ineligible origin의 라벨이 완결되면 eligible verdict를 새로 기록한다', async () => {
    const latest = new Map<string, LatestOriginEligibilityPayload>([[
      '31111111-1111-4111-8111-111111111111',
      { payloadSha256: 'a'.repeat(64), matured: true, verdict: 'ineligible' },
    ]])

    const { report, insertEligibility } = await evaluateSingleOrigin({
      now: new Date('2026-07-30T18:00:00+09:00'),
      latest,
    })

    expect(report.evaluations).toHaveLength(1)
    expect(report.evaluations[0]).toMatchObject({
      action: 'inserted',
      previousVerdict: 'ineligible',
      result: { matured: true, verdict: 'eligible', labelTerminalCount: 1 },
    })
    expect(report.summary.severity).toBe('pass')
    expect(insertEligibility).toHaveBeenCalledOnce()
    expect(insertEligibility.mock.calls[0]?.[1].payloadSha256).not.toBe('a'.repeat(64))
  })
})

describe('origin eligibility maturity', () => {
  it('KOSPI 실측 graceDeadline 시각 전에는 미성숙이고 정확한 시각부터 성숙한다', async () => {
    const before = await evaluateSingleOrigin({
      now: new Date('2026-07-30T17:59:59+09:00'),
    })
    const atDeadline = await evaluateSingleOrigin({
      now: new Date('2026-07-30T18:00:00+09:00'),
    })

    expect(before.report.evaluations[0]?.result.matured).toBe(false)
    expect(before.loadLabelAccounting).not.toHaveBeenCalled()
    expect(atDeadline.report.evaluations[0]?.result.matured).toBe(true)
    expect(atDeadline.loadLabelAccounting).toHaveBeenCalledOnce()
    expect(before.loadKospiTradingDates).toHaveBeenCalledOnce()
    expect(atDeadline.loadKospiTradingDates).toHaveBeenCalledOnce()
  })

  it('KOSPI 미래 창을 파생할 수 없으면 grace 이후 시각에도 미성숙이다', async () => {
    const result = await evaluateSingleOrigin({
      now: new Date('2026-09-02T18:00:00+09:00'),
      kospiDates: KOSPI_DATES.slice(0, 12),
    })

    expect(result.report.evaluations[0]?.result.matured).toBe(false)
    expect(result.loadLabelAccounting).not.toHaveBeenCalled()
  })
})

describe('origin eligibility exit code', () => {
  it('변화 없는 standing ineligible은 pass 0이다', () => {
    const severity = classifyOriginEligibilitySeverity(
      [evaluation('2026-08-10', 'ineligible', 'skipped_unchanged', 'ineligible')],
      '2026-09-02',
    )
    expect(severity).toBe('pass')
    expect(scientificGateExitCode(severity)).toBe(0)
  })

  it('eligible에서 ineligible로 회귀하면 과거 origin도 critical 3이다', () => {
    const severity = classifyOriginEligibilitySeverity(
      [evaluation('2026-07-20', 'ineligible', 'inserted', 'eligible')],
      '2026-09-02',
    )
    expect(severity).toBe('critical')
    expect(scientificGateExitCode(severity)).toBe(3)
  })

  it('직전 verdict 없는 최근 origin의 최초 ineligible은 critical이다', () => {
    expect(classifyOriginEligibilitySeverity(
      [evaluation('2026-08-27', 'ineligible')],
      '2026-09-02',
    )).toBe('critical')
  })

  it('직전 verdict 없는 과거 origin의 bootstrap ineligible은 warning 2이다', () => {
    const severity = classifyOriginEligibilitySeverity(
      [evaluation('2026-08-24', 'ineligible')],
      '2026-09-02',
    )
    expect(severity).toBe('warning')
    expect(scientificGateExitCode(severity)).toBe(2)
  })

  it('ineligible에서 eligible로 회복을 기록하면 pass이다', () => {
    expect(classifyOriginEligibilitySeverity(
      [evaluation('2026-08-31', 'eligible', 'inserted', 'ineligible')],
      '2026-09-02',
    )).toBe('pass')
  })

  it('기존 ineligible의 payload만 바뀌어 재기록되면 pass이다', () => {
    expect(classifyOriginEligibilitySeverity(
      [evaluation('2026-08-10', 'ineligible', 'inserted', 'ineligible')],
      '2026-09-02',
    )).toBe('pass')
  })

  it('dry-run에서 기록될 ineligible 회귀도 severity에 반영한다', () => {
    expect(classifyOriginEligibilitySeverity(
      [evaluation('2026-07-20', 'ineligible', 'dry_run', 'eligible')],
      '2026-09-02',
    )).toBe('critical')
  })
})

describe('origin eligibility change summary', () => {
  it('동일한 standing ineligible을 재평가하면 pass이고 standing 수만 유지한다', async () => {
    const first = await evaluateSingleOrigin({
      now: new Date('2026-07-30T18:00:00+09:00'),
      labelAccounting: { terminal: 0, pending: 1, sourceGap: 0 },
    })
    const firstEvaluation = first.report.evaluations[0]
    expect(firstEvaluation?.result.verdict).toBe('ineligible')

    const latest = new Map<string, LatestOriginEligibilityPayload>([[
      first.studyOrigin.studyOriginManifestId,
      {
        payloadSha256: firstEvaluation?.result.payloadSha256 ?? '',
        matured: true,
        verdict: 'ineligible',
      },
    ]])
    const rerun = await evaluateSingleOrigin({
      now: new Date('2026-07-30T18:00:00+09:00'),
      labelAccounting: { terminal: 0, pending: 1, sourceGap: 0 },
      latest,
    })

    expect(rerun.report.evaluations[0]).toMatchObject({
      action: 'skipped_unchanged',
      previousVerdict: 'ineligible',
      result: { verdict: 'ineligible' },
    })
    expect(rerun.report.summary).toMatchObject({
      ineligibleCount: 1,
      standingIneligibleCount: 1,
      insertedCount: 0,
      newlyRecordedIneligibleCount: 0,
      severity: 'pass',
      exitCode: 0,
    })
  })
})
