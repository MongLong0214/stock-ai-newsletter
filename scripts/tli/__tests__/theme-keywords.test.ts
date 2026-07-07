import { describe, expect, it } from 'vitest'
import {
  buildKeywordEpochPatch,
  computeThemeKeywordHash,
} from '../themes/theme-keywords'

describe('theme keyword epoch helpers', () => {
  it('hashes a sorted unique keyword list', () => {
    expect(computeThemeKeywordHash(['반도체', 'AI', '반도체']))
      .toBe(computeThemeKeywordHash(['AI', '반도체']))
  })

  it('keeps epoch at first hash materialization', () => {
    expect(buildKeywordEpochPatch({
      keywords: ['AI', '반도체'],
      currentEpoch: 1,
      currentHash: null,
    }).keyword_epoch).toBe(1)
  })

  it('increments epoch only when an existing hash changes', () => {
    const previousHash = computeThemeKeywordHash(['AI', '반도체'])
    const unchanged = buildKeywordEpochPatch({
      keywords: ['반도체', 'AI'],
      currentEpoch: 3,
      currentHash: previousHash,
    })
    const changed = buildKeywordEpochPatch({
      keywords: ['AI', '로봇'],
      currentEpoch: 3,
      currentHash: previousHash,
    })

    expect(unchanged.keyword_epoch).toBe(3)
    expect(changed.keyword_epoch).toBe(4)
  })
})
