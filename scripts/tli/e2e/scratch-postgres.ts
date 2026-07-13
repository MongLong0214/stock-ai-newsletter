import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { TLI_E2E_CONTAINER_NAME, TLI_E2E_VOLUME_NAME } from './contracts'
import type { CycleFreezeContract, StudyLockContract } from './cycle-freeze-contract'
import { parsePostgresRehearsalReceipt, type Todo12LifecycleReceipt } from './todo12-lifecycle-receipt'
import type { Todo12RollbackBranchReceipt } from './todo12-rollback-branch-receipt'

const POSTGRES_IMAGE = 'postgres:17'
const POSTGRES_READY_SENTINEL = 'PostgreSQL init process complete; ready for start up.'
const MIGRATIONS = [
  'supabase/migrations/049_tli_experiment_cycles.sql',
  'supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql',
  'supabase/migrations/051_tli_fix_observation_trigger_binding.sql',
  'supabase/migrations/052_tli_abstain_sentinel_db_guard.sql',
  'supabase/migrations/053_tli_label_guard_and_legacy_prediction_upsert.sql',
] as const

const SHIMS = `DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE PUBLICATION supabase_realtime;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION extensions.gen_random_uuid()
RETURNS UUID LANGUAGE sql VOLATILE PARALLEL SAFE
AS 'SELECT pg_catalog.gen_random_uuid()';
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB LANGUAGE sql STABLE AS 'SELECT NULL::JSONB';
`

export type CommandRunner = (
  command: string,
  args: readonly string[],
  input?: string,
) => SpawnSyncReturns<string>

const defaultRunner: CommandRunner = (command, args, input) => spawnSync(command, [...args], {
  cwd: process.cwd(),
  encoding: 'utf8',
  input,
})

interface ScratchResourceRemoval {
  readonly container: SpawnSyncReturns<string>
  readonly volume: SpawnSyncReturns<string>
}

export const forceRemoveScratchResources = (
  runner: CommandRunner = defaultRunner,
): ScratchResourceRemoval => ({
  container: runner('docker', ['rm', '-f', '-v', TLI_E2E_CONTAINER_NAME]),
  volume: runner('docker', ['volume', 'rm', '-f', TLI_E2E_VOLUME_NAME]),
})

const outputOf = (result: SpawnSyncReturns<string>): string => (
  result.stderr || result.stdout || `exit ${String(result.status)}`
).trim()

export class ScratchPostgresError extends Error {
  readonly name = 'ScratchPostgresError'

  constructor(readonly step: string, detail: string) {
    super(`${step}: ${detail}`)
  }
}

export interface ScratchPostgresReceipt {
  readonly image: typeof POSTGRES_IMAGE
  readonly serverVersion: string
  readonly migrations: typeof MIGRATIONS
  readonly positiveRehearsal: true
  readonly collectionAppendContract: 'separate_immutable_runs'
  readonly studyLockRehearsal: StudyLockReceipt
  readonly lifecycleRehearsal: Todo12LifecycleReceipt
  readonly rollbackBranches: Todo12RollbackBranchReceipt
}

export interface ScratchCleanupReceipt {
  readonly rmForceIssued: true
  readonly rmForceExitStatus: number | null
  readonly containerAbsent: boolean
  readonly volumeName: typeof TLI_E2E_VOLUME_NAME
  readonly volumeRmForceIssued: true
  readonly volumeRmForceExitStatus: number | null
  readonly volumeAbsent: boolean
}

export interface StudyLockReceipt {
  readonly studyContractId: string
  readonly payloadSha256: string
  readonly lockedAt: string
  readonly lockedBeforeFirstOrigin: boolean
  readonly storage: 'tli_attention_study_contracts'
}

export interface CycleFreezeReceipt {
  readonly cycleId: string
  readonly status: 'frozen'
  readonly freezeRpc: 'freeze_tli_cycle'
  readonly evidenceArtifactCount: 4
  readonly evidenceAttestationCount: 4
  readonly hashBundleExact: boolean
  readonly sourceDatasetManifestSha256: string
  readonly datasetManifestSha256: string
  readonly modelManifestSha256: string
  readonly cycleManifestSha256: string
}

export class ScratchPostgres {
  private started = false

  constructor(private readonly runner: CommandRunner = defaultRunner) {}

  cleanup(): ScratchCleanupReceipt {
    const removal = forceRemoveScratchResources(this.runner)
    const containerVerification = this.runner('docker', [
      'ps', '-a', '--filter', `name=^/${TLI_E2E_CONTAINER_NAME}$`, '--format', '{{.Names}}',
    ])
    const volumeVerification = this.runner('docker', [
      'volume', 'ls', '--quiet', '--filter', `name=${TLI_E2E_VOLUME_NAME}`,
    ])
    const remainingVolumes = volumeVerification.stdout.trim().split('\n').filter(Boolean)
    this.started = false
    return {
      rmForceIssued: true,
      rmForceExitStatus: removal.container.status,
      containerAbsent: containerVerification.status === 0
        && containerVerification.stdout.trim().length === 0,
      volumeName: TLI_E2E_VOLUME_NAME,
      volumeRmForceIssued: true,
      volumeRmForceExitStatus: removal.volume.status,
      volumeAbsent: volumeVerification.status === 0
        && !remainingVolumes.includes(TLI_E2E_VOLUME_NAME),
    }
  }

  private run(command: string, args: readonly string[], step: string, input?: string): SpawnSyncReturns<string> {
    const result = this.runner(command, args, input)
    if (result.status !== 0) throw new ScratchPostgresError(step, outputOf(result))
    return result
  }

  private psql(input: string, step: string): void {
    this.run('docker', [
      'exec', '-i', TLI_E2E_CONTAINER_NAME,
      'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
    ], step, input)
  }

  private contractRehearsal(action: 'study-lock' | 'cycle-freeze', input: unknown): unknown {
    const result = this.run(process.execPath, [
      '--import', 'tsx',
      'scripts/tli/e2e/postgres-contract-rehearsal.ts',
      TLI_E2E_CONTAINER_NAME,
      action,
    ], action, JSON.stringify(input))
    const lastLine = result.stdout.trim().split('\n').at(-1)
    if (lastLine === undefined) throw new ScratchPostgresError(action, 'contract rehearsal returned no receipt')
    try {
      return JSON.parse(lastLine) as unknown
    } catch {
      throw new ScratchPostgresError(action, `contract rehearsal returned invalid JSON: ${lastLine}`)
    }
  }

  seedStudyLock(contract: StudyLockContract): StudyLockReceipt {
    const receipt = this.contractRehearsal('study-lock', contract)
    if (receipt === null || typeof receipt !== 'object'
      || !('studyContractId' in receipt) || typeof receipt.studyContractId !== 'string'
      || !('payloadSha256' in receipt) || typeof receipt.payloadSha256 !== 'string'
      || !('lockedAt' in receipt) || typeof receipt.lockedAt !== 'string'
      || !('lockedBeforeFirstOrigin' in receipt) || typeof receipt.lockedBeforeFirstOrigin !== 'boolean'
      || !('storage' in receipt) || receipt.storage !== 'tli_attention_study_contracts') {
      throw new ScratchPostgresError('study-lock', 'contract rehearsal receipt has an invalid shape')
    }
    return receipt as StudyLockReceipt
  }

  freezeCycle(contract: CycleFreezeContract): CycleFreezeReceipt {
    const receipt = this.contractRehearsal('cycle-freeze', contract)
    if (receipt === null || typeof receipt !== 'object'
      || !('cycleId' in receipt) || typeof receipt.cycleId !== 'string'
      || !('status' in receipt) || receipt.status !== 'frozen'
      || !('freezeRpc' in receipt) || receipt.freezeRpc !== 'freeze_tli_cycle'
      || !('evidenceArtifactCount' in receipt) || receipt.evidenceArtifactCount !== 4
      || !('evidenceAttestationCount' in receipt) || receipt.evidenceAttestationCount !== 4
      || !('hashBundleExact' in receipt) || typeof receipt.hashBundleExact !== 'boolean'
      || !('sourceDatasetManifestSha256' in receipt) || typeof receipt.sourceDatasetManifestSha256 !== 'string'
      || !('datasetManifestSha256' in receipt) || typeof receipt.datasetManifestSha256 !== 'string'
      || !('modelManifestSha256' in receipt) || typeof receipt.modelManifestSha256 !== 'string'
      || !('cycleManifestSha256' in receipt) || typeof receipt.cycleManifestSha256 !== 'string') {
      throw new ScratchPostgresError('cycle-freeze', 'contract rehearsal receipt has an invalid shape')
    }
    return receipt as CycleFreezeReceipt
  }

  start(prodSchemaPath: string, studyContract: StudyLockContract): ScratchPostgresReceipt {
    this.cleanup()
    this.run('docker', ['info'], 'docker_info')
    this.run('docker', [
      'run', '--name', TLI_E2E_CONTAINER_NAME,
      '--mount', `type=volume,source=${TLI_E2E_VOLUME_NAME},target=/var/lib/postgresql/data`,
      '-e', 'POSTGRES_PASSWORD=postgres', '-d', POSTGRES_IMAGE,
    ], 'docker_run')
    this.started = true

    let ready = false
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const logs = this.runner('docker', ['logs', TLI_E2E_CONTAINER_NAME])
      const initComplete = logs.status === 0
        && `${logs.stdout}\n${logs.stderr}`.includes(POSTGRES_READY_SENTINEL)
      const result = this.runner('docker', [
        'exec', TLI_E2E_CONTAINER_NAME, 'pg_isready', '-U', 'postgres',
      ])
      if (initComplete && result.status === 0) {
        ready = true
        break
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
    }
    if (!ready) throw new ScratchPostgresError('postgres_readiness', 'pg_isready did not succeed')

    this.psql(SHIMS, 'postgres_shims')
    const schema = readFileSync(prodSchemaPath, 'utf8')
      .replace(/^.*CREATE EXTENSION IF NOT EXISTS "supabase_vault".*(?:\r?\n|$)/gm, '')
    this.psql(schema, 'prod_schema')
    for (const migration of MIGRATIONS) {
      this.psql(readFileSync(migration, 'utf8'), migration)
    }

    const version = this.run('docker', [
      'exec', TLI_E2E_CONTAINER_NAME,
      'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
      '-c', 'SHOW server_version;',
    ], 'server_version').stdout.trim()
    const studyLockRehearsal = this.seedStudyLock(studyContract)
    const rehearsal = this.run(process.execPath, [
      '--import', 'tsx',
      'scripts/tli/e2e/postgres-rehearsal.ts',
      TLI_E2E_CONTAINER_NAME,
    ], 'positive_rehearsal')
    const rehearsalReceipt = parsePostgresRehearsalReceipt(rehearsal.stdout)
    return {
      image: POSTGRES_IMAGE,
      serverVersion: version,
      migrations: MIGRATIONS,
      positiveRehearsal: true,
      collectionAppendContract: 'separate_immutable_runs',
      studyLockRehearsal,
      lifecycleRehearsal: rehearsalReceipt.lifecycle,
      rollbackBranches: rehearsalReceipt.rollbackBranches,
    }
  }

  isStarted(): boolean {
    return this.started
  }
}
