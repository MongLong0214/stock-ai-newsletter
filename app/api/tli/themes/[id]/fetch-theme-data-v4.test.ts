import { describe, expect, it } from 'vitest'
import {
  buildComparisonsQueryDescriptor,
  isCertificationArtifactError,
  resolveComparisonsResult,
  shouldFallbackToLegacyComparisons,
} from './fetch-theme-data-v4'

describe('fetch theme data v4 descriptor', () => {
  it('uses the v4 reader path when serving flag is enabled', () => {
    const descriptor = buildComparisonsQueryDescriptor({
      themeId: 'theme-1',
      threeDaysAgo: '2026-03-08',
      useV4Serving: true,
    })

    expect(descriptor.mode).toBe('v4')
    expect(descriptor.themeId).toBe('theme-1')
  })

  it('uses the legacy query path when serving flag is disabled', () => {
    const descriptor = buildComparisonsQueryDescriptor({
      themeId: 'theme-1',
      threeDaysAgo: '2026-03-08',
      useV4Serving: false,
    })

    expect(descriptor.mode).toBe('legacy')
    expect(descriptor.threeDaysAgo).toBe('2026-03-08')
  })

  it('does not hide v4 serving errors behind legacy comparisons', () => {
    expect(shouldFallbackToLegacyComparisons({ data: null, error: { message: 'rls' } })).toBe(false)
  })

  it('does not fall back when v4 returns empty data (legitimate no-comparisons)', () => {
    expect(shouldFallbackToLegacyComparisons({ data: [], error: null })).toBe(false)
    expect(shouldFallbackToLegacyComparisons({ data: [{ id: 'x' }], error: null })).toBe(false)
  })

  it('does not fall back when v4 returns null data without an explicit compatibility signal', () => {
    expect(shouldFallbackToLegacyComparisons({ data: null, error: null })).toBe(false)
  })

  it('does not replace broken v4 responses with legacy data', () => {
    const legacy = { data: [{ id: 'legacy' }], error: null }
    expect(resolveComparisonsResult({ data: [{ id: 'v4' }], error: null }, legacy)).toEqual({ data: [{ id: 'v4' }], error: null })
    expect(resolveComparisonsResult({ data: [], error: null }, legacy)).toEqual({ data: [], error: null })
    expect(resolveComparisonsResult({ data: null, error: { message: 'rls' } }, legacy)).toEqual({ data: null, error: { message: 'rls' } })
  })

  it('does not fall back to legacy when v4 serving is blocked by certification-grade artifact enforcement', () => {
    const v4Result = { data: null, error: { code: 'CERTIFICATION_REQUIRED', message: 'Missing certification-grade calibration artifact' } }
    const legacy = { data: [{ id: 'legacy' }], error: null }

    expect(isCertificationArtifactError(v4Result.error)).toBe(true)
    expect(shouldFallbackToLegacyComparisons(v4Result)).toBe(false)
    expect(resolveComparisonsResult(v4Result, legacy)).toEqual(v4Result)
  })
})
