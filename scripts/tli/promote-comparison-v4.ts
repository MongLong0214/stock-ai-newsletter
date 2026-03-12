import { config } from 'dotenv'
config({ path: '.env.local' })

import type { Level4CertificationSourceSurface } from '@/lib/tli/comparison/level4-types'
import { buildArtifactBackedPromotionContext, resolveRequiredWeightArtifact } from './level4/promotion-runtime'
import { fetchLatestCertificationCalibrationArtifact } from './level4/calibration-artifact'
import { fetchWeightArtifactByVersion } from './level4/weight-artifact'
import { supabaseAdmin } from './supabase-admin'

function readRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function parseSourceSurface(value: string): Level4CertificationSourceSurface {
  if (value === 'v2_certification' || value === 'replay_equivalent') return value
  throw new Error(`Invalid TLI_COMPARISON_V4_SOURCE_SURFACE: ${value}`)
}

async function main() {
  const runIds = process.argv.slice(2)
  const actor = process.env.USER || 'codex'

  if (runIds.length === 0) {
    throw new Error('usage: npx tsx scripts/tli/promote-comparison-v4.ts <run-id> [run-id...]')
  }

  const productionVersion = readRequiredEnv('TLI_COMPARISON_V4_PRODUCTION_VERSION')
  const calibrationVersion = readRequiredEnv('TLI_COMPARISON_V4_CALIBRATION_VERSION')
  const driftVersion = readRequiredEnv('TLI_COMPARISON_V4_DRIFT_VERSION')
  const sourceSurface = parseSourceSurface(process.env.TLI_COMPARISON_V4_SOURCE_SURFACE || 'v2_certification')
  const weightVersion = readRequiredEnv('TLI_COMPARISON_V4_WEIGHT_VERSION')
  const holdState = (process.env.TLI_COMPARISON_V4_HOLD_STATE || 'inactive') as 'inactive' | 'active' | 'observation_only'
  const holdReason = process.env.TLI_COMPARISON_V4_HOLD_REASON || null
  const holdReportDate = process.env.TLI_COMPARISON_V4_HOLD_REPORT_DATE || null
  const gateFailures = process.env.TLI_COMPARISON_V4_GATE_FAILURES
    ? process.env.TLI_COMPARISON_V4_GATE_FAILURES.split(',').map((value) => value.trim()).filter(Boolean)
    : []
  void gateFailures
  void holdState
  void holdReason
  void holdReportDate

  const calibrationArtifact = await fetchLatestCertificationCalibrationArtifact(
    supabaseAdmin as unknown as Parameters<typeof fetchLatestCertificationCalibrationArtifact>[0],
    calibrationVersion,
  )
  const requestedWeightArtifact = weightVersion
    ? await fetchWeightArtifactByVersion(
        supabaseAdmin as unknown as Parameters<typeof fetchWeightArtifactByVersion>[0],
        weightVersion,
      )
    : null
  const { data: driftArtifact, error: driftError } = driftVersion
    ? await supabaseAdmin
        .from('drift_report_artifact')
        .select('drift_version, drift_status, candidate_concentration_gini, baseline_candidate_concentration_gini, censoring_ratio, baseline_censoring_ratio, low_confidence_serving_rate, auto_hold_enabled, hold_report_date')
        .eq('drift_version', driftVersion)
        .maybeSingle()
    : { data: null, error: null }

  if (driftError || !driftArtifact) {
    throw new Error(`Missing drift artifact: ${driftError?.message || driftVersion || 'unknown'}`)
  }

  const context = buildArtifactBackedPromotionContext({
    calibrationArtifact,
    weightArtifact: resolveRequiredWeightArtifact(requestedWeightArtifact),
    driftArtifact,
  })

  if (!context.gateVerdict.passed) {
    throw new Error(`promotion gate failed: ${context.gateVerdict.summary}`)
  }

  const { data: activeControlRow } = await supabaseAdmin
    .from('comparison_v4_control')
    .select('production_version')
    .eq('serving_enabled', true)
    .maybeSingle()

  const publishedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin.rpc('promote_comparison_v4_release', {
    p_run_ids: runIds,
    p_published_at: publishedAt,
    p_production_version: productionVersion,
    p_actor: actor,
    p_source_surface: sourceSurface,
    p_calibration_version: calibrationVersion,
    p_weight_version: weightVersion,
    p_drift_version: driftVersion,
    p_gate_status: context.gateVerdict.status,
    p_gate_summary: context.gateVerdict.summary,
    p_gate_failures: context.gateVerdict.failureReasons,
    p_previous_stable_version: activeControlRow?.production_version ?? null,
    p_auto_hold_enabled: context.autoHold.autoHoldEnabled,
    p_hold_state: context.autoHold.holdState,
    p_hold_reason: context.autoHold.holdReason,
    p_hold_report_date: context.autoHold.holdReportDate,
  })

  if (error) throw new Error(`atomic promotion failed: ${error.message}`)

  console.log(JSON.stringify(data))
  console.log(`\n✅ 승격 완료: ${runIds.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
