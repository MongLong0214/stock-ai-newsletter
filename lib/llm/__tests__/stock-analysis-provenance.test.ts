import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getGeminiRecommendationResult = vi.hoisted(() => vi.fn())
vi.mock('@/lib/llm/korea/gemini', () => ({ getGeminiRecommendationResult }))

import { getStockAnalysis } from '@/lib/llm/stock-analysis'

describe('stock analysis generation manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  it('records exact output hash, prompt/model identity, grounding, and a UUID run id', async () => {
    const content = '[{"ticker":"KOSPI:005930"}]'
    const groundingEvidence = [{
      ticker: 'KOSPI:005930',
      identitySourceUrl: 'https://finance.naver.com/item/main.naver?code=005930',
      quoteSourceUrl: 'https://openapi.koreainvestment.com/uapi/test',
      sourceObservedAt: '2026-07-31T00:00:00.000Z',
    }]
    getGeminiRecommendationResult.mockResolvedValue({
      geminiAnalysis: content,
      generationKind: 'stock_recommendation',
      modelVersion: 'gemini-2.5-flash',
      promptManifest: { version: 'korea-stock-seven-stage-v6', sha256: 'a'.repeat(64) },
      groundingEvidence,
      startedAt: '2026-07-31T00:00:00.000Z',
      completedAt: '2026-07-31T00:01:00.000Z',
    })

    const result = await getStockAnalysis()

    expect(result.geminiAnalysis).toBe(content)
    expect(result.generationManifest).toMatchObject({
      generationKind: 'stock_recommendation',
      modelProvider: 'google_vertex_ai',
      modelVersion: 'gemini-2.5-flash',
      promptVersion: 'korea-stock-seven-stage-v6',
      promptSha256: 'a'.repeat(64),
      groundingEvidence,
      contentSha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      startedAt: '2026-07-31T00:00:00.000Z',
      completedAt: '2026-07-31T00:01:00.000Z',
    })
    expect(result.generationManifest.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
