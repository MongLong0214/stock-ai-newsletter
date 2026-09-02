import { describe, expect, it } from 'vitest'

import {
  evaluateOriginEligibility,
  ORIGIN_ELIGIBILITY_RULE_VERSION,
} from '../origins/origin-eligibility'

const themeIds = (count: number, offset = 0): string[] => Array.from(
  { length: count },
  (_, index) => `theme-${String(index + offset).padStart(3, '0')}`,
)

const evaluate = (overrides: Partial<Parameters<typeof evaluateOriginEligibility>[0]> = {}) =>
  evaluateOriginEligibility({
    originDate: '2026-08-03',
    forecastCutoff: '2026-08-03T09:00:00.000Z',
    rosterThemeIds: themeIds(100),
    expectedThemeIds: themeIds(100),
    usableThemeIds: themeIds(90),
    matured: true,
    labelAccounting: { terminal: 100, pending: 0, sourceGap: 0 },
    ...overrides,
  })

describe('evaluateOriginEligibility', () => {
  it('모든 universe, coverage, matured label 기준을 만족하면 eligible이다', () => {
    const result = evaluate()

    expect(result.ruleVersion).toBe(ORIGIN_ELIGIBILITY_RULE_VERSION)
    expect(result.verdict).toBe('eligible')
    expect(result.reasons).toEqual([])
    expect(result.usableCoverage).toBe(0.9)
  })

  it('8/10 false-clean을 roster 분모로 재현해 ineligible 처리한다', () => {
    const roster = themeIds(219)
    const expected = roster.slice(0, 30)
    const result = evaluate({
      originDate: '2026-08-10',
      forecastCutoff: '2026-08-10T09:00:00.000Z',
      rosterThemeIds: roster,
      expectedThemeIds: expected,
      usableThemeIds: expected,
      matured: false,
      labelAccounting: null,
    })

    expect(result.verdict).toBe('ineligible')
    expect(result.usableThemeCount).toBe(30)
    expect(result.rosterThemeCount).toBe(219)
    expect(result.missingThemeCount).toBe(189)
    expect(result.usableCoverage).toBeCloseTo(0.137, 3)
    expect(result.reasons).toContain('usable_coverage_below_floor')
  })

  it('roster에 없는 expected theme을 unknown으로 잡는다', () => {
    const result = evaluate({
      rosterThemeIds: themeIds(100),
      expectedThemeIds: [...themeIds(100), 'theme-unknown'],
      usableThemeIds: themeIds(90),
      labelAccounting: { terminal: 101, pending: 0, sourceGap: 0 },
    })

    expect(result.unknownThemeCount).toBe(1)
    expect(result.reasons).toContain('unknown_theme_in_manifest')
  })

  it('빈 roster를 roster_empty와 coverage 결손으로 거부한다', () => {
    const result = evaluate({
      rosterThemeIds: [],
      expectedThemeIds: [],
      usableThemeIds: [],
      matured: false,
      labelAccounting: null,
    })

    expect(result.verdict).toBe('ineligible')
    expect(result.usableCoverage).toBe(0)
    expect(result.reasons).toEqual(['roster_empty', 'usable_coverage_below_floor'])
  })

  it('matured origin의 terminal label이 expected보다 적으면 ineligible이다', () => {
    const result = evaluate({ labelAccounting: { terminal: 99, pending: 1, sourceGap: 0 } })

    expect(result.reasons).toContain('label_accounting_incomplete')
  })

  it('matured origin의 source gap 비율이 1%를 초과하면 ineligible이다', () => {
    const result = evaluate({ labelAccounting: { terminal: 100, pending: 0, sourceGap: 2 } })

    expect(result.reasons).toContain('label_source_gap_above_sla')
  })

  it('unmatured origin은 label 기준을 평가하지 않고 evidence에 카운트만 남긴다', () => {
    const result = evaluate({
      matured: false,
      labelAccounting: { terminal: 0, pending: 100, sourceGap: 100 },
    })

    expect(result.verdict).toBe('eligible')
    expect(result.reasons).toEqual([])
    expect(result.evidence.label_accounting).toEqual({ terminal: 0, pending: 100, source_gap: 100 })
  })

  it('같은 상태는 입력 배열 순서와 평가 시각에 무관하게 같은 payload SHA를 낸다', () => {
    const first = evaluate()
    const second = evaluate({
      rosterThemeIds: [...themeIds(100)].reverse(),
      expectedThemeIds: [...themeIds(100)].reverse(),
      usableThemeIds: [...themeIds(90)].reverse(),
    })

    expect(second.payloadSha256).toBe(first.payloadSha256)
    expect(first).not.toHaveProperty('evaluatedAt')
  })
})
