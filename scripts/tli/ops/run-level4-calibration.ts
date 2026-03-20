import { config } from 'dotenv'
config({ path: '.env.local' })

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery } from '@/scripts/tli/shared/supabase-batch'
import { upsertCalibrationArtifact } from '../level4/calibration-artifact'
import { buildCalibrationArtifactFromV2Rows } from '../level4/calibration-runtime'
import { renderCertificationCalibrationReport } from '../level4/calibrate-comparisons'
import { dedupePreserveOrder, loadAllOrderedRows } from '../level4/runner-pagination'

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

async function main() {
  const calibrationVersion = process.env.TLI4_CALIBRATION_VERSION || `cal-${timestamp()}`
  const pageSize = Number(process.env.TLI4_EVAL_PAGE_SIZE || 1000)

  const evalRows = await loadAllOrderedRows({
    countRows: async () => {
      const { count, error } = await supabaseAdmin
        .from('theme_comparison_eval_v2')
        .select('*', { count: 'exact', head: true })
      if (error) throw new Error(`calibration eval count failed: ${error.message}`)
      return count ?? 0
    },
    pageSize,
    loadPage: async ({ from, to }) => {
      const { data, error } = await supabaseAdmin
        .from('theme_comparison_eval_v2')
        .select('run_id, candidate_theme_id, binary_relevant, censored_reason, evaluated_at')
        .order('evaluated_at', { ascending: false })
        .range(from, to)
      if (error) throw new Error(`calibration eval load failed: ${error.message}`)
      return data ?? []
    },
  })

  if (evalRows.length === 0) throw new Error('no v2 eval rows available for calibration')

  const runIds = dedupePreserveOrder(evalRows.map((row) => row.run_id))
  const candidateRows = await batchQuery<{ run_id: string; candidate_theme_id: string; similarity_score: number }>(
    'theme_comparison_candidates_v2',
    'run_id, candidate_theme_id, similarity_score',
    runIds,
    (query) => query.order('run_id', { ascending: true }),
    'run_id',
    { failOnError: true },
  )
  const candidateMap = new Map(candidateRows.map((row) => [`${row.run_id}:${row.candidate_theme_id}`, row.similarity_score]))

  const joined = evalRows
    .map((row) => ({
      run_id: row.run_id,
      evaluated_at: row.evaluated_at,
      similarity_score: candidateMap.get(`${row.run_id}:${row.candidate_theme_id}`) ?? null,
      binary_relevant: row.binary_relevant,
      censored_reason: row.censored_reason,
    }))
    .filter((row): row is { run_id: string; evaluated_at: string; similarity_score: number; binary_relevant: boolean; censored_reason: string | null } => row.similarity_score != null)

  const artifact = buildCalibrationArtifactFromV2Rows({
    calibrationVersion,
    sourceSurface: 'v2_certification',
    rows: joined,
    bootstrapIterations: 1000,
  })

  await upsertCalibrationArtifact(
    supabaseAdmin as unknown as Parameters<typeof upsertCalibrationArtifact>[0],
    artifact,
  )

  const report = renderCertificationCalibrationReport({
    objective: 'Build a certification-grade calibration artifact from v2 evaluation rows.',
    dataSummary: `${artifact.source_row_count} evaluated rows from v2 certification surface`,
    findings: [
      {
        finding: `Calibration artifact ${artifact.calibration_version} generated from v2 evaluation rows.`,
        stats: {
          n: `n = ${artifact.source_row_count}`,
          effect_size: `positive_rate = ${(artifact.positive_count / Math.max(artifact.source_row_count, 1)).toFixed(4)}`,
        },
      },
    ],
    limitations: [
      'This runtime uses available v2 rows only; if the surface is sparse, recalibration should be rerun after more evaluations accumulate.',
    ],
  })

  const stamp = timestamp()
  const reportsDir = join(process.cwd(), '.omx', 'scientist', 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const reportPath = join(reportsDir, `${stamp}_calibration_report.md`)
  writeFileSync(reportPath, report)
  console.log(`calibration report saved: ${reportPath}`)
  console.log(`calibration artifact saved: ${artifact.calibration_version}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
