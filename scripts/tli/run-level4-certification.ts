import { config } from 'dotenv'
config({ path: '.env.local' })

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseAdmin } from './supabase-admin'
import { fetchPublishedComparisonRowsV4 } from '@/app/api/tli/themes/[id]/comparison-v4-reader'
import { fetchLatestCertificationCalibrationArtifact } from './level4/calibration-artifact'
import { fetchLatestDriftArtifact } from './level4/drift-report'
import { buildCertificationOutput } from './level4/runtime'
import { buildLevel4CertificationChecklist } from './level4/certification-rehearsal'
import { buildCertificationRuntimeChecks } from './level4/certification-runtime'
import { fetchLatestCertificationWeightArtifact } from './level4/weight-artifact'
import { getConfidenceAlertText } from '@/app/themes/[id]/_components/comparison-list/logic'

async function main() {
  const releaseCandidate = process.env.TLI4_RELEASE_CANDIDATE || 'comparison-v4-rc'

  const calibrationArtifact = await fetchLatestCertificationCalibrationArtifact(
    supabaseAdmin as unknown as Parameters<typeof fetchLatestCertificationCalibrationArtifact>[0],
  )
  const weightArtifact = await fetchLatestCertificationWeightArtifact(
    supabaseAdmin as unknown as Parameters<typeof fetchLatestCertificationWeightArtifact>[0],
  )
  const driftArtifact = await fetchLatestDriftArtifact(
    supabaseAdmin as unknown as Parameters<typeof fetchLatestDriftArtifact>[0],
  )
  process.env.TLI_COMPARISON_V4_SERVING_ENABLED = 'true'

  const { data: activeControlRow } = await supabaseAdmin
    .from('comparison_v4_control')
    .select('production_version, calibration_version, weight_version, promotion_gate_status, promotion_gate_failures, previous_stable_version')
    .eq('serving_enabled', true)
    .maybeSingle()

  const { data: sampleRun } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .select('current_theme_id')
    .eq('status', 'published')
    .eq('algorithm_version', activeControlRow?.production_version ?? 'comparison-v4-shadow-v1')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const servingSample = sampleRun?.current_theme_id
    ? await fetchPublishedComparisonRowsV4(sampleRun.current_theme_id)
    : { data: [], error: null }

  const runtimeChecks = buildCertificationRuntimeChecks({
    controlRow: activeControlRow,
    comparisonRows: (servingSample.data ?? []).map((row) => ({
      relevanceProbability: row.relevanceProbability ?? null,
      probabilityCiLower: row.probabilityCiLower ?? null,
      probabilityCiUpper: row.probabilityCiUpper ?? null,
      supportCount: row.supportCount ?? null,
      confidenceTier: row.confidenceTier ?? null,
      calibrationVersion: row.calibrationVersion ?? null,
      weightVersion: row.weightVersion ?? null,
      sourceSurface: row.sourceSurface ?? null,
    })),
    uiLowConfidenceSupported: Boolean(getConfidenceAlertText({
      pastTheme: 'sample',
      pastThemeId: 'sample',
      similarity: 0.4,
      currentDay: 10,
      pastPeakDay: 20,
      pastTotalDays: 40,
      estimatedDaysToPeak: 10,
      message: '',
      lifecycleCurve: [],
      featureSim: null,
      curveSim: null,
      keywordSim: null,
      pastPeakScore: null,
      pastFinalStage: null,
      pastDeclineDays: null,
      confidenceTier: 'low',
      supportCount: 12,
    })),
  })

  const checklist = buildLevel4CertificationChecklist({
    calibrationArtifact: true,
    probabilityServing: runtimeChecks.probabilityServing,
    promotionGate: runtimeChecks.promotionGate,
    driftReport: true,
    rollbackDrill: runtimeChecks.rollbackDrill,
    payloadMetadataVerified: runtimeChecks.payloadMetadataVerified,
    uiLowConfidencePathVerified: runtimeChecks.uiLowConfidencePathVerified,
  })

  const output = buildCertificationOutput({
    releaseCandidate,
    checklist,
    calibrationVersion: calibrationArtifact.calibration_version,
    weightVersion: weightArtifact.weight_version,
    driftVersion: driftArtifact.drift_version,
    rollbackEvidence: runtimeChecks.rollbackDrill
      ? `active control row pinned with previous stable version ${activeControlRow?.previous_stable_version}`
      : (process.env.TLI4_ROLLBACK_EVIDENCE || 'rollback evidence missing'),
  })

  const path = join(process.cwd(), 'docs', output.filename)
  mkdirSync(join(process.cwd(), 'docs'), { recursive: true })
  writeFileSync(path, output.markdown)
  console.log(`certification report saved: ${path}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
