import type { ThemeRanking, ApiResponse } from '@/lib/tli/types'

/** 테마 랭킹 데이터 조회 */
export async function getRanking(): Promise<ThemeRanking> {
  const res = await fetch('/api/tli/scores/ranking')
  if (!res.ok) throw new Error('랭킹 데이터 로딩 실패')

  const json: ApiResponse<ThemeRanking> = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? '알 수 없는 오류')

  return json.data
}
