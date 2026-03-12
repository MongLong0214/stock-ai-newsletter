import { describe, expect, it } from 'vitest'
import { buildCertificationRuntimeChecks } from '../level4/certification-runtime'

describe('certification runtime checks', () => {
  it('marks serving and payload checks as verified when pinned metadata matches the active control row', () => {
    const checks = buildCertificationRuntimeChecks({
      controlRow: {
        calibration_version: 'cal-1',
        weight_version: 'baseline',
        promotion_gate_status: 'passed',
        promotion_gate_failures: [],
        previous_stable_version: 'comparison-v4-shadow-v1',
      },
      comparisonRows: [
        {
          relevanceProbability: 0.12,
          probabilityCiLower: 0.08,
          probabilityCiUpper: 0.16,
          supportCount: 220,
          confidenceTier: 'high',
          calibrationVersion: 'cal-1',
          weightVersion: 'baseline',
          sourceSurface: 'v2_certification',
        },
      ],
      uiLowConfidenceSupported: true,
    })

    expect(checks.probabilityServing).toBe(true)
    expect(checks.promotionGate).toBe(true)
    expect(checks.payloadMetadataVerified).toBe(true)
    expect(checks.uiLowConfidencePathVerified).toBe(true)
    expect(checks.rollbackDrill).toBe(true)
  })

  it('fails payload verification when pinned metadata does not match the active control row', () => {
    const checks = buildCertificationRuntimeChecks({
      controlRow: {
        calibration_version: 'cal-1',
        weight_version: 'baseline',
        promotion_gate_status: 'passed',
        promotion_gate_failures: [],
        previous_stable_version: null,
      },
      comparisonRows: [
        {
          relevanceProbability: null,
          probabilityCiLower: null,
          probabilityCiUpper: null,
          supportCount: null,
          confidenceTier: null,
          calibrationVersion: 'cal-2',
          weightVersion: 'baseline',
          sourceSurface: 'v2_certification',
        },
      ],
      uiLowConfidenceSupported: false,
    })

    expect(checks.probabilityServing).toBe(false)
    expect(checks.payloadMetadataVerified).toBe(false)
    expect(checks.rollbackDrill).toBe(false)
    expect(checks.uiLowConfidencePathVerified).toBe(false)
  })
})
