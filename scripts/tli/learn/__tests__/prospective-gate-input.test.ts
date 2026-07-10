import { describe, expect, it } from 'vitest'

import {
  assembleProspectiveGateInput,
  buildFinalPromotionGateInput,
  type ProspectiveGateSource,
} from '../gate-input-from-db'
import {
  bootstrapResultSha256,
  evaluateFinalPromotionGate,
  evaluateSafetyCheckpoint,
  type BootstrapResultCore,
} from '../promotion-gate'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'
const STUDY_CONTRACT_ID = '10000000-0000-4000-8000-000000000013'
const sha = (digit: string): string => digit.repeat(64)
const SOURCE_PROOF = {
  interest_run_status: 'complete' as const,
  interest_run_source: 'naver_datalab',
  interest_run_before_cutoff: true,
  interest_observation_count: 20,
  interest_observation_run_count: 1,
  news_observation_count: 14,
  news_run_statuses: ['complete'],
  news_before_cutoff: true,
}

const buildSource = (input: {
  readonly count: number
  readonly planned?: number
  readonly safetyPassed?: boolean
  readonly sequences?: readonly number[]
  readonly hashDriftSequence?: number
  readonly omitCycleEvidence?: boolean
  readonly comparatorAbstainAt?: { readonly sequence: number; readonly theme: number }
}): ProspectiveGateSource => {
  const planned = input.planned ?? 16
  const sequences = input.sequences ?? Array.from({ length: input.count }, (_, index) => index + 1)
  const origins = sequences.map((sequence) => {
    const regime = sequence <= 4 ? 'risk_off' as const
      : sequence > planned - 4 ? 'risk_on' as const : 'neutral' as const
    return {
      id: `origin-${sequence}`, cycle_id: CYCLE_ID,
      study_origin_manifest_id: `study-origin-${sequence}`,
      study_origin: {
        study_contract_id: STUDY_CONTRACT_ID,
        forecast_origin_manifest_id: `forecast-${sequence}`,
        payload_sha256: sha('d'),
      },
      forecast_origin_manifest_id: `forecast-${sequence}`,
      sequence_no: sequence, enrollment_role: 'confirmatory',
      candidate_model_sha256: sha('2'), comparator_artifact_sha256: sha('3'),
      kospi_base_trade_date: '2025-12-31',
      kospi_base_close: regime === 'risk_off' ? 96 : regime === 'risk_on' ? 104 : 100,
      kospi_lookback_trade_date: '2025-12-01', kospi_lookback_close: 100,
      kospi_source_ids: [`kospi-${sequence}-base`, `kospi-${sequence}-lookback`],
      kospi_input_sha256: sha('e'), regime,
    }
  })
  const forecasts = origins.map((origin) => ({
    id: origin.forecast_origin_manifest_id,
    origin_date: `2026-${String(1 + Math.floor((origin.sequence_no - 1) / 4)).padStart(2, '0')}-${String(5 + ((origin.sequence_no - 1) % 4) * 7).padStart(2, '0')}`,
    forecast_cutoff: `2026-${String(1 + Math.floor((origin.sequence_no - 1) / 4)).padStart(2, '0')}-${String(5 + ((origin.sequence_no - 1) % 4) * 7).padStart(2, '0')}T09:00:00.000Z`,
    expected_theme_count: 10,
    expected_universe_sha256: sha('8'),
    keyword_group_manifest_sha256: sha('9'),
    payload_sha256: sha('a'),
  }))
  const expectedThemes = origins.flatMap((origin) => Array.from({ length: 10 }, (_, theme) => ({
    forecast_origin_manifest_id: origin.forecast_origin_manifest_id,
    theme_id: `theme-${String(theme).padStart(2, '0')}`,
    keyword_group_sha256: sha('d'),
    forecast_interest_run_id: `interest-${origin.sequence_no}`,
    forecast_interest_response_sha256: sha('e'),
    news_observation_ids: Array.from({ length: 14 }, (_, index) => `news-${origin.sequence_no}-${theme}-${index}`),
    news_input_sha256: sha('f'),
    input_status: 'usable' as const,
    abstain_reason: null,
    source_proof: SOURCE_PROOF,
  })))
  const predictions = origins.flatMap((origin) => {
    const forecast = forecasts.find((row) => row.id === origin.forecast_origin_manifest_id)
    if (forecast === undefined) throw new Error('fixture forecast missing')
    return Array.from({ length: 10 }, (_, theme) => {
      const outcome = theme < 5
      const themeId = `theme-${String(theme).padStart(2, '0')}`
      return (['candidate', 'comparator'] as const).map((role) => ({
        id: `${origin.id}-${themeId}-${role}`, experiment_cycle_id: CYCLE_ID,
        experiment_origin_manifest_id: origin.id, theme_id: themeId,
        prediction_date: forecast.origin_date, horizon_days: 5, labeler_version: 'gta-v2',
        scientific_prediction_role: role,
        model_artifact_sha256: origin.sequence_no === input.hashDriftSequence && role === 'candidate'
          ? sha('f') : role === 'candidate' ? sha('2') : sha('3'),
        feature_contract_hash: sha('5'), forecast_cutoff: forecast.forecast_cutoff,
        forecast_origin_week: forecast.origin_date,
        p_rise: role === 'candidate' ? outcome ? 0.95 : 0.05 : outcome ? 0.6 : 0.4,
        ci_lower: role === 'candidate' ? outcome ? 0.9 : 0.01 : outcome ? 0.5 : 0.3,
        ci_upper: role === 'candidate' ? outcome ? 0.99 : 0.1 : outcome ? 0.7 : 0.5,
        abstain: role === 'comparator'
          && input.comparatorAbstainAt?.sequence === origin.sequence_no
          && input.comparatorAbstainAt.theme === theme,
        actual_y: outcome, actual_label_id: `label-${origin.sequence_no}-${theme}`,
        score_status: 'scored' as const, score_exclusion_reason: null,
      }))
    }).flat()
  })
  const cycleEvidence = ['preregistration', 'cycle_manifest', 'dataset_manifest', 'model_manifest'].map((type, index) => ({
    id: `artifact-cycle-${index}`, cycle_id: CYCLE_ID, experiment_origin_manifest_id: null,
    artifact_type: type, artifact_key: 'singleton', content_sha256: sha('7'), payload: {},
  }))
  const originEvidence = origins.map((origin) => {
    const forecast = forecasts.find((row) => row.id === origin.forecast_origin_manifest_id)
    if (forecast === undefined) throw new Error('fixture forecast missing')
    return {
      id: `artifact-${origin.id}`, cycle_id: CYCLE_ID, experiment_origin_manifest_id: origin.id,
      artifact_type: 'origin_manifest', artifact_key: forecast.origin_date,
      content_sha256: sha('a'),
      payload: {
        manifest_version: 'origin-manifest-v1', experiment_origin_manifest_id: origin.id,
        cycle_id: CYCLE_ID, study_origin_manifest_id: origin.study_origin_manifest_id,
        forecast_origin_manifest_id: origin.forecast_origin_manifest_id,
        study_contract_id: STUDY_CONTRACT_ID, study_contract_sha256: sha('1'),
        enrollment_role: origin.enrollment_role, sequence_no: origin.sequence_no,
        origin_date: forecast.origin_date, forecast_cutoff: forecast.forecast_cutoff,
        expected_universe_sha256: forecast.expected_universe_sha256,
        keyword_group_manifest_sha256: forecast.keyword_group_manifest_sha256,
        forecast_payload_sha256: forecast.payload_sha256,
        study_origin_payload_sha256: origin.study_origin.payload_sha256,
        candidate_model_sha256: origin.candidate_model_sha256,
        comparator_artifact_sha256: origin.comparator_artifact_sha256,
        kospi_base_trade_date: origin.kospi_base_trade_date, kospi_base_close: origin.kospi_base_close,
        kospi_lookback_trade_date: origin.kospi_lookback_trade_date,
        kospi_lookback_close: origin.kospi_lookback_close,
        kospi_source_ids: origin.kospi_source_ids, kospi_input_sha256: origin.kospi_input_sha256,
        regime: origin.regime,
      },
    }
  })
  const safetyEvidence = input.safetyPassed ? [{
    id: 'artifact-safety', cycle_id: CYCLE_ID, experiment_origin_manifest_id: null,
    artifact_type: 'safety_report', artifact_key: 'singleton', content_sha256: sha('b'),
    payload: { decision: 'pass' },
  }] : []
  const evidence = [...(input.omitCycleEvidence ? [] : cycleEvidence), ...originEvidence, ...safetyEvidence]
  return {
    cycle: {
      id: CYCLE_ID, status: 'running', study_contract_id: STUDY_CONTRACT_ID,
      study_contract_sha256: sha('1'),
      candidate_model_sha256: sha('2'), comparator_artifact_sha256: sha('3'),
      dataset_manifest_sha256: sha('4'), feature_contract_sha256: sha('5'),
      labeler_version: 'gta-v2', label_contract_sha256: sha('6'),
      calibration_artifact_sha256: sha('7'), planned_origins: planned, safety_origins: 8,
      safety_checked_at: input.safetyPassed ? '2026-03-01T00:00:00.000Z' : null,
      decision_at: null,
    },
    origins, forecasts, expectedThemes, predictions, evidence,
    attestations: evidence.map((artifact) => ({
      artifact_id: artifact.id, content_sha256: artifact.content_sha256,
    })),
  }
}

const passingBootstrap = (inputSha256: string, deltaPoint: number) => {
  const core: BootstrapResultCore = {
    contractVersion: 'bootstrap-v1', method: 'theme_x_two_week_moving_block',
    replicates: 10_000, movingBlockLength: 2, eceBinCount: 10, inputSha256,
    deltaBrier: { seed: 1, point: deltaPoint, upper99: -0.01, replicateSha256: sha('b') },
    ece: { seed: 2, point: 0.05, upper95: 0.08, replicateSha256: sha('c') },
    regimeLower95: { risk_off: null, neutral: null, risk_on: null },
  }
  return { ...core, resultSha256: bootstrapResultSha256(core) }
}

describe('prospective scientific gate input assembly', () => {
  it('keeps 7/15 observation-only, exposes safety-only at 8, and final data only at 16', () => {
    const at7 = assembleProspectiveGateInput(buildSource({ count: 7 }))
    const at8 = assembleProspectiveGateInput(buildSource({ count: 8 }))
    const at15 = assembleProspectiveGateInput(buildSource({ count: 15, safetyPassed: true }))
    const at16 = assembleProspectiveGateInput(buildSource({ count: 16, safetyPassed: true }))

    expect(at7.checkpoint.kind).toBe('insufficient_origins')
    expect(at15.checkpoint.kind).toBe('insufficient_origins')
    expect(JSON.stringify([at7, at15])).not.toMatch(/candidateBrier|comparatorProbability|bootstrap|pAt10/)
    expect(at8).toMatchObject({ checkpoint: { kind: 'safety_due' }, safetyInput: { sequenceEnd: 8 } })
    expect(JSON.stringify(at8)).not.toMatch(/comparatorProbability|bootstrap|pAt10|would_promote/)
    expect(at16).toMatchObject({ checkpoint: { kind: 'final_due' }, finalDataset: { plannedOrigins: 16 } })
  })

  it('passes the safety catastrophe-only surface and the complete final gate', () => {
    const safetyBundle = assembleProspectiveGateInput(buildSource({ count: 8 }))
    if (!('safetyInput' in safetyBundle)) throw new Error('expected safety input')
    expect(evaluateSafetyCheckpoint(safetyBundle.safetyInput)).toMatchObject({
      decision: 'pass', action: 'safety_only',
    })

    const finalBundle = assembleProspectiveGateInput(buildSource({ count: 16, safetyPassed: true }))
    if (!('finalDataset' in finalBundle)) throw new Error('expected final dataset')
    const candidateBrier = 0.0025
    const comparatorBrier = 0.16
    const bootstrap = passingBootstrap(finalBundle.finalDataset.gateInputSha256, candidateBrier - comparatorBrier)
    const result = evaluateFinalPromotionGate(buildFinalPromotionGateInput(finalBundle.finalDataset, bootstrap))

    expect(result).toMatchObject({ decision: 'pass', action: 'would_promote' })
    expect(result.metrics.pAt10ValidOrigins).toBe(16)
    expect(result.regimes.every((regime) => regime.status === 'insufficient_regime_sample')).toBe(true)
  })

  it('never substitutes sequence N+1 and supports planned 24 only at exact sequence 24', () => {
    const missingEight = assembleProspectiveGateInput(buildSource({
      count: 16, safetyPassed: true, sequences: [1, 2, 3, 4, 5, 6, 7, ...Array.from({ length: 9 }, (_, index) => index + 9)],
    }))
    const at23 = assembleProspectiveGateInput(buildSource({ count: 23, planned: 24, safetyPassed: true }))
    const at24 = assembleProspectiveGateInput(buildSource({ count: 24, planned: 24, safetyPassed: true }))

    expect(missingEight.checkpoint).toMatchObject({ kind: 'insufficient_origins', missingSequences: [8] })
    expect(at23.checkpoint.kind).toBe('insufficient_origins')
    expect(at24.checkpoint.kind).toBe('final_due')
  })

  it('turns missing evidence into safety_hold and frozen model drift into final rejection', () => {
    const unsafe = assembleProspectiveGateInput(buildSource({ count: 8, omitCycleEvidence: true }))
    if (!('safetyInput' in unsafe)) throw new Error('expected safety input')
    expect(evaluateSafetyCheckpoint(unsafe.safetyInput)).toMatchObject({ decision: 'safety_hold' })

    const drift = assembleProspectiveGateInput(buildSource({
      count: 16, safetyPassed: true, hashDriftSequence: 16,
    }))
    if (!('finalDataset' in drift)) throw new Error('expected final dataset')
    const bootstrap = passingBootstrap(drift.finalDataset.gateInputSha256, -0.1575)
    const result = evaluateFinalPromotionGate(buildFinalPromotionGateInput(drift.finalDataset, bootstrap))
    expect(result).toMatchObject({ decision: 'reject', action: 'keep_champion' })
    expect(result.reasons).toEqual(expect.arrayContaining(['critical_incident', 'frozen_hash_mismatch']))
  })

  it('excludes a pair when either model abstains, even if both rows are terminal-scored', () => {
    const bundle = assembleProspectiveGateInput(buildSource({
      count: 16,
      safetyPassed: true,
      comparatorAbstainAt: { sequence: 16, theme: 9 },
    }))
    if (!('finalDataset' in bundle)) throw new Error('expected final dataset')

    expect(bundle.finalDataset.completeness.terminalPairCount).toBe(160)
    expect(bundle.finalDataset.completeness.exactPairedCount).toBe(159)
    expect(bundle.finalDataset.rows).toHaveLength(159)
  })
})
