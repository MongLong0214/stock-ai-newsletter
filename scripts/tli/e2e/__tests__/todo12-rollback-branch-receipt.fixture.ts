export const buildTodo12RollbackBranchReceiptFixture = () => {
  const rejection = (mismatch: 'cycle' | 'event' | 'hash' | 'reason') => ({
    mismatch,
    rpc: 'hold_tli_public_release',
    expectedSqlstate: '22023',
    observedSqlstate: '22023',
    message: `${mismatch} rejected`,
    stateUnchanged: true,
  })

  return {
    receiptVersion: 'todo12-rollback-branches-v1',
    status: 'pass',
    cycleId: '12000012-0000-4000-8000-000000000012',
    canaryFailure: {
      rpc: 'record_tli_canary_failure',
      transientCycleStatus: 'safety_hold',
      transientCandidateStatus: 'archived',
      transientCandidateRelease: 'blocked',
      evidenceCreated: true,
      releaseEventCreated: true,
      transactionRolledBack: true,
      restoredCycleStatus: 'promoted_internal',
      restoredCandidateStatus: 'challenger',
      restoredCandidateRelease: 'internal',
      stateRestored: true,
    },
    holdRejections: ['cycle', 'event', 'hash', 'reason'].map((mismatch) => (
      rejection(mismatch as 'cycle' | 'event' | 'hash' | 'reason')
    )),
    publicHold: {
      rpc: 'hold_tli_public_release',
      releaseEventId: '12000008-0000-4000-8000-000000000021',
      cycleStatus: 'public_approved',
      candidateStatus: 'champion',
      candidateRelease: 'blocked',
      claimReason: 'monitoring_hold:source_outage',
      publicViewCount: 0,
      evidenceCreated: true,
      releaseEventCreated: true,
    },
    resumeRejection: {
      probe: 'non_allowlisted_reason',
      rpc: 'resume_tli_public_release',
      expectedSqlstate: '22023',
      observedSqlstate: '22023',
      message: 'reason rejected',
      stateUnchanged: true,
    },
    publicResume: {
      rpc: 'resume_tli_public_release',
      releaseEventId: '12000008-0000-4000-8000-000000000022',
      cycleStatus: 'public_approved',
      candidateStatus: 'champion',
      candidateRelease: 'public',
      claimReason: 'monitoring_resume_verified',
      publicViewCount: 20,
      evidenceCreated: true,
      releaseEventCreated: true,
    },
  }
}
