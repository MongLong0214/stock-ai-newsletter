import { createHash, randomUUID } from 'node:crypto'

import { getGeminiRecommendationResult } from './korea/gemini'

export interface GenerationManifest {
  readonly runId: string
  readonly generationKind: 'stock_recommendation' | 'crash_alert'
  readonly modelProvider: 'google_vertex_ai'
  readonly modelVersion: string
  readonly promptVersion: string
  readonly promptSha256: string
  readonly groundingEvidence: readonly Record<string, unknown>[]
  readonly contentSha256: string
  readonly startedAt: string
  readonly completedAt: string
}

/** 주식 분석 결과와 immutable persistence manifest. */
export interface StockAnalysisResult {
  readonly geminiAnalysis: string
  readonly generationManifest: GenerationManifest
}

export async function getStockAnalysis(signal?: AbortSignal): Promise<StockAnalysisResult> {
  console.log('🤖 Gemini 주식 분석 시작...\n')

  const startTime = Date.now()
  try {
    const result = await getGeminiRecommendationResult(signal)
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    const contentSha256 = createHash('sha256').update(result.geminiAnalysis, 'utf8').digest('hex')

    console.log(`\n⏱️  총 실행 시간: ${duration}초\n`)
    console.log('━'.repeat(80))
    console.log('📊 Gemini 분석: ✅ 성공')
    console.log('━'.repeat(80))
    console.log('')

    return {
      geminiAnalysis: result.geminiAnalysis,
      generationManifest: {
        runId: randomUUID(),
        generationKind: result.generationKind,
        modelProvider: 'google_vertex_ai',
        modelVersion: result.modelVersion,
        promptVersion: result.promptManifest.version,
        promptSha256: result.promptManifest.sha256,
        groundingEvidence: result.groundingEvidence as readonly Record<string, unknown>[],
        contentSha256,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
      },
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log(`\n⏱️  총 실행 시간: ${duration}초\n`)
    console.log('━'.repeat(80))
    console.log('📊 Gemini 분석: ❌ 실패')
    console.log('━'.repeat(80))
    console.log('')

    throw error
  }
}
