import { apiError, apiSuccess, handleApiError, UUID_RE } from '@/lib/tli/api-utils'
import { isPredictionV3ExposureEnabled, loadPredictionResponse } from './prediction-loader'
import type { PredictionApiResponse, PredictionPhase } from '@/lib/tli/predictions-v3-contract'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const phaseFilter = parsePhaseFilter(searchParams.get('phase'))
    const themeId = searchParams.get('themeId')

    if (themeId && !UUID_RE.test(themeId)) {
      return apiError('Invalid themeId filter.', 400)
    }

    if (!isPredictionV3ExposureEnabled()) {
      return apiSuccess(rollbackResponse(phaseFilter), undefined, 'medium')
    }

    const result = await loadPredictionResponse({ phaseFilter, themeId })
    return apiSuccess(result, undefined, 'medium')
  } catch (error) {
    return handleApiError(error, '예측 데이터를 불러오는데 실패했습니다.')
  }
}

function parsePhaseFilter(value: string | null): PredictionPhase | null {
  switch (value) {
    case 'rising':
    case 'hot':
    case 'cooling':
      return value
    default:
      return null
  }
}

function rollbackResponse(phase: PredictionPhase | null): PredictionApiResponse {
  return {
    phase,
    dataSource: 'none',
    themes: [],
    guidance: 'TLI v3 prediction exposure is disabled for rollback.',
  }
}

export const runtime = 'nodejs'
