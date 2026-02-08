import { useQuery } from '@tanstack/react-query'
import { getRanking } from '../_apis'

/** 테마 랭킹 데이터 조회 훅 */
export function useGetRanking() {
  return useQuery({
    queryKey: ['tli', 'ranking'],
    queryFn: getRanking,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
