import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { calculatePrediction } from '../../lib/tli/prediction'
import type { ComparisonInput } from '../../lib/tli/prediction'
import { getKSTDateString } from '../../lib/tli/date-utils'

interface ThemeComparison {
  theme_id: string
  past_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  past_theme_name?: string
}

export async function snapshotPredictions(): Promise<void> {
  const today = getKSTDateString()
  console.log(`\n📸 예측 스냅샷 생성 [${today}]`)

  // 활성 테마 로딩
  const { data: themes, error: themesErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_spike_date')
    .eq('is_active', true)

  if (themesErr || !themes?.length) {
    console.log('   ⚠️ 활성 테마 없음')
    return
  }

  const themeIds = themes.map(t => t.id)

  // 비교 데이터 로딩
  const comparisons = await batchQuery<ThemeComparison>(
    'theme_comparisons',
    'theme_id:current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days',
    themeIds,
    undefined,
    'current_theme_id',
  )

  const compsByTheme = groupByThemeId(comparisons)

  // 과거 테마명 로딩 (시나리오용)
  const pastThemeIds = [...new Set(comparisons.map(c => c.past_theme_id))]
  const pastThemes = pastThemeIds.length > 0
    ? await batchQuery<{ id: string; name: string }>('themes', 'id, name', pastThemeIds, undefined, 'id')
    : []
  const pastThemeNames = new Map(pastThemes.map(t => [t.id, t.name]))

  const rows: Record<string, unknown>[] = []

  for (const theme of themes) {
    const themeComps = compsByTheme.get(theme.id) || []
    if (themeComps.length === 0) continue

    const inputs: ComparisonInput[] = themeComps.map(c => ({
      pastTheme: pastThemeNames.get(c.past_theme_id) || c.past_theme_id,
      similarity: c.similarity_score,
      estimatedDaysToPeak: Math.max(0, c.past_peak_day - c.current_day),
      pastPeakDay: c.past_peak_day,
      pastTotalDays: c.past_total_days,
    }))

    const result = calculatePrediction(theme.first_spike_date, inputs, today)
    if (!result) continue

    rows.push({
      theme_id: theme.id,
      snapshot_date: today,
      comparison_count: result.comparisonCount,
      avg_similarity: result.avgSimilarity,
      phase: result.phase,
      confidence: result.confidence,
      risk_level: result.riskLevel,
      momentum: result.momentum,
      avg_peak_day: result.avgPeakDay,
      avg_total_days: result.avgTotalDays,
      avg_days_to_peak: result.avgDaysToPeak,
      current_progress: result.currentProgress,
      days_since_spike: result.daysSinceSpike,
      best_scenario: result.scenarios.best,
      median_scenario: result.scenarios.median,
      worst_scenario: result.scenarios.worst,
      status: 'pending',
    })
  }

  if (rows.length === 0) {
    console.log('   ⚠️ 예측 가능한 테마 없음')
    return
  }

  // 스냅샷 저장
  let failedCount = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabaseAdmin
      .from('prediction_snapshots')
      .upsert(batch, { onConflict: 'theme_id,snapshot_date' })

    if (error) {
      failedCount += batch.length
      console.error(`   ⚠️ 스냅샷 저장 실패:`, error.message)
    }
  }

  if (failedCount > 0) {
    console.error(`   ❌ ${failedCount}/${rows.length}개 스냅샷 저장 실패`)
  } else {
    console.log(`   ✅ ${rows.length}개 예측 스냅샷 저장 완료`)
  }
}
