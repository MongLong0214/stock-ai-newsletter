import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateTliPromotionGate, type PromotionGateInput } from '../promotion-gate'
import { promoteOrKeep } from '../run-weekly-learn'

const passingInput: PromotionGateInput = {
  nEff: 320,
  cycleExtendedWeeks: 0,
  promotionsThisYear: 1,
  brierChampion: 0.20,
  deltaBrierPoint: -0.006,
  deltaBrierUpper99: -0.001,
  ecePoint: 0.05,
  eceUpper95: 0.09,
  pAt10Challenger: 0.47,
  pAt10Champion: 0.50,
  clusterBalance: {
    topFivePercentLabelShare: 0.24,
    wildClusterBootstrapUsed: false,
  },
}

const evaluation = (passed: boolean) => ({
  step: 'evaluate-challenger' as const,
  dryRun: false,
  scenario: null,
  candidateModelVersion: 'm1-2026w28-a2',
  gate: evaluateTliPromotionGate(passed
    ? passingInput
    : { ...passingInput, deltaBrierPoint: 0 }),
})

const promotedResult = {
  modelVersion: 'm1-2026w28-a2',
  status: 'champion' as const,
  promotedAt: '2026-07-10T00:00:00.000Z',
  previousChampion: 'b-abl-v1',
}

describe('weekly M1 promotion containment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    ['unset', undefined],
    ['false', 'false'],
    ['numeric truthy', '1'],
  ])('returns promotion_disabled with zero RPC when the flag is %s', async (_label, flag) => {
    const promote = vi.fn().mockResolvedValue(promotedResult)
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', flag)

    const result = await promoteOrKeep({
      dryRun: false,
      evaluation: evaluation(true),
    }, promote)

    expect(result).toMatchObject({
      step: 'promote-or-keep',
      action: 'promotion_disabled',
      dryRun: false,
    })
    expect(promote).not.toHaveBeenCalled()
  })

  it('keeps a failed gate without calling the RPC even when promotion is enabled', async () => {
    const promote = vi.fn().mockResolvedValue(promotedResult)
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', 'true')

    const result = await promoteOrKeep({
      dryRun: false,
      evaluation: evaluation(false),
    }, promote)

    expect(result).toMatchObject({ action: 'keep_champion' })
    expect(promote).not.toHaveBeenCalled()
  })

  it('keeps enabled dry-runs write-free', async () => {
    const promote = vi.fn().mockResolvedValue(promotedResult)
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', 'true')

    const result = await promoteOrKeep({
      dryRun: true,
      evaluation: evaluation(true),
    }, promote)

    expect(result).toMatchObject({
      action: 'would_promote',
      dryRun: true,
      modelVersion: 'm1-2026w28-a2',
    })
    expect(promote).not.toHaveBeenCalled()
  })

  it('calls the promotion RPC exactly once only for an enabled passing real run', async () => {
    const promote = vi.fn().mockResolvedValue(promotedResult)
    vi.stubEnv('TLI_M1_PROMOTION_ENABLED', 'true')

    const result = await promoteOrKeep({
      dryRun: false,
      evaluation: evaluation(true),
    }, promote)

    expect(promote).toHaveBeenCalledTimes(1)
    expect(promote).toHaveBeenCalledWith('m1-2026w28-a2')
    expect(result).toMatchObject({
      action: 'promoted',
      result: promotedResult,
    })
  })
})
