import { supabase } from '@/lib/supabase'
import { apiSuccess, handleApiError, placeholderResponse, isTableNotFound } from '@/lib/tli/api-utils'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { withRateLimit } from '@/lib/rate-limit/with-rate-limit'

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

// Rate limit: uses checkRateLimit('standard') via withRateLimit wrapper
export const GET = withRateLimit('standard', async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') === '7d' ? '7d' : '1d'

    const placeholder = placeholderResponse({
      movers: { rising: [], falling: [] },
      stageTransitions: [],
      newlyEmerging: [],
    })
    if (placeholder) return placeholder

    // 1) lifecycle_scores에서 최근 날짜분 조회
    const cutoff = getKSTDateString(period === '7d' ? -8 : -2)

    const { data: scores, error: scoresError } = await supabase
      .from('lifecycle_scores')
      .select('theme_id, score, stage, calculated_at')
      .gte('calculated_at', cutoff)
      .order('calculated_at', { ascending: false })
      .limit(5000)

    if (scoresError) {
      if (isTableNotFound(scoresError)) {
        return apiSuccess({
          movers: { rising: [], falling: [] },
          stageTransitions: [],
          newlyEmerging: [],
        }, undefined, 'short')
      }
      throw scoresError
    }

    if (!scores?.length) {
      return apiSuccess({
        movers: { rising: [], falling: [] },
        stageTransitions: [],
        newlyEmerging: [],
      }, undefined, 'medium')
    }

    // 2) 테마별 최신 row + 비교 시점 row 매핑
    const themeMap = new Map<string, ThemePair>()

    for (const row of scores as ScoreRow[]) {
      const existing = themeMap.get(row.theme_id)
      if (!existing) {
        themeMap.set(row.theme_id, { latest: row })
      } else if (!existing.prev) {
        // calculated_at DESC이므로 두 번째로 만나는 row가 이전 시점
        existing.prev = row
      }
    }

    // 7d 모드: prev가 최소 5일 이상 차이나야 유효 (중간 데이터 누락 대비)
    // 1d 모드: prev는 latest와 다른 날짜면 유효

    // 3) 테마명 조회
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

    // 4) 결과 조립
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
})

export const runtime = 'nodejs'
