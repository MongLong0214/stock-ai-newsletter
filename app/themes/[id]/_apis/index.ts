import type { ThemeDetail, ApiResponse } from '@/lib/tli/types'
import type { PredictionApiItem } from '@/lib/tli/predictions-v3-contract'

/** 테마 상세 데이터 조회 */
export async function getThemeDetail(id: string): Promise<ThemeDetail> {
  const res = await fetch(`/api/tli/themes/${id}`)
  if (!res.ok) throw new Error('테마 데이터 로딩 실패')

  const json: ApiResponse<ThemeDetail> = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? '알 수 없는 오류')

  return json.data
}

interface PredictionApiEnvelope {
  readonly success: boolean
  readonly data?: {
    readonly themes: readonly PredictionApiItem[]
  }
  readonly error?: {
    readonly message?: string
  }
}

export async function getThemePrediction(themeId: string): Promise<PredictionApiItem | null> {
  const res = await fetch(`/api/tli/predictions?themeId=${encodeURIComponent(themeId)}`)
  if (!res.ok) throw new Error('예측 스냅샷 로딩 실패')

  const json: PredictionApiEnvelope = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? '알 수 없는 오류')

  return json.data?.themes[0] ?? null
}
