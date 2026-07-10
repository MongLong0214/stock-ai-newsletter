import { classifyKospiRegime } from './prospective-gate-metrics'
import type {
  ProspectiveCompleteness,
  ProspectiveEvidenceRow,
  ProspectiveGateSource,
  ProspectiveOriginAccounting,
  ProspectiveOriginRow,
  ProspectivePredictionRow,
} from './prospective-gate-input-contract'
import type { ProspectiveGateStatisticRow } from './prospective-gate-statistics'

export type ProspectiveOriginSummary = {
  readonly origin: ProspectiveOriginRow
  readonly originDate: string
  readonly eligible: boolean
  readonly accounting: ProspectiveOriginAccounting
  readonly exactPairs: readonly ProspectiveGateStatisticRow[]
  readonly excludedReasons: readonly string[]
}

export const artifactAttested = (
  artifact: ProspectiveEvidenceRow,
  source: ProspectiveGateSource,
): boolean => source.attestations.some((attestation) => (
  attestation.artifact_id === artifact.id && attestation.content_sha256 === artifact.content_sha256
))

export const addIncident = (
  incidents: Map<string, string[]>,
  originId: string,
  reason: string,
): void => {
  incidents.set(originId, [...(incidents.get(originId) ?? []), reason])
}

const terminal = (row: ProspectivePredictionRow): boolean => (
  row.score_status === 'scored' || row.score_status === 'excluded'
)

const validInterval = (row: ProspectivePredictionRow): boolean => row.abstain || (
  row.p_rise !== null && row.ci_lower !== null && row.ci_upper !== null
  && Number.isFinite(row.p_rise) && Number.isFinite(row.ci_lower) && Number.isFinite(row.ci_upper)
  && row.ci_lower >= 0 && row.ci_lower <= row.p_rise && row.p_rise <= row.ci_upper && row.ci_upper <= 1
)

const payloadString = (payload: Readonly<Record<string, unknown>>, key: string): string | null => {
  const value = Reflect.get(payload, key)
  return typeof value === 'string' ? value : null
}

const payloadNumber = (payload: Readonly<Record<string, unknown>>, key: string): number | null => {
  const value = Reflect.get(payload, key)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const payloadStringArray = (payload: Readonly<Record<string, unknown>>, key: string): readonly string[] | null => {
  const value = Reflect.get(payload, key)
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null
}

const originArtifactMatches = (
  source: ProspectiveGateSource,
  origin: ProspectiveOriginRow,
  artifact: ProspectiveEvidenceRow,
  forecast: ProspectiveGateSource['forecasts'][number],
): boolean => {
  const payload = artifact.payload
  return payloadString(payload, 'manifest_version') === 'origin-manifest-v1'
    && payloadString(payload, 'experiment_origin_manifest_id') === origin.id
    && payloadString(payload, 'cycle_id') === source.cycle.id
    && payloadString(payload, 'study_origin_manifest_id') === origin.study_origin_manifest_id
    && payloadString(payload, 'forecast_origin_manifest_id') === origin.forecast_origin_manifest_id
    && payloadString(payload, 'study_contract_id') === source.cycle.study_contract_id
    && payloadString(payload, 'study_contract_sha256') === source.cycle.study_contract_sha256
    && payloadString(payload, 'enrollment_role') === origin.enrollment_role
    && payloadNumber(payload, 'sequence_no') === origin.sequence_no
    && origin.study_origin.study_contract_id === source.cycle.study_contract_id
    && origin.study_origin.forecast_origin_manifest_id === origin.forecast_origin_manifest_id
    && payloadString(payload, 'origin_date') === forecast.origin_date
    && payloadString(payload, 'forecast_cutoff') === forecast.forecast_cutoff
    && payloadString(payload, 'expected_universe_sha256') === forecast.expected_universe_sha256
    && payloadString(payload, 'keyword_group_manifest_sha256') === forecast.keyword_group_manifest_sha256
    && payloadString(payload, 'forecast_payload_sha256') === forecast.payload_sha256
    && payloadString(payload, 'study_origin_payload_sha256') === origin.study_origin.payload_sha256
    && payloadString(payload, 'candidate_model_sha256') === origin.candidate_model_sha256
    && payloadString(payload, 'comparator_artifact_sha256') === origin.comparator_artifact_sha256
    && payloadString(payload, 'kospi_base_trade_date') === origin.kospi_base_trade_date
    && payloadNumber(payload, 'kospi_base_close') === origin.kospi_base_close
    && payloadString(payload, 'kospi_lookback_trade_date') === origin.kospi_lookback_trade_date
    && payloadNumber(payload, 'kospi_lookback_close') === origin.kospi_lookback_close
    && JSON.stringify(payloadStringArray(payload, 'kospi_source_ids')) === JSON.stringify(origin.kospi_source_ids)
    && payloadString(payload, 'kospi_input_sha256') === origin.kospi_input_sha256
    && payloadString(payload, 'regime') === origin.regime
}

const inspectSourceProof = (
  source: ProspectiveGateSource,
  originId: string,
  expected: ProspectiveGateSource['expectedThemes'][number],
  incidents: Map<string, string[]>,
): void => {
  const proof = expected.source_proof
  if (proof.interest_run_status === 'partial' || proof.interest_run_status === 'failed'
    || proof.news_run_statuses.some((status) => status === 'partial' || status === 'failed')) {
    addIncident(incidents, originId, 'partial_or_failed_source_run_affected_universe')
  }
  if (expected.input_status === 'abstain') return
  if (proof.interest_observation_run_count !== 1) {
    addIncident(incidents, originId, 'mixed_datalab_interest_runs')
  }
  if (proof.interest_run_status !== 'complete' || proof.interest_run_source !== 'naver_datalab'
    || proof.interest_observation_count !== 20 || proof.news_observation_count !== 14) {
    addIncident(incidents, originId, 'source_provenance_contract_failure')
  }
  if (!proof.interest_run_before_cutoff || !proof.news_before_cutoff) {
    addIncident(incidents, originId, 'feature_or_source_cutoff_violation')
  }
}

export const summarizeProspectiveOrigin = (
  source: ProspectiveGateSource,
  origin: ProspectiveOriginRow,
  incidents: Map<string, string[]>,
): ProspectiveOriginSummary => {
  const forecastRows = source.forecasts.filter((row) => row.id === origin.forecast_origin_manifest_id)
  const forecast = forecastRows.length === 1 ? forecastRows[0] : null
  const expected = source.expectedThemes.filter((row) => row.forecast_origin_manifest_id === origin.forecast_origin_manifest_id)
  const predictions = source.predictions.filter((row) => row.experiment_origin_manifest_id === origin.id)
  const artifacts = source.evidence.filter((row) => row.experiment_origin_manifest_id === origin.id
    && row.artifact_type === 'origin_manifest')
  const attested = artifacts.length === 1 && artifactAttested(artifacts[0], source)
  if (!attested) addIncident(incidents, origin.id, 'gate_evidence_artifact_missing')
  if (attested && forecast !== null && !originArtifactMatches(source, origin, artifacts[0], forecast)) {
    addIncident(incidents, origin.id, 'same_cutoff_dataset_or_study_mismatch')
  }
  if (forecast === null || forecast.expected_theme_count !== expected.length || expected.length === 0) {
    addIncident(incidents, origin.id, 'prediction_completeness_below_99pct')
  }
  if (!Number.isFinite(origin.kospi_base_close) || !Number.isFinite(origin.kospi_lookback_close)
    || origin.kospi_base_close <= 0 || origin.kospi_lookback_close <= 0
    || classifyKospiRegime(origin.kospi_base_close / origin.kospi_lookback_close - 1) !== origin.regime) {
    addIncident(incidents, origin.id, 'regime_provenance_mismatch')
  }
  const expectedIds = new Set(expected.map((row) => row.theme_id))
  if (predictions.some((row) => !expectedIds.has(row.theme_id))) {
    addIncident(incidents, origin.id, 'cross_cycle_or_universe_join')
  }
  const pairs: ProspectiveGateStatisticRow[] = []
  const excludedReasons: string[] = []
  let terminalCount = 0
  let nonAbstainCount = 0
  let sourceGap = 0
  for (const expectedRow of expected) {
    inspectSourceProof(source, origin.id, expectedRow, incidents)
    const rows = predictions.filter((row) => row.theme_id === expectedRow.theme_id)
    const candidates = rows.filter((row) => row.scientific_prediction_role === 'candidate')
    const comparators = rows.filter((row) => row.scientific_prediction_role === 'comparator')
    if (candidates.length !== 1 || comparators.length !== 1) {
      addIncident(incidents, origin.id, rows.length > 2 ? 'duplicate_scientific_key' : 'prediction_completeness_below_99pct')
      continue
    }
    const candidate = candidates[0]
    const comparator = comparators[0]
    if (!candidate.abstain) nonAbstainCount += 1
    if (!terminal(candidate) || !terminal(comparator)) continue
    terminalCount += 1
    if (forecast === null || rows.some((row) => row.experiment_cycle_id !== source.cycle.id
      || row.prediction_date !== forecast.origin_date || row.forecast_origin_week !== forecast.origin_date
      || row.forecast_cutoff !== forecast.forecast_cutoff || row.horizon_days !== 5
      || row.labeler_version !== source.cycle.labeler_version)) {
      addIncident(incidents, origin.id, 'label_horizon_cutoff_or_cycle_mismatch')
    }
    if (candidate.model_artifact_sha256 !== source.cycle.candidate_model_sha256
      || comparator.model_artifact_sha256 !== source.cycle.comparator_artifact_sha256
      || candidate.feature_contract_hash !== source.cycle.feature_contract_sha256
      || comparator.feature_contract_hash !== source.cycle.feature_contract_sha256) {
      addIncident(incidents, origin.id, 'model_or_contract_hash_drift')
    }
    if (!validInterval(candidate) || !validInterval(comparator)) {
      addIncident(incidents, origin.id, 'interval_completeness_failure')
    }
    if (candidate.score_status === 'excluded' || comparator.score_status === 'excluded') {
      const reason = candidate.score_exclusion_reason
      if (reason === null || reason !== comparator.score_exclusion_reason) {
        addIncident(incidents, origin.id, 'terminal_label_accounting_incomplete')
      } else {
        excludedReasons.push(reason)
        if (reason === 'source_gap_sla') sourceGap += 1
      }
      continue
    }
    if (candidate.abstain || comparator.abstain) continue
    if (candidate.actual_y === null || candidate.actual_y !== comparator.actual_y
      || candidate.actual_label_id === null || candidate.actual_label_id !== comparator.actual_label_id) {
      addIncident(incidents, origin.id, 'null_or_mismatched_scored_outcome')
      continue
    }
    pairs.push({
      originDate: forecast?.origin_date ?? candidate.prediction_date,
      themeId: expectedRow.theme_id,
      candidateProbability: candidate.p_rise ?? Number.NaN,
      comparatorProbability: comparator.p_rise ?? Number.NaN,
      outcome: candidate.actual_y,
      regime: origin.regime,
    })
  }
  const expectedCount = expected.length
  const ratio = expectedCount === 0 ? 0 : terminalCount / expectedCount
  const sourceGapRatio = expectedCount === 0 ? 1 : sourceGap / expectedCount
  if (ratio < 0.99) addIncident(incidents, origin.id, 'prediction_completeness_below_99pct')
  if (ratio < 1) addIncident(incidents, origin.id, 'terminal_label_accounting_incomplete')
  if (sourceGapRatio > 0.01) addIncident(incidents, origin.id, 'source_gap_sla_above_1pct')
  const excluded = new Map<string, number>()
  for (const reason of excludedReasons) excluded.set(reason, (excluded.get(reason) ?? 0) + 1)
  const originDate = forecast?.origin_date ?? ''
  return {
    origin, originDate, eligible: attested && expectedCount > 0 && terminalCount === expectedCount,
    accounting: {
      originId: origin.id, sequenceNo: origin.sequence_no, originDate,
      expectedCount, terminalCount, exactPairedCount: pairs.length,
      candidateNonAbstainCount: nonAbstainCount, sourceGapCount: sourceGap,
      excludedReasonCounts: [...excluded].map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => left.reason.localeCompare(right.reason)),
    },
    exactPairs: pairs, excludedReasons,
  }
}

export const summarizeCompleteness = (
  summaries: readonly ProspectiveOriginSummary[],
): ProspectiveCompleteness => {
  const expected = summaries.reduce((sum, row) => sum + row.accounting.expectedCount, 0)
  const terminalCount = summaries.reduce((sum, row) => sum + row.accounting.terminalCount, 0)
  const excluded = new Map<string, number>()
  for (const reason of summaries.flatMap((row) => row.excludedReasons)) {
    excluded.set(reason, (excluded.get(reason) ?? 0) + 1)
  }
  const ratios = summaries.map((row) => row.accounting.expectedCount === 0
    ? 0 : row.accounting.terminalCount / row.accounting.expectedCount)
  return {
    expectedPairCount: expected, terminalPairCount: terminalCount,
    exactPairedCount: summaries.reduce((sum, row) => sum + row.exactPairs.length, 0),
    pooledRatio: expected === 0 ? 0 : terminalCount / expected,
    minimumOriginRatio: ratios.length === 0 ? 0 : Math.min(...ratios),
    terminalAccountingRatio: expected === 0 ? 0 : terminalCount / expected,
    maximumOriginSourceGapRatio: summaries.length === 0 ? 1 : Math.max(...summaries.map((row) => (
      row.accounting.expectedCount === 0 ? 1 : row.accounting.sourceGapCount / row.accounting.expectedCount
    ))),
    pooledCoverage: expected === 0 ? 0 : summaries.reduce(
      (sum, row) => sum + row.accounting.candidateNonAbstainCount, 0,
    ) / expected,
    excludedReasonCounts: [...excluded].map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => left.reason.localeCompare(right.reason)),
  }
}
