import { useQuery } from '@tanstack/react-query'
import { getRanking } from '../_apis'
import type { ThemeRanking } from '@/lib/tli/types'

/** 테마 랭킹 데이터 조회 훅 */
export function useGetRanking(initialData?: ThemeRanking) {
  return useQuery({
    queryKey: ['tli', 'ranking'],
    queryFn: getRanking,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
  })
}
