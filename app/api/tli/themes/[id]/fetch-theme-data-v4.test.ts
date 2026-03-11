import { describe, expect, it } from 'vitest'
import {
  buildComparisonsQueryDescriptor,
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

  it('falls back to legacy comparisons when the v4 reader returns an error', () => {
    expect(shouldFallbackToLegacyComparisons({ data: null, error: { message: 'rls' } })).toBe(true)
  })

  it('falls back to legacy comparisons when the v4 reader returns no published rows', () => {
    expect(shouldFallbackToLegacyComparisons({ data: [], error: null })).toBe(true)
    expect(shouldFallbackToLegacyComparisons({ data: [{ id: 'x' }], error: null })).toBe(false)
  })

  it('prefers legacy comparisons only when the v4 result is unsafe', () => {
    const legacy = { data: [{ id: 'legacy' }], error: null }
    expect(resolveComparisonsResult({ data: [{ id: 'v4' }], error: null }, legacy)).toEqual({ data: [{ id: 'v4' }], error: null })
    expect(resolveComparisonsResult({ data: [], error: null }, legacy)).toEqual(legacy)
    expect(resolveComparisonsResult({ data: null, error: { message: 'rls' } }, legacy)).toEqual(legacy)
  })
})
