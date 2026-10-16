import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('two-head composite training target', () => {
  it('runs the actual Python regressions for loss penalty, per-head clipping and unknown predictions', () => {
    const result = spawnSync('python3', [
      '-m', 'unittest', 'discover', '-s', 'scripts/stock-picks', '-p', 'utility_target_test.py',
    ], { encoding: 'utf8' })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain('Ran 5 tests')
    expect(result.stderr).toMatch(/\bOK\b/)
  })

  it('runs the actual Python benchmark regressions for unknown reasons and conservative metrics', () => {
    const result = spawnSync('python3', [
      '-m', 'unittest', 'discover', '-s', 'scripts/stock-picks', '-p', 'benchmark_composite_utility_test.py',
    ], { encoding: 'utf8' })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain('Ran 12 tests')
    expect(result.stderr).toMatch(/\bOK\b/)
  })
})
