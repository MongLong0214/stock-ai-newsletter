import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchQuery } from '@/scripts/tli/shared/supabase-batch'
import { calculatePrediction } from '@/lib/tli/prediction'
import type { ComparisonInput } from '@/lib/tli/prediction'
import { getKSTDateString } from '@/lib/tli/date-utils'
import {
  assertComparisonV4PipelineEnabled,
  getComparisonV4ShadowConfig,
  loadShadowCandidatesByRunIds,
  loadShadowRunsByTheme,
  markShadowRunCompleteWithoutSnapshot,
  toPredictionInputsFromShadowCandidates,
  upsertPredictionShadowSnapshot,
} from '@/scripts/tli/comparison/v4/shadow'
import type { ComparisonV4ShadowConfig } from '@/scripts/tli/comparison/v4/shadow'
import type { ThemeComparisonCandidateV2 } from '@/lib/tli/types/db'
import type { ComparisonCandidatePool } from '@/lib/tli/comparison/spec'

async function safeMarkComplete(config: ComparisonV4ShadowConfig, runId: string, snapshotDate: string): Promise<void> {
  try {
    await markShadowRunCompleteWithoutSnapshot({ config, runId, snapshotDate })
  } catch (err: unknown) {
    console.error('   ⚠️ shadow run complete 처리 실패 (파이프라인 계속):', err instanceof Error ? err.message : String(err))
  }
}

export function resolvePredictionInputContext(input: {
  shadowRun: { runId: string; candidatePool: ComparisonCandidatePool } | null
  shadowCandidates: ThemeComparisonCandidateV2[]
  pastThemeNames: Map<string, string>
}) {
  if (!input.shadowRun || input.shadowCandidates.length === 0) return null

  return {
    candidatePool: input.shadowRun.candidatePool,
    inputs: toPredictionInputsFromShadowCandidates(
      input.shadowCandidates,
      Object.fromEntries([...input.pastThemeNames.entries()]),
    ),
  }
}

export async function snapshotPredictions(): Promise<void> {
  const today = getKSTDateString()
  console.log(`\n📸 예측 스냅샷 생성 [${today}]`)
  const shadowConfig = getComparisonV4ShadowConfig()
  assertComparisonV4PipelineEnabled(shadowConfig, 'prediction snapshot generation')

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
  const shadowRunsByTheme = await loadShadowRunsByTheme({
    config: shadowConfig,
    themeIds,
    runDate: today,
  })
  const shadowCandidatesByRunId = await loadShadowCandidatesByRunIds({
    config: shadowConfig,
    runIds: [...new Set([...shadowRunsByTheme.values()].map((item) => item.runId))],
  })

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

  // 과거 테마명 로딩 (시나리오용) — V4 candidates만 사용
  const v4PastIds = [...shadowCandidatesByRunId.values()].flatMap(cs => cs.map(c => c.candidate_theme_id))
  const pastThemeIds = [...new Set(v4PastIds)]
  const pastThemes = pastThemeIds.length > 0
    ? await batchQuery<{ id: string; name: string }>('themes', 'id, name', pastThemeIds, undefined, 'id')
    : []
  const pastThemeNames = new Map(pastThemes.map(t => [t.id, t.name]))

  let snapshotCount = 0
  let failedCount = 0

  for (const theme of themes) {
    const shadowRun = shadowRunsByTheme.get(theme.id)
    const shadowCandidates = shadowRun ? shadowCandidatesByRunId.get(shadowRun.runId) || [] : []
    const predictionContext = resolvePredictionInputContext({
      shadowRun: shadowRun ?? null,
      shadowCandidates,
      pastThemeNames,
    })

    if (!predictionContext) {
      if (shadowRun) await safeMarkComplete(shadowConfig, shadowRun.runId, today)
      continue
    }

    const themeScore = latestScoreByTheme.get(theme.id)
    const result = calculatePrediction(
      theme.first_spike_date,
      predictionContext.inputs as ComparisonInput[],
      today,
      themeScore?.score,
      themeScore?.stage as Parameters<typeof calculatePrediction>[4],
    )
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
          candidatePool: predictionContext.candidatePool,
          prediction: result,
        })
        snapshotCount++
      } catch (v4Err: unknown) {
        failedCount++
        console.error('   ⚠️ V4 snapshot 저장 실패 (파이프라인 계속):', v4Err instanceof Error ? v4Err.message : String(v4Err))
      }
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
