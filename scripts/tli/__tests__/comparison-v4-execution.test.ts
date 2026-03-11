import { describe, expect, it } from 'vitest'
import {
  buildPromotionExecutionInput,
  buildBackfillManifestExecutionInput,
} from '../comparison-v4-execution'

describe('comparison v4 execution helpers', () => {
  it('builds a promotion execution input from run ids and actor', () => {
    const input = buildPromotionExecutionInput({
      runIds: ['run-1', 'run-2'],
      actor: 'codex',
      productionVersion: 'algo-v4-prod',
    })

    expect(input.runIds).toEqual(['run-1', 'run-2'])
    expect(input.actor).toBe('codex')
    expect(input.productionVersion).toBe('algo-v4-prod')
  })

  it('builds a backfill manifest execution input from table and parity source', () => {
    const input = buildBackfillManifestExecutionInput({
      sourceTable: 'theme_comparisons',
      targetTable: 'theme_comparison_candidates_v2',
      actor: 'codex',
    })

    expect(input.sourceTable).toBe('theme_comparisons')
    expect(input.targetTable).toBe('theme_comparison_candidates_v2')
    expect(input.actor).toBe('codex')
  })
})
