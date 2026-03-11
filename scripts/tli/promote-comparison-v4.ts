import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { buildComparisonV4ControlRow } from './comparison-v4-control'
import { buildPromoteRunPatch, canPromoteComparisonRun } from './comparison-v4-promotion'
import { buildComparisonV4ReleasePlan } from './comparison-v4-release'

async function main() {
  const runIds = process.argv.slice(2)
  const actor = process.env.USER || 'codex'
  const productionVersion = process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION

  if (runIds.length === 0) {
    throw new Error('usage: npx tsx scripts/tli/promote-comparison-v4.ts <run-id> [run-id...]')
  }
  if (!productionVersion) {
    throw new Error('Missing TLI_COMPARISON_V4_PRODUCTION_VERSION')
  }

  const { data: runs, error } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .select('id, status, publish_ready, expected_candidate_count, materialized_candidate_count, expected_snapshot_count, materialized_snapshot_count')
    .in('id', runIds)

  if (error) throw new Error(`run 조회 실패: ${error.message}`)

  const releasePlan = buildComparisonV4ReleasePlan((runs || []) as Array<{
    id: string
    status: 'pending' | 'materializing' | 'complete' | 'published' | 'failed' | 'rolled_back'
    publish_ready: boolean
    expected_candidate_count: number
    materialized_candidate_count: number
    expected_snapshot_count: number
    materialized_snapshot_count: number
  }>)

  if (releasePlan.promotableRunIds.length === 0) {
    throw new Error(`승격 가능한 run이 없습니다.\n${releasePlan.report}`)
  }

  const patch = buildPromoteRunPatch()
  const { error: promoteErr } = await supabaseAdmin
    .from('theme_comparison_runs_v2')
    .update(patch)
    .in('id', releasePlan.promotableRunIds)

  if (promoteErr) throw new Error(`run 승격 실패: ${promoteErr.message}`)

  // 단일 active production pointer 유지
  await supabaseAdmin
    .from('comparison_v4_control')
    .update({ serving_enabled: false })
    .eq('serving_enabled', true)

  const controlRow = buildComparisonV4ControlRow({
    productionVersion,
    servingEnabled: true,
    actor,
    promotedAt: patch.published_at,
  })

  const { error: controlErr } = await supabaseAdmin
    .from('comparison_v4_control')
    .upsert(controlRow, { onConflict: 'production_version' })

  if (controlErr) throw new Error(`control row 저장 실패: ${controlErr.message}`)

  console.log(releasePlan.report)
  console.log(`\n✅ 승격 완료: ${releasePlan.promotableRunIds.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
