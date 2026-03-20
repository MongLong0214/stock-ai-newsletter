import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import { resolveLevel4ConfidenceTier } from '@/lib/tli/comparison/level4-serving'
import { isCertificationSourceSurface, type Level4ServingMetadata } from '@/lib/tli/comparison/level4-types'
import { fetchLatestCertificationCalibrationArtifact } from '@/scripts/tli/level4/calibration-artifact'
import {
  fetchLatestCertificationWeightArtifact,
  fetchWeightArtifactByVersion,
  type WeightArtifactRow,
} from '@/scripts/tli/level4/weight-artifact'

export { isCertificationSourceSurface } from '@/lib/tli/comparison/level4-types'
import { resolveComparisonV4ServingVersion } from '@/scripts/tli/comparison/v4/control'

export const DEFAULT_COMPARISON_V4_SERVING_VERSION = 'latest'

export interface PublishedComparisonRun {
  id: string
  candidate_pool: string
  publish_ready: boolean
  status: string
  created_at: string
  algorithm_version: string
}

interface ComparisonV2CandidateRow {
  candidate_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  message: string | null
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  past_peak_score: number | null
  past_final_stage: string | null
  past_decline_days: number | null
  supportCount?: number | null
  confidenceTier?: 'high' | 'medium' | 'low' | null
  calibrationVersion?: string | null
  weightVersion?: string | null
  sourceSurface?: Level4ServingMetadata['source_surface'] | null
}

interface CalibrationArtifactServingRow {
  source_surface: Level4ServingMetadata['source_surface']
  calibration_version: string
  weight_version?: string | null
  bin_summary?: Array<{
    bucket: number
    mean_predicted: number
    empirical_rate: number
    count: number
  }> | null
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

interface EpisodeServingRow {
  id: string
  is_active: boolean
}

type ServingMetadataInput = CalibrationArtifactServingRow | Pick<
  Level4ServingMetadata,
  'source_surface' | 'calibration_version' | 'weight_version' | 'relevance_probability' | 'probability_ci_lower' | 'probability_ci_upper' | 'support_count' | 'confidence_tier'
>
type Level4ServingPayload = ReturnType<typeof buildLevel4ServingMetadata>
type ActiveControlRow = {
  production_version: string
  serving_enabled: boolean
  calibration_version?: string | null
  weight_version?: string | null
} | null

export function hasActiveComparisonV4ServingControl(
  controlRow: { production_version: string; serving_enabled: boolean } | null,
) {
  return Boolean(controlRow?.serving_enabled && controlRow.production_version)
}

export function isComparisonV4ServingEnabled() {
  return true
}

export function getComparisonV4ReaderMode(): 'view' | 'table' {
  return 'table'
}

export function resolvePinnedServingArtifactVersions(input: {
  calibration_version?: string | null
  weight_version?: string | null
  serving_enabled: boolean
}) {
  return {
    calibrationVersion: input.serving_enabled ? input.calibration_version ?? null : null,
    weightVersion: input.serving_enabled ? input.weight_version ?? null : null,
  }
}

export function selectPublishedComparisonRun(
  runs: PublishedComparisonRun[],
  algorithmVersion = DEFAULT_COMPARISON_V4_SERVING_VERSION,
) {
  const poolPriority: Record<string, number> = {
    archetype: 0,
    mixed_legacy: 1,
    peer: 2,
  }

  const eligible = runs
    .filter((run) => run.publish_ready && run.status === 'published')
    .filter((run) => algorithmVersion === DEFAULT_COMPARISON_V4_SERVING_VERSION || run.algorithm_version === algorithmVersion)
    .sort((a, b) => {
      const poolDelta = (poolPriority[a.candidate_pool] ?? 99) - (poolPriority[b.candidate_pool] ?? 99)
      if (poolDelta !== 0) return poolDelta
      return b.created_at.localeCompare(a.created_at)
    })

  return eligible[0] ?? null
}



export function assertCertificationServingArtifact(metadata: Pick<Level4ServingMetadata, 'source_surface' | 'calibration_version'>) {
  if (!isCertificationSourceSurface(metadata.source_surface)) {
    throw new Error(
      `Comparison v4 serving requires a certification-grade artifact. Received ${metadata.source_surface} for ${metadata.calibration_version}.`,
    )
  }

  return metadata
}

export function applyCertifiedWeightVersion(
  artifact: CalibrationArtifactServingRow,
  weightArtifact: Pick<WeightArtifactRow, 'weight_version' | 'source_surface'>,
): CalibrationArtifactServingRow {
  return {
    ...artifact,
    weight_version: weightArtifact.weight_version,
  }
}

export async function resolveServingWeightVersion(input: {
  requestedWeightVersion?: string | null
  loadWeightArtifact: (weightVersion: string) => Promise<Pick<WeightArtifactRow, 'weight_version' | 'source_surface'>>
}) {
  if (!input.requestedWeightVersion) return null
  const artifact = await input.loadWeightArtifact(input.requestedWeightVersion)
  if (!artifact?.weight_version || !isCertificationSourceSurface(artifact.source_surface)) {
    throw new Error(`Active weight artifact ${input.requestedWeightVersion} is not certification-grade`)
  }
  return artifact.weight_version
}

function clampProbability(value: number) {
  return Math.max(0, Math.min(1, value))
}

function buildWilsonInterval(probability: number, count: number) {
  if (count <= 0) return { lower: null, upper: null }
  const z = 1.96
  const denominator = 1 + (z * z) / count
  const center = (probability + (z * z) / (2 * count)) / denominator
  const halfWidth = (z * Math.sqrt((probability * (1 - probability) + (z * z) / (4 * count)) / count)) / denominator
  return {
    lower: clampProbability(center - halfWidth),
    upper: clampProbability(center + halfWidth),
  }
}

async function loadActiveControlRow(supabase: ReturnType<typeof getServerSupabaseClient>): Promise<ActiveControlRow> {
  try {
    const { data } = await supabase
      .from('comparison_v4_control')
      .select('production_version, serving_enabled, calibration_version, weight_version')
      .eq('serving_enabled', true)
      .order('promoted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data ?? null
  } catch {
    return null
  }
}

async function resolveServingCalibrationArtifact(
  supabase: ReturnType<typeof getServerSupabaseClient>,
  controlRow: ActiveControlRow,
) {
  const pinned = resolvePinnedServingArtifactVersions({
    calibration_version: controlRow?.calibration_version ?? null,
    weight_version: controlRow?.weight_version ?? null,
    serving_enabled: controlRow?.serving_enabled ?? false,
  })
  const artifactClient = supabase as unknown as Parameters<typeof fetchLatestCertificationCalibrationArtifact>[0]
  const calibrationArtifact = await fetchLatestCertificationCalibrationArtifact(
    artifactClient,
    pinned.calibrationVersion,
  ) as CalibrationArtifactServingRow
  assertCertificationServingArtifact(calibrationArtifact)

  const weightArtifactClient = supabase as unknown as Parameters<typeof fetchWeightArtifactByVersion>[0]
  const weightArtifact = pinned.weightVersion
    ? await fetchWeightArtifactByVersion(weightArtifactClient, pinned.weightVersion)
    : await fetchLatestCertificationWeightArtifact(weightArtifactClient)

  return applyCertifiedWeightVersion(calibrationArtifact, {
    weight_version: weightArtifact.weight_version,
    source_surface: weightArtifact.source_surface,
  })
}

export function buildLevel4ServingMetadata(
  artifact: CalibrationArtifactServingRow,
  similarityScore: number,
): Pick<Level4ServingMetadata, 'source_surface' | 'calibration_version' | 'weight_version' | 'relevance_probability' | 'probability_ci_lower' | 'probability_ci_upper' | 'support_count' | 'confidence_tier'> {
  const bucket = Math.max(0, Math.min(9, Math.floor(similarityScore * 10)))
  const bin = artifact.bin_summary?.find((entry) => entry.bucket === bucket) ?? null
  const relevanceProbability = bin ? clampProbability(bin.empirical_rate) : null
  const supportCount = bin?.count ?? null
  const interval = relevanceProbability != null && supportCount != null
    ? buildWilsonInterval(relevanceProbability, supportCount)
    : { lower: null, upper: null }
  const confidenceTier = resolveLevel4ConfidenceTier({
    supportCount,
    probabilityCiLower: interval.lower,
    probabilityCiUpper: interval.upper,
  })

  return {
    source_surface: artifact.source_surface,
    calibration_version: artifact.calibration_version,
    weight_version: artifact.weight_version ?? null,
    relevance_probability: relevanceProbability,
    probability_ci_lower: interval.lower,
    probability_ci_upper: interval.upper,
    support_count: supportCount,
    confidence_tier: confidenceTier,
  }
}

export function mapV2CandidatesToLegacyComparisons(
  rows: ComparisonV2CandidateRow[],
  servingMetadata?: ServingMetadataInput,
) {
  return rows.map((row) => {
    const level4: Level4ServingPayload | null = servingMetadata
      ? ('bin_summary' in servingMetadata
          ? buildLevel4ServingMetadata(servingMetadata, row.similarity_score)
          : servingMetadata as Level4ServingPayload)
      : null
    return {
      id: row.candidate_theme_id,
      past_theme_id: row.candidate_theme_id,
      similarity_score: row.similarity_score,
      current_day: row.current_day,
      past_peak_day: row.past_peak_day,
      past_total_days: row.past_total_days,
      message: row.message,
      feature_sim: row.feature_sim,
      curve_sim: row.curve_sim,
      keyword_sim: row.keyword_sim,
      past_peak_score: row.past_peak_score,
      past_final_stage: row.past_final_stage,
      past_decline_days: row.past_decline_days,
      relevanceProbability: level4?.relevance_probability ?? null,
      probabilityCiLower: level4?.probability_ci_lower ?? null,
      probabilityCiUpper: level4?.probability_ci_upper ?? null,
      supportCount: row.supportCount ?? level4?.support_count ?? null,
      confidenceTier: row.confidenceTier ?? level4?.confidence_tier ?? null,
      calibrationVersion: row.calibrationVersion ?? level4?.calibration_version ?? null,
      weightVersion: row.weightVersion ?? level4?.weight_version ?? null,
      sourceSurface: row.sourceSurface ?? level4?.source_surface ?? null,
    }
  })
}

function normalizeAnalogSummary(
  summary: AnalogEvidenceServingRow['analog_future_path_summary'] | null | undefined,
) {
  if (!summary) return null
  if (!Number.isFinite(summary.peak_day) || !Number.isFinite(summary.total_days)) return null
  if (typeof summary.final_stage !== 'string' || summary.final_stage.length === 0) return null
  return summary
}

export function buildCompletedAnalogComparisonRows(input: {
  currentDay: number
  candidates: AnalogCandidateServingRow[]
  evidenceByCandidateId: Map<string, AnalogEvidenceServingRow>
  episodeById: Map<string, EpisodeServingRow>
}) {
  const rows: Array<{
    id: string
    candidate_theme_id: string
    similarity_score: number
    current_day: number
    past_peak_day: number
    past_total_days: number
    message: string
    feature_sim: number | null
    curve_sim: number | null
    keyword_sim: number | null
    past_peak_score: null
    past_final_stage: string | null
    past_decline_days: number | null
    supportCount: number
    confidenceTier: 'high' | 'medium' | 'low'
    sourceSurface: Level4ServingMetadata['source_surface']
  }> = []

  for (const candidate of input.candidates) {
    const evidence = input.evidenceByCandidateId.get(candidate.id)
    const summary = normalizeAnalogSummary(evidence?.analog_future_path_summary)
    const episode = input.episodeById.get(candidate.candidate_episode_id)
    if (!evidence || !summary) continue

    rows.push({
      id: candidate.id,
      candidate_theme_id: candidate.candidate_theme_id,
      similarity_score: candidate.similarity_score,
      current_day: input.currentDay,
      past_peak_day: summary.peak_day,
      past_total_days: summary.total_days,
      message: evidence.retrieval_reason,
      feature_sim: candidate.feature_sim,
      curve_sim: candidate.curve_sim,
      keyword_sim: candidate.keyword_sim,
      past_peak_score: null,
      past_final_stage: episode?.is_active ? null : summary.final_stage,
      past_decline_days: episode?.is_active ? null : Math.max(summary.total_days - summary.peak_day, 0),
      supportCount: evidence.analog_support_count,
      confidenceTier: evidence.evidence_quality,
      sourceSurface: 'v2_certification',
    })
  }

  return rows
}

async function loadLatestCompletedAnalogRows(themeId: string) {
  const supabase = getServerSupabaseClient()
  const { data: snapshot, error: snapshotError } = await supabase
    .from('query_snapshot_v1')
    .select('id, days_since_episode_start, reconstruction_status')
    .eq('theme_id', themeId)
    .neq('reconstruction_status', 'failed')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snapshotError || !snapshot) {
    return { data: [], error: snapshotError ?? null }
  }

  const { data: candidates, error: candidateError } = await supabase
    .from('analog_candidates_v1')
    .select('id, candidate_theme_id, candidate_episode_id, similarity_score, feature_sim, curve_sim, keyword_sim, rank')
    .eq('query_snapshot_id', snapshot.id)
    .order('rank', { ascending: true })
    .limit(5)

  if (candidateError || !candidates?.length) {
    return { data: [], error: candidateError ?? null }
  }

  const candidateIds = candidates.map((candidate) => candidate.id)
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('analog_evidence_v1')
    .select('candidate_id, candidate_episode_id, analog_future_path_summary, retrieval_reason, mismatch_summary, evidence_quality, evidence_quality_score, analog_support_count, candidate_concentration_gini, top1_analog_weight')
    .eq('query_snapshot_id', snapshot.id)
    .in('candidate_id', candidateIds)

  if (evidenceError || !evidenceRows?.length) {
    return { data: [], error: evidenceError ?? null }
  }

  const episodeIds = [...new Set(candidates.map((candidate) => candidate.candidate_episode_id))]
  const { data: episodeRows, error: episodeError } = await supabase
    .from('episode_registry_v1')
    .select('id, is_active')
    .in('id', episodeIds)

  if (episodeError) {
    return { data: [], error: episodeError }
  }

  return {
    data: buildCompletedAnalogComparisonRows({
      currentDay: snapshot.days_since_episode_start,
      candidates: candidates as AnalogCandidateServingRow[],
      evidenceByCandidateId: new Map(
        evidenceRows.map((row) => [row.candidate_id, row as AnalogEvidenceServingRow]),
      ),
      episodeById: new Map(
        (episodeRows ?? []).map((row) => [row.id, row as EpisodeServingRow]),
      ),
    }),
    error: null,
  }
}

async function fetchFromServingView(themeId: string) {
  const supabase = getServerSupabaseClient()
  const controlRow = await loadActiveControlRow(supabase)
  let artifact: CalibrationArtifactServingRow
  try {
    artifact = await resolveServingCalibrationArtifact(supabase, controlRow)
  } catch (error) {
    return { data: null, error: { code: 'CERTIFICATION_REQUIRED', message: error instanceof Error ? error.message : String(error) } }
  }
  const { data, error } = await supabase
    .from('v_comparison_v4_serving')
    .select('candidate_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
    .eq('theme_id', themeId)
    .order('rank', { ascending: true })
    .limit(3)

  if (error) return { data: null, error }
  return {
    data: mapV2CandidatesToLegacyComparisons((data || []) as ComparisonV2CandidateRow[], artifact),
    error: null,
  }
}

export async function fetchPublishedComparisonRowsV4(themeId: string) {
  // view mode: use the pre-filtered serving view (anon-safe)
  if (getComparisonV4ReaderMode() === 'view') {
    return fetchFromServingView(themeId)
  }

  const supabase = getServerSupabaseClient()
  const controlRow = await loadActiveControlRow(supabase)
  const algorithmVersion = resolveComparisonV4ServingVersion({
    envVersion: DEFAULT_COMPARISON_V4_SERVING_VERSION,
    controlRow,
  })

  let artifact: CalibrationArtifactServingRow
  try {
    artifact = await resolveServingCalibrationArtifact(supabase, controlRow)
  } catch (error) {
    return { data: null, error: { code: 'CERTIFICATION_REQUIRED', message: error instanceof Error ? error.message : String(error) } }
  }

  const analogRows = await loadLatestCompletedAnalogRows(themeId)
  if (analogRows.error) {
    return { data: null, error: analogRows.error }
  }
  if (analogRows.data.length > 0) {
    return {
      data: mapV2CandidatesToLegacyComparisons(analogRows.data as ComparisonV2CandidateRow[], artifact),
      error: null,
    }
  }

  const { data: runs, error: runError } = await supabase
    .from('theme_comparison_runs_v2')
    .select('id, candidate_pool, publish_ready, status, created_at, algorithm_version')
    .eq('current_theme_id', themeId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (runError) {
    return { data: null, error: runError }
  }

  const selected = selectPublishedComparisonRun((runs || []) as PublishedComparisonRun[], algorithmVersion)
  if (!selected) {
    return { data: [], error: null }
  }

  const { data, error } = await supabase
    .from('theme_comparison_candidates_v2')
    .select('candidate_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
    .eq('run_id', selected.id)
    .order('rank', { ascending: true })
    .limit(3)

  if (error) {
    return { data: null, error }
  }

  return {
    data: mapV2CandidatesToLegacyComparisons((data || []) as ComparisonV2CandidateRow[], artifact),
    error: null,
  }
}
