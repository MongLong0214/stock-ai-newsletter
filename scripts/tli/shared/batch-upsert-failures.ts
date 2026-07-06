export interface BatchUpsertCompletion {
  readonly label: string
  readonly rowCount: number
  readonly failedCount: number
}

export class BatchUpsertPartialFailureError extends Error {
  readonly label: string
  readonly rowCount: number
  readonly failedCount: number
  readonly persistedCount: number

  constructor(input: BatchUpsertCompletion) {
    const persistedCount = Math.max(0, input.rowCount - input.failedCount)
    super(`${input.label} 부분 저장 실패 (${input.failedCount}/${input.rowCount}건 실패, ${persistedCount}건 저장됨)`)
    this.name = 'BatchUpsertPartialFailureError'
    this.label = input.label
    this.rowCount = input.rowCount
    this.failedCount = input.failedCount
    this.persistedCount = persistedCount
  }
}

export function assertBatchUpsertComplete(input: BatchUpsertCompletion): void {
  if (input.failedCount <= 0) return
  throw new BatchUpsertPartialFailureError(input)
}
