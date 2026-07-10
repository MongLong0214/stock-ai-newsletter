import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import { join } from 'node:path'

import { parseDryRunCliArgs } from './cli-args'
import { forceRemoveScratchResources } from './scratch-postgres'

const SENSITIVE_ENV_NAME = /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_KEY|SERVICE_ROLE_KEY|DATABASE_URL)(?:$|_)/i

interface DryRunPipelineModule {
  readonly runDryRunPipeline: typeof import('./pipeline')['runDryRunPipeline']
}

const isDryRunPipelineModule = (value: unknown): value is DryRunPipelineModule => (
  value !== null
    && typeof value === 'object'
    && 'runDryRunPipeline' in value
    && typeof value.runDryRunPipeline === 'function'
)

export async function loadIsolatedDryRunPipeline(): Promise<DryRunPipelineModule> {
  for (const name of Object.keys(process.env)) {
    if (SENSITIVE_ENV_NAME.test(name)) delete process.env[name]
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'tli-e2e-disabled-service-role'
  process.env.TLI_M1_PROMOTION_ENABLED = 'false'
  process.env.TLI_PREDICTIONS_V3_EXPOSURE_ENABLED = 'false'
  process.env.TLI_E2E_DRY_RUN = 'true'

  const originalCwd = process.cwd()
  const isolatedCwd = mkdtempSync(join(tmpdir(), 'tli-e2e-import-'))
  try {
    process.chdir(isolatedCwd)
    const loaded = await import('./pipeline')
    const candidate: unknown = 'default' in loaded ? loaded.default : loaded
    if (!isDryRunPipelineModule(candidate)) {
      throw new TypeError('isolated Todo 15 pipeline module has an invalid export surface')
    }
    return candidate
  } finally {
    process.chdir(originalCwd)
    rmSync(isolatedCwd, { recursive: true, force: true })
  }
}

export async function runScientificDryRunCli(argv: readonly string[]): Promise<number> {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write([
      'Usage: pnpm run tli:e2e:dry-run --fixture=<happy|no-signal|missing-source> --prod-schema=<path> --output=<path>',
      '',
    ].join('\n'))
    return 0
  }
  const args = parseDryRunCliArgs(argv)
  const { runDryRunPipeline } = await loadIsolatedDryRunPipeline()
  const report = await runDryRunPipeline(args)
  mkdirSync(dirname(args.outputPath), { recursive: true })
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  return report.exitCode
}

const isDirectRun = /run-scientific-dry-run\.(?:ts|js)$/.test(process.argv[1] ?? '')

if (isDirectRun) {
  const onSignal = (signal: NodeJS.Signals): void => {
    forceRemoveScratchResources()
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }
  const onInterrupt = (): void => onSignal('SIGINT')
  const onTerminate = (): void => onSignal('SIGTERM')
  process.once('SIGINT', onInterrupt)
  process.once('SIGTERM', onTerminate)
  runScientificDryRunCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 2
    })
    .finally(() => {
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
    })
}
