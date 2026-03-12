import {
  isCertificationSourceSurface,
  isLevel4SourceSurface,
  type Level4CalibrationArtifact,
} from '@/lib/tli/comparison/level4-types'

export interface ReaderArtifactInput {
  source_surface: string
  calibration_version: string
  created_at?: string
  ci_method?: string
  bootstrap_iterations?: number
}

export function assertServingArtifactSurface(artifact: Pick<ReaderArtifactInput, 'source_surface' | 'calibration_version'>) {
  if (!isLevel4SourceSurface(artifact.source_surface)) {
    throw new Error(`Invalid source_surface for serving artifact: ${artifact.source_surface} (${artifact.calibration_version})`)
  }
  return artifact
}

export function selectCertificationCalibrationArtifact<T extends ReaderArtifactInput>(artifacts: T[]): T {
  const eligible = artifacts
    .filter((artifact): artifact is T & Level4CalibrationArtifact => isCertificationSourceSurface(artifact.source_surface))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  const selected = eligible[0]
  if (!selected) {
    throw new Error('No certification-grade calibration artifact available for serving')
  }

  return selected
}
