import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  buildTodo12LifecycleSourceProvenance,
  TODO12_LIFECYCLE_SOURCE_PATHS,
  verifyTodo12LifecycleSourceProvenance,
} from '../todo12-lifecycle-source-provenance'

const HEAD_SHA = 'e22e3c981d841e1966e35551d62bdf37142f73f2'

describe('Todo 12 lifecycle source provenance', () => {
  it('binds the receipt to the exact worktree SQL and harness bytes', () => {
    const provenance = buildTodo12LifecycleSourceProvenance(HEAD_SHA)

    expect(provenance.gitCommitSha).toBe(HEAD_SHA)
    expect(provenance.files.map(({ path }) => path)).toEqual(TODO12_LIFECYCLE_SOURCE_PATHS)
    for (const source of provenance.files) {
      expect(source.sha256).toBe(
        createHash('sha256').update(readFileSync(source.path)).digest('hex'),
      )
    }
    expect(verifyTodo12LifecycleSourceProvenance(provenance)).toEqual(provenance)
  })

  it('rejects a schema-valid digest that does not match the current worktree', () => {
    const provenance = buildTodo12LifecycleSourceProvenance(HEAD_SHA)
    const forged = structuredClone(provenance)
    forged.files[0].sha256 = '0'.repeat(64)

    expect(() => verifyTodo12LifecycleSourceProvenance(forged)).toThrow(
      /source digest mismatch.*todo12-lifecycle-rehearsal\.sql/,
    )
  })
})
