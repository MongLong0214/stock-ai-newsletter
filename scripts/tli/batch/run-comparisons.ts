/** 유사패턴 비교만 단독 실행하는 스크립트 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { loadActiveThemes } from '@/scripts/tli/shared/data-ops'
import { calculateThemeComparisons } from '@/scripts/tli/comparison/calculate-comparisons'
import { computeOptimalThreshold } from '@/scripts/tli/comparison/auto-tune'
import { materializePhase0Artifacts } from '@/scripts/tli/comparison/materialize-phase0-artifacts'

export interface TliComparisonPipelineResult {
  themeCount: number
  threshold: number | null
  confidence: string | null
  sampleSize: number | null
  durationSeconds: number
  exitCode: 0 | 1
}

export async function runTliComparisonPipeline(): Promise<TliComparisonPipelineResult> {
  console.log('🔍 유사패턴 비교 단독 실행\n')
  const startTime = Date.now()

  const themes = await loadActiveThemes()
  await materializePhase0Artifacts()
  const tuning = await computeOptimalThreshold()
  if (tuning) console.log(`🎯 자동 튜닝 임계값: ${tuning.threshold} (${tuning.confidence}, ${tuning.sampleSize}건)`)
  await calculateThemeComparisons(themes, tuning?.threshold)

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`\n⏱️  소요 시간: ${duration}초`)
  return {
    themeCount: themes.length,
    threshold: tuning?.threshold ?? null,
    confidence: tuning?.confidence ?? null,
    sampleSize: tuning?.sampleSize ?? null,
    durationSeconds: Number(duration),
    exitCode: 0,
  }
}

const isDirectRun = process.argv[1]?.includes('run-comparisons')
if (isDirectRun) {
  runTliComparisonPipeline()
    .then((result) => {
      process.exit(result.exitCode)
    })
    .catch((error: unknown) => {
      console.error('❌ 실패:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
