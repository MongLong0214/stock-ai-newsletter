import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import { resolveLevel4ConfidenceTier } from '@/lib/tli/comparison/level4-serving'
import { isCertificationSourceSurface, type Level4ServingMetadata } from '@/lib/tli/comparison/level4-types'
import { fetchLatestCertificationCalibrationArtifact } from '@/scripts/tli/level4/calibration-artifact'
import { fetchWeightArtifactByVersion, type WeightArtifactRow } from '@/scripts/tli/level4/weight-artifact'

export { isCertificationSourceSurface } from '@/lib/tli/comparison/level4-types'
import { resolveComparisonV4ServingVersion } from '@/scripts/tli/comparison-v4-control'

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

export function isComparisonV4ServingEnabled() {
  return process.env.TLI_COMPARISON_V4_SERVING_ENABLED === 'true'
}

export function getComparisonV4ReaderMode(): 'view' | 'table' {
  return process.env.TLI_COMPARISON_V4_SERVING_VIEW === 'true' ? 'view' : 'table'
}

export function getComparisonV4ServingVersion() {
  return process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION || DEFAULT_COMPARISON_V4_SERVING_VERSION
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
  const eligible = runs
    .filter((run) => run.candidate_pool === 'archetype' && run.publish_ready && run.status === 'published')
    .filter((run) => algorithmVersion === DEFAULT_COMPARISON_V4_SERVING_VERSION || run.algorithm_version === algorithmVersion)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

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
  if (!pinned.calibrationVersion) {
    throw new Error('Active serving control row is missing a pinned calibration artifact')
  }

  const artifactClient = supabase as unknown as Parameters<typeof fetchLatestCertificationCalibrationArtifact>[0]
  const calibrationArtifact = await fetchLatestCertificationCalibrationArtifact(artifactClient, pinned.calibrationVersion) as CalibrationArtifactServingRow
  assertCertificationServingArtifact(calibrationArtifact)

  const weightVersion = await resolveServingWeightVersion({
    requestedWeightVersion: pinned.weightVersion,
    loadWeightArtifact: (requestedWeightVersion) => fetchWeightArtifactByVersion(
      supabase as unknown as Parameters<typeof fetchWeightArtifactByVersion>[0],
      requestedWeightVersion,
    ),
  })

  return weightVersion
    ? applyCertifiedWeightVersion(calibrationArtifact, {
        weight_version: weightVersion,
        source_surface: calibrationArtifact.source_surface,
      })
    : calibrationArtifact
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
      ...(level4 ? {
        relevanceProbability: level4.relevance_probability,
        probabilityCiLower: level4.probability_ci_lower,
        probabilityCiUpper: level4.probability_ci_upper,
        supportCount: level4.support_count,
        confidenceTier: level4.confidence_tier,
        calibrationVersion: level4.calibration_version,
        weightVersion: level4.weight_version ?? null,
        sourceSurface: level4.source_surface,
      } : {}),
    }
  })
}

async function fetchFromServingView(themeId: string) {
  const supabase = getServerSupabaseClient()
  let artifact: CalibrationArtifactServingRow
  try {
    const controlRow = await loadActiveControlRow(supabase)
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
    envVersion: process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION,
    controlRow,
  })

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
  let artifact: CalibrationArtifactServingRow
  try {
    artifact = await resolveServingCalibrationArtifact(supabase, controlRow)
  } catch (error) {
    return { data: null, error: { code: 'CERTIFICATION_REQUIRED', message: error instanceof Error ? error.message : String(error) } }
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
