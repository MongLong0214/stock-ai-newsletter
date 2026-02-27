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

  // 비교 데이터 로딩 (당일 기준, 중복 방지)
  const comparisons = await batchQuery<ThemeComparison & { calculated_at: string }>(
    'theme_comparisons',
    'theme_id:current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, calculated_at',
    themeIds,
    q => q.order('calculated_at', { ascending: false }),
    'current_theme_id',
  )

  // (current_theme_id, past_theme_id) 기준 최신 1건만 유지
  const dedupedComps: ThemeComparison[] = []
  const seen = new Set<string>()
  for (const c of comparisons) {
    const key = `${c.theme_id}|${c.past_theme_id}`
    if (!seen.has(key)) {
      seen.add(key)
      dedupedComps.push(c)
    }
  }

  const compsByTheme = groupByThemeId(dedupedComps)

  // 현재 score/stage 로딩 (v2: Phase 판정에 활용)
  const scoreRows = await batchQuery<{ theme_id: string; score: number; stage: string; calculated_at: string }>(
    'lifecycle_scores',
    'theme_id, score, stage, calculated_at',
    themeIds,
    q => q.order('calculated_at', { ascending: false }),
  )
  const latestScoreByTheme = new Map<string, { score: number; stage: string }>()
  for (const s of scoreRows) {
    if (!latestScoreByTheme.has(s.theme_id)) {
      latestScoreByTheme.set(s.theme_id, { score: s.score, stage: s.stage })
    }
  }

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

    const inputs: ComparisonInput[] = themeComps.map(c => {
      // DB 값 방어적 캡핑 (스크립트 재실행 전 기존 데이터 대응)
      const pastTotalDays = Math.min(c.past_total_days, 365)
      const currentDay = Math.min(c.current_day, 365)
      const pastPeakDay = Math.min(c.past_peak_day, pastTotalDays)
      return {
        pastTheme: pastThemeNames.get(c.past_theme_id) || c.past_theme_id,
        similarity: c.similarity_score,
        estimatedDaysToPeak: pastPeakDay > 0 ? Math.max(0, pastPeakDay - currentDay) : 0,
        pastPeakDay,
        pastTotalDays,
      }
    })

    const themeScore = latestScoreByTheme.get(theme.id)
    const result = calculatePrediction(theme.first_spike_date, inputs, today, themeScore?.score, themeScore?.stage as Parameters<typeof calculatePrediction>[4])
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
