/** 유사패턴 비교만 단독 실행하는 스크립트 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { loadActiveThemes } from './data-ops'
import { calculateThemeComparisons } from './calculate-comparisons'
import { computeOptimalThreshold } from './auto-tune'

async function main() {
  console.log('🔍 유사패턴 비교 단독 실행\n')
  const startTime = Date.now()

  const themes = await loadActiveThemes()
  const tuning = await computeOptimalThreshold()
  if (tuning) console.log(`🎯 자동 튜닝 임계값: ${tuning.threshold} (${tuning.confidence}, ${tuning.sampleSize}건)`)
  await calculateThemeComparisons(themes, tuning?.threshold)

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`\n⏱️  소요 시간: ${duration}초`)
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error('❌ 실패:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
