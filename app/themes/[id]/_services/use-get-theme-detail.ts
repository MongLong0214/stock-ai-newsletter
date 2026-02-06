import { useQuery } from '@tanstack/react-query'
import { getThemeDetail } from '../_apis'

/** 테마 상세 데이터 조회 훅 */
export function useGetThemeDetail(id: string) {
  return useQuery({
    queryKey: ['tli', 'theme', id],
    queryFn: () => getThemeDetail(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
