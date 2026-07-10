export const TLI_E2E_CONTAINER_NAME = 'tli-e2e-dryrun'
export const TLI_E2E_VOLUME_NAME = 'tli-e2e-dryrun-data'

export type DryRunFixture = 'happy' | 'no-signal' | 'missing-source'
export type DryRunStatus = 'pass' | 'no_promotion' | 'fail_closed' | 'failed'
export type StageStatus = 'pass' | 'no_go' | 'fail_closed' | 'skipped'

export interface DryRunStage {
  readonly name: string
  readonly status: StageStatus
  readonly summary: Readonly<Record<string, unknown>>
}

export interface LeakageAudit {
  readonly duplicate: number
  readonly missing: number
  readonly futureLeakage: number
  readonly currentMembershipLeakage: number
  readonly postOutcomeSource: number
  readonly mixedStudy: number
  readonly crossCycleRoleJoin: number
  readonly v1Mix: number
  readonly nullToFalse: number
  readonly challengerReplacement: number
}

export interface ExactFiveAudit {
  readonly eligible: number
  readonly total: number
  readonly rate: number
}

export interface CycleProbe {
  readonly plannedOrigins: 16 | 24
  readonly observedOrigins: number
  readonly checkpoint: string
  readonly action: string
  readonly decision: string | null
}

export interface DryRunReport {
  readonly reportVersion: 'tli-scientific-e2e-dry-run-v1'
  readonly fixture: DryRunFixture
  readonly status: DryRunStatus
  readonly expectedSatisfied: boolean
  readonly exitCode: number
  readonly containerName: typeof TLI_E2E_CONTAINER_NAME
  readonly startedAt: string
  readonly completedAt: string
  readonly stages: readonly DryRunStage[]
  readonly audit: LeakageAudit
  readonly exactFive: ExactFiveAudit
  readonly cycleProbes: readonly CycleProbe[]
  readonly metrics: Readonly<Record<string, unknown>>
  readonly contractDefects: readonly string[]
  readonly risks: readonly string[]
  readonly errors: readonly string[]
}

export const emptyLeakageAudit = (): LeakageAudit => ({
  duplicate: 0,
  missing: 0,
  futureLeakage: 0,
  currentMembershipLeakage: 0,
  postOutcomeSource: 0,
  mixedStudy: 0,
  crossCycleRoleJoin: 0,
  v1Mix: 0,
  nullToFalse: 0,
  challengerReplacement: 0,
})

export const skippedStage = (name: string): DryRunStage => ({
  name,
  status: 'skipped',
  summary: {},
})
