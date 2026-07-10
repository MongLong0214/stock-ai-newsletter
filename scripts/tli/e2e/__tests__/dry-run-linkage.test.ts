import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { canonicalJsonV1Sha256 } from '../../../../lib/tli/canonical-json'
import {
  buildCycleFreezeContract,
  buildStudyLockContract,
} from '../cycle-freeze-contract'
import { buildGateSource } from '../fixture-gate-source'
import {
  CYCLE_ID,
  experimentOriginId,
  scientificPredictionId,
} from '../fixture-identities'

const HASH = 'a'.repeat(64)
const STUDY_ID = '15000000-0000-4000-8000-000000000015'
const FORECAST_ID = '25000000-0000-4000-8000-000000000015'
const STUDY_ORIGIN_ID = '35000000-0000-4000-8000-000000000015'
const THEME_ID = '45000000-0000-4000-8000-000000000015'
const INTERVAL_ENSEMBLE = { fixture: 'dry-run-linkage' }

const STUDY_PAYLOAD = {
    id: STUDY_ID,
    contract_version: 'tli-attention-study-v1',
    first_origin_date: '2026-07-13',
    babl_algorithm_version: 'b-abl-v4',
    babl_comparison_spec_version: 'comparison-v4-spec-v1',
    babl_evaluation_horizon_days: 14,
    babl_candidate_pool_rule: 'source_prod_run_v1',
    babl_control_row_id: '55000000-0000-4000-8000-000000000015',
    babl_control_sha256: HASH,
    labeler_version: 'gta-v2',
    label_contract_sha256: HASH,
    feature_contract_version: 'tli-attention-v2-f1',
    feature_contract_sha256: HASH,
}

const stack = {
  studyContractPayload: STUDY_PAYLOAD,
  studyContractSha256: canonicalJsonV1Sha256(STUDY_PAYLOAD),
  studyLockedAt: '2026-07-01T00:00:00.000Z',
  universalOriginCount: 50,
  trainingSelectionRule: 'first_13_then_one_week_embargo_then_next_13' as const,
  trainingOrigins: [],
  prospectiveOrigins: [{
    originDate: '2027-03-01',
    forecastCutoff: '2027-03-01T09:00:00.000Z',
    forecastManifestId: FORECAST_ID,
    forecastManifestSha256: HASH,
    studyOriginManifestId: STUDY_ORIGIN_ID,
    studyOriginManifestSha256: HASH,
  }],
}

const training = {
  artifact: {
    artifact_version: 'tli-model-artifact-v2',
    model_type: 'm1_logistic',
    coefficients: { intercept: 0, weights: [] },
    train_range: ['2026-01-01', '2026-12-31'],
  },
  artifactSha256: 'b'.repeat(64),
  calibrationArtifactSha256: 'c'.repeat(64),
  intervalEnsembleSha256: canonicalJsonV1Sha256(INTERVAL_ENSEMBLE),
  report: {
    promotionDecision: { positiveSkill: true },
    intervalEnsemble: INTERVAL_ENSEMBLE,
  },
}

describe('Todo 15 hash and identity linkage', () => {
  it('builds canonical study/cycle envelopes linked to the raw deterministic dataset', () => {
    const study = buildStudyLockContract({ stack, gitCommitSha: '1'.repeat(40) })
    const freeze = buildCycleFreezeContract({
      stack,
      data: {
        dataset: {
          manifest: {
            manifest_version: 'tli-dataset-manifest-v1',
            study_contract_id: STUDY_ID,
            study_contract_sha256: HASH,
            feature_contract_sha256: HASH,
            label_contract_sha256: HASH,
            ordered_rows_sha256: 'e'.repeat(64),
            row_count: 312,
          },
          manifestSha256: 'f'.repeat(64),
          rows: [],
        },
        cutoff: '2027-01-01T12:00:00.000Z',
      },
      training,
      gitCommitSha: '1'.repeat(40),
      verifiedAt: '2026-07-10T15:30:00.000Z',
    })

    expect(study.payloadSha256).toBe(stack.studyContractSha256)
    expect(freeze.cycleId).toBe(CYCLE_ID)
    expect(freeze.sourceDatasetManifestSha256).toBe('f'.repeat(64))
    expect(freeze.evidenceEnvelopes).toHaveLength(4)
    for (const envelope of freeze.evidenceEnvelopes) {
      expect(envelope.content_sha256).toBe(canonicalJsonV1Sha256(envelope.payload))
    }
    const dataset = freeze.evidenceEnvelopes.find((row) => row.artifact_type === 'dataset_manifest')
    expect(dataset?.payload).toMatchObject({ source_dataset_manifest_sha256: 'f'.repeat(64) })
  })

  it('uses canonical evidence hashes and the scorer identities for the primary planned-24 gate', () => {
    const origin = stack.prospectiveOrigins[0]
    if (origin === undefined) throw new Error('prospective origin fixture is empty')
    const row = {
      sequence: 1,
      origin,
      themeId: THEME_ID,
      candidateProbability: 0.8,
      candidateCiLower: 0.7,
      candidateCiUpper: 0.9,
      comparatorProbability: 0.5 as const,
      outcome: true,
      labelId: '65000000-0000-4000-8000-000000000015',
    }
    const source = buildGateSource({
      stack,
      panel: { rows: [row] },
      candidateModelSha256: training.artifactSha256,
      calibrationArtifactSha256: training.calibrationArtifactSha256,
      datasetManifestSha256: 'f'.repeat(64),
      plannedOrigins: 24,
      observedOrigins: 1,
      safetyPassed: false,
      primaryCycleId: CYCLE_ID,
    })
    const originId = experimentOriginId(CYCLE_ID, row.origin.originDate)

    expect(source.cycle.id).toBe(CYCLE_ID)
    expect(source.origins[0]?.id).toBe(originId)
    expect(source.predictions.map((prediction) => prediction.id)).toEqual([
      scientificPredictionId(originId, THEME_ID, 'candidate'),
      scientificPredictionId(originId, THEME_ID, 'comparator'),
    ])
    for (const artifact of source.evidence) {
      expect(artifact.content_sha256).toBe(canonicalJsonV1Sha256(artifact.payload))
    }
  })

  it('loads the public pipeline without reading a cwd .env.local sentinel', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-e2e-env-'))
    const script = resolve('scripts/tli/e2e/run-scientific-dry-run.ts')
    writeFileSync(join(directory, '.env.local'), 'TLI_E2E_DOTENV_SENTINEL=loaded\n')
    try {
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', '--input-type=module', '-e',
        `process.chdir(${JSON.stringify(directory)}); const loaded = await import(${JSON.stringify(script)}); const mod = loaded.default ?? loaded; await mod.loadIsolatedDryRunPipeline(); process.stdout.write(JSON.stringify({sentinel: process.env.TLI_E2E_DOTENV_SENTINEL ?? null, url: process.env.NEXT_PUBLIC_SUPABASE_URL}));`,
      ], { cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, TLI_E2E_DOTENV_SENTINEL: undefined } })
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({ sentinel: null, url: 'http://127.0.0.1:1' })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
