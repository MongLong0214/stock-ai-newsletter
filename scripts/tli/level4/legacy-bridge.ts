import { buildComparisonCandidateRowV2, buildComparisonRunRowV2 } from '../comparison-v4-records'

interface LegacyComparisonRow {
  id: string
  current_theme_id: string
  past_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  message: string | null
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  past_peak_score: number | null
  past_final_stage: string | null
  past_decline_days: number | null
  calculated_at: string
}

export function buildLegacyBridgeRows(rows: LegacyComparisonRow[]) {
  const groups = new Map<string, LegacyComparisonRow[]>()
  for (const row of rows) {
    const key = `${row.current_theme_id}:${row.calculated_at}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const runs: ReturnType<typeof buildComparisonRunRowV2>[] = []
  const candidates: ReturnType<typeof buildComparisonCandidateRowV2>[] = []

  for (const groupRows of groups.values()) {
    const first = groupRows[0]
    const sorted = [...groupRows].sort((left, right) => right.similarity_score - left.similarity_score)
    const run = buildComparisonRunRowV2({
      runDate: first.calculated_at,
      currentThemeId: first.current_theme_id,
      algorithmVersion: 'comparison-v4-legacy-bridge-v1',
      runType: 'backtest',
      candidatePool: 'mixed_legacy',
      thresholdPolicyVersion: 'legacy-bridge-v1',
      sourceDataCutoffDate: first.calculated_at,
      comparisonSpecVersion: 'comparison-v4-spec-v1',
      themeDefinitionVersion: 'theme-def-v2.0',
      lifecycleScoreVersion: 'lifecycle-score-v2.0',
      expectedCandidateCount: sorted.length,
    })
    run.status = 'complete'
    run.publish_ready = false
    run.materialized_candidate_count = sorted.length

    runs.push(run)
    sorted.forEach((row, index) => {
      candidates.push(buildComparisonCandidateRowV2(run.id, index + 1, {
        pastThemeId: row.past_theme_id,
        similarity: row.similarity_score,
        currentDay: row.current_day,
        pastPeakDay: row.past_peak_day,
        pastTotalDays: row.past_total_days,
        estimatedDaysToPeak: Math.max(0, row.past_peak_day - row.current_day),
        message: row.message ?? '',
        featureSim: row.feature_sim,
        curveSim: row.curve_sim,
        keywordSim: row.keyword_sim,
        pastPeakScore: row.past_peak_score,
        pastFinalStage: row.past_final_stage,
        pastDeclineDays: row.past_decline_days,
      }))
    })
  }

  return { runs, candidates }
}
