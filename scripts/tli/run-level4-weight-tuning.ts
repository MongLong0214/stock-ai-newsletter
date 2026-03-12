import { config } from 'dotenv'
config({ path: '.env.local' })

import { mkdirSync, writeFileSync } from 'node:fs'
import { supabaseAdmin } from './supabase-admin'
import { batchQuery } from './supabase-batch'
import { dedupePreserveOrder, loadAllOrderedRows } from './level4/runner-pagination'
import { buildWeightTuningOutputPaths, buildWeightTuningRows } from './level4/runtime'
import {
  generateWeightGridCandidates,
  renderWeightTuningReport,
  runWeightGridSearch,
  type WeightTuningConfig,
} from './level4/tune-weights'
import { buildWeightArtifactRow, upsertWeightArtifact } from './level4/weight-artifact'

function timestamp() {
  const now = new Date()
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ]
  return parts.join('')
}

export function buildRunDateLookupMap(rows: Array<{ id: string; run_date: string }>) {
  return new Map(rows.map((row) => [row.id, row.run_date]))
}

async function main() {
  const sinceDate = process.env.TLI4_WEIGHT_TUNING_SINCE_DATE || '2026-01-01'
  const weightVersion = process.env.TLI4_WEIGHT_VERSION || `w-${timestamp()}`
  const pageSize = Number(process.env.TLI4_EVAL_PAGE_SIZE || 1000)

  const evalRows = await loadAllOrderedRows({
    countRows: async () => {
      const { count, error } = await supabaseAdmin
        .from('theme_comparison_eval_v2')
        .select('*', { count: 'exact', head: true })
        .gte('evaluated_at', sinceDate)
      if (error) throw new Error(`weight tuning eval count failed: ${error.message}`)
      return count ?? 0
    },
    pageSize,
    loadPage: async ({ from, to }) => {
      const { data, error } = await supabaseAdmin
        .from('theme_comparison_eval_v2')
        .select('run_id, candidate_theme_id, binary_relevant, censored_reason, evaluated_at')
        .gte('evaluated_at', sinceDate)
        .order('evaluated_at', { ascending: false })
        .range(from, to)
      if (error) throw new Error(`weight tuning eval load failed: ${error.message}`)
      return data ?? []
    },
  })

  const runIds = dedupePreserveOrder((evalRows || []).map((row) => row.run_id))
  if (runIds.length === 0) throw new Error('no evaluation rows available for weight tuning')

  const runs = await batchQuery<{ id: string; run_date: string }>(
    'theme_comparison_runs_v2',
    'id, run_date',
    runIds,
    (query) => query.order('run_date', { ascending: false }),
    'id',
    { failOnError: true },
  )
  const runDateMap = buildRunDateLookupMap(runs)

  const candidateRows = await batchQuery<{
    run_id: string
    candidate_theme_id: string
    feature_sim: number
    curve_sim: number
    keyword_sim: number
    current_day: number
    past_total_days: number
  }>(
    'theme_comparison_candidates_v2',
    'run_id, candidate_theme_id, feature_sim, curve_sim, keyword_sim, current_day, past_total_days',
    runIds,
    (query) => query.order('run_id', { ascending: true }),
    'run_id',
    { failOnError: true },
  )

  const joinedRows = buildWeightTuningRows({
    evalRows: (evalRows || []).map((row) => ({
      ...row,
      binary_relevant: row.binary_relevant,
      censored_reason: row.censored_reason,
    })),
    candidateRows: (candidateRows || []).map((row) => ({
      ...row,
      run_date: runDateMap.get(row.run_id) || sinceDate,
    })),
  })

  const baselineConfig: WeightTuningConfig = {
    weight_version: 'baseline',
    source_surface: 'v2_certification',
    w_feature: 0.4,
    w_curve: 0.6,
    w_keyword: 0,
    sector_penalty: 0.85,
  }
  const candidateConfigs: WeightTuningConfig[] = generateWeightGridCandidates({
    sourceSurface: 'v2_certification',
    weightVersionPrefix: weightVersion,
  }).map((config, index) => index === 0
    ? baselineConfig
    : config)

  const result = runWeightGridSearch({
    rows: joinedRows,
    candidateConfigs,
    baselineConfig,
    minFolds: 3,
    bootstrapIterations: 1000,
  })

  const selected = result.selectedConfig
  const artifactRow = buildWeightArtifactRow({
    weight_version: selected.weight_version,
    source_surface: selected.source_surface,
    w_feature: selected.w_feature,
    w_curve: selected.w_curve,
    w_keyword: selected.w_keyword,
    sector_penalty: selected.sector_penalty,
    curve_bucket_policy: {
      gte14: { w_feature: selected.w_feature, w_curve: selected.w_curve, w_keyword: selected.w_keyword },
      gte7: { w_feature: selected.w_feature, w_curve: selected.w_curve, w_keyword: selected.w_keyword },
      lt7: { w_feature: 1, w_curve: 0, w_keyword: selected.w_keyword },
    },
    validation_metric_summary: selected.validation_metric_summary,
    ci_lower: selected.ci_lower ?? 0,
    ci_upper: selected.ci_upper ?? 0,
    ci_method: 'cluster_bootstrap',
    bootstrap_iterations: 1000,
    created_at: new Date().toISOString(),
  })

  await upsertWeightArtifact(
    supabaseAdmin as unknown as Parameters<typeof upsertWeightArtifact>[0],
    artifactRow,
  )

  const stamp = timestamp()
  const output = buildWeightTuningOutputPaths(stamp)
  mkdirSync(output.reportPath.replace(/\/[^/]+$/, ''), { recursive: true })
  mkdirSync(output.figurePath.replace(/\/[^/]+$/, ''), { recursive: true })
  writeFileSync(output.reportPath, renderWeightTuningReport(result))
  writeFileSync(output.figurePath, '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><text x="16" y="24">Level-4 weight tuning figure placeholder</text></svg>')

  console.log(`weight tuning report saved: ${output.reportPath}`)
  console.log(`weight artifact saved: ${artifactRow.weight_version}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
