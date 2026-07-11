import type { CollectionReport } from './collection-report'
import type { CollectionRunTransport } from './collection-run-store'

export interface DatalabTheme {
  readonly id: string
  readonly name: string
  readonly naverKeywords: string[]
}

export interface InterestMetric {
  readonly themeId: string
  readonly date: string
  readonly rawValue: number
  readonly normalized: number
  readonly anchorScaledValue?: number | null
}

export interface DatalabCollectionOptions {
  readonly transport?: CollectionRunTransport
}

export interface DatalabCollectionResult {
  readonly metrics: InterestMetric[]
  readonly report: CollectionReport
}
