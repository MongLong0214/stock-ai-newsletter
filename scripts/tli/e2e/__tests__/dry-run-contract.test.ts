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
import { todo12LifecycleReceiptSchema } from '../todo12-lifecycle-receipt'

const processResult = (stdout = '', status = 0): SpawnSyncReturns<string> => ({
  pid: 1,
  output: [null, stdout, ''],
  stdout,
  stderr: '',
  status,
  signal: null,
  error: undefined,
})

const lifecycleReceipt = {
  receiptVersion: 'todo12-lifecycle-rehearsal-v1',
  status: 'pass',
  cycleId: 'abcdefab-0000-4000-8000-000000000012',
  transactionIsolation: {
    mode: 'committed_stage_groups',
    guardGucResetChecks: 23,
    allGuardsReset: true,
  },
  transitions: [
    ['draft', null, 'draft'],
    ['freeze', 'draft', 'frozen'],
    ['start', 'frozen', 'running'],
    ['confirmatory_enroll', 'running', 'running'],
    ['origin_attest', 'running', 'running'],
    ['prediction_insert', 'running', 'running'],
    ['scoring_rpc', 'running', 'running'],
    ['safety', 'running', 'running'],
    ['final', 'running', 'ready_for_decision'],
    ['internal', 'ready_for_decision', 'promoted_internal'],
    ['canary_enroll', 'promoted_internal', 'promoted_internal'],
    ['canary_attest', 'promoted_internal', 'promoted_internal'],
    ['canary_prediction_insert', 'promoted_internal', 'promoted_internal'],
    ['canary_scoring_rpc', 'promoted_internal', 'promoted_internal'],
    ['public_swap', 'promoted_internal', 'public_approved'],
  ].map(([transition, beforeStatus, afterStatus], index) => ({
    order: index + 1,
    transition,
    beforeStatus,
    afterStatus,
    observed: { transition },
    verdict: 'pass',
  })),
  rejections: [
    ['terminal_enrollment', '55000'],
    ['three_canary_release', '55000'],
    ['direct_prediction_update', '42501'],
  ].map(([probe, sqlstate]) => ({
    probe,
    expectedSqlstate: sqlstate,
    observedSqlstate: sqlstate,
    message: `${probe} rejected`,
    stateUnchanged: true,
    verdict: 'pass',
  })),
  counts: {
    confirmatoryOrigins: 16,
    safetyOrigins: 8,
    finalOrigins: 16,
    publicCanaries: 4,
    originAttestations: 20,
    scientificPredictions: 40,
    scoringFinalizations: 40,
  },
  publicSwap: { oldChampionStatus: 'archived', candidateStatus: 'champion', candidateRelease: 'public' },
}

describe('Todo 15 dry-run public contract', () => {
  it('rejects duplicate lifecycle steps and mismatched rejection SQLSTATEs', () => {
    expect(todo12LifecycleReceiptSchema.safeParse(lifecycleReceipt).success).toBe(true)

    const duplicateTransitions = structuredClone(lifecycleReceipt)
    duplicateTransitions.transitions = duplicateTransitions.transitions.map((transition, index) => ({
      ...duplicateTransitions.transitions[0]!,
      order: index + 1,
      observed: transition.observed,
    }))
    expect(todo12LifecycleReceiptSchema.safeParse(duplicateTransitions).success).toBe(false)

    const wrongSqlstate = structuredClone(lifecycleReceipt)
    wrongSqlstate.rejections[0]!.observedSqlstate = '42501'
    expect(todo12LifecycleReceiptSchema.safeParse(wrongSqlstate).success).toBe(false)

    const duplicateRejections = structuredClone(lifecycleReceipt)
    duplicateRejections.rejections = duplicateRejections.rejections.map(() => ({
      ...duplicateRejections.rejections[0]!,
    }))
    expect(todo12LifecycleReceiptSchema.safeParse(duplicateRejections).success).toBe(false)

    const reorderedRejections = structuredClone(lifecycleReceipt)
    reorderedRejections.rejections.reverse()
    expect(todo12LifecycleReceiptSchema.safeParse(reorderedRejections).success).toBe(false)

    const missingRejection = structuredClone(lifecycleReceipt)
    missingRejection.rejections.pop()
    expect(todo12LifecycleReceiptSchema.safeParse(missingRejection).success).toBe(false)
  })

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

  it('starts PG17 with a named scratch volume and removes every scratch resource', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-e2e-scratch-'))
    const schemaPath = join(directory, 'schema.sql')
    writeFileSync(schemaPath, 'CREATE EXTENSION IF NOT EXISTS "supabase_vault";\nSELECT 1;\n')
    const calls: { readonly command: string; readonly args: readonly string[]; readonly input?: string }[] = []
    const runner: CommandRunner = (command, args, input) => {
      calls.push({ command, args, input })
      if (args[0] === 'logs') {
        return processResult('PostgreSQL init process complete; ready for start up.\n')
      }
      if (args[0] === 'volume' && args[1] === 'inspect') return processResult('', 1)
      if (command === process.execPath
        && args.some((argument) => argument.endsWith('postgres-contract-rehearsal.ts'))) {
        return processResult(`${JSON.stringify({
          studyContractId: '20000000-0000-4000-8000-000000000015',
          payloadSha256: 'a'.repeat(64),
          lockedAt: '2026-07-01T00:00:00.000Z',
          lockedBeforeFirstOrigin: true,
          storage: 'tli_attention_study_contracts',
        })}\n`)
      }
      if (command === process.execPath
        && args.some((argument) => argument.endsWith('postgres-rehearsal.ts'))) {
        return processResult(`${JSON.stringify({
          status: 'pass',
          sources: ['naver_news', 'naver_datalab'],
          identicalPayloadContract: 'separate_immutable_runs',
          runCount: 3,
          lifecycle: lifecycleReceipt,
        })}\n`)
      }
      return args.includes('SHOW server_version;') ? processResult('17.5\n') : processResult()
    }
    try {
      const scratch = new ScratchPostgres(runner)
      const receipt = scratch.start(schemaPath, {} as never)
      const cleanup = scratch.cleanup()

      expect(receipt).toMatchObject({
        image: 'postgres:17',
        serverVersion: '17.5',
        positiveRehearsal: true,
        collectionAppendContract: 'separate_immutable_runs',
        lifecycleRehearsal: lifecycleReceipt,
      })
      expect(receipt.migrations).toEqual([
        'supabase/migrations/049_tli_experiment_cycles.sql',
        'supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql',
        'supabase/migrations/051_tli_fix_observation_trigger_binding.sql',
        'supabase/migrations/052_tli_abstain_sentinel_db_guard.sql',
      ])
      expect(calls.filter((call) => call.command === 'docker'
        && call.args[0] === 'rm' && call.args[1] === '-f'
        && call.args[2] === '-v' && call.args[3] === TLI_E2E_CONTAINER_NAME)).toHaveLength(2)
      expect(calls.filter((call) => call.command === 'docker'
        && call.args[0] === 'volume' && call.args[1] === 'rm'
        && call.args[2] === '-f' && call.args[3] === 'tli-e2e-dryrun-data')).toHaveLength(2)
      expect(calls.some((call) => call.command === 'docker'
        && call.args[0] === 'run'
        && call.args.includes('type=volume,source=tli-e2e-dryrun-data,target=/var/lib/postgresql/data'))).toBe(true)
      expect(cleanup).toMatchObject({
        containerAbsent: true,
        volumeName: 'tli-e2e-dryrun-data',
        volumeAbsent: true,
      })
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

  it('fails closed at docker_info and still removes the container and volume', async () => {
    const calls: { readonly command: string; readonly args: readonly string[] }[] = []
    const runner: CommandRunner = (command, args) => {
      calls.push({ command, args })
      if (command === 'docker' && args[0] === 'volume' && args[1] === 'inspect') {
        return processResult('', 1)
      }
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
      && call.args[2] === '-v' && call.args[3] === TLI_E2E_CONTAINER_NAME)).toHaveLength(2)
    expect(calls.filter((call) => call.command === 'docker'
      && call.args[0] === 'volume' && call.args[1] === 'rm'
      && call.args[2] === '-f' && call.args[3] === 'tli-e2e-dryrun-data')).toHaveLength(2)
  })

  it('fails closed when the scratch data volume remains after cleanup', async () => {
    const runner: CommandRunner = (command, args) => {
      if (command === 'docker' && args[0] === 'volume' && args[1] === 'ls') {
        return processResult('tli-e2e-dryrun-data\n')
      }
      return command === 'docker' && args[0] === 'info'
        ? processResult('', 1)
        : processResult()
    }
    const report = await runDryRunPipeline({
      fixture: 'happy',
      prodSchemaPath: '/fixture/not-read-before-docker-info.sql',
      outputPath: '/fixture/not-written-by-pipeline.json',
    }, { scratchPostgres: new ScratchPostgres(runner) })

    expect(report.stages.at(-1)).toMatchObject({
      name: 'cleanup',
      status: 'fail_closed',
      summary: { containerAbsent: true, volumeAbsent: false },
    })
    expect(report.errors).toContain('scratch PostgreSQL container or data volume absence could not be verified')
  })
})
