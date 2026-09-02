import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({ supabaseAdmin: {} }))

import { scientificGateExitCode } from '../ops/scientific-gate-exit'
import type { OriginEligibilityResult } from '../origins/origin-eligibility'
import {
  classifyOriginEligibilitySeverity,
  filterPendingOriginEligibilityBindings,
  shouldAppendOriginEligibility,
  type LatestOriginEligibilityPayload,
  type StudyOriginEligibilityBinding,
} from '../origins/run-origin-eligibility'

const evaluation = (
  originDate: string,
  verdict: OriginEligibilityResult['verdict'],
): { readonly originDate: string; readonly result: Pick<OriginEligibilityResult, 'verdict'> } => ({
  originDate,
  result: { verdict },
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

describe('origin eligibility append dedupe', () => {
  it('latest SHA가 같을 때만 append를 생략한다', () => {
    const sha = 'a'.repeat(64)
    expect(shouldAppendOriginEligibility(undefined, sha)).toBe(true)
    expect(shouldAppendOriginEligibility('b'.repeat(64), sha)).toBe(true)
    expect(shouldAppendOriginEligibility(sha, sha)).toBe(false)
  })
})

describe('pending origin eligibility scope', () => {
  it('최신 verdict 없음, 미성숙 verdict, 이번 origin date만 재평가한다', () => {
    const noVerdict = binding('31111111-1111-4111-8111-111111111111', '2026-08-03')
    const immature = binding('41111111-1111-4111-8111-111111111111', '2026-08-10')
    const requested = binding('51111111-1111-4111-8111-111111111111', '2026-08-31')
    const settled = binding('61111111-1111-4111-8111-111111111111', '2026-08-17')
    const sha = 'a'.repeat(64)
    const latest = new Map<string, LatestOriginEligibilityPayload>([
      [immature.studyOriginManifestId, { payloadSha256: sha, matured: false }],
      [requested.studyOriginManifestId, { payloadSha256: sha, matured: true }],
      [settled.studyOriginManifestId, { payloadSha256: sha, matured: true }],
    ])

    const selected = filterPendingOriginEligibilityBindings(
      [noVerdict, immature, requested, settled],
      latest,
      [requested.originDate],
    )

    expect(selected.map((item) => item.studyOriginManifestId)).toEqual([
      noVerdict.studyOriginManifestId,
      immature.studyOriginManifestId,
      requested.studyOriginManifestId,
    ])
  })
})

describe('origin eligibility exit code', () => {
  it('최근 7일 origin의 ineligible은 critical 3이다', () => {
    const severity = classifyOriginEligibilitySeverity(
      [evaluation('2026-08-27', 'ineligible')],
      '2026-09-02',
    )
    expect(severity).toBe('critical')
    expect(scientificGateExitCode(severity)).toBe(3)
  })

  it('과거 ineligible은 warning 2이고 전부 eligible이면 0이다', () => {
    const warning = classifyOriginEligibilitySeverity(
      [evaluation('2026-08-24', 'ineligible')],
      '2026-09-02',
    )
    const pass = classifyOriginEligibilitySeverity(
      [evaluation('2026-08-31', 'eligible')],
      '2026-09-02',
    )
    expect(scientificGateExitCode(warning)).toBe(2)
    expect(scientificGateExitCode(pass)).toBe(0)
  })
})
