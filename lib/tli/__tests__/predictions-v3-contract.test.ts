import { describe, expect, it } from 'vitest'
import {
  PHASE_DEPRECATION_NOTICE,
  buildPredictionApiItem,
  derivePredictionPhase,
} from '@/lib/tli/predictions-v3-contract'

const row = {
  theme_id: '11111111-1111-4111-8111-111111111111',
  prediction_date: '2026-08-03',
  p_rise: '0.68',
  ci_lower: '0.59',
  ci_upper: '0.77',
  abstain: false,
  abstain_reasons: [],
  model_version: 'm1-2026w31',
}

describe('predictions v3 API contract', () => {
  it('maps a DB snapshot row without recalculating exposed probability values', () => {
    const item = buildPredictionApiItem({
      row,
      themeName: 'AI 반도체',
      trailing90d: { topSignalPrecision: 0.63, n: 214 },
    })

    expect(item).toEqual({
      id: row.theme_id,
      name: 'AI 반도체',
      themeId: row.theme_id,
      predictionDate: '2026-08-03',
      pRise: 0.68,
      ciLower: 0.59,
      ciUpper: 0.77,
      abstain: false,
      abstainReasons: [],
      modelVersion: 'm1-2026w31',
      trailing90d: { topSignalPrecision: 0.63, n: 214 },
      phase: 'rising',
      deprecation: { phase: PHASE_DEPRECATION_NOTICE },
    })
  })

  it('derives the legacy phase only from pRise thresholds and hides phase on abstain', () => {
    expect(derivePredictionPhase({ pRise: 0.6, abstain: false })).toBe('rising')
    expect(derivePredictionPhase({ pRise: 0.4, abstain: false })).toBe('hot')
    expect(derivePredictionPhase({ pRise: 0.399, abstain: false })).toBe('cooling')
    expect(derivePredictionPhase({ pRise: null, abstain: true })).toBeNull()
  })

  it.each([
    ['missing lower bound', { ci_lower: null }],
    ['missing upper bound', { ci_upper: null }],
    ['lower above p', { ci_lower: '0.70' }],
    ['p above upper', { ci_upper: '0.60' }],
  ])('fails closed for a non-abstain scientific interval with %s', (_name, change) => {
    expect(() => buildPredictionApiItem({
      row: { ...row, ...change },
      themeName: 'AI 반도체',
      trailing90d: { topSignalPrecision: 0.63, n: 214 },
    })).toThrow(/interval/)
  })

  it('allows an explicit abstain row without probability interval values', () => {
    const item = buildPredictionApiItem({
      row: { ...row, p_rise: null, ci_lower: null, ci_upper: null, abstain: true },
      themeName: 'AI 반도체',
      trailing90d: { topSignalPrecision: null, n: 0 },
    })

    expect(item).toMatchObject({ pRise: null, ciLower: null, ciUpper: null, abstain: true, phase: null })
  })
})
