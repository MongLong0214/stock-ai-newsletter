import { getStageKo, toStage } from '@/lib/tli/types'
import { applyFreshnessDecay, type ThemeScoreMeta } from '../scores/ranking/ranking-helpers'

export const THEME_LIST_SCORE_BATCH_SIZE = 10

export function buildThemeListResults(params: {
  themes: Array<{ id: string; name: string; name_en: string | null }>
  scoreMetaByTheme: Map<string, ThemeScoreMeta>
  stockCountMap: Map<string, number>
  todayStr: string
}) {
  const { themes, scoreMetaByTheme, stockCountMap, todayStr } = params

  return themes.map((theme) => {
    const key = String(theme.id)
    const meta = scoreMetaByTheme.get(key)
    const score = meta?.latest ?? null
    const weekAgoScore = meta?.weekAgoScore ?? null
    const stage = toStage(score?.stage)
    const nextScore = score?.score ?? 0
    const freshnessAdjustedScore = meta?.lastDataDate
      ? applyFreshnessDecay(nextScore, meta.lastDataDate, todayStr)
      : nextScore

    return {
      id: theme.id,
      name: theme.name,
      nameEn: theme.name_en,
      score: freshnessAdjustedScore,
      stage,
      stageKo: getStageKo(stage),
      change7d: score?.score != null && weekAgoScore?.score != null ? score.score - weekAgoScore.score : 0,
      stockCount: stockCountMap.get(key) ?? 0,
      isReigniting: score?.is_reigniting ?? false,
      updatedAt: score?.calculated_at ?? new Date().toISOString(),
    }
  })
}
