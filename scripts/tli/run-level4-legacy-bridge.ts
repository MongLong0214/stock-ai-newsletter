import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { batchQuery, batchUpsert } from './supabase-batch'
import { buildLegacyBridgeRows } from './level4/legacy-bridge'

export function buildLegacyBridgePageRanges(totalRows: number, pageSize: number) {
  if (totalRows <= 0 || pageSize <= 0) return []

  const ranges: Array<{ from: number; to: number }> = []
  for (let from = 0; from < totalRows; from += pageSize) {
    ranges.push({ from, to: Math.min(totalRows - 1, from + pageSize - 1) })
  }
  return ranges
}

export function buildLegacyRunUpsertRows(rows: Array<Record<string, unknown>>) {
  return rows.map(({ id: _id, ...row }) => row)
}

async function main() {
  const pageSize = Number(process.env.TLI4_LEGACY_BRIDGE_PAGE_SIZE || 5000)
  const { count, error: countError } = await supabaseAdmin
    .from('theme_comparisons')
    .select('*', { count: 'exact', head: true })

  if (countError) throw new Error(`legacy comparison count failed: ${countError.message}`)
  const ranges = buildLegacyBridgePageRanges(count ?? 0, pageSize)
  if (ranges.length === 0) throw new Error('no legacy comparison rows available for bridging')

  let totalRuns = 0
  let totalCandidates = 0

  for (const range of ranges) {
    const { data, error } = await supabaseAdmin
      .from('theme_comparisons')
      .select('id, current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days, calculated_at')
      .order('calculated_at', { ascending: false })
      .range(range.from, range.to)

    if (error) throw new Error(`legacy comparison load failed: ${error.message}`)
    if (!data || data.length === 0) continue

    const bridged = buildLegacyBridgeRows(data as Parameters<typeof buildLegacyBridgeRows>[0])

    await batchUpsert(
      'theme_comparison_runs_v2',
      buildLegacyRunUpsertRows(bridged.runs.map((row) => ({ ...row }))),
      'run_date,current_theme_id,algorithm_version,run_type,candidate_pool',
      'level4 legacy bridge runs',
    )

    const currentThemeIds = [...new Set(bridged.runs.map((row) => row.current_theme_id))]
    const insertedRuns = await batchQuery<{ id: string; run_date: string; current_theme_id: string }>(
      'theme_comparison_runs_v2',
      'id, run_date, current_theme_id',
      currentThemeIds,
      (query) => query.eq('algorithm_version', 'comparison-v4-legacy-bridge-v1').order('created_at', { ascending: false }),
      'current_theme_id',
    )

    const runMap = new Map((insertedRuns || []).map((row) => [`${row.current_theme_id}:${row.run_date}`, row.id]))

    const candidateRows = bridged.candidates.map((row) => {
      const legacyRun = bridged.runs.find((run) => run.id === row.run_id)
      const mappedRunId = legacyRun
        ? runMap.get(`${legacyRun.current_theme_id}:${legacyRun.run_date}`)
        : null
      return mappedRunId ? { ...row, run_id: mappedRunId } : null
    }).filter((row): row is NonNullable<typeof row> => row != null)

    await batchUpsert(
      'theme_comparison_candidates_v2',
      candidateRows.map((row) => ({ ...row })),
      'run_id,candidate_theme_id',
      'level4 legacy bridge candidates',
    )

    totalRuns += bridged.runs.length
    totalCandidates += candidateRows.length
    console.log(`legacy bridge page complete: range=${range.from}-${range.to}, runs=${bridged.runs.length}, candidates=${candidateRows.length}`)
  }

  console.log(`legacy bridge complete: runs=${totalRuns}, candidates=${totalCandidates}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
