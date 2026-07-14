import { useQuery } from '@tanstack/react-query'
import { getRanking } from '../_apis'
import type { ThemeRanking } from '@/lib/tli/types'

export function isEmptyRanking(ranking: ThemeRanking): boolean {
  const hasStageThemes = [
    ranking.emerging,
    ranking.growth,
    ranking.peak,
    ranking.decline,
    ranking.reigniting,
  ].some((themes) => themes.length > 0)

  return ranking.summary.visibleThemes === 0 || !hasStageThemes
}

/** 테마 랭킹 데이터 조회 훅 */
export function useGetRanking(initialData?: ThemeRanking) {
  const hydratableInitialData = initialData && !isEmptyRanking(initialData)
    ? initialData
    : undefined

  return useQuery({
    queryKey: ['tli', 'ranking'],
    queryFn: getRanking,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    initialData: hydratableInitialData,
    initialDataUpdatedAt: hydratableInitialData ? Date.now() : undefined,
  })
}
