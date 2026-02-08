import type { ThemeDetail, ApiResponse } from '@/lib/tli/types'

/** 테마 상세 데이터 조회 */
export async function getThemeDetail(id: string): Promise<ThemeDetail> {
  const res = await fetch(`/api/tli/themes/${id}`)
  if (!res.ok) throw new Error('테마 데이터 로딩 실패')

  const json: ApiResponse<ThemeDetail> = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? '알 수 없는 오류')

  return json.data
}
