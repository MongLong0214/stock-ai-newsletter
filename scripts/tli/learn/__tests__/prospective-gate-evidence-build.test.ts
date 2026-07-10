import { describe, expect, it } from 'vitest'

import { bootstrapResultSha256, evaluateFinalPromotionGate } from '../prospective-gate-final'
import { buildFinalEvidenceArtifact, buildSafetyEvidenceArtifact } from '../prospective-gate-evidence-build'
import type { ProspectiveFinalDataset } from '../prospective-gate-input-contract'
import { evaluateSafetyCheckpoint } from '../prospective-gate-metrics'

const cycleId = '10000000-0000-4000-8000-000000000014'
const sha = (digit: string): string => digit.repeat(64)
const hashes = {
  studyContractSha256: sha('1'), candidateModelSha256: sha('2'), comparatorArtifactSha256: sha('3'),
  datasetManifestSha256: sha('4'), featureContractSha256: sha('5'), labelContractSha256: sha('6'),
  calibrationArtifactSha256: sha('7'),
}

describe('prospective gate evidence builders', () => {
  it('renders safety results without efficacy fields', () => {
    const evaluation = evaluateSafetyCheckpoint({
      cycleId, sequenceStart: 1, sequenceEnd: 8,
      rows: [{ originDate: '2026-07-06', themeId: 'theme-a', candidateProbability: 0.9, outcome: true }],
      criticalIncidentCount: 0, gateInputSha256: sha('a'), frozenHashes: hashes,
    })
    const artifact = buildSafetyEvidenceArtifact({ evaluation, incidents: [] })

    expect(artifact.decision).toBe('pass')
    expect(Object.keys(artifact)).not.toContain('promotion_action')
    expect(JSON.stringify(artifact)).not.toMatch(/bootstrap|p_at_10|relative_brier|regime/)
  })

  it('maps the complete final result and deterministic bootstrap receipt', () => {
    const bootstrapCore = {
      contractVersion: 'bootstrap-v1', method: 'theme_x_two_week_moving_block', replicates: 10_000,
      movingBlockLength: 2, eceBinCount: 10, inputSha256: sha('a'),
      deltaBrier: { seed: 14, point: -0.02, upper99: -0.001, replicateSha256: sha('b') },
      ece: { seed: 15, point: 0.05, upper95: 0.08, replicateSha256: sha('c') },
      regimeLower95: { risk_off: null, neutral: null, risk_on: null },
    }
    const bootstrap = { ...bootstrapCore, resultSha256: bootstrapResultSha256(bootstrapCore) }
    const completeness = {
      expectedPairCount: 160, terminalPairCount: 160, exactPairedCount: 160,
      pooledRatio: 1, minimumOriginRatio: 1, terminalAccountingRatio: 1,
      maximumOriginSourceGapRatio: 0, pooledCoverage: 0.8, excludedReasonCounts: [],
    }
    const regimes = (['risk_off', 'neutral', 'risk_on'] as const).map((regime) => ({
      regime, originCount: 3, pairedRowCount: 90, candidateBrier: 0.18,
      comparatorBrier: 0.2, deltaLower95: null,
    }))
    const evaluation = evaluateFinalPromotionGate({
      cycleId, plannedOrigins: 16, sequenceStart: 1, sequenceEnd: 16,
      completeness, metrics: {
        candidateBrier: 0.18, comparatorBrier: 0.2, pAt10Candidate: 0.6,
        pAt10Comparator: 0.58, pAt10ValidOrigins: 13, pAt10RequiredOrigins: 13,
        pAt10TieBreak: 'probability_desc_theme_id_asc', regimes,
      },
      criticalIncidentCount: 0, gateInputSha256: sha('a'), frozenHashes: hashes,
      expectedFrozenHashes: hashes, bootstrap,
    })
    const dataset: ProspectiveFinalDataset = {
      cycleId, plannedOrigins: 16, sequenceStart: 1, sequenceEnd: 16,
      decisionOriginDate: '2026-10-19', rows: [], completeness,
      criticalIncidentCount: 0, incidents: [], gateInputSha256: sha('a'),
      frozenHashes: hashes, expectedFrozenHashes: hashes,
    }
    const artifact = buildFinalEvidenceArtifact({
      evaluation, dataset,
      bootstrapReceipt: { requestSha256: sha('e'), bridgeResultSha256: sha('f'), bootstrap },
    })

    expect(artifact.promotion_action).toBe('would_promote')
    expect(artifact.completeness.exact_paired_count).toBe(160)
    expect(artifact.bootstrap_receipt).toEqual({ request_sha256: sha('e'), bridge_result_sha256: sha('f') })
  })
})
