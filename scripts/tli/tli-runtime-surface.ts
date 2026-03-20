import { runTliMainPipeline } from '@/scripts/tli/batch/collect-and-score'
import { runTliComparisonPipeline } from '@/scripts/tli/batch/run-comparisons'

export const TLI_RUNTIME_ENTRYPOINTS = [
  'scripts/tli/batch/collect-and-score.ts',
  'scripts/tli/batch/run-comparisons.ts',
] as const

export {
  runTliMainPipeline,
  runTliComparisonPipeline,
}
