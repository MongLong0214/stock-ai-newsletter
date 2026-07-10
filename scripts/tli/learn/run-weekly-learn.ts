import {
  resolveProspectiveCheckpoint,
  type ProspectiveCheckpoint,
  type ProspectiveLifecycleInput,
} from './prospective-gate-contract'

type Awaitable<T> = T | Promise<T>

interface ProspectiveCheckpointInput<SafetyInput, FinalInput> {
  readonly lifecycle: ProspectiveLifecycleInput
  readonly safetyInput: SafetyInput
  readonly finalInput: FinalInput
}

interface ProspectiveCheckpointDependencies<SafetyInput, FinalInput, SafetyResult, FinalResult> {
  readonly evaluateSafety: (input: SafetyInput) => Awaitable<SafetyResult>
  readonly evaluateFinal: (input: FinalInput) => Awaitable<FinalResult>
}

type ProspectiveCheckpointExecution<SafetyResult, FinalResult> =
  | {
      readonly checkpoint: Extract<ProspectiveCheckpoint, { readonly kind: 'safety_due' }>
      readonly evaluation: SafetyResult
    }
  | {
      readonly checkpoint: Extract<ProspectiveCheckpoint, { readonly kind: 'final_due' }>
      readonly evaluation: FinalResult
    }
  | {
      readonly checkpoint: Exclude<ProspectiveCheckpoint, { readonly kind: 'safety_due' | 'final_due' }>
    }

const assertNever = (value: never): never => {
  throw new Error(`unhandled prospective gate variant: ${JSON.stringify(value)}`)
}

export async function executeProspectiveCheckpoint<
  SafetyInput,
  FinalInput,
  SafetyResult,
  FinalResult,
>(
  input: ProspectiveCheckpointInput<SafetyInput, FinalInput>,
  dependencies: ProspectiveCheckpointDependencies<SafetyInput, FinalInput, SafetyResult, FinalResult>,
): Promise<ProspectiveCheckpointExecution<SafetyResult, FinalResult>> {
  const checkpoint = resolveProspectiveCheckpoint(input.lifecycle)

  switch (checkpoint.kind) {
    case 'safety_due':
      return {
        checkpoint,
        evaluation: await dependencies.evaluateSafety(input.safetyInput),
      }
    case 'final_due':
      return {
        checkpoint,
        evaluation: await dependencies.evaluateFinal(input.finalInput),
      }
    case 'insufficient_origins':
    case 'safety_evidence_missing':
    case 'already_recorded':
    case 'inactive_cycle':
    case 'invalid_lifecycle':
      return { checkpoint }
    default:
      return assertNever(checkpoint)
  }
}

type RecordableProspectiveDecision =
  | {
      readonly kind: 'safety'
      readonly cycleId: string
      readonly decision: 'pass'
      readonly action: 'safety_only'
    }
  | {
      readonly kind: 'safety'
      readonly cycleId: string
      readonly decision: 'safety_hold'
      readonly action: 'safety_hold'
    }
  | {
      readonly kind: 'final'
      readonly cycleId: string
      readonly decision: 'pass'
      readonly action: 'would_promote'
    }
  | {
      readonly kind: 'final'
      readonly cycleId: string
      readonly decision: 'reject'
      readonly action: 'keep_champion'
    }

interface ProspectiveDecisionRecordInput<Decision extends RecordableProspectiveDecision> {
  readonly dryRun: boolean
  readonly decision: Decision
}

type ProspectiveDecisionRecordResult<RecordResult> =
  | { readonly action: 'recording_disabled' }
  | { readonly action: 'would_record_safety' | 'would_record_final' }
  | { readonly action: 'recorded_safety' | 'recorded_final'; readonly result: RecordResult }

export async function recordProspectiveDecision<
  Decision extends RecordableProspectiveDecision,
  RecordResult,
>(
  input: ProspectiveDecisionRecordInput<Decision>,
  record: (decision: Decision) => Awaitable<RecordResult>,
): Promise<ProspectiveDecisionRecordResult<RecordResult>> {
  if (input.decision.kind === 'final' && input.decision.decision === 'pass'
    && process.env.TLI_M1_PROMOTION_ENABLED !== 'true') {
    return { action: 'recording_disabled' }
  }

  switch (input.decision.kind) {
    case 'safety':
      if (input.dryRun) return { action: 'would_record_safety' }
      return { action: 'recorded_safety', result: await record(input.decision) }
    case 'final':
      if (input.dryRun) return { action: 'would_record_final' }
      return { action: 'recorded_final', result: await record(input.decision) }
    default:
      return assertNever(input.decision)
  }
}

const isDirectRun = /run-weekly-learn\.(?:ts|js)$/.test(process.argv[1] ?? '')

if (isDirectRun) {
  import('./run-weekly-learn-cli').then(({ runWeeklyLearnCli }) => runWeeklyLearnCli()).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
