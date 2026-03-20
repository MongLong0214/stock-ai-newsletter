import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEFAULT_TLI_PARAMS, computeWActivity, computeSentVolumeWeight, getTLIParams, setTLIParams } from '@/lib/tli/constants/tli-params'

describe('TLIParams', () => {
  beforeEach(() => {
    setTLIParams(null)
    vi.unstubAllEnvs()
  })

  // T2 Test #1
  it('getTLIParams returns defaults when no override', () => {
    const params = getTLIParams()
    expect(params.w_interest).toBe(0.304148)
    expect(params.w_newsMomentum).toBe(0.366408)
    expect(params.w_volatility).toBe(0.104017)
    expect(params.stage_dormant).toBe(10)
    expect(params.ema_alpha).toBe(0.416554)
    expect(params.min_raw_interest).toBe(4)
    expect(params.cautious_floor_ratio).toBe(0.946661)
  })

  // T2 Test #2
  it('setTLIParams overrides specific fields', () => {
    setTLIParams({ w_interest: 0.50, stage_peak: 75 })
    const params = getTLIParams()
    expect(params.w_interest).toBe(0.50)
    expect(params.stage_peak).toBe(75)
    expect(params.w_newsMomentum).toBe(0.366408) // unchanged
  })

  // T2 Test #3
  it('setTLIParams resets on null', () => {
    setTLIParams({ w_interest: 0.50 })
    setTLIParams(null)
    const params = getTLIParams()
    expect(params.w_interest).toBe(0.304148) // back to default
  })

  // T2 Test #4
  it('weight fields sum to 1.0 in defaults', () => {
    const sum = DEFAULT_TLI_PARAMS.w_interest
      + DEFAULT_TLI_PARAMS.w_newsMomentum
      + DEFAULT_TLI_PARAMS.w_volatility
      + computeWActivity(DEFAULT_TLI_PARAMS)
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001)
  })

  // T2 Test #5
  it('stage thresholds are monotonically increasing', () => {
    const p = DEFAULT_TLI_PARAMS
    expect(p.stage_dormant).toBeLessThan(p.stage_emerging)
    expect(p.stage_emerging).toBeLessThan(p.stage_growth)
    expect(p.stage_growth).toBeLessThan(p.stage_peak)
  })

  // T2 Test #6
  it('env var v1 returns defaults', () => {
    vi.stubEnv('TLI_PARAMS_VERSION', 'v1')
    const params = getTLIParams()
    expect(params.w_interest).toBe(DEFAULT_TLI_PARAMS.w_interest)
  })

  // T2 Test #7 — optimized-params.json now exists, so v2 loads it (full-precision values)
  it('env var v2 loads optimized-params.json when present', () => {
    vi.stubEnv('TLI_PARAMS_VERSION', 'v2')
    const params = getTLIParams()
    // JSON has full-precision values that round to the truncated defaults
    expect(params.w_interest).toBeCloseTo(DEFAULT_TLI_PARAMS.w_interest, 4)
    expect(params.w_newsMomentum).toBeCloseTo(DEFAULT_TLI_PARAMS.w_newsMomentum, 4)
    expect(params.w_volatility).toBeCloseTo(DEFAULT_TLI_PARAMS.w_volatility, 4)
  })

  // T2 Test #8 - computeWActivity
  it('computeWActivity returns correct computed value', () => {
    expect(computeWActivity(DEFAULT_TLI_PARAMS)).toBeCloseTo(0.225427, 3)
  })

  // T2 Test #9 - computeSentVolumeWeight
  it('computeSentVolumeWeight returns correct computed value', () => {
    expect(computeSentVolumeWeight(DEFAULT_TLI_PARAMS)).toBeCloseTo(0.20, 3)
  })

  // T2 Test - 32 fields check
  it('DEFAULT_TLI_PARAMS has exactly 50 fields', () => {
    expect(Object.keys(DEFAULT_TLI_PARAMS)).toHaveLength(50)
  })
})
