import { describe, expect, it } from 'vitest'
import { buildRunDateLookupMap } from '../run-level4-weight-tuning'

describe('run-level4-weight-tuning runner helpers', () => {
  it('builds a stable run-date lookup map from run rows', () => {
    const map = buildRunDateLookupMap([
      { id: 'run-2', run_date: '2026-03-02' },
      { id: 'run-1', run_date: '2026-03-01' },
    ])

    expect(map.get('run-1')).toBe('2026-03-01')
    expect(map.get('run-2')).toBe('2026-03-02')
  })
})
