import { z } from 'zod'

const passSchema = z.literal('pass')
const rpcSchema = z.enum([
  'record_tli_canary_failure',
  'hold_tli_public_release',
  'resume_tli_public_release',
])

const rejectionSchema = z.object({
  rpc: rpcSchema,
  expectedSqlstate: z.literal('22023'),
  observedSqlstate: z.literal('22023'),
  message: z.string().min(1),
  stateUnchanged: z.literal(true),
}).strict()

const holdRejectionsSchema = z.array(rejectionSchema.extend({
  mismatch: z.enum(['cycle', 'event', 'hash', 'reason']),
})).length(4).superRefine((rejections, context) => {
  const expected = ['cycle', 'event', 'hash', 'reason'] as const
  expected.forEach((mismatch, index) => {
    if (rejections[index]?.mismatch !== mismatch) {
      context.addIssue({
        code: 'custom',
        path: [index, 'mismatch'],
        message: `expected ${mismatch}`,
      })
    }
    if (rejections[index]?.rpc !== 'hold_tli_public_release') {
      context.addIssue({
        code: 'custom',
        path: [index, 'rpc'],
        message: 'expected hold_tli_public_release',
      })
    }
  })
})

const publicStateSchema = z.object({
  releaseEventId: z.string().uuid(),
  cycleStatus: z.literal('public_approved'),
  candidateStatus: z.literal('champion'),
  evidenceCreated: z.literal(true),
  releaseEventCreated: z.literal(true),
}).strict()

export const todo12RollbackBranchReceiptSchema = z.object({
  receiptVersion: z.literal('todo12-rollback-branches-v1'),
  status: passSchema,
  cycleId: z.string().uuid(),
  canaryFailure: z.object({
    rpc: z.literal('record_tli_canary_failure'),
    transientCycleStatus: z.literal('safety_hold'),
    transientCandidateStatus: z.literal('archived'),
    transientCandidateRelease: z.literal('blocked'),
    evidenceCreated: z.literal(true),
    releaseEventCreated: z.literal(true),
    transactionRolledBack: z.literal(true),
    restoredCycleStatus: z.literal('promoted_internal'),
    restoredCandidateStatus: z.literal('challenger'),
    restoredCandidateRelease: z.literal('internal'),
    stateRestored: z.literal(true),
  }).strict(),
  holdRejections: holdRejectionsSchema,
  publicHold: publicStateSchema.extend({
    rpc: z.literal('hold_tli_public_release'),
    candidateRelease: z.literal('blocked'),
    claimReason: z.literal('monitoring_hold:source_outage'),
    publicViewCount: z.literal(0),
  }),
  resumeRejection: rejectionSchema.extend({
    probe: z.literal('non_allowlisted_reason'),
    rpc: z.literal('resume_tli_public_release'),
  }),
  publicResume: publicStateSchema.extend({
    rpc: z.literal('resume_tli_public_release'),
    candidateRelease: z.literal('public'),
    claimReason: z.literal('monitoring_resume_verified'),
    publicViewCount: z.literal(20),
  }),
}).strict()

export type Todo12RollbackBranchReceipt = z.infer<typeof todo12RollbackBranchReceiptSchema>

export function parseTodo12RollbackBranchReceipt(output: string): Todo12RollbackBranchReceipt {
  const receiptLine = output.trim().split('\n')
    .find((line) => line.includes('"todo12-rollback-branches-v1"'))
  if (receiptLine === undefined) {
    throw new TypeError('Todo 12 rollback branch rehearsal returned no receipt')
  }
  let value: unknown
  try {
    value = JSON.parse(receiptLine) as unknown
  } catch {
    throw new TypeError(`Todo 12 rollback branch rehearsal returned invalid JSON: ${receiptLine}`)
  }
  return todo12RollbackBranchReceiptSchema.parse(value)
}
