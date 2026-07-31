import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery } from '@/scripts/tli/shared/supabase-batch'
import { buildBackfillRow } from '@/scripts/tli/themes/theme-state-history'

export async function backfillThemeStateHistory() {
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('theme_state_history_v2')
    .select('theme_id')

  if (existingError) {
    throw new Error(`existing theme_state_history_v2 load failed: ${existingError.message}`)
  }

  const existingThemeIds = new Set((existingRows || []).map((row) => row.theme_id))

  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, is_active, first_spike_date, created_at, updated_at')

  if (error) {
    throw new Error(`theme load failed: ${error.message}`)
  }

  const targets = (themes || []).filter((theme) => !existingThemeIds.has(theme.id))
  if (targets.length === 0) {
    console.log('⊘ theme_state_history_v2 already backfilled')
    return { insertedCount: 0 }
  }

  const lastScoreRows = await batchQuery<{
    theme_id: string
    calculated_at: string
  }>(
    'lifecycle_scores',
    'theme_id, calculated_at',
    targets.map((theme) => theme.id),
    (query) => query.order('calculated_at', { ascending: false }),
    'theme_id',
    { failOnError: true },
  )

  const lastScoreByTheme = new Map<string, string>()
  for (const row of lastScoreRows) {
    if (!lastScoreByTheme.has(row.theme_id)) {
      lastScoreByTheme.set(row.theme_id, row.calculated_at.split('T')[0])
    }
  }

  const rows = targets.map((theme) => buildBackfillRow({
    themeId: theme.id,
    isActive: theme.is_active,
    firstSpikeDate: theme.first_spike_date,
    createdAt: theme.created_at ?? theme.updated_at ?? new Date().toISOString(),
    lastScoreDate: lastScoreByTheme.get(theme.id) ?? null,
    updatedAt: theme.updated_at ?? new Date().toISOString(),
  }))

  const { error: upsertError } = await supabaseAdmin
    .from('theme_state_history_v2')
    .upsert(rows, { onConflict: 'theme_id,effective_from' })

  if (upsertError) {
    throw new Error(`theme_state_history_v2 backfill failed: ${upsertError.message}`)
  }

  console.log(`✅ theme_state_history_v2 backfill complete: ${rows.length} rows inserted`)
  return { insertedCount: rows.length }
}

async function main() {
  await backfillThemeStateHistory()
}

const isDirectRun = process.argv[1]?.includes('run-theme-state-history-backfill')
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
