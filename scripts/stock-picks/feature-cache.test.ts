import { describe, expect, it } from 'vitest'
import { featureCacheKey } from '@/scripts/stock-picks/feature-cache'

const base = {
  symbolCount: 2642,
  historyStart: '2024-08-28',
  historyEnd: '2026-09-14',
  evaluationStart: '2026-01-02',
  priceRowCount: 1_332_587,
  featureSourceHash: 'a'.repeat(64),
}

/**
 * 캐시가 위험해지는 경우는 하나다: 입력이 바뀌었는데 옛 피처를 그대로 쓰는 것.
 * 키가 모든 입력 축을 반영하는지 고정한다.
 */
describe('featureCacheKey', () => {
  it('같은 입력이면 같은 키다', () => {
    expect(featureCacheKey(base)).toBe(featureCacheKey({ ...base }))
  })

  it('가격 행이 늘면 키가 바뀐다 — 데이터 갱신 후 옛 피처 재사용을 막는다', () => {
    expect(featureCacheKey({ ...base, priceRowCount: base.priceRowCount + 1 })).not.toBe(featureCacheKey(base))
  })

  it('피처 계산 소스 해시가 바뀌면 키가 바뀐다', () => {
    expect(featureCacheKey({ ...base, featureSourceHash: 'b'.repeat(64) })).not.toBe(featureCacheKey(base))
  })

  it('종목 수·구간이 바뀌면 키가 바뀐다', () => {
    for (const patch of [
      { symbolCount: 2641 },
      { historyStart: '2024-08-29' },
      { historyEnd: '2026-09-15' },
      { evaluationStart: '2026-01-03' },
    ]) {
      expect(featureCacheKey({ ...base, ...patch }), JSON.stringify(patch)).not.toBe(featureCacheKey(base))
    }
  })
})
