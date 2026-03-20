import { config } from 'dotenv'
config({ path: '.env.local' })

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery } from '@/scripts/tli/shared/supabase-batch'
import { evaluateAutoHoldDecision } from '../level4/auto-hold'
import { fetchLatestCertificationCalibrationArtifact } from '../level4/calibration-artifact'
import { assessDriftBaselineMaturity } from '../level4/drift-baseline'
import { aggregateRollingDriftBaseline, buildDriftReportArtifact, buildDriftReportMarkdown, upsertDriftReportArtifact } from '../level4/drift-report'
import { dedupePreserveOrder, loadAllOrderedRows } from '../level4/runner-pagination'
import { buildLevel4ServingMetadata } from '@/app/api/tli/themes/[id]/comparison-v4-reader'

function timestamp() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
}

export function buildOperationalDriftArtifact(input: {
  driftVersion: string
  reportDate: string
  sourceSurface: 'v2_certification' | 'replay_equivalent'
  rows: Array<{
    runId: string
    evaluatedAt: string
    binaryRelevant: boolean
    censoredReason: string | null
    relevanceProbability: number | null
    supportCount: number | null
    probabilityCiLower: number | null
    probabilityCiUpper: number | null
    firstSpikeInferred: boolean
  }>
  calibrationArtifactPresent: boolean
  priorBaseline: null | {
    relevanceBaseRate: number
    ece: number
    censoringRatio: number
    candidateConcentrationGini: number
    supportBucketPrecision: { high: number; medium: number; low: number }
  }
}) {
  const distinctMonths = new Set(input.rows.map((row) => row.evaluatedAt.slice(0, 7))).size
  const distinctRunDates = new Set(input.rows.map((row) => row.evaluatedAt)).size
  const maturity = assessDriftBaselineMaturity({
    distinctCalendarMonths: distinctMonths,
    baselineRowCount: input.rows.length,
    distinctEvaluatedRunDates: distinctRunDates,
  })

  const currentArtifact = buildDriftReportArtifact({
    driftVersion: input.driftVersion,
    reportDate: input.reportDate,
    sourceSurface: input.sourceSurface,
    rows: input.rows,
    baselineWindowMonths: 3,
    baselineRowCount: input.rows.length,
    autoHoldEnabled: maturity.autoHoldEnabled,
  })

  const autoHoldDecision = evaluateAutoHoldDecision({
    baselineMaturity: maturity,
    calibrationArtifactPresent: input.calibrationArtifactPresent,
    current: {
      relevanceBaseRate: currentArtifact.relevance_base_rate,
      ece: currentArtifact.ece,
      censoringRatio: currentArtifact.censoring_ratio,
      candidateConcentrationGini: currentArtifact.candidate_concentration_gini,
      supportBucketPrecision: currentArtifact.support_bucket_precision,
    },
    baseline: input.priorBaseline ?? {
      relevanceBaseRate: currentArtifact.relevance_base_rate,
      ece: currentArtifact.ece,
      censoringRatio: currentArtifact.censoring_ratio,
      candidateConcentrationGini: currentArtifact.candidate_concentration_gini,
      supportBucketPrecision: currentArtifact.support_bucket_precision,
    },
    reportDate: input.reportDate,
  })

  return {
    ...currentArtifact,
    auto_hold_enabled: autoHoldDecision.holdState !== 'observation_only',
    drift_status: autoHoldDecision.holdState === 'active'
      ? 'hold'
      : autoHoldDecision.holdState === 'observation_only'
        ? 'observation_only'
        : 'stable',
    hold_report_date: autoHoldDecision.holdState === 'active' ? autoHoldDecision.holdReportDate : null,
    triggered_rules: autoHoldDecision.triggeredRules,
  }
}

async function main() {
  const driftVersion = process.env.TLI4_DRIFT_VERSION || `drift-${timestamp()}`
  const reportDate = new Date().toISOString().slice(0, 10)
  const pageSize = Number(process.env.TLI4_EVAL_PAGE_SIZE || 1000)
  const calibrationArtifact = await fetchLatestCertificationCalibrationArtifact(
    supabaseAdmin as unknown as Parameters<typeof fetchLatestCertificationCalibrationArtifact>[0],
  )

  const evalRows = await loadAllOrderedRows({
    countRows: async () => {
      const { count, error } = await supabaseAdmin
        .from('theme_comparison_eval_v2')
        .select('*', { count: 'exact', head: true })
      if (error) throw new Error(`drift eval count failed: ${error.message}`)
      return count ?? 0
    },
    pageSize,
    loadPage: async ({ from, to }) => {
      const { data, error } = await supabaseAdmin
        .from('theme_comparison_eval_v2')
        .select('run_id, candidate_theme_id, binary_relevant, censored_reason, evaluated_at')
        .order('evaluated_at', { ascending: false })
        .range(from, to)
      if (error) throw new Error(`drift eval load failed: ${error.message}`)
      return data ?? []
    },
  })

  if (evalRows.length === 0) throw new Error('no v2 eval rows available for drift')

  const runIds = dedupePreserveOrder(evalRows.map((row) => row.run_id))
  const candidateRows = await batchQuery<{ run_id: string; candidate_theme_id: string; similarity_score: number }>(
    'theme_comparison_candidates_v2',
    'run_id, candidate_theme_id, similarity_score',
    runIds,
    (query) => query.order('run_id', { ascending: true }),
    'run_id',
    { failOnError: true },
  )
  const similarityMap = new Map(candidateRows.map((row) => [`${row.run_id}:${row.candidate_theme_id}`, row.similarity_score]))

  const rows = evalRows.map((row) => {
    const similarity = similarityMap.get(`${row.run_id}:${row.candidate_theme_id}`) ?? 0
    const metadata = buildLevel4ServingMetadata(calibrationArtifact as never, similarity)
    return {
      runId: row.run_id,
      evaluatedAt: row.evaluated_at,
      binaryRelevant: row.binary_relevant,
      censoredReason: row.censored_reason,
      relevanceProbability: metadata.relevance_probability ?? null,
      supportCount: metadata.support_count ?? null,
      probabilityCiLower: metadata.probability_ci_lower ?? null,
      probabilityCiUpper: metadata.probability_ci_upper ?? null,
      firstSpikeInferred: false,
    }
  })
  const baselineWindowMonths = 3
  const baselineWindowStart = new Date(`${reportDate}T00:00:00.000Z`)
  baselineWindowStart.setUTCMonth(baselineWindowStart.getUTCMonth() - baselineWindowMonths)
  const { data: priorArtifacts } = await supabaseAdmin
    .from('drift_report_artifact')
    .select('drift_version, report_date, source_surface, relevance_base_rate, calibration_curve_error, brier, ece, candidate_concentration_gini, baseline_candidate_concentration_gini, censoring_ratio, baseline_censoring_ratio, first_spike_inference_rate, support_bucket_precision, low_confidence_serving_rate, baseline_window_months, baseline_row_count, auto_hold_enabled, drift_status, triggered_rules, base_rate, hold_report_date')
    .eq('source_surface', 'v2_certification')
    .lt('report_date', reportDate)
    .gte('report_date', baselineWindowStart.toISOString().slice(0, 10))
    .order('report_date', { ascending: false })
    .limit(6)
  const rollingBaseline = aggregateRollingDriftBaseline((priorArtifacts || []) as Parameters<typeof aggregateRollingDriftBaseline>[0])

  const artifact = buildOperationalDriftArtifact({
    driftVersion,
    reportDate,
    sourceSurface: 'v2_certification',
    rows,
    calibrationArtifactPresent: true,
    priorBaseline: rollingBaseline,
  })

  await upsertDriftReportArtifact(
    supabaseAdmin as unknown as Parameters<typeof upsertDriftReportArtifact>[0],
    artifact as never,
  )

  const reportsDir = join(process.cwd(), '.omx', 'scientist', 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const reportPath = join(reportsDir, `${timestamp()}_drift_report.md`)
  writeFileSync(reportPath, buildDriftReportMarkdown(artifact as never))

  console.log(`drift report saved: ${reportPath}`)
  console.log(`drift artifact saved: ${artifact.drift_version}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
