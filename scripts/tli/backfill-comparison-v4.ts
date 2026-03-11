import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { batchUpsert } from './supabase-batch'
import {
  buildBackfillExecutionPlan,
  normalizeLegacyComparisonForParity,
  remapLegacyRowToV2Candidate,
  buildNullMappingReport,
} from './comparison-v4-backfill'
import {
  buildComparisonBackfillManifestRow,
  evaluateRowCountParity,
  evaluateSampleContractParity,
} from './comparison-v4-manifest'

async function main() {
  console.log('📜 comparison v4 backfill 시작\n')

  const sourceTable = 'theme_comparisons'
  const targetTable = 'theme_comparison_candidates_v2'

  // 1) source/target count
  const { count: sourceRowCount, error: sourceCountErr } = await supabaseAdmin
    .from(sourceTable)
    .select('*', { count: 'exact', head: true })
  if (sourceCountErr) throw new Error(`source count 실패: ${sourceCountErr.message}`)

  const { count: targetRowCount, error: targetCountErr } = await supabaseAdmin
    .from(targetTable)
    .select('*', { count: 'exact', head: true })
  if (targetCountErr) throw new Error(`target count 실패: ${targetCountErr.message}`)

  console.log(`📊 source: ${sourceRowCount ?? 0}행, target: ${targetRowCount ?? 0}행`)

  const plan = buildBackfillExecutionPlan({
    sourceTable,
    sourceRowCount: sourceRowCount ?? 0,
  })

  // 2) legacy sample 로드
  const { data: legacySample, error: legacyErr } = await supabaseAdmin
    .from(sourceTable)
    .select('id, current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
    .order('created_at', { ascending: false })
    .limit(plan.sampleSize)

  if (legacyErr) throw new Error(`legacy sample 로드 실패: ${legacyErr.message}`)
  if (!legacySample?.length) {
    console.log('❌ legacy 행 없음')
    return
  }

  // 3) row-level remap
  // 현재 테마별 최신 v2 run ID 조회 (없으면 placeholder run ID 사용)
  const currentThemeIds = [...new Set(legacySample.map((r) => r.current_theme_id))]
  const { data: v2Runs } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .select('id, current_theme_id')
    .in('current_theme_id', currentThemeIds)
    .order('created_at', { ascending: false })

  const runByTheme = new Map<string, string>()
  for (const run of v2Runs || []) {
    if (!runByTheme.has(run.current_theme_id)) {
      runByTheme.set(run.current_theme_id, run.id)
    }
  }

  const remapped = legacySample
    .filter((row) => runByTheme.has(row.current_theme_id))
    .map((row, idx) => remapLegacyRowToV2Candidate({
      runId: runByTheme.get(row.current_theme_id)!,
      rank: idx + 1,
      legacy: row,
    }))

  // 4) null/default mapping report
  const nullReport = buildNullMappingReport(remapped)
  console.log(`\n📊 null/default 매핑:`)
  console.log(`   총 행: ${nullReport.totalRows}`)
  for (const [field, count] of Object.entries(nullReport.nullCounts)) {
    if (count > 0) console.log(`   null ${field}: ${count}`)
  }
  for (const [field, count] of Object.entries(nullReport.defaultCounts)) {
    if (count > 0) console.log(`   default ${field}: ${count}`)
  }

  // 5) sample contract parity (normalized legacy vs remapped v2 — field-level comparison)
  const normalizedLegacy = legacySample
    .filter((row) => runByTheme.has(row.current_theme_id))
    .map(normalizeLegacyComparisonForParity)
  // v2 rows use candidate_theme_id instead of past_theme_id, remap for parity
  const normalizedV2 = remapped.map((r) => normalizeLegacyComparisonForParity({
    id: `${r.run_id}-${r.candidate_theme_id}`,
    past_theme_id: r.candidate_theme_id,
    similarity_score: r.similarity_score,
    current_day: r.current_day,
    past_peak_day: r.past_peak_day,
    past_total_days: r.past_total_days,
    message: r.message,
    feature_sim: r.feature_sim,
    curve_sim: r.curve_sim,
    keyword_sim: r.keyword_sim,
    past_peak_score: r.past_peak_score,
    past_final_stage: r.past_final_stage,
    past_decline_days: r.past_decline_days,
  }))
  const sampleContractParityOk = evaluateSampleContractParity(
    normalizedLegacy as Array<Record<string, unknown>>,
    normalizedV2 as Array<Record<string, unknown>>,
  )

  const rowCountParityOk = evaluateRowCountParity(sourceRowCount ?? 0, targetRowCount ?? 0)

  // 6) manifest 저장
  const manifest = buildComparisonBackfillManifestRow({
    sourceTable,
    sourceRowCount: sourceRowCount ?? 0,
    targetRowCount: targetRowCount ?? 0,
    rowCountParityOk,
    sampleContractParityOk,
    notes: JSON.stringify({
      sampleSize: plan.sampleSize,
      remappedCount: remapped.length,
      nullMapping: nullReport.nullCounts,
      defaultMapping: nullReport.defaultCounts,
    }),
  })

  const { error: manifestErr } = await supabaseAdmin
    .from('comparison_backfill_manifest_v2')
    .insert(manifest)

  if (manifestErr) throw new Error(`manifest 저장 실패: ${manifestErr.message}`)

  // 7) remapped rows upsert (if v2 runs exist)
  if (remapped.length > 0) {
    await batchUpsert(
      targetTable,
      remapped.map((r) => ({ ...r })),
      'run_id,candidate_theme_id',
      'v2 candidate backfill',
    )
  }

  console.log(`\n✅ backfill manifest 저장 완료`)
  console.log(`   source=${sourceRowCount ?? 0}, target=${targetRowCount ?? 0}`)
  console.log(`   rowCountParity=${rowCountParityOk}, sampleContractParity=${sampleContractParityOk}`)
  console.log(`   remapped=${remapped.length}, sample=${plan.sampleSize}`)
}

main().catch((error: unknown) => {
  console.error('❌:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
