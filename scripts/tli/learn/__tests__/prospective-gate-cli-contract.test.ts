import { describe, expect, it } from 'vitest'

import { parseProspectiveGateCli } from '../prospective-gate-cli-contract'

const cycleId = '10000000-0000-4000-8000-000000000014'

describe('prospective gate CLI contract', () => {
  it('parses read-only inspect and exact render commands', () => {
    expect(parseProspectiveGateCli(['inspect'])).toEqual({
      command: 'inspect', cycleId: null, jsonOutput: null,
    })
    expect(parseProspectiveGateCli([
      'render-decision', '--kind=final', `--cycle-id=${cycleId}`, '--work-dir=.omo/gate',
    ])).toEqual({
      command: 'render-decision', kind: 'final', cycleId, workDir: '.omo/gate', jsonOutput: null,
    })
  })

  it('defaults recording to dry-run and never accepts a verdict override', () => {
    expect(parseProspectiveGateCli([
      'record-decision', '--kind=safety', `--cycle-id=${cycleId}`, `--evidence-commit=${'a'.repeat(40)}`,
    ])).toMatchObject({ command: 'record-decision', dryRun: true })
    expect(() => parseProspectiveGateCli([
      'record-decision', '--kind=final', `--cycle-id=${cycleId}`,
      `--evidence-commit=${'a'.repeat(40)}`, '--decision=pass',
    ])).toThrow(/unknown option/)
  })

  it.each([
    ['render-decision', '--kind=theme-only', `--cycle-id=${cycleId}`],
    ['record-decision', '--kind=final', `--cycle-id=${cycleId}`, '--evidence-commit=HEAD'],
    ['record-decision', '--kind=final', `--cycle-id=${cycleId}`, `--evidence-commit=${'a'.repeat(40)}`, '--dry-run=yes'],
  ])('rejects malformed input without falling back: %s', (...args) => {
    expect(() => parseProspectiveGateCli(args)).toThrow()
  })
})
