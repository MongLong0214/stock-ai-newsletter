import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { buildStudyLockContract } from './cycle-freeze-contract'
import { buildFixtureOriginStack } from './fixture-origins'
import { TLI_E2E_CONTAINER_NAME } from './contracts'
import {
  forceRemoveScratchResources,
  ScratchPostgres,
  type ScratchPostgresReceipt,
} from './scratch-postgres'
import { todo12LifecycleEvidenceSchema } from './todo12-lifecycle-receipt'
import { buildTodo12LifecycleSourceProvenance } from './todo12-lifecycle-source-provenance'

interface LifecycleCliArgs {
  readonly prodSchemaPath: string
  readonly outputPath: string
}

const parseArgs = (argv: readonly string[]): LifecycleCliArgs => {
  const values = new Map<string, string>()
  for (const argument of argv) {
    const separator = argument.indexOf('=')
    if (!argument.startsWith('--') || separator < 3 || separator === argument.length - 1) {
      throw new TypeError(`invalid argument '${argument}'; expected --name=value`)
    }
    const name = argument.slice(2, separator)
    if (name !== 'prod-schema' && name !== 'output') {
      throw new TypeError(`unknown argument --${name}`)
    }
    if (values.has(name)) throw new TypeError(`duplicate argument --${name}`)
    values.set(name, argument.slice(separator + 1))
  }
  const prodSchemaPath = values.get('prod-schema')
  const outputPath = values.get('output')
  if (prodSchemaPath === undefined) throw new TypeError('missing required --prod-schema=path')
  if (outputPath === undefined) throw new TypeError('missing required --output=path')
  return { prodSchemaPath: resolve(prodSchemaPath), outputPath: resolve(outputPath) }
}

const buildEvidence = (
  scratchReceipt: ScratchPostgresReceipt,
  gitCommitSha: string,
  execution: { readonly startedAt: string; readonly completedAt: string },
  cleanup: ReturnType<ScratchPostgres['cleanup']>,
) => todo12LifecycleEvidenceSchema.parse({
  ...scratchReceipt.lifecycleRehearsal,
  rollbackBranches: scratchReceipt.rollbackBranches,
  sourceProvenance: buildTodo12LifecycleSourceProvenance(gitCommitSha),
  execution: { ...execution, containerName: TLI_E2E_CONTAINER_NAME },
  postgres: {
    image: scratchReceipt.image,
    serverVersion: scratchReceipt.serverVersion,
    migrations: scratchReceipt.migrations,
  },
  cleanup,
})

export const runTodo12LifecycleRehearsal = async (argv: readonly string[]): Promise<number> => {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write('Usage: npm run tli:lifecycle:rehearse -- --prod-schema=<path> --output=<path>\n')
    return 0
  }
  const args = parseArgs(argv)
  rmSync(args.outputPath, { force: true })
  const startedAt = new Date().toISOString()
  const stack = await buildFixtureOriginStack()
  const gitCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const studyContract = buildStudyLockContract({ stack, gitCommitSha })
  const scratch = new ScratchPostgres()
  let scratchReceipt: ScratchPostgresReceipt | undefined
  let failure: { readonly error: unknown } | undefined
  try {
    scratchReceipt = scratch.start(args.prodSchemaPath, studyContract)
  } catch (error) {
    failure = { error }
  }
  const cleanup = scratch.cleanup()
  if (failure !== undefined) throw failure.error
  if (scratchReceipt === undefined) throw new Error('lifecycle rehearsal returned no scratch PostgreSQL receipt')
  const evidence = buildEvidence(
    scratchReceipt,
    gitCommitSha,
    { startedAt, completedAt: new Date().toISOString() },
    cleanup,
  )
  mkdirSync(dirname(args.outputPath), { recursive: true })
  writeFileSync(args.outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  return 0
}

const isDirectRun = /run-todo12-lifecycle-rehearsal\.(?:ts|js)$/.test(process.argv[1] ?? '')

if (isDirectRun) {
  const onSignal = (exitCode: 130 | 143): void => {
    forceRemoveScratchResources()
    process.exit(exitCode)
  }
  const onInterrupt = (): void => onSignal(130)
  const onTerminate = (): void => onSignal(143)
  process.once('SIGINT', onInterrupt)
  process.once('SIGTERM', onTerminate)
  runTodo12LifecycleRehearsal(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
    .finally(() => {
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
    })
}
