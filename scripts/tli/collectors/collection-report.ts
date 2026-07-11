export interface CollectionReport {
  readonly requested: number
  readonly succeeded: number
  readonly failed: number
  readonly persistenceFailed: number
}

export const emptyCollectionReport = (): CollectionReport => ({
  requested: 0,
  succeeded: 0,
  failed: 0,
  persistenceFailed: 0,
})

export const collectionReportHasFailures = (report: CollectionReport): boolean =>
  report.failed > 0 || report.persistenceFailed > 0

export const collectionReportFailureCount = (report: CollectionReport): number =>
  Math.max(report.failed, report.persistenceFailed)
