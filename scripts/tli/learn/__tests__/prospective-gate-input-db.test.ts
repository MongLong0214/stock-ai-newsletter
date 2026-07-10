import { beforeEach, describe, expect, it, vi } from 'vitest'

const CYCLE_ID = '10000000-0000-4000-8000-000000000014'
const STUDY_CONTRACT_ID = '10000000-0000-4000-8000-000000000013'
const sha = (digit: string): string => digit.repeat(64)
const uuid = (prefix: string, index: number): string => `${prefix}000000-0000-4000-8000-${String(index).padStart(12, '0')}`

type QueryTrace = {
  readonly table: string
  readonly equals: Readonly<Record<string, unknown>>
  readonly includes: Readonly<Record<string, readonly unknown[]>>
  readonly orders: readonly string[]
  readonly range: readonly [number, number]
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as QueryTrace[],
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  interface Result { readonly data: readonly Record<string, unknown>[]; readonly error: null }
  interface Builder extends PromiseLike<Result> {
    select(columns: string): Builder
    eq(column: string, value: unknown): Builder
    in(column: string, values: readonly unknown[]): Builder
    order(column: string, options?: { readonly ascending?: boolean }): Builder
    range(from: number, to: number): Builder
  }
  const from = (table: string): Builder => {
    const equals = new Map<string, unknown>()
    const includes = new Map<string, readonly unknown[]>()
    const orders: string[] = []
    let range: readonly [number, number] = [0, 999]
    const builder: Builder = {
      select: () => builder,
      eq: (column, value) => { equals.set(column, value); return builder },
      in: (column, values) => { includes.set(column, values); return builder },
      order: (column) => { orders.push(column); return builder },
      range: (fromIndex, toIndex) => { range = [fromIndex, toIndex]; return builder },
      then: (onfulfilled, onrejected) => {
        state.queries.push({
          table, equals: Object.fromEntries(equals), includes: Object.fromEntries(includes), orders: [...orders], range,
        })
        const filtered = (state.tables[table] ?? []).filter((row) => (
          [...equals].every(([column, value]) => row[column] === value)
          && [...includes].every(([column, values]) => values.includes(row[column]))
        ))
        filtered.sort((left, right) => {
          for (const column of orders) {
            const compared = String(left[column]).localeCompare(String(right[column]))
            if (compared !== 0) return compared
          }
          return 0
        })
        const data = filtered.slice(range[0], range[1] + 1)
        return Promise.resolve({ data, error: null } as const).then(onfulfilled, onrejected)
      },
    }
    return builder
  }
  return { supabaseAdmin: { from: vi.fn(from) } }
})

const seed = (omitOriginArtifact = false): void => {
  const themes = Array.from({ length: 63 }, (_, index) => `theme-${String(index).padStart(3, '0')}`)
  const origins = Array.from({ length: 8 }, (_, index) => ({
    id: uuid('20', index + 1), cycle_id: CYCLE_ID, forecast_origin_manifest_id: uuid('30', index + 1),
    study_origin_manifest_id: uuid('90', index + 1),
    study_origin: {
      study_contract_id: STUDY_CONTRACT_ID,
      forecast_origin_manifest_id: uuid('30', index + 1),
      payload_sha256: sha('d'),
    },
    sequence_no: index + 1, enrollment_role: 'confirmatory',
    candidate_model_sha256: sha('2'), comparator_artifact_sha256: sha('3'), regime: 'neutral',
    kospi_base_trade_date: '2025-12-31', kospi_base_close: 100,
    kospi_lookback_trade_date: '2025-12-01', kospi_lookback_close: 100,
    kospi_source_ids: [`kospi-${index + 1}-base`, `kospi-${index + 1}-lookback`],
    kospi_input_sha256: sha('e'),
  }))
  const forecasts = origins.map((origin, index) => ({
    id: origin.forecast_origin_manifest_id, origin_date: `2026-0${index + 1}-05`,
    forecast_cutoff: `2026-0${index + 1}-05T09:00:00.000Z`, expected_theme_count: themes.length,
    expected_universe_sha256: sha('8'), keyword_group_manifest_sha256: sha('9'),
    payload_sha256: sha('a'),
  }))
  const interestRuns = origins.map((_, index) => ({
    id: uuid('60', index + 1), source: 'naver_datalab', status: 'complete',
    collected_at: '2025-12-31T00:00:00.000Z', completed_at: '2025-12-31T01:00:00.000Z',
    response_sha256: sha('e'),
  }))
  const newsRuns = origins.map((_, index) => ({
    id: uuid('80', index + 1), source: 'naver_news', status: 'complete',
    collected_at: '2025-12-31T00:00:00.000Z', completed_at: '2025-12-31T01:00:00.000Z',
    response_sha256: sha('f'),
  }))
  const newsIds = origins.map((_, originIndex) => Array.from(
    { length: 14 },
    (_, newsIndex) => uuid('70', originIndex * 100 + newsIndex + 1),
  ))
  const expectedThemes = origins.flatMap((origin, originIndex) => themes.map((themeId) => ({
    forecast_origin_manifest_id: origin.forecast_origin_manifest_id,
    keyword_group_sha256: sha('d'),
    forecast_interest_run_id: interestRuns[originIndex].id,
    forecast_interest_response_sha256: sha('e'),
    news_observation_ids: newsIds[originIndex], news_input_sha256: sha('f'),
    theme_id: themeId, input_status: 'usable', abstain_reason: null,
  })))
  const interestObservations = origins.flatMap((_, originIndex) => themes.flatMap((themeId) => (
    Array.from({ length: 20 }, () => ({
      collection_run_id: interestRuns[originIndex].id, theme_id: themeId,
    }))
  )))
  const newsObservations = origins.flatMap((_, originIndex) => newsIds[originIndex].map((id) => ({
    id, collection_run_id: newsRuns[originIndex].id, collected_at: '2025-12-31T00:00:00.000Z',
  })))
  const predictions = origins.flatMap((origin, originIndex) => themes.flatMap((themeId, themeIndex) => {
    const forecast = forecasts[originIndex]
    const outcome = themeIndex % 2 === 0
    return (['candidate', 'comparator'] as const).map((role) => ({
      id: `${String(originIndex).padStart(2, '0')}-${themeId}-${role}`,
      experiment_cycle_id: CYCLE_ID, experiment_origin_manifest_id: origin.id, theme_id: themeId,
      prediction_date: forecast.origin_date, horizon_days: 5, labeler_version: 'gta-v2',
      scientific_prediction_role: role, model_artifact_sha256: role === 'candidate' ? sha('2') : sha('3'),
      feature_contract_hash: sha('5'), forecast_cutoff: forecast.forecast_cutoff,
      forecast_origin_week: forecast.origin_date, p_rise: role === 'candidate' ? outcome ? 0.9 : 0.1 : 0.5,
      ci_lower: role === 'candidate' ? outcome ? 0.8 : 0.05 : 0.4,
      ci_upper: role === 'candidate' ? outcome ? 0.95 : 0.2 : 0.6,
      abstain: false, actual_y: outcome, actual_label_id: `label-${originIndex}-${themeIndex}`,
      score_status: 'scored', score_exclusion_reason: null,
    }))
  }))
  const cycleArtifacts = ['preregistration', 'cycle_manifest', 'dataset_manifest', 'model_manifest'].map((type, index) => ({
    id: uuid('40', index + 1), cycle_id: CYCLE_ID, experiment_origin_manifest_id: null,
    artifact_type: type, artifact_key: 'singleton', content_sha256: sha('7'), payload: {},
  }))
  const originArtifacts = origins.slice(0, omitOriginArtifact ? 7 : 8).map((origin, index) => {
    const forecast = forecasts[index]
    return {
      id: uuid('50', index + 1), cycle_id: CYCLE_ID, experiment_origin_manifest_id: origin.id,
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
  const evidence = [...cycleArtifacts, ...originArtifacts]
  state.tables = {
    tli_experiment_cycles: [{
      id: CYCLE_ID, status: 'running', study_contract_id: STUDY_CONTRACT_ID,
      study_contract_sha256: sha('1'), candidate_model_sha256: sha('2'),
      comparator_artifact_sha256: sha('3'), dataset_manifest_sha256: sha('4'), feature_contract_sha256: sha('5'),
      labeler_version: 'gta-v2', label_contract_sha256: sha('6'), calibration_artifact_sha256: sha('7'),
      planned_origins: 16, safety_origins: 8, safety_checked_at: null, decision_at: null,
    }],
    tli_experiment_origin_manifests: origins,
    tli_forecast_origin_manifests: forecasts,
    tli_forecast_origin_theme_inputs: expectedThemes,
    theme_predictions_v3: predictions,
    tli_evidence_artifacts: evidence,
    tli_evidence_attestations: evidence.map((artifact) => ({
      artifact_id: artifact.id, content_sha256: artifact.content_sha256,
    })),
    tli_collection_runs: [...interestRuns, ...newsRuns],
    tli_interest_observations: interestObservations,
    tli_news_observations: newsObservations,
  }
}

beforeEach(() => {
  seed()
  state.queries = []
  vi.clearAllMocks()
})

describe('prospective gate DB loader', () => {
  it('loads one cycle in batched pages and opens safety only at exact eligible sequence 8', async () => {
    const { loadProspectiveGateInputFromDb } = await import('../gate-input-from-db')
    const result = await loadProspectiveGateInputFromDb({ cycleId: CYCLE_ID })

    expect(result).toMatchObject({
      checkpoint: { kind: 'safety_due', sequenceEnd: 8 },
      safetyInput: { criticalIncidentCount: 0 },
    })
    expect(state.queries.filter((query) => query.table === 'theme_predictions_v3')).toEqual([
      expect.objectContaining({ range: [0, 999], orders: ['id'] }),
      expect.objectContaining({ range: [1000, 1999], orders: ['id'] }),
    ])
    for (const table of [
      'tli_experiment_cycles', 'tli_experiment_origin_manifests', 'tli_forecast_origin_manifests',
      'tli_forecast_origin_theme_inputs', 'tli_evidence_artifacts', 'tli_evidence_attestations',
    ]) expect(state.queries.filter((query) => query.table === table).length).toBeLessThanOrEqual(1)
  })

  it('does not substitute an unattested eighth origin even when all prediction rows are terminal', async () => {
    seed(true)
    const { loadProspectiveGateInputFromDb } = await import('../gate-input-from-db')
    const result = await loadProspectiveGateInputFromDb({ cycleId: CYCLE_ID })

    expect(result.checkpoint).toMatchObject({
      kind: 'insufficient_origins', checkpoint: 'safety', eligibleThroughSequence: 7,
      missingSequences: [8],
    })
    expect(result.incidents).toContainEqual(expect.objectContaining({
      originId: uuid('20', 8), reasons: ['gate_evidence_artifact_missing'],
    }))
  })
})
