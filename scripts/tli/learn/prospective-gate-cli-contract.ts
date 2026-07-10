import { z } from 'zod'

import type { GateEvidenceKind } from './prospective-gate-evidence-render'

export const PROSPECTIVE_GATE_CLI_USAGE = [
  'Usage:',
  '  npm run tli:weekly-learn -- inspect [--cycle-id=<uuid>] [--json-output=<path>]',
  '  npm run tli:weekly-learn -- render-decision --kind=<safety|final> --cycle-id=<uuid> [--work-dir=<path>] [--json-output=<path>]',
  '  npm run tli:weekly-learn -- record-decision --kind=<safety|final> --cycle-id=<uuid> --evidence-commit=<sha> [--dry-run=<true|false>] [--json-output=<path>]',
].join('\n')

type SharedOptions = {
  readonly cycleId: string
  readonly jsonOutput: string | null
}

export type ProspectiveGateCliCommand =
  | { readonly command: 'help' }
  | { readonly command: 'inspect'; readonly cycleId: string | null; readonly jsonOutput: string | null }
  | (SharedOptions & {
      readonly command: 'render-decision'
      readonly kind: GateEvidenceKind
      readonly workDir: string | null
    })
  | (SharedOptions & {
      readonly command: 'record-decision'
      readonly kind: GateEvidenceKind
      readonly evidenceCommit: string
      readonly dryRun: boolean
    })

const canonicalUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
)
const gitObjectId = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)

const parseOptions = (args: readonly string[]): ReadonlyMap<string, string> => {
  const options = new Map<string, string>()
  for (const arg of args) {
    const match = /^--([a-z][a-z-]*)=(.+)$/.exec(arg)
    if (match === null) throw new TypeError(`invalid option syntax: ${arg}`)
    const [, name, value] = match
    if (options.has(name)) throw new TypeError(`duplicate option: --${name}`)
    options.set(name, value)
  }
  return options
}

const assertAllowed = (options: ReadonlyMap<string, string>, allowed: readonly string[]): void => {
  const unknown = [...options.keys()].filter((name) => !allowed.includes(name))
  if (unknown.length > 0) throw new TypeError(`unknown option: --${unknown[0]}`)
}

const required = (options: ReadonlyMap<string, string>, name: string): string => {
  const value = options.get(name)
  if (value === undefined) throw new TypeError(`missing required option: --${name}`)
  return value
}

const kind = (options: ReadonlyMap<string, string>): GateEvidenceKind => {
  const value = required(options, 'kind')
  if (value !== 'safety' && value !== 'final') throw new TypeError(`invalid decision kind: ${value}`)
  return value
}

const dryRun = (options: ReadonlyMap<string, string>): boolean => {
  const value = options.get('dry-run') ?? 'true'
  if (value !== 'true' && value !== 'false') throw new TypeError(`invalid dry-run value: ${value}`)
  return value === 'true'
}

export function parseProspectiveGateCli(args: readonly string[]): ProspectiveGateCliCommand {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help')) return { command: 'help' }
  const command = args[0]
  const options = parseOptions(args.slice(1))
  if (command === 'inspect') {
    assertAllowed(options, ['cycle-id', 'json-output'])
    const cycleId = options.get('cycle-id')
    return {
      command,
      cycleId: cycleId === undefined ? null : canonicalUuid.parse(cycleId),
      jsonOutput: options.get('json-output') ?? null,
    }
  }
  if (command === 'render-decision') {
    assertAllowed(options, ['cycle-id', 'kind', 'work-dir', 'json-output'])
    return {
      command,
      cycleId: canonicalUuid.parse(required(options, 'cycle-id')),
      kind: kind(options),
      workDir: options.get('work-dir') ?? null,
      jsonOutput: options.get('json-output') ?? null,
    }
  }
  if (command === 'record-decision') {
    assertAllowed(options, ['cycle-id', 'kind', 'evidence-commit', 'dry-run', 'json-output'])
    return {
      command,
      cycleId: canonicalUuid.parse(required(options, 'cycle-id')),
      kind: kind(options),
      evidenceCommit: gitObjectId.parse(required(options, 'evidence-commit')),
      dryRun: dryRun(options),
      jsonOutput: options.get('json-output') ?? null,
    }
  }
  throw new TypeError(`unknown command: ${command}`)
}
