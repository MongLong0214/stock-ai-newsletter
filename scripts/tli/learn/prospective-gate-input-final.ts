import type { BootstrapResult, FinalPromotionGateInput } from './prospective-gate-final'
import type { ProspectiveFinalDataset } from './prospective-gate-input-contract'
import { calculatePAt10, type KospiRegime } from './prospective-gate-metrics'

const meanBrier = (
  rows: ProspectiveFinalDataset['rows'],
  probability: 'candidateProbability' | 'comparatorProbability',
): number => rows.length === 0 ? 1 : rows.reduce((sum, row) => (
  sum + (row[probability] - (row.outcome ? 1 : 0)) ** 2
), 0) / rows.length

export function buildFinalPromotionGateInput(
  dataset: ProspectiveFinalDataset,
  bootstrap: BootstrapResult,
): FinalPromotionGateInput {
  const pAt10 = calculatePAt10(dataset.rows, dataset.plannedOrigins)
  const regimeOrder: readonly KospiRegime[] = ['risk_off', 'neutral', 'risk_on']
  const regimes = regimeOrder.map((regime) => {
    const rows = dataset.rows.filter((row) => row.regime === regime)
    return {
      regime,
      originCount: dataset.eligibleOrigins.filter((origin) => origin.regime === regime).length,
      pairedRowCount: rows.length,
      candidateBrier: meanBrier(rows, 'candidateProbability'),
      comparatorBrier: meanBrier(rows, 'comparatorProbability'),
      deltaLower95: bootstrap.regimeLower95[regime]?.lower95 ?? null,
    }
  })
  return {
    cycleId: dataset.cycleId,
    plannedOrigins: dataset.plannedOrigins,
    sequenceStart: dataset.sequenceStart,
    sequenceEnd: dataset.sequenceEnd,
    completeness: {
      pooledRatio: dataset.completeness.pooledRatio,
      minimumOriginRatio: dataset.completeness.minimumOriginRatio,
      terminalAccountingRatio: dataset.completeness.terminalAccountingRatio,
      maximumOriginSourceGapRatio: dataset.completeness.maximumOriginSourceGapRatio,
      pooledCoverage: dataset.completeness.pooledCoverage,
    },
    metrics: {
      candidateBrier: meanBrier(dataset.rows, 'candidateProbability'),
      comparatorBrier: meanBrier(dataset.rows, 'comparatorProbability'),
      pAt10Candidate: pAt10.candidate,
      pAt10Comparator: pAt10.comparator,
      pAt10ValidOrigins: pAt10.validOrigins,
      pAt10RequiredOrigins: pAt10.requiredOrigins,
      pAt10TieBreak: pAt10.tieBreak,
      regimes,
    },
    criticalIncidentCount: dataset.criticalIncidentCount,
    gateInputSha256: dataset.gateInputSha256,
    frozenHashes: dataset.frozenHashes,
    expectedFrozenHashes: dataset.expectedFrozenHashes,
    bootstrap,
  }
}
