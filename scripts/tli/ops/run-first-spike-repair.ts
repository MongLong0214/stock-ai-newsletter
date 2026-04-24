import { config } from 'dotenv'
config({ path: '.env.local' })

import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery, groupByThemeId } from '@/scripts/tli/shared/supabase-batch'
import { getKSTDate } from '@/scripts/tli/shared/utils'
import { buildFirstSpikeDateRepairRows } from '@/scripts/tli/themes/first-spike-date'
import { buildFirstSpikeDateSyncPatch } from '@/scripts/tli/themes/theme-state-history'

async function main() {
  const repairDates = (process.env.TLI_FIRST_SPIKE_REPAIR_DATES || '2026-02-06')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const { data: themesByCurrentDate, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_spike_date, created_at, is_active')
    .in('first_spike_date', repairDates)

  if (error) {
    throw new Error(`theme load failed: ${error.message}`)
  }

  const { data: historyRows, error: historyError } = await supabaseAdmin
    .from('theme_state_history_v2')
    .select('theme_id, first_spike_date')
    .in('first_spike_date', repairDates)

  if (historyError) {
    throw new Error(`theme_state_history_v2 load failed: ${historyError.message}`)
  }

  const historyThemeIds = [...new Set((historyRows || []).map((row) => row.theme_id))]
  const missingThemeIds = historyThemeIds.filter(
    (themeId) => !(themesByCurrentDate || []).some((theme) => theme.id === themeId),
  )

  let recoveredThemes: typeof themesByCurrentDate = []
  if (missingThemeIds.length > 0) {
    const { data: recovered, error: recoveredError } = await supabaseAdmin
      .from('themes')
      .select('id, name, first_spike_date, created_at, is_active')
      .in('id', missingThemeIds)

    if (recoveredError) {
      throw new Error(`recovered theme load failed: ${recoveredError.message}`)
    }
    recoveredThemes = recovered || []
  }

  const themes = [...(themesByCurrentDate || []), ...recoveredThemes]

  if (!themes.length) {
    console.log('⊘ repair target themes not found')
    return
  }

  const themeIds = themes.map((theme) => theme.id)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const interestRows = await batchQuery<{
    theme_id: string
    time: string
    normalized: number
  }>(
    'interest_metrics',
    'theme_id, time, normalized',
    themeIds,
    (query) => query.order('time', { ascending: false }).gte('time', new Date(kstNow.getTime() - 180 * 86400000).toISOString().split('T')[0]),
    'theme_id',
    { failOnError: true },
  )

  const repairRows = buildFirstSpikeDateRepairRows(
    themes,
    groupByThemeId(interestRows),
    kstNow,
    repairDates,
  )

  let updated = 0
  for (const row of repairRows) {
    const { error: updateError } = await supabaseAdmin
      .from('themes')
      .update({ first_spike_date: row.first_spike_date })
      .eq('id', row.id)

    if (updateError) {
      console.error(`❌ first_spike_date repair failed (${row.id}): ${updateError.message}`)
      continue
    }

    const { error: historyError } = await supabaseAdmin
      .from('theme_state_history_v2')
      .update(buildFirstSpikeDateSyncPatch({ firstSpikeDate: row.first_spike_date }))
      .eq('theme_id', row.id)

    if (historyError) {
      console.error(`❌ theme_state_history_v2 sync failed (${row.id}): ${historyError.message}`)
      continue
    }
    updated += 1
  }

  console.log(`✅ first_spike_date repair complete: ${updated}/${repairRows.length} updated on ${getKSTDate()}`)
}

import { isMainModule } from '@/scripts/tli/shared/is-main'

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
