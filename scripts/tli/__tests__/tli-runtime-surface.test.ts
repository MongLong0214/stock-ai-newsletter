import { describe, expect, it } from 'vitest'
import {
  TLI_RUNTIME_ENTRYPOINTS,
  runTliComparisonPipeline,
  runTliMainPipeline,
} from '../tli-runtime-surface'

describe('tli runtime surface', () => {
  it('defines the canonical runtime entrypoints', () => {
    expect(TLI_RUNTIME_ENTRYPOINTS).toEqual([
      'scripts/tli/batch/collect-and-score.ts',
      'scripts/tli/batch/run-comparisons.ts',
    ])
  })

  it('exports callable runtime entrypoints', () => {
    expect(typeof runTliMainPipeline).toBe('function')
    expect(typeof runTliComparisonPipeline).toBe('function')
  })
})
