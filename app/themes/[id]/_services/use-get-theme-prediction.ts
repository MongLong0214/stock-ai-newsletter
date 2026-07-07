import { useQuery } from '@tanstack/react-query'
import { getThemePrediction } from '../_apis'

export function useGetThemePrediction(themeId: string) {
  return useQuery({
    queryKey: ['tli', 'prediction-v3', themeId],
    queryFn: () => getThemePrediction(themeId),
    enabled: themeId.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
