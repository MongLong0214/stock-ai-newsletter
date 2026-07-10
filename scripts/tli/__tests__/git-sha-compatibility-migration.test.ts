import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const compatibilityMigrationPath = join(
  process.cwd(),
  'supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql',
)
const snapshotMigrationPath = join(
  process.cwd(),
  'supabase/migrations/046_tli_immutable_source_snapshots.sql',
)
const experimentMigrationPath = join(
  process.cwd(),
  'supabase/migrations/049_tli_experiment_cycles.sql',
)

let compatibilitySql = ''
let normalizedCompatibilitySql = ''
let snapshotSql = ''
let experimentSql = ''

beforeAll(() => {
  compatibilitySql = readFileSync(compatibilityMigrationPath, 'utf8')
  normalizedCompatibilitySql = compatibilitySql.replace(/\s+/g, ' ').trim()
  snapshotSql = readFileSync(snapshotMigrationPath, 'utf8').replace(/\s+/g, ' ').trim()
  experimentSql = readFileSync(experimentMigrationPath, 'utf8').replace(/\s+/g, ' ').trim()
})

const gitShaCheck = (column: string): string =>
  `${column} ~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$'`

const gitShaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const contentSha256Pattern = /^[0-9a-f]{64}$/

describe('migration 050 git SHA compatibility', () => {
  it('replaces only the two 046 study git constraints with named 40-or-64 checks', () => {
    const table = 'public.tli_attention_study_contracts'
    const checks = [
      ['git_commit_sha', 'tli_attention_study_contracts_git_commit_sha_check'],
      ['git_blob_sha', 'tli_attention_study_contracts_git_blob_sha_check'],
    ] as const

    for (const [column, constraint] of checks) {
      expect(normalizedCompatibilitySql).toContain(
        `ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`,
      )
      expect(normalizedCompatibilitySql).toContain(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${gitShaCheck(column)})`,
      )
    }
  })

  it('aligns the existing study-lock RPC guard with both supported git object formats', () => {
    const match = compatibilitySql.match(
      /CREATE OR REPLACE FUNCTION public\.lock_tli_attention_study_contract\([\s\S]*?\n\$\$;/,
    )
    const lockSql = match?.[0].replace(/\s+/g, ' ').trim() ?? ''

    expect(lockSql).not.toBe('')
    expect(lockSql).toContain('SECURITY DEFINER SET search_path = pg_catalog, extensions')
    expect(lockSql).toContain(
      'public.tli_require_canonical_json_v1( p_contract_canonical_json, p_contract_payload_sha256 )',
    )
    expect(lockSql).toContain(
      'public.tli_require_canonical_json_v1( p_control_canonical_json, v_control_sha256 )',
    )
    expect(lockSql).toContain(`p_git_commit_sha !~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$'`)
    expect(lockSql).toContain(`p_git_blob_sha !~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$'`)
    expect(lockSql).toContain(`p_verifier_code_sha !~ '^[0-9a-f]{64}$'`)
    expect(lockSql).toContain('NOT isfinite(p_verified_at)')
    expect(lockSql).not.toContain(`p_git_commit_sha !~ '^[0-9a-f]{64}$'`)
    expect(lockSql).not.toContain(`p_git_blob_sha !~ '^[0-9a-f]{64}$'`)
    expect(normalizedCompatibilitySql).toContain(
      'ALTER FUNCTION public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) OWNER TO postgres',
    )
  })

  it('bounds every study-lock attestation scalar before acquiring the global lock', () => {
    const match = compatibilitySql.match(
      /CREATE OR REPLACE FUNCTION public\.lock_tli_attention_study_contract\([\s\S]*?\n\$\$;/,
    )
    const lockSql = match?.[0] ?? ''
    const advisoryLockOffset = lockSql.indexOf(
      "PERFORM pg_advisory_xact_lock(hashtextextended('tli-attention-study-lock-v1', 0));",
    )

    expect(advisoryLockOffset).toBeGreaterThan(0)
    for (const guard of [
      "p_git_commit_sha !~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$'",
      "p_git_blob_sha !~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$'",
      'octet_length(p_repo_relative_path) > 512',
      'octet_length(p_verifier_version) > 128',
      "p_verifier_code_sha !~ '^[0-9a-f]{64}$'",
      'NOT isfinite(p_verified_at)',
    ]) {
      const guardOffset = lockSql.indexOf(guard)
      expect(guardOffset, `${guard} must be validated before the advisory lock`).toBeGreaterThan(0)
      expect(guardOffset, `${guard} must be validated before the advisory lock`).toBeLessThan(
        advisoryLockOffset,
      )
    }

    const controlReadOffset = lockSql.indexOf(
      'SELECT count(*)::INTEGER INTO v_control_count',
    )
    expect(advisoryLockOffset).toBeLessThan(controlReadOffset)
  })

  it('recognizes that 049 attestations already use 40-or-64 git checks and leaves them untouched', () => {
    for (const column of ['git_commit_sha', 'git_blob_sha']) {
      expect(experimentSql).toContain(
        `CHECK (${column} ~ '^[0-9a-f]{40}$' OR ${column} ~ '^[0-9a-f]{64}$')`,
      )
    }
    expect(normalizedCompatibilitySql).not.toMatch(
      /ALTER TABLE public\.tli_evidence_attestations (?:DROP|ADD) CONSTRAINT/,
    )
  })

  it('keeps every content and verifier SHA contract lowercase 64-hex', () => {
    expect(snapshotSql).toContain("payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')")
    expect(snapshotSql).toContain("verifier_code_sha TEXT NOT NULL CHECK (verifier_code_sha ~ '^[0-9a-f]{64}$')")
    expect(experimentSql).toContain("content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$')")
    expect(normalizedCompatibilitySql).not.toMatch(/DROP CONSTRAINT [a-z0-9_]*(?:content|payload|verifier)[a-z0-9_]*_check/)
  })

  it.each([
    [
      'tli_attention_study_contracts',
      () => normalizedCompatibilitySql,
      gitShaCheck('git_commit_sha'),
      gitShaCheck('git_blob_sha'),
    ],
    [
      'tli_evidence_attestations',
      () => experimentSql,
      "git_commit_sha ~ '^[0-9a-f]{40}$' OR git_commit_sha ~ '^[0-9a-f]{64}$'",
      "git_blob_sha ~ '^[0-9a-f]{40}$' OR git_blob_sha ~ '^[0-9a-f]{64}$'",
    ],
  ] as const)('%s accepts only lowercase 40-or-64 git object ids', (_, sqlSource, commitCheck, blobCheck) => {
    const source = sqlSource()
    expect(source).toContain(commitCheck)
    expect(source).toContain(blobCheck)

    expect(gitShaPattern.test('a'.repeat(40))).toBe(true)
    expect(gitShaPattern.test('b'.repeat(64))).toBe(true)
    for (const invalid of [
      'a'.repeat(39),
      'a'.repeat(41),
      'A'.repeat(40),
      'g'.repeat(40),
    ]) {
      expect(gitShaPattern.test(invalid)).toBe(false)
    }
  })

  it.each([
    [
      'tli_attention_study_contracts.payload_sha256',
      () => snapshotSql,
      "payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')",
    ],
    [
      'tli_evidence_attestations.content_sha256',
      () => experimentSql,
      "content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$')",
    ],
  ] as const)('%s remains lowercase 64-only', (_, sqlSource, checkSql) => {
    expect(sqlSource()).toContain(checkSql)
    expect(contentSha256Pattern.test('a'.repeat(64))).toBe(true)
    expect(contentSha256Pattern.test('a'.repeat(40))).toBe(false)
    expect(contentSha256Pattern.test('A'.repeat(64))).toBe(false)
    expect(contentSha256Pattern.test('g'.repeat(64))).toBe(false)
  })
})
