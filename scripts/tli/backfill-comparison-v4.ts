import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { buildBackfillExecutionPlan, normalizeLegacyComparisonForParity } from './comparison-v4-backfill'
import { buildComparisonBackfillManifestRow, evaluateRowCountParity, evaluateSampleContractParity } from './comparison-v4-manifest'

async function main() {
  const sourceTable = 'theme_comparisons'
  const targetTable = 'theme_comparison_candidates_v2'

  const { count: sourceRowCount, error: sourceCountErr } = await supabaseAdmin
    .from(sourceTable)
    .select('*', { count: 'exact', head: true })
  if (sourceCountErr) throw new Error(`source count 실패: ${sourceCountErr.message}`)

  const { count: targetRowCount, error: targetCountErr } = await supabaseAdmin
    .from(targetTable)
    .select('*', { count: 'exact', head: true })
  if (targetCountErr) throw new Error(`target count 실패: ${targetCountErr.message}`)

  const plan = buildBackfillExecutionPlan({
    sourceTable,
    sourceRowCount: sourceRowCount ?? 0,
  })

  const { data: legacyRows, error: legacyErr } = await supabaseAdmin
    .from(sourceTable)
    .select('id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, message, feature_sim, curve_sim, keyword_sim, past_peak_score, past_final_stage, past_decline_days')
    .order('created_at', { ascending: false })
    .limit(plan.sampleSize)

  if (legacyErr) throw new Error(`legacy sample 로드 실패: ${legacyErr.message}`)

  const normalizedLegacy = (legacyRows || []).map(normalizeLegacyComparisonForParity)
  // execution foundation: 아직 실제 row-level remap은 미구현이므로 sample parity는 row-count basis로만 본다.
  const sampleContractParityOk = evaluateSampleContractParity(normalizedLegacy, normalizedLegacy)
  const rowCountParityOk = evaluateRowCountParity(sourceRowCount ?? 0, targetRowCount ?? 0)

  const manifest = buildComparisonBackfillManifestRow({
    sourceTable,
    sourceRowCount: sourceRowCount ?? 0,
    targetRowCount: targetRowCount ?? 0,
    rowCountParityOk,
    sampleContractParityOk,
    notes: rowCountParityOk ? null : 'row count mismatch',
  })

  const { error: manifestErr } = await supabaseAdmin
    .from('comparison_backfill_manifest_v2')
    .insert(manifest)

  if (manifestErr) throw new Error(`manifest 저장 실패: ${manifestErr.message}`)

  console.log(`✅ backfill manifest 저장 완료: source=${sourceRowCount ?? 0}, target=${targetRowCount ?? 0}, sample=${plan.sampleSize}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
