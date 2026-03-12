import { describe, expect, it } from 'vitest'
import {
  buildLevel4CertificationChecklist,
  renderLevel4CertificationReport,
} from '../level4/certification-rehearsal'

describe('TLI4-015 level4 certification rehearsal', () => {
  it('builds a checklist that includes payload and UI confidence semantics', () => {
    const checklist = buildLevel4CertificationChecklist({
      calibrationArtifact: true,
      probabilityServing: true,
      promotionGate: true,
      driftReport: true,
      rollbackDrill: true,
      payloadMetadataVerified: true,
      uiLowConfidencePathVerified: true,
    })

    expect(checklist.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      'calibration-artifact',
      'probability-serving',
      'promotion-gate',
      'drift-report',
      'rollback-drill',
      'payload-metadata',
      'ui-low-confidence',
    ]))
    expect(checklist.passed).toBe(true)
  })

  it('renders an end-to-end certification report with explicit acceptance verdict', () => {
    const checklist = buildLevel4CertificationChecklist({
      calibrationArtifact: true,
      probabilityServing: true,
      promotionGate: true,
      driftReport: true,
      rollbackDrill: true,
      payloadMetadataVerified: true,
      uiLowConfidencePathVerified: true,
    })

    const report = renderLevel4CertificationReport({
      releaseCandidate: 'algo-v4-prod',
      checklist,
      rollbackEvidence: 'rollback drill completed on 2026-03-12',
      summary: 'All level-4 acceptance criteria are satisfied.',
    })

    expect(report).toContain('# TLI Comparison Level-4 Certification Report')
    expect(report).toContain('algo-v4-prod')
    expect(report).toContain('rollback drill completed on 2026-03-12')
    expect(report).toContain('Overall Verdict: PASS')
    expect(report).toContain('UI low-confidence badge/copy path')
  })
})