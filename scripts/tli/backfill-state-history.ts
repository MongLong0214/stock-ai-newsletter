/**
 * CMPV4-003: Backfill theme_state_history_v2 from existing themes + lifecycle_scores
 *
 * Run once to populate point-in-time state for all existing themes.
 * Idempotent: uses upsert with onConflict on (theme_id, effective_from).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from './supabase-admin'
import { batchQuery, batchUpsert, groupByThemeId } from './supabase-batch'
import { buildBackfillRow, isStateHistoryBackfillComplete } from './theme-state-history'

async function main() {
  console.log('📜 theme_state_history_v2 백필 시작\n')

  // 1) 전체 테마 로딩
  const { data: themes, error: themeErr } = await supabaseAdmin
    .from('themes')
    .select('id, is_active, first_spike_date, created_at, updated_at')

  if (themeErr || !themes) {
    console.error('❌ 테마 조회 실패:', themeErr?.message)
    process.exit(1)
  }

  console.log(`📊 전체 테마: ${themes.length}개`)

  // 2) 기존 state history 유무 확인
  const { count: existingCount } = await supabaseAdmin
    .from('theme_state_history_v2')
    .select('*', { count: 'exact', head: true })

  console.log(`📊 기존 state history 행: ${existingCount ?? 0}개`)

  // 3) 비활성 테마의 마지막 점수 날짜 조회 (closed_at 유도용)
  const inactiveThemeIds = themes.filter(t => !t.is_active).map(t => t.id)
  let lastScoreDateByTheme = new Map<string, string>()

  if (inactiveThemeIds.length > 0) {
    const scores = await batchQuery<{ theme_id: string; calculated_at: string }>(
      'lifecycle_scores', 'theme_id, calculated_at', inactiveThemeIds,
    )
    const scoresByTheme = groupByThemeId(scores)

    for (const [themeId, themeScores] of scoresByTheme) {
      const sorted = themeScores.sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))
      if (sorted.length > 0) {
        lastScoreDateByTheme.set(themeId, sorted[0].calculated_at)
      }
    }
  }

  // 4) 백필 행 생성
  const rows: Record<string, unknown>[] = []
  let unknownCount = 0

  for (const theme of themes) {
    const lastScoreDate = lastScoreDateByTheme.get(theme.id) ?? null
    const row = buildBackfillRow({
      themeId: theme.id,
      isActive: theme.is_active,
      firstSpikeDate: theme.first_spike_date ?? null,
      createdAt: theme.created_at,
      lastScoreDate,
      updatedAt: theme.updated_at,
    })

    if (row.state_version === 'unknown') unknownCount++
    rows.push({ ...row })
  }

  console.log(`\n📊 백필 행 생성: ${rows.length}개 (unknown: ${unknownCount}개)`)

  // 5) Upsert
  const failedCount = await batchUpsert(
    'theme_state_history_v2',
    rows,
    'theme_id,effective_from',
    'state history 백필',
  )

  // 6) 완료 여부 확인
  const { count: finalCount } = await supabaseAdmin
    .from('theme_state_history_v2')
    .select('*', { count: 'exact', head: true })

  const complete = isStateHistoryBackfillComplete({
    totalThemeCount: themes.length,
    themesWithHistoryCount: finalCount ?? 0,
  })

  console.log(`\n📊 최종 state history 행: ${finalCount ?? 0}개`)
  console.log(`📊 백필 완료 여부: ${complete ? '✅ 완료' : '❌ 미완료'}`)

  if (failedCount > 0) {
    console.error(`\n❌ ${failedCount}건 저장 실패`)
    process.exit(1)
  }

  console.log('\n✅ 백필 완료')
}

main().catch((error: unknown) => {
  console.error('❌ 치명적 오류:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
