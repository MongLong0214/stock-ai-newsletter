import type { SpawnSyncReturns } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseDryRunCliArgs } from '../cli-args'
import { TLI_E2E_CONTAINER_NAME } from '../contracts'
import { buildFixtureOriginStack } from '../fixture-origins'
import { auditDataset } from '../pipeline-audit'
import { runDryRunPipeline } from '../pipeline'
import { ScratchPostgres, type CommandRunner } from '../scratch-postgres'
import { buildTrainingFixtureData } from '../fixture-study-data'

const processResult = (stdout = '', status = 0): SpawnSyncReturns<string> => ({
  pid: 1,
  output: [null, stdout, ''],
  stdout,
  stderr: '',
  status,
  signal: null,
  error: undefined,
})

describe('Todo 15 dry-run public contract', () => {
  it('parses the exact fixture/schema/output CLI and rejects unknown flags', () => {
    expect(parseDryRunCliArgs([
      '--fixture=happy',
      '--prod-schema=prod-schema.sql',
      '--output=.omo/evidence/happy.json',
    ])).toMatchObject({ fixture: 'happy' })
    expect(() => parseDryRunCliArgs([
      '--fixture=happy',
      '--prod-schema=prod-schema.sql',
      '--output=happy.json',
      '--skip-docker=true',
    ])).toThrow(/unknown argument --skip-docker/)
  })

  it('starts PG17, applies 049/050/051, runs the live rehearsal, and issues rm -f', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-e2e-scratch-'))
    const schemaPath = join(directory, 'schema.sql')
    writeFileSync(schemaPath, 'CREATE EXTENSION IF NOT EXISTS "supabase_vault";\nSELECT 1;\n')
    const calls: { readonly command: string; readonly args: readonly string[]; readonly input?: string }[] = []
    const runner: CommandRunner = (command, args, input) => {
      calls.push({ command, args, input })
      if (args[0] === 'logs') {
        return processResult('PostgreSQL init process complete; ready for start up.\n')
      }
      return args.includes('SHOW server_version;') ? processResult('17.5\n') : processResult()
    }
    try {
      const scratch = new ScratchPostgres(runner)
      const receipt = scratch.start(schemaPath)
      scratch.cleanup()

      expect(receipt).toMatchObject({
        image: 'postgres:17',
        serverVersion: '17.5',
        positiveRehearsal: true,
        collectionAppendContract: 'separate_immutable_runs',
      })
      expect(receipt.migrations).toEqual([
        'supabase/migrations/049_tli_experiment_cycles.sql',
        'supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql',
        'supabase/migrations/051_tli_fix_observation_trigger_binding.sql',
      ])
      expect(calls.filter((call) => call.command === 'docker'
        && call.args[0] === 'rm' && call.args[1] === '-f'
        && call.args[2] === TLI_E2E_CONTAINER_NAME)).toHaveLength(2)
      expect(calls.some((call) => call.command === process.execPath
        && call.args.some((argument) => argument.endsWith('postgres-rehearsal.ts')))).toBe(true)
      expect(calls.some((call) => call.input?.includes('supabase_vault'))).toBe(false)
      expect(calls.some((call) => call.input?.includes('CREATE OR REPLACE FUNCTION auth.jwt()'))).toBe(true)
      expect(calls.some((call) => call.input?.includes('CREATE PUBLICATION supabase_realtime'))).toBe(true)
      expect(calls.some((call) => call.command === 'docker' && call.args[0] === 'logs')).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('invokes the real cycle-freeze rehearsal and parses its frozen readback', () => {
    const calls: { readonly command: string; readonly args: readonly string[]; readonly input?: string }[] = []
    const runner: CommandRunner = (command, args, input) => {
      calls.push({ command, args, input })
      return args.some((argument) => argument.endsWith('postgres-contract-rehearsal.ts'))
        ? processResult(JSON.stringify({
          cycleId: 'abcdefab-0000-4000-8000-000000000015',
          status: 'frozen',
          freezeRpc: 'freeze_tli_cycle',
          evidenceArtifactCount: 4,
          evidenceAttestationCount: 4,
          hashBundleExact: true,
          sourceDatasetManifestSha256: 'a'.repeat(64),
          datasetManifestSha256: 'b'.repeat(64),
          modelManifestSha256: 'c'.repeat(64),
          cycleManifestSha256: 'd'.repeat(64),
        }))
        : processResult()
    }
    const scratch = new ScratchPostgres(runner)
    const receipt = scratch.freezeCycle({ cycleId: 'abcdefab-0000-4000-8000-000000000015' } as never)

    expect(receipt).toMatchObject({
      status: 'frozen',
      freezeRpc: 'freeze_tli_cycle',
      evidenceArtifactCount: 4,
      evidenceAttestationCount: 4,
      hashBundleExact: true,
    })
    expect(calls.at(-1)).toMatchObject({
      command: process.execPath,
      input: expect.stringContaining('abcdefab-0000-4000-8000-000000000015'),
    })
  })

  it('builds byte-repeatable exact-five data and excludes one missing source completion', async () => {
    const stack = await buildFixtureOriginStack()
    const happy = await buildTrainingFixtureData({
      stack,
      mode: 'known_signal',
      omitSourceCompletion: false,
    })
    const missing = await buildTrainingFixtureData({
      stack,
      mode: 'known_signal',
      omitSourceCompletion: true,
    })

    expect(stack.trainingOrigins).toHaveLength(26)
    expect(stack.prospectiveOrigins).toHaveLength(24)
    expect(happy.dataset.rows).toHaveLength(26 * 12)
    expect(happy.exactFiveRows).toBe(happy.dataset.rows.length)
    expect(happy.dataset.manifestSha256).toBe(happy.repeatedDataset.manifestSha256)
    expect(JSON.stringify(happy.dataset)).toBe(JSON.stringify(happy.repeatedDataset))
    expect(auditDataset(happy, stack)).toMatchObject({
      duplicate: 0,
      missing: 0,
      currentMembershipLeakage: 0,
      postOutcomeSource: 0,
      mixedStudy: 0,
      repeatBytesEqual: true,
      repeatManifestHashEqual: true,
    })
    expect(missing.missingRows).toBe(1)
    expect(missing.dataset.rows).toHaveLength(26 * 12 - 1)
  })

  it('fails closed at docker_info and still issues final rm -f cleanup', async () => {
    const calls: { readonly command: string; readonly args: readonly string[] }[] = []
    const runner: CommandRunner = (command, args) => {
      calls.push({ command, args })
      return command === 'docker' && args[0] === 'info'
        ? processResult('', 1)
        : processResult()
    }
    const report = await runDryRunPipeline({
      fixture: 'happy',
      prodSchemaPath: '/fixture/not-read-before-docker-info.sql',
      outputPath: '/fixture/not-written-by-pipeline.json',
    }, { scratchPostgres: new ScratchPostgres(runner) })

    expect(report).toMatchObject({ status: 'failed', expectedSatisfied: false, exitCode: 1 })
    expect(report.errors[0]).toMatch(/docker_info/)
    expect(report.stages.at(-1)).toMatchObject({ name: 'cleanup', status: 'pass' })
    expect(calls.filter((call) => call.command === 'docker'
      && call.args[0] === 'rm' && call.args[1] === '-f'
      && call.args[2] === TLI_E2E_CONTAINER_NAME)).toHaveLength(2)
  })
})
