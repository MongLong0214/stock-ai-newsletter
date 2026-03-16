/**
 * TCAR-018: Forecast Reader — fail-closed serving reader backed by forecast_control_v1.
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import {
  buildAnalogEvidencePayload,
  buildForecastPayload,
  type AnalogEvidencePayload,
  type ForecastPayload,
} from '@/lib/tli/forecast/api-payloads'
import {
  computeAnalogWeightedForecast,
  computePostPeakRisk,
} from '@/lib/tli/forecast/model'
import { shouldAbstain } from '@/lib/tli/forecast/evidence-quality'
import { computeSurvivalHead } from '@/lib/tli/forecast/survival'
import type { ThemeForecastControl } from '@/lib/tli/types/api'
import type { ComparisonRow } from './build-comparisons'
import {
  loadRollbackTarget,
  readServingVersion,
  type ControlPlaneState,
} from '../../../../../scripts/tli/forecast-serving'
import type { Stage } from '@/lib/tli/types/db'

export type ForecastReaderResult = ThemeForecastControl

interface QuerySnapshotServingRow {
  id: string
  days_since_episode_start: number
  reconstruction_status: 'success' | 'partial' | 'failed'
}

interface AnalogCandidateServingRow {
  id: string
  candidate_theme_id: string
  candidate_episode_id: string
  similarity_score: number
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  rank: number
}

interface AnalogEvidenceServingRow {
  candidate_id: string
  candidate_episode_id: string
  analog_future_path_summary: {
    peak_day: number
    total_days: number
    final_stage: string
    post_peak_drawdown: number | null
  }
  retrieval_reason: string
  mismatch_summary: string | null
  evidence_quality: 'high' | 'medium' | 'low'
  evidence_quality_score: number
  analog_support_count: number
  candidate_concentration_gini: number
  top1_analog_weight: number
}

export interface ServedForecastBundle {
  control: ForecastReaderResult
  forecast: ForecastPayload | null
  analogEvidence: AnalogEvidencePayload | null
  comparisonRows: ComparisonRow[]
}

const SERVING_ANALOG_LIMIT = 5
const LEGACY_FALLBACK_REASONS = new Set(['control_row_missing', 'not_production'])

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const normalizeSummary = (
  summary: AnalogEvidenceServingRow['analog_future_path_summary'] | null | undefined,
): AnalogEvidenceServingRow['analog_future_path_summary'] | null => {
  if (!summary) return null
  if (!isFiniteNumber(summary.peak_day) || !isFiniteNumber(summary.total_days)) return null
  if (typeof summary.final_stage !== 'string' || summary.final_stage.length === 0) return null

  return {
    peak_day: summary.peak_day,
    total_days: summary.total_days,
    final_stage: summary.final_stage,
    post_peak_drawdown: isFiniteNumber(summary.post_peak_drawdown)
      ? summary.post_peak_drawdown
      : null,
  }
}

const mapControlState = (row: {
  production_version: string
  serving_status: ControlPlaneState['servingStatus']
  cutover_ready: boolean
  rollback_target_version: string | null
  fail_closed_verified: boolean
  ship_verdict_artifact_id: string | null
}): ControlPlaneState => ({
  productionVersion: row.production_version,
  servingStatus: row.serving_status,
  cutoverReady: row.cutover_ready,
  rollbackTargetVersion: row.rollback_target_version,
  failClosedVerified: row.fail_closed_verified,
  shipVerdictArtifactId: row.ship_verdict_artifact_id,
})

const mapReaderResult = (controlState: ControlPlaneState): ForecastReaderResult => {
  const serving = readServingVersion(controlState)
  const rollback = loadRollbackTarget(controlState)

  return {
    serving: serving.serving,
    version: serving.version,
    rollbackAvailable: rollback.available,
    rollbackVersion: rollback.version,
    reason: serving.reason,
  }
}

async function loadLatestControlState(): Promise<ControlPlaneState | null> {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('forecast_control_v1')
    .select('production_version, serving_status, cutover_ready, rollback_target_version, fail_closed_verified, ship_verdict_artifact_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return mapControlState(data)
}

async function loadLatestSnapshot(themeId: string): Promise<QuerySnapshotServingRow | null> {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('query_snapshot_v1')
    .select('id, days_since_episode_start, reconstruction_status')
    .eq('theme_id', themeId)
    .neq('reconstruction_status', 'failed')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as QuerySnapshotServingRow
}

async function loadAnalogArtifacts(snapshotId: string): Promise<{
  candidates: AnalogCandidateServingRow[]
  evidenceByCandidateId: Map<string, AnalogEvidenceServingRow>
}> {
  const supabase = getServerSupabaseClient()
  const { data: candidates, error: candidateError } = await supabase
    .from('analog_candidates_v1')
    .select('id, candidate_theme_id, candidate_episode_id, similarity_score, feature_sim, curve_sim, keyword_sim, rank')
    .eq('query_snapshot_id', snapshotId)
    .order('rank', { ascending: true })
    .limit(SERVING_ANALOG_LIMIT)

  if (candidateError || !candidates?.length) {
    return { candidates: [], evidenceByCandidateId: new Map() }
  }

  const candidateIds = candidates.map((candidate) => candidate.id)
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('analog_evidence_v1')
    .select('candidate_id, candidate_episode_id, analog_future_path_summary, retrieval_reason, mismatch_summary, evidence_quality, evidence_quality_score, analog_support_count, candidate_concentration_gini, top1_analog_weight')
    .eq('query_snapshot_id', snapshotId)
    .in('candidate_id', candidateIds)

  if (evidenceError || !evidenceRows?.length) {
    return { candidates: candidates as AnalogCandidateServingRow[], evidenceByCandidateId: new Map() }
  }

  return {
    candidates: candidates as AnalogCandidateServingRow[],
    evidenceByCandidateId: new Map(
      evidenceRows.map((row) => [row.candidate_id, row as AnalogEvidenceServingRow]),
    ),
  }
}

function buildServedComparisons(input: {
  currentDay: number
  candidates: AnalogCandidateServingRow[]
  evidenceByCandidateId: Map<string, AnalogEvidenceServingRow>
}): ComparisonRow[] {
  const rows: ComparisonRow[] = []

  for (const candidate of input.candidates) {
    const evidence = input.evidenceByCandidateId.get(candidate.id)
    const summary = normalizeSummary(evidence?.analog_future_path_summary)
    if (!evidence || !summary) continue

    rows.push({
      id: candidate.id,
      past_theme_id: candidate.candidate_theme_id,
      similarity_score: candidate.similarity_score,
      current_day: input.currentDay,
      past_peak_day: summary.peak_day,
      past_total_days: summary.total_days,
      message: evidence.retrieval_reason,
      feature_sim: candidate.feature_sim,
      curve_sim: candidate.curve_sim,
      keyword_sim: candidate.keyword_sim,
      past_peak_score: null,
      past_final_stage: summary.final_stage,
      past_decline_days: Math.max(summary.total_days - summary.peak_day, 0),
      supportCount: evidence.analog_support_count,
      confidenceTier: evidence.evidence_quality,
      sourceSurface: null,
      calibrationVersion: null,
      weightVersion: null,
    })
  }

  return rows
}

function buildServedForecastArtifacts(input: {
  candidates: AnalogCandidateServingRow[]
  evidenceByCandidateId: Map<string, AnalogEvidenceServingRow>
}): {
  forecast: ForecastPayload | null
  analogEvidence: AnalogEvidencePayload | null
} {
  const analogs = input.candidates.flatMap((candidate) => {
    const evidence = input.evidenceByCandidateId.get(candidate.id)
    const summary = normalizeSummary(evidence?.analog_future_path_summary)
    if (!evidence || !summary) return []

    return [{
      candidate,
      evidence,
      summary,
    }]
  })

  if (analogs.length === 0) {
    return { forecast: null, analogEvidence: null }
  }

  const canonicalEvidence = analogs[0].evidence
  const forecastInput = analogs.map(({ candidate, summary }) => ({
    weight: candidate.similarity_score,
    peakDay: summary.peak_day,
    totalDays: summary.total_days,
    finalStage: summary.final_stage as Stage,
    postPeakDrawdown: summary.post_peak_drawdown,
  }))

  const forecast = computeAnalogWeightedForecast(forecastInput, { stage2Passed: true })
  const survival = computeSurvivalHead(
    forecastInput.map((analog) => ({ weight: analog.weight, peakDay: analog.peakDay })),
  )
  const postPeakRisk = computePostPeakRisk(forecastInput)
  const abstention = shouldAbstain({
    analogSupportCount: canonicalEvidence.analog_support_count,
    candidateConcentrationGini: canonicalEvidence.candidate_concentration_gini,
    top1AnalogWeight: canonicalEvidence.top1_analog_weight,
  })

  return {
    forecast: buildForecastPayload({
      probabilities: forecast.probabilities,
      expectedPeakDay: Math.round(forecast.expectedPeakDay),
      confidence: forecast.confidence,
      survivalProbabilities: survival.survivalProbabilities,
      medianTimeToPeak: survival.medianTimeToPeak,
      postPeakExpectedDrawdown: postPeakRisk.expectedDrawdown,
      severeDrawdownProb: postPeakRisk.severeDrawdownProb,
      evidenceQualityScore: canonicalEvidence.evidence_quality_score,
      abstain: abstention.abstain,
      abstentionReasons: abstention.reasons,
    }),
    analogEvidence: buildAnalogEvidencePayload({
      analogCount: analogs.length,
      topAnalogs: analogs.map(({ candidate, summary }) => ({
        episodeId: candidate.candidate_episode_id,
        themeId: candidate.candidate_theme_id,
        similarity: candidate.similarity_score,
        peakDay: summary.peak_day,
        totalDays: summary.total_days,
      })),
      concentrationGini: canonicalEvidence.candidate_concentration_gini,
      top1Weight: canonicalEvidence.top1_analog_weight,
      evidenceQuality: canonicalEvidence.evidence_quality,
    }),
  }
}

export const readForecastForTheme = (controlState: ControlPlaneState): ForecastReaderResult =>
  mapReaderResult(controlState)

export const shouldAllowLegacyComparisonFallback = (
  control: ForecastReaderResult,
): boolean => !control.serving && LEGACY_FALLBACK_REASONS.has(control.reason ?? '')

export async function loadServedForecastBundle(themeId: string): Promise<ServedForecastBundle> {
  const controlState = await loadLatestControlState()
  if (!controlState) {
    return {
      control: {
        serving: false,
        version: null,
        rollbackAvailable: false,
        rollbackVersion: null,
        reason: 'control_row_missing',
      },
      forecast: null,
      analogEvidence: null,
      comparisonRows: [],
    }
  }

  const control = mapReaderResult(controlState)
  if (!control.serving) {
    return {
      control,
      forecast: null,
      analogEvidence: null,
      comparisonRows: [],
    }
  }

  const snapshot = await loadLatestSnapshot(themeId)
  if (!snapshot) {
    return {
      control: { ...control, serving: false, version: null, reason: 'snapshot_missing' },
      forecast: null,
      analogEvidence: null,
      comparisonRows: [],
    }
  }

  const { candidates, evidenceByCandidateId } = await loadAnalogArtifacts(snapshot.id)
  if (candidates.length === 0 || evidenceByCandidateId.size === 0) {
    return {
      control: { ...control, serving: false, version: null, reason: 'analog_artifacts_missing' },
      forecast: null,
      analogEvidence: null,
      comparisonRows: [],
    }
  }

  const comparisonRows = buildServedComparisons({
    currentDay: snapshot.days_since_episode_start,
    candidates,
    evidenceByCandidateId,
  })
  const { forecast, analogEvidence } = buildServedForecastArtifacts({
    candidates,
    evidenceByCandidateId,
  })

  if (comparisonRows.length === 0 || !forecast || !analogEvidence) {
    return {
      control: { ...control, serving: false, version: null, reason: 'analog_artifacts_incomplete' },
      forecast: null,
      analogEvidence: null,
      comparisonRows: [],
    }
  }

  return {
    control,
    forecast,
    analogEvidence,
    comparisonRows,
  }
}
