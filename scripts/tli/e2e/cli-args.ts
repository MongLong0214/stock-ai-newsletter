import { resolve } from 'node:path'

import { z } from 'zod'

import type { DryRunFixture } from './contracts'

const fixtureSchema = z.enum(['happy', 'no-signal', 'missing-source'])

export interface DryRunCliArgs {
  readonly fixture: DryRunFixture
  readonly prodSchemaPath: string
  readonly outputPath: string
}

const readFlag = (argument: string): readonly [string, string] => {
  const separator = argument.indexOf('=')
  if (!argument.startsWith('--') || separator < 3 || separator === argument.length - 1) {
    throw new TypeError(`invalid argument '${argument}'; expected --name=value`)
  }
  return [argument.slice(2, separator), argument.slice(separator + 1)]
}

export function parseDryRunCliArgs(argv: readonly string[]): DryRunCliArgs {
  const values = new Map<string, string>()
  for (const argument of argv) {
    const [name, value] = readFlag(argument)
    if (!['fixture', 'prod-schema', 'output'].includes(name)) {
      throw new TypeError(`unknown argument --${name}`)
    }
    if (values.has(name)) throw new TypeError(`duplicate argument --${name}`)
    values.set(name, value)
  }

  const fixture = fixtureSchema.parse(values.get('fixture'))
  const prodSchema = values.get('prod-schema')
  const output = values.get('output')
  if (prodSchema === undefined) throw new TypeError('missing required --prod-schema=path')
  if (output === undefined) throw new TypeError('missing required --output=path')

  return {
    fixture,
    prodSchemaPath: resolve(prodSchema),
    outputPath: resolve(output),
  }
}
