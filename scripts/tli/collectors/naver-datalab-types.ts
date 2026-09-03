import type { CollectionReport } from './collection-report'
import type { CollectionRunTransport } from './collection-run-store'
import type { NaverDatalabRequest, NaverDatalabResponse } from './naver-datalab-api'
import type { ReusableDatalabRun } from './naver-datalab-reuse'

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
  readonly reuseRuns?: ReadonlyMap<string, ReusableDatalabRun>
  readonly previousTradingDate?: string
  readonly forceRefresh?: boolean
  readonly reserveAttempt?: () => Promise<void>
  readonly callDatalab?: (request: NaverDatalabRequest) => Promise<NaverDatalabResponse>
}

export interface DatalabCollectionResult {
  readonly metrics: InterestMetric[]
  readonly report: CollectionReport
}
