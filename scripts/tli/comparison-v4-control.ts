export const DEFAULT_COMPARISON_V4_SERVING_VERSION = 'latest'

export interface ComparisonV4ControlRow {
  production_version: string
  serving_enabled: boolean
  promoted_by: string
  promoted_at: string
}

export function resolveComparisonV4ServingVersion(input: {
  envVersion?: string
  controlRow: { production_version: string; serving_enabled: boolean } | null
}) {
  if (input.controlRow?.serving_enabled && input.controlRow.production_version) {
    return input.controlRow.production_version
  }
  return input.envVersion || DEFAULT_COMPARISON_V4_SERVING_VERSION
}

export function buildComparisonV4ControlRow(input: {
  productionVersion: string
  servingEnabled: boolean
  actor: string
  promotedAt?: string
}): ComparisonV4ControlRow {
  return {
    production_version: input.productionVersion,
    serving_enabled: input.servingEnabled,
    promoted_by: input.actor,
    promoted_at: input.promotedAt || new Date().toISOString(),
  }
}
