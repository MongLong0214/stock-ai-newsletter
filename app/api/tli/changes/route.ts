import { supabase } from '@/lib/supabase'
import { apiSuccess, handleApiError, placeholderResponse, isTableNotFound } from '@/lib/tli/api-utils'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { loadThemeScoreWindows } from '@/lib/tli/rpc/score-windows'
import { selectPreviousChangesRow } from './date-selection'

interface ScoreRow {
  theme_id: string
  score: number
  stage: string | null
  calculated_at: string
}

interface ThemeRow {
  id: string
  name: string
  name_en: string | null
}

interface ThemePair {
  latest: ScoreRow
  prev?: ScoreRow
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') === '7d' ? '7d' : '1d'

    const placeholder = placeholderResponse({
      movers: { rising: [], falling: [] },
      stageTransitions: [],
      newlyEmerging: [],
    })
    if (placeholder) return placeholder

    // 1) 활성 테마 ID 조회
    const { data: activeThemes, error: themesLookupError } = await supabase
      .from('themes')
      .select('id')
      .eq('is_active', true)

    if (themesLookupError) {
      if (isTableNotFound(themesLookupError)) {
        return apiSuccess({
          movers: { rising: [], falling: [] },
          stageTransitions: [],
          newlyEmerging: [],
        }, undefined, 'short')
      }
      throw themesLookupError
    }

    const allThemeIds = (activeThemes ?? []).map((t) => t.id)
    if (allThemeIds.length === 0) {
      return apiSuccess({
        movers: { rising: [], falling: [] },
        stageTransitions: [],
        newlyEmerging: [],
      }, undefined, 'medium')
    }

    // 2) RPC로 테마별 점수 윈도우 조회 (COR-016: PostgREST max_rows=1000 우회)
    // For 7d: look back ~10 days to ensure we find a row with minimum gap
    const lookbackDays = period === '7d' ? 12 : 3
    const cutoff = getKSTDateString(-lookbackDays)

    // Chunk theme IDs to stay within the 500-theme RPC limit
    const scoreChunks: string[][] = []
    for (let i = 0; i < allThemeIds.length; i += 500) {
      scoreChunks.push(allThemeIds.slice(i, i + 500))
    }

    const chunkResults = await Promise.all(
      scoreChunks.map((chunk) => loadThemeScoreWindows(supabase, chunk, cutoff)),
    )

    const scores: ScoreRow[] = []
    for (const result of chunkResults) {
      if (result.error) throw result.error
      scores.push(...(result.data as ScoreRow[]))
    }

    if (!scores.length) {
      return apiSuccess({
        movers: { rising: [], falling: [] },
        stageTransitions: [],
        newlyEmerging: [],
      }, undefined, 'medium')
    }

    // 3) 테마별 최신 row + 비교 시점 row 매핑
    const rowsByTheme = new Map<string, ScoreRow[]>()
    for (const row of scores as ScoreRow[]) {
      const rows = rowsByTheme.get(row.theme_id) ?? []
      rows.push(row)
      rowsByTheme.set(row.theme_id, rows)
    }

    const themeMap = new Map<string, ThemePair>()
    for (const [themeId, rows] of rowsByTheme) {
      const latest = rows[0]
      if (!latest) continue
      themeMap.set(themeId, {
        latest,
        prev: selectPreviousChangesRow(rows, period),
      })
    }

    // 4) 테마명 조회
    const themeIds = [...themeMap.keys()]
    if (themeIds.length === 0) {
      return apiSuccess({
        movers: { rising: [], falling: [] },
        stageTransitions: [],
        newlyEmerging: [],
      }, undefined, 'medium')
    }

    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .in('id', themeIds)

    if (themesError) throw themesError

    const nameMap = new Map<string, ThemeRow>()
    for (const t of (themes || []) as ThemeRow[]) {
      nameMap.set(t.id, t)
    }

    // 5) 결과 조립
    const rising: Array<Record<string, unknown>> = []
    const falling: Array<Record<string, unknown>> = []
    const stageTransitions: Array<Record<string, unknown>> = []
    const newlyEmerging: Array<Record<string, unknown>> = []

    for (const [themeId, pair] of themeMap) {
      const theme = nameMap.get(themeId)
      if (!theme) continue

      const change = pair.prev ? pair.latest.score - pair.prev.score : null
      const base = {
        themeId,
        name: theme.name,
        nameEn: theme.name_en,
        currentScore: pair.latest.score,
        currentStage: pair.latest.stage,
      }

      // movers
      if (change !== null && change !== 0) {
        const entry = {
          ...base,
          change,
          previousScore: pair.prev!.score,
        }
        if (change > 0) rising.push(entry)
        else falling.push(entry)
      }

      // stage transitions
      if (pair.prev && pair.latest.stage !== pair.prev.stage) {
        stageTransitions.push({
          ...base,
          fromStage: pair.prev.stage,
          toStage: pair.latest.stage,
        })
      }

      // newly emerging
      if (
        pair.latest.stage === 'Emerging' &&
        (!pair.prev || pair.prev.stage === 'Dormant')
      ) {
        newlyEmerging.push(base)
      }
    }

    // 정렬: rising은 change 내림차순, falling은 change 오름차순
    rising.sort((a, b) => (b.change as number) - (a.change as number))
    falling.sort((a, b) => (a.change as number) - (b.change as number))

    return apiSuccess({
      period,
      movers: {
        rising: rising.slice(0, 10),
        falling: falling.slice(0, 10),
      },
      stageTransitions,
      newlyEmerging,
    }, undefined, 'medium')
  } catch (error) {
    return handleApiError(error, '테마 변동 정보를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
