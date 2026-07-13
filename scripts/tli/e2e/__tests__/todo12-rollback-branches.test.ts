import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parseTodo12RollbackBranchReceipt } from '../todo12-rollback-branch-receipt'
import { buildTodo12RollbackBranchReceiptFixture } from './todo12-rollback-branch-receipt.fixture'

const lifecycleSql = readFileSync(
  'scripts/tli/e2e/sql/todo12-lifecycle-rehearsal.sql',
  'utf8',
)
const postgresRehearsal = readFileSync(
  'scripts/tli/e2e/postgres-rehearsal.ts',
  'utf8',
)

describe('Todo 12 rollback branch rehearsal', () => {
  it('executes canary failure, public hold, and public resume through their RPCs', () => {
    for (const rpc of [
      'record_tli_canary_failure',
      'hold_tli_public_release',
      'resume_tli_public_release',
    ]) {
      expect(lifecycleSql).toMatch(new RegExp(`PERFORM public\\.${rpc}\\(`))
    }
  })

  it('covers mismatch rejections and emits a separately parsed receipt', () => {
    for (const mismatch of ['cycle', 'event', 'hash', 'reason']) {
      expect(lifecycleSql).toContain(`'${mismatch}'`)
    }
    expect(lifecycleSql).toContain("'non_allowlisted_reason'")
    expect(lifecycleSql).toContain("'todo12-rollback-branches-v1'")
    expect(postgresRehearsal).toContain('rollbackBranches: rollbackBranches')
  })

  it('parses only the exact rollback branch receipt contract', () => {
    const receipt = buildTodo12RollbackBranchReceiptFixture()

    expect(parseTodo12RollbackBranchReceipt(`NOTICE\n${JSON.stringify(receipt)}\n{}`))
      .toEqual(receipt)
    const reordered = structuredClone(receipt)
    reordered.holdRejections.reverse()
    expect(() => parseTodo12RollbackBranchReceipt(JSON.stringify(reordered))).toThrow()
    const withUnknownKey = { ...receipt, ignored: true }
    expect(() => parseTodo12RollbackBranchReceipt(JSON.stringify(withUnknownKey))).toThrow()
  })
})
