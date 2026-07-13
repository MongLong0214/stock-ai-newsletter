import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { z } from 'zod'

export const TODO12_LIFECYCLE_SOURCE_PATHS = [
  'scripts/tli/e2e/sql/todo12-lifecycle-rehearsal.sql',
  'scripts/tli/e2e/postgres-rehearsal.ts',
  'scripts/tli/e2e/todo12-rollback-branch-receipt.ts',
  'scripts/tli/e2e/run-todo12-lifecycle-rehearsal.ts',
] as const

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const sourceFileSchema = <Path extends string>(path: Path) => z.object({
  path: z.literal(path),
  sha256: sha256Schema,
}).strict()

export const todo12LifecycleSourceProvenanceSchema = z.object({
  gitCommitSha: z.string().regex(/^[0-9a-f]{40}$/),
  files: z.tuple([
    sourceFileSchema(TODO12_LIFECYCLE_SOURCE_PATHS[0]),
    sourceFileSchema(TODO12_LIFECYCLE_SOURCE_PATHS[1]),
    sourceFileSchema(TODO12_LIFECYCLE_SOURCE_PATHS[2]),
    sourceFileSchema(TODO12_LIFECYCLE_SOURCE_PATHS[3]),
  ]),
}).strict()

export type Todo12LifecycleSourceProvenance = z.infer<
  typeof todo12LifecycleSourceProvenanceSchema
>

const digestSource = (path: typeof TODO12_LIFECYCLE_SOURCE_PATHS[number]) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
})

export const buildTodo12LifecycleSourceProvenance = (
  gitCommitSha: string,
): Todo12LifecycleSourceProvenance => todo12LifecycleSourceProvenanceSchema.parse({
  gitCommitSha,
  files: [
    digestSource(TODO12_LIFECYCLE_SOURCE_PATHS[0]),
    digestSource(TODO12_LIFECYCLE_SOURCE_PATHS[1]),
    digestSource(TODO12_LIFECYCLE_SOURCE_PATHS[2]),
    digestSource(TODO12_LIFECYCLE_SOURCE_PATHS[3]),
  ],
})

export const verifyTodo12LifecycleSourceProvenance = (
  value: unknown,
): Todo12LifecycleSourceProvenance => {
  const provenance = todo12LifecycleSourceProvenanceSchema.parse(value)
  const current = buildTodo12LifecycleSourceProvenance(provenance.gitCommitSha)
  provenance.files.forEach((source, index) => {
    if (source.sha256 !== current.files[index].sha256) {
      throw new TypeError(`source digest mismatch for ${source.path}`)
    }
  })
  return provenance
}
