import { supabase } from '@/lib/supabase'
import { apiSuccess, apiError, handleApiError, placeholderResponse, UUID_RE } from '@/lib/tli/api-utils'
import { getKSTDateString } from '@/lib/tli/date-utils'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids')

    if (!idsParam) {
      return apiError('ids 파라미터가 필요합니다.', 400)
    }

    const rawIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
    const warnings: string[] = []
    const validIds: string[] = []

    for (const id of rawIds) {
      if (UUID_RE.test(id)) {
        validIds.push(id)
      } else {
        warnings.push(`Invalid UUID format: ${id}`)
      }
    }

    if (validIds.length < 2) {
      return apiError('유효한 UUID가 최소 2개 필요합니다.', 400)
    }
    if (validIds.length > 5) {
      return apiError('최대 5개까지 비교할 수 있습니다.', 400)
    }

    const placeholder = placeholderResponse({ themes: [], pairwiseSimilarity: [], overlappingStocks: [], warnings })
    if (placeholder) return placeholder

    // 1) 테마 메타 조회
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .in('id', validIds)

    if (themesError) throw themesError

    const foundIds = new Set((themes || []).map((t) => t.id))
    for (const id of validIds) {
      if (!foundIds.has(id)) {
        warnings.push(`Theme ${id} not found`)
      }
    }

    const activeIds = validIds.filter((id) => foundIds.has(id))
    if (activeIds.length < 2) {
      return apiSuccess({
        themes: [],
        pairwiseSimilarity: [],
        overlappingStocks: [],
        warnings,
      }, undefined, 'medium')
    }

    // 2) 병렬: 최신 점수 + 종목 + 7일 sparkline
    const sevenDaysAgo = getKSTDateString(-7)

    const [scoresRes, stocksRes, sparklineRes] = await Promise.all([
      supabase
        .from('lifecycle_scores')
        .select('theme_id, score, stage, is_reigniting, calculated_at')
        .in('theme_id', activeIds)
        .order('calculated_at', { ascending: false })
        .limit(activeIds.length * 7),
      supabase
        .from('theme_stocks')
        .select('theme_id, symbol, name')
        .in('theme_id', activeIds)
        .eq('is_active', true),
      supabase
        .from('lifecycle_scores')
        .select('theme_id, score, calculated_at')
        .in('theme_id', activeIds)
        .gte('calculated_at', sevenDaysAgo)
        .order('calculated_at', { ascending: true }),
    ])

    if (scoresRes.error) throw scoresRes.error
    if (stocksRes.error) throw stocksRes.error
    if (sparklineRes.error) throw sparklineRes.error

    // 최신 점수 Map (테마별 1개)
    const latestScoreMap = new Map<string, { score: number; stage: string | null; is_reigniting: boolean; calculated_at: string }>()
    for (const row of scoresRes.data || []) {
      if (!latestScoreMap.has(row.theme_id)) {
        latestScoreMap.set(row.theme_id, row)
      }
    }

    // sparkline Map (테마별 7일 점수 배열)
    const sparklineMap = new Map<string, number[]>()
    for (const row of sparklineRes.data || []) {
      if (!sparklineMap.has(row.theme_id)) {
        sparklineMap.set(row.theme_id, [])
      }
      sparklineMap.get(row.theme_id)!.push(Math.round(row.score))
    }

    // 종목 Map (테마별 종목 배열)
    const stockMap = new Map<string, Array<{ symbol: string; name: string }>>()
    for (const row of stocksRes.data || []) {
      if (!stockMap.has(row.theme_id)) {
        stockMap.set(row.theme_id, [])
      }
      stockMap.get(row.theme_id)!.push({ symbol: row.symbol, name: row.name })
    }

    // 테마 메타 Map
    const themeMap = new Map((themes || []).map((t) => [t.id, t]))

    // 3) 테마 결과 조합
    const themeResults = activeIds.map((id) => {
      const meta = themeMap.get(id)
      const score = latestScoreMap.get(id)
      return {
        id,
        name: meta?.name ?? '',
        nameEn: meta?.name_en ?? null,
        score: score?.score ?? 0,
        stage: score?.stage ?? 'Unknown',
        isReigniting: score?.is_reigniting ?? false,
        sparkline: sparklineMap.get(id) ?? [],
      }
    })

    // 4) 겹치는 종목 계산 (모든 테마에 공통인 symbol)
    const symbolSets = activeIds.map((id) => {
      const stocks = stockMap.get(id) || []
      return new Set(stocks.map((s) => s.symbol))
    })
    const allStocksFlat = new Map<string, string>()
    for (const stocks of stockMap.values()) {
      for (const s of stocks) {
        allStocksFlat.set(s.symbol, s.name)
      }
    }
    const overlappingStocks: Array<{ symbol: string; name: string }> = []
    for (const [symbol, name] of allStocksFlat) {
      const inCount = symbolSets.filter((set) => set.has(symbol)).length
      if (inCount >= 2) {
        overlappingStocks.push({ symbol, name })
      }
    }

    // 5) 상호 유사도: theme_comparison_runs_v2 + theme_comparison_candidates_v2
    const pairwiseSimilarity: Array<{ themeA: string; themeB: string; similarity: number | null }> = []

    // 각 테마의 최신 published run 조회
    const { data: runs, error: runsError } = await supabase
      .from('theme_comparison_runs_v2')
      .select('id, current_theme_id, created_at, publish_ready, status')
      .in('current_theme_id', activeIds)
      .eq('status', 'published')
      .eq('publish_ready', true)
      .order('created_at', { ascending: false })

    if (!runsError && runs?.length) {
      // 테마별 최신 run 선택
      const latestRunMap = new Map<string, string>()
      for (const run of runs) {
        if (!latestRunMap.has(run.current_theme_id)) {
          latestRunMap.set(run.current_theme_id, run.id)
        }
      }

      const runIds = [...latestRunMap.values()]
      if (runIds.length > 0) {
        const { data: candidates } = await supabase
          .from('theme_comparison_candidates_v2')
          .select('run_id, candidate_theme_id, similarity_score')
          .in('run_id', runIds)
          .in('candidate_theme_id', activeIds)

        // run_id → theme_id 역매핑
        const runToTheme = new Map<string, string>()
        for (const [themeId, runId] of latestRunMap) {
          runToTheme.set(runId, themeId)
        }

        // 후보 매핑: (themeA, themeB) → similarity
        const simMap = new Map<string, number>()
        for (const c of candidates || []) {
          const sourceTheme = runToTheme.get(c.run_id)
          if (sourceTheme) {
            simMap.set(`${sourceTheme}:${c.candidate_theme_id}`, c.similarity_score)
          }
        }

        // 모든 쌍 순회
        for (let i = 0; i < activeIds.length; i++) {
          for (let j = i + 1; j < activeIds.length; j++) {
            const a = activeIds[i]
            const b = activeIds[j]
            const abSim = simMap.get(`${a}:${b}`)
            const baSim = simMap.get(`${b}:${a}`)
            const similarity = abSim ?? baSim ?? null
            pairwiseSimilarity.push({ themeA: a, themeB: b, similarity })
          }
        }
      }
    }

    // 쌍이 아직 없으면 (runs 조회 실패 등) 빈 쌍 생성
    if (pairwiseSimilarity.length === 0) {
      for (let i = 0; i < activeIds.length; i++) {
        for (let j = i + 1; j < activeIds.length; j++) {
          pairwiseSimilarity.push({ themeA: activeIds[i], themeB: activeIds[j], similarity: null })
        }
      }
    }

    return apiSuccess({
      themes: themeResults,
      pairwiseSimilarity,
      overlappingStocks,
      warnings,
    }, undefined, 'medium')
  } catch (error) {
    return handleApiError(error, '테마 비교 데이터를 불러오는데 실패했습니다.')
  }
}

export const runtime = 'nodejs'
