import { describe, expect, it } from 'vitest'
import {
  computeAnchorScaleFactor,
  computeCoefficientOfVariation,
  isDatalabAnchorEnabled,
  splitDatalabThemeBatches,
} from '../collectors/naver-datalab'

describe('DataLab anchor batching helpers', () => {
  it('enables the anchor by default and supports rollback env values', () => {
    expect(isDatalabAnchorEnabled(undefined)).toBe(true)
    expect(isDatalabAnchorEnabled('true')).toBe(true)
    expect(isDatalabAnchorEnabled('0')).toBe(false)
    expect(isDatalabAnchorEnabled('false')).toBe(false)
  })

  it('uses four theme slots when the anchor occupies one DataLab group', () => {
    expect(splitDatalabThemeBatches([1, 2, 3, 4, 5, 6, 7, 8, 9], true))
      .toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]])
  })

  it('keeps five theme slots when the rollback flag disables anchors', () => {
    expect(splitDatalabThemeBatches([1, 2, 3, 4, 5, 6], false))
      .toEqual([[1, 2, 3, 4, 5], [6]])
  })

  it('scales by the latest seven-day anchor median with an epsilon floor', () => {
    expect(computeAnchorScaleFactor([10, 20, 30, 40, 50, 60, 70]))
      .toBeCloseTo(1 / 40, 10)
    expect(computeAnchorScaleFactor([0, 0, 0, 0, 0, 0, 0]))
      .toBe(1)
  })

  it('computes coefficient of variation for anchor drift warnings', () => {
    expect(computeCoefficientOfVariation([10, 10, 10])).toBe(0)
    expect(computeCoefficientOfVariation([1, 10, 20])).toBeGreaterThan(0.3)
  })
})
