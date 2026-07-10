import { z } from 'zod'

export const lifecycleTransitionNames = [
  'draft',
  'freeze',
  'start',
  'confirmatory_enroll',
  'origin_attest',
  'prediction_insert',
  'scoring_rpc',
  'safety',
  'final',
  'internal',
  'canary_enroll',
  'canary_attest',
  'canary_prediction_insert',
  'canary_scoring_rpc',
  'public_swap',
] as const

export const lifecycleRejectionNames = [
  'terminal_enrollment',
  'three_canary_release',
  'direct_prediction_update',
] as const

const verdictSchema = z.literal('pass')
const expectedLifecycleTransitions = [
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
] as const
const expectedLifecycleRejections = [
  ['terminal_enrollment', '55000'],
  ['three_canary_release', '55000'],
  ['direct_prediction_update', '42501'],
] as const
const transitionSchema = z.object({
  order: z.number().int().positive(),
  transition: z.enum(lifecycleTransitionNames),
  beforeStatus: z.string().nullable(),
  afterStatus: z.string().nullable(),
  observed: z.record(z.string(), z.unknown()).refine(
    (observed) => Object.keys(observed).length > 0,
    'transition observation must not be empty',
  ),
  verdict: verdictSchema,
})
const rejectionSchema = z.object({
  probe: z.enum(lifecycleRejectionNames),
  expectedSqlstate: z.string().regex(/^[0-9A-Z]{5}$/),
  observedSqlstate: z.string().regex(/^[0-9A-Z]{5}$/),
  message: z.string().min(1),
  stateUnchanged: z.literal(true),
  verdict: verdictSchema,
})

const transitionsSchema = z.array(transitionSchema)
  .length(expectedLifecycleTransitions.length)
  .superRefine((transitions, context) => {
    expectedLifecycleTransitions.forEach(([transition, beforeStatus, afterStatus], index) => {
      const actual = transitions[index]
      if (actual?.order !== index + 1) {
        context.addIssue({ code: 'custom', path: [index, 'order'], message: `expected order ${index + 1}` })
      }
      if (actual?.transition !== transition) {
        context.addIssue({ code: 'custom', path: [index, 'transition'], message: `expected ${transition}` })
      }
      if (actual?.beforeStatus !== beforeStatus) {
        context.addIssue({ code: 'custom', path: [index, 'beforeStatus'], message: `expected ${String(beforeStatus)}` })
      }
      if (actual?.afterStatus !== afterStatus) {
        context.addIssue({ code: 'custom', path: [index, 'afterStatus'], message: `expected ${afterStatus}` })
      }
    })
  })

const rejectionsSchema = z.array(rejectionSchema)
  .length(expectedLifecycleRejections.length)
  .superRefine((rejections, context) => {
    expectedLifecycleRejections.forEach(([probe, sqlstate], index) => {
      const actual = rejections[index]
      if (actual?.probe !== probe) {
        context.addIssue({ code: 'custom', path: [index, 'probe'], message: `expected ${probe}` })
      }
      if (actual?.expectedSqlstate !== sqlstate) {
        context.addIssue({ code: 'custom', path: [index, 'expectedSqlstate'], message: `expected ${sqlstate}` })
      }
      if (actual?.observedSqlstate !== sqlstate) {
        context.addIssue({ code: 'custom', path: [index, 'observedSqlstate'], message: `expected ${sqlstate}` })
      }
    })
  })

export const todo12LifecycleReceiptSchema = z.object({
  receiptVersion: z.literal('todo12-lifecycle-rehearsal-v1'),
  status: verdictSchema,
  cycleId: z.string().uuid(),
  transactionIsolation: z.object({
    mode: z.literal('committed_stage_groups'),
    guardGucResetChecks: z.literal(23),
    allGuardsReset: z.literal(true),
  }),
  transitions: transitionsSchema,
  rejections: rejectionsSchema,
  counts: z.object({
    confirmatoryOrigins: z.literal(16),
    safetyOrigins: z.literal(8),
    finalOrigins: z.literal(16),
    publicCanaries: z.literal(4),
    originAttestations: z.literal(20),
    scientificPredictions: z.literal(40),
    scoringFinalizations: z.literal(40),
  }),
  publicSwap: z.object({
    oldChampionStatus: z.literal('archived'),
    candidateStatus: z.literal('champion'),
    candidateRelease: z.literal('public'),
  }),
})

export const todo12LifecycleEvidenceSchema = todo12LifecycleReceiptSchema.extend({
  execution: z.object({
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    containerName: z.literal('tli-e2e-dryrun'),
  }),
  postgres: z.object({
    image: z.literal('postgres:17'),
    serverVersion: z.string().min(1),
    migrations: z.tuple([
      z.literal('supabase/migrations/049_tli_experiment_cycles.sql'),
      z.literal('supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql'),
      z.literal('supabase/migrations/051_tli_fix_observation_trigger_binding.sql'),
    ]),
  }),
  cleanup: z.object({
    rmForceIssued: z.literal(true),
    rmForceExitStatus: z.literal(0),
    containerAbsent: z.literal(true),
    volumeName: z.literal('tli-e2e-dryrun-data'),
    volumeRmForceIssued: z.literal(true),
    volumeRmForceExitStatus: z.literal(0),
    volumeAbsent: z.literal(true),
  }),
})

const postgresRehearsalReceiptSchema = z.object({
  status: verdictSchema,
  sources: z.tuple([z.literal('naver_news'), z.literal('naver_datalab')]),
  identicalPayloadContract: z.literal('separate_immutable_runs'),
  runCount: z.literal(3),
  lifecycle: todo12LifecycleReceiptSchema,
})

export type Todo12LifecycleReceipt = z.infer<typeof todo12LifecycleReceiptSchema>
export type Todo12LifecycleEvidence = z.infer<typeof todo12LifecycleEvidenceSchema>
export type PostgresRehearsalReceipt = z.infer<typeof postgresRehearsalReceiptSchema>

export function parsePostgresRehearsalReceipt(output: string): PostgresRehearsalReceipt {
  const lastLine = output.trim().split('\n').at(-1)
  if (lastLine === undefined) throw new TypeError('postgres rehearsal returned no receipt')
  let value: unknown
  try {
    value = JSON.parse(lastLine) as unknown
  } catch {
    throw new TypeError(`postgres rehearsal returned invalid JSON: ${lastLine}`)
  }
  return postgresRehearsalReceiptSchema.parse(value)
}
