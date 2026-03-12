export const LEVEL4_SOURCE_SURFACES = [
  'legacy_diagnostic',
  'v2_certification',
  'replay_equivalent',
] as const

export type Level4SourceSurface = (typeof LEVEL4_SOURCE_SURFACES)[number]
export type Level4CertificationSourceSurface = Exclude<Level4SourceSurface, 'legacy_diagnostic'>
export type Level4ConfidenceTier = 'high' | 'medium' | 'low'

export interface Level4ServingMetadata {
  source_surface: Level4SourceSurface
  calibration_version: string
  weight_version?: string | null
  relevance_probability?: number | null
  probability_ci_lower?: number | null
  probability_ci_upper?: number | null
  support_count?: number | null
  confidence_tier?: Level4ConfidenceTier | null
}

export function isLevel4SourceSurface(value: unknown): value is Level4SourceSurface {
  return typeof value === 'string' && LEVEL4_SOURCE_SURFACES.includes(value as Level4SourceSurface)
}

export function isCertificationSourceSurface(
  value: unknown,
): value is Level4CertificationSourceSurface {
  return value === 'v2_certification' || value === 'replay_equivalent'
}


export interface Level4CalibrationArtifact extends Level4ServingMetadata {
  ci_method: string
  bootstrap_iterations: number
  created_at?: string
}

export interface Level4WeightArtifact {
  source_surface: Level4SourceSurface
  weight_version: string
  ci_method: string
  bootstrap_iterations: number
  created_at?: string
}

export const requiredCalibrationArtifactFields = [
  'source_surface',
  'calibration_version',
  'ci_method',
  'bootstrap_iterations',
  'created_at',
] as const

export const requiredWeightArtifactFields = [
  'source_surface',
  'weight_version',
  'created_at',
] as const

export const requiredDriftArtifactFields = [
  'source_surface',
  'drift_version',
  'created_at',
] as const

export function isCertificationCalibrationArtifact(
  value: Pick<Level4CalibrationArtifact, 'source_surface' | 'calibration_version' | 'ci_method' | 'bootstrap_iterations'>,
): value is Level4CalibrationArtifact {
  return isCertificationSourceSurface(value.source_surface)
    && typeof value.calibration_version === 'string'
    && typeof value.ci_method === 'string'
    && typeof value.bootstrap_iterations === 'number'
}

export function isCertificationWeightArtifact(
  value: Pick<Level4WeightArtifact, 'source_surface' | 'weight_version' | 'ci_method' | 'bootstrap_iterations'>,
): value is Level4WeightArtifact {
  return isCertificationSourceSurface(value.source_surface)
    && typeof value.weight_version === 'string'
    && typeof value.ci_method === 'string'
    && typeof value.bootstrap_iterations === 'number'
}
