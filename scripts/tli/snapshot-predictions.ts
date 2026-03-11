import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import { calculatePrediction } from '../../lib/tli/prediction'
import type { ComparisonInput } from '../../lib/tli/prediction'
import { getKSTDateString } from '../../lib/tli/date-utils'
import {
  getComparisonV4ShadowConfig,
  loadShadowCandidatesByRunIds,
  loadShadowRunsByTheme,
  markShadowRunCompleteWithoutSnapshot,
  toPredictionInputsFromShadowCandidates,
  upsertPredictionShadowSnapshot,
} from './comparison-v4-shadow'
import type { ComparisonV4ShadowConfig } from './comparison-v4-shadow'
import type { ThemeComparisonCandidateV2 } from '../../lib/tli/types/db'
import type { ComparisonCandidatePool } from '../../lib/tli/comparison/spec'

interface ThemeComparison {
  theme_id: string
  past_theme_id: string
  similarity_score: number
  current_day: number
  past_peak_day: number
  past_total_days: number
  past_theme_name?: string
}

async function safeMarkComplete(config: ComparisonV4ShadowConfig, runId: string, snapshotDate: string): Promise<void> {
  try {
    await markShadowRunCompleteWithoutSnapshot({ config, runId, snapshotDate })
  } catch (err: unknown) {
    console.error('   ⚠️ shadow run complete 처리 실패 (파이프라인 계속):', err instanceof Error ? err.message : String(err))
  }
}

export async function snapshotPredictions(): Promise<void> {
  const today = getKSTDateString()
  console.log(`\n📸 예측 스냅샷 생성 [${today}]`)
  const shadowConfig = getComparisonV4ShadowConfig()

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
  let shadowRunsByTheme = new Map<string, { runId: string; candidatePool: ComparisonCandidatePool }>()
  let shadowCandidatesByRunId = new Map<string, ThemeComparisonCandidateV2[]>()
  try {
    shadowRunsByTheme = await loadShadowRunsByTheme({
      config: shadowConfig,
      themeIds,
      runDate: today,
    })
    shadowCandidatesByRunId = await loadShadowCandidatesByRunIds({
      config: shadowConfig,
      runIds: [...new Set([...shadowRunsByTheme.values()].map((item) => item.runId))],
    })
  } catch (v4Err: unknown) {
    console.error('   ⚠️ V4 run 로딩 실패 (legacy 경로로 계속):', v4Err instanceof Error ? v4Err.message : String(v4Err))
  }

  // legacy 비교 데이터 로딩 (V4 run이 없는 테마만)
  const legacyThemeIds = themeIds.filter(id => !shadowRunsByTheme.has(id))
  const comparisons = legacyThemeIds.length > 0
    ? await batchQuery<ThemeComparison & { calculated_at: string }>(
        'theme_comparisons',
        'theme_id:current_theme_id, past_theme_id, similarity_score, current_day, past_peak_day, past_total_days, calculated_at',
        legacyThemeIds,
        q => q.order('calculated_at', { ascending: false }),
        'current_theme_id',
      )
    : []

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

  // 과거 테마명 로딩 (시나리오용) — V4 candidates + legacy comparisons 모두 포함
  const v4PastIds = [...shadowCandidatesByRunId.values()].flatMap(cs => cs.map(c => c.candidate_theme_id))
  const legacyPastIds = comparisons.map(c => c.past_theme_id)
  const pastThemeIds = [...new Set([...v4PastIds, ...legacyPastIds])]
  const pastThemes = pastThemeIds.length > 0
    ? await batchQuery<{ id: string; name: string }>('themes', 'id, name', pastThemeIds, undefined, 'id')
    : []
  const pastThemeNames = new Map(pastThemes.map(t => [t.id, t.name]))

  let snapshotCount = 0
  let failedCount = 0

  for (const theme of themes) {
    const shadowRun = shadowRunsByTheme.get(theme.id)
    const shadowCandidates = shadowRun ? shadowCandidatesByRunId.get(shadowRun.runId) || [] : []
    const themeComps = compsByTheme.get(theme.id) || []
    if (themeComps.length === 0 && shadowCandidates.length === 0) {
      if (shadowRun) await safeMarkComplete(shadowConfig, shadowRun.runId, today)
      continue
    }

    // V4 run이 존재하면 V4 candidates만 사용 (legacy fallback으로 오염 방지)
    if (shadowRun && shadowCandidates.length === 0) {
      await safeMarkComplete(shadowConfig, shadowRun.runId, today)
      continue
    }

    const inputs: ComparisonInput[] = shadowCandidates.length > 0
      ? toPredictionInputsFromShadowCandidates(
          shadowCandidates,
          Object.fromEntries([...pastThemeNames.entries()]),
        )
      : themeComps.map(c => {
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
    if (!result) {
      if (shadowRun) await safeMarkComplete(shadowConfig, shadowRun.runId, today)
      continue
    }

    if (shadowRun) {
      try {
        await upsertPredictionShadowSnapshot({
          config: shadowConfig,
          runId: shadowRun.runId,
          themeId: theme.id,
          snapshotDate: today,
          candidatePool: shadowRun.candidatePool,
          prediction: result,
        })
        snapshotCount++
      } catch (v4Err: unknown) {
        failedCount++
        console.error('   ⚠️ V4 snapshot 저장 실패 (파이프라인 계속):', v4Err instanceof Error ? v4Err.message : String(v4Err))
      }
    } else {
      console.log(`   ⊘ ${theme.name}: V4 run 없음 — 스냅샷 생략`)
    }
  }

  if (snapshotCount === 0 && failedCount === 0) {
    console.log('   ⚠️ 예측 가능한 테마 없음')
    return
  }

  if (failedCount > 0) {
    console.error(`   ❌ ${failedCount}건 V4 스냅샷 저장 실패`)
  }
  console.log(`   ✅ ${snapshotCount}개 V4 예측 스냅샷 저장 완료`)
}
