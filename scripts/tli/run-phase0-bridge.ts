/**
 * TCAR-003 / TCAR-003A: Phase 0 Bridge Runner
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client'
import type { BridgeRowName, GatePassResult } from '../../lib/tli/forecast/types'
import {
  validateEpisodeRegistryParity,
  validateQuerySnapshotParity,
  validateAnalogCandidatesParity,
  validateForecastControlParity,
  runBridgeValidation,
  createPendingNotMaterializedResult,
  type BridgeRowResult,
} from './phase0-bridge'
import {
  runBridgeCertification,
  evaluateCutoverReadiness,
  evaluateRollbackTrigger,
  type BridgeCertificationInput,
  type BridgeCertificationResult,
  type WeeklyVerdictHistory,
} from './phase0-bridge-certification'

interface EpisodeRegistryStats {
  activeThemeCount: number
  episodeThemeCount: number
  overlappingEpisodeCount: number
  coverageGapRatio: number
}

interface QuerySnapshotLabelStats {
  totalSnapshots: number
  reconstructionSuccessCount: number
  missingSnapshotCount: number
}

interface AnalogCandidatesEvidenceStats {
  expectedArtifacts: number
  materializedArtifacts: number
  dualWriteSuccessCount: number
  dualWriteAttemptCount: number
  auditTrailComplete: boolean
}

interface ForecastControlStats {
  rollbackDrillCount: number
  rollbackDrillSuccessCount: number
  failClosedVerified: boolean
}

export interface BridgeMaterializationStats {
  episodeRegistry: EpisodeRegistryStats
  querySnapshotLabel: QuerySnapshotLabelStats
  analogCandidatesEvidence: AnalogCandidatesEvidenceStats
  forecastControl: ForecastControlStats
}

interface BridgeAuditInsert {
  run_date: string
  bridge_row: BridgeRowName
  parity: Record<string, unknown>
  verdict: GatePassResult
  cutover_eligible: boolean
  rollback_triggered: boolean
  details: Record<string, unknown> | null
}

const PAGE_SIZE = 1000

async function fetchAllRows<T>(
  table: string,
  select: string,
  eqFilter?: { column: string; value: string | boolean },
): Promise<T[]> {
  const supabase = getServerSupabaseClient()
  const rows: T[] = []
  let from = 0

  while (true) {
    let query = supabase.from(table).select(select)
    if (eqFilter) {
      query = query.eq(eqFilter.column, eqFilter.value)
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error || !data?.length) break

    rows.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

function countOverlappingEpisodes(rows: Array<{
  theme_id: string
  episode_start: string
  episode_end: string | null
}>): number {
  const byTheme = new Map<string, Array<{ episode_start: string; episode_end: string | null }>>()

  for (const row of rows) {
    const existing = byTheme.get(row.theme_id) ?? []
    existing.push({ episode_start: row.episode_start, episode_end: row.episode_end })
    byTheme.set(row.theme_id, existing)
  }

  let overlaps = 0
  for (const episodes of byTheme.values()) {
    const sorted = [...episodes].sort((a, b) => a.episode_start.localeCompare(b.episode_start))
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]
      const next = sorted[i + 1]
      if (current.episode_end === null || current.episode_end > next.episode_start) {
        overlaps++
      }
    }
  }

  return overlaps
}

async function loadEpisodeRegistryStats(): Promise<EpisodeRegistryStats> {
  const supabase = getServerSupabaseClient()
  const [{ count: activeThemeCount }, activeThemes, episodeRows] = await Promise.all([
    supabase.from('themes').select('*', { count: 'exact', head: true }).eq('is_active', true),
    fetchAllRows<{ id: string }>('themes', 'id', { column: 'is_active', value: true }),
    fetchAllRows<{ theme_id: string; episode_start: string; episode_end: string | null }>(
      'episode_registry_v1',
      'theme_id, episode_start, episode_end',
    ),
  ])

  const activeThemeIds = new Set(activeThemes.map((theme) => theme.id))
  const episodeThemeIds = new Set(episodeRows.map((row) => row.theme_id))
  const missingCoverageCount = [...activeThemeIds].filter((themeId) => !episodeThemeIds.has(themeId)).length

  return {
    activeThemeCount: activeThemeCount ?? activeThemeIds.size,
    episodeThemeCount: episodeThemeIds.size,
    overlappingEpisodeCount: countOverlappingEpisodes(episodeRows),
    coverageGapRatio: activeThemeIds.size === 0 ? 0 : missingCoverageCount / activeThemeIds.size,
  }
}

async function loadQuerySnapshotLabelStats(): Promise<QuerySnapshotLabelStats> {
  const supabase = getServerSupabaseClient()
  const [
    { count: totalSnapshots },
    { count: reconstructionSuccessCount },
    { count: failedSnapshots },
    { count: labelCount },
  ] = await Promise.all([
    supabase.from('query_snapshot_v1').select('*', { count: 'exact', head: true }),
    supabase.from('query_snapshot_v1').select('*', { count: 'exact', head: true }).eq('reconstruction_status', 'success'),
    supabase.from('query_snapshot_v1').select('*', { count: 'exact', head: true }).neq('reconstruction_status', 'success'),
    supabase.from('label_table_v1').select('*', { count: 'exact', head: true }),
  ])

  return {
    totalSnapshots: totalSnapshots ?? 0,
    reconstructionSuccessCount: reconstructionSuccessCount ?? 0,
    missingSnapshotCount: Math.max((totalSnapshots ?? 0) - (labelCount ?? 0), failedSnapshots ?? 0),
  }
}

async function loadAnalogCandidatesEvidenceStats(): Promise<AnalogCandidatesEvidenceStats> {
  const supabase = getServerSupabaseClient()
  const [
    { count: expectedArtifacts },
    { count: candidateCount },
    { count: evidenceCount },
  ] = await Promise.all([
    supabase.from('theme_comparisons').select('*', { count: 'exact', head: true }),
    supabase.from('analog_candidates_v1').select('*', { count: 'exact', head: true }),
    supabase.from('analog_evidence_v1').select('*', { count: 'exact', head: true }),
  ])

  const materializedArtifacts = Math.min(candidateCount ?? 0, evidenceCount ?? 0)

  return {
    expectedArtifacts: expectedArtifacts ?? 0,
    materializedArtifacts,
    dualWriteSuccessCount: materializedArtifacts,
    dualWriteAttemptCount: Math.max(expectedArtifacts ?? 0, candidateCount ?? 0, evidenceCount ?? 0),
    auditTrailComplete: materializedArtifacts > 0 && candidateCount === evidenceCount,
  }
}

async function loadForecastControlStats(): Promise<ForecastControlStats> {
  const supabase = getServerSupabaseClient()
  const { data } = await supabase
    .from('forecast_control_v1')
    .select('rollback_drill_count, rollback_drill_last_success, fail_closed_verified')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return {
      rollbackDrillCount: 0,
      rollbackDrillSuccessCount: 0,
      failClosedVerified: false,
    }
  }

  return {
    rollbackDrillCount: data.rollback_drill_count,
    rollbackDrillSuccessCount: data.rollback_drill_last_success ? data.rollback_drill_count : 0,
    failClosedVerified: data.fail_closed_verified,
  }
}

export async function loadBridgeMaterializationStats(): Promise<BridgeMaterializationStats> {
  const [
    episodeRegistry,
    querySnapshotLabel,
    analogCandidatesEvidence,
    forecastControl,
  ] = await Promise.all([
    loadEpisodeRegistryStats(),
    loadQuerySnapshotLabelStats(),
    loadAnalogCandidatesEvidenceStats(),
    loadForecastControlStats(),
  ])

  return {
    episodeRegistry,
    querySnapshotLabel,
    analogCandidatesEvidence,
    forecastControl,
  }
}

export const buildBridgeCertificationInputFromStats = (
  stats: BridgeMaterializationStats,
): BridgeCertificationInput => ({
  episodeRegistry: stats.episodeRegistry,
  querySnapshotLabel: stats.querySnapshotLabel,
  analogCandidatesEvidence: stats.analogCandidatesEvidence,
  forecastControl: stats.forecastControl,
})

export const buildBridgeAuditRows = (
  runDate: string,
  certification: BridgeCertificationResult,
): BridgeAuditInsert[] =>
  certification.results.map((result) => ({
    run_date: runDate,
    bridge_row: result.rowName,
    parity: { ...result.parity },
    verdict: result.verdict,
    cutover_eligible: result.cutover_eligible,
    rollback_triggered: result.rollback_triggered,
    details: result.details ? { ...result.details } : null,
  }))

export async function persistBridgeAuditRows(rows: BridgeAuditInsert[]) {
  if (rows.length === 0) return

  const supabase = getServerSupabaseClient()
  const payload = rows.map((row) => ({
    artifact_version: 'bridge_run_audits_v1',
    ...row,
  }))
  const { error } = await supabase.from('bridge_run_audits_v1').insert(payload)
  if (error) {
    throw new Error(`failed to persist bridge audits: ${error.message}`)
  }
}

export async function runPhase0BridgeCertification(input?: {
  runDate?: string
  persist?: boolean
}) {
  const runDate = input?.runDate ?? new Date().toISOString().split('T')[0]
  const stats = await loadBridgeMaterializationStats()
  const certificationInput = buildBridgeCertificationInputFromStats(stats)
  const certification = runBridgeCertification(certificationInput)
  const auditRows = buildBridgeAuditRows(runDate, certification)

  if (input?.persist !== false) {
    await persistBridgeAuditRows(auditRows)
  }

  return {
    stats,
    certificationInput,
    certification,
    auditRows,
  }
}

export const runBridgeWithDefaults = (): BridgeRowResult[] => [
  createPendingNotMaterializedResult('episode_registry'),
  createPendingNotMaterializedResult('query_snapshot_label'),
  createPendingNotMaterializedResult('analog_candidates_evidence'),
  createPendingNotMaterializedResult('forecast_control'),
]

export {
  validateEpisodeRegistryParity,
  validateQuerySnapshotParity,
  validateAnalogCandidatesParity,
  validateForecastControlParity,
  runBridgeValidation,
  createPendingNotMaterializedResult,
  runBridgeCertification,
  evaluateCutoverReadiness,
  evaluateRollbackTrigger,
  type BridgeRowResult,
  type BridgeCertificationInput,
  type WeeklyVerdictHistory,
}
