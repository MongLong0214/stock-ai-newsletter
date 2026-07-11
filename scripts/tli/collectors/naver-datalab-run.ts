import type { JsonObject } from '../../../lib/tli/canonical-json'
import { buildInterestCollectionRun } from './collection-run-contract'
import { appendCollectionRun, type CollectionRunTransport } from './collection-run-store'

export const INTEREST_CONTRACT_VERSION = 'tli-interest-v1'

export const appendFailedInterestRun = async (input: {
  readonly startDate: string
  readonly endDate: string
  readonly requestPayload: JsonObject
  readonly keywordGroupHash: string
  readonly requestedThemes: ReadonlyArray<{ readonly themeId: string; readonly groupName: string }>
  readonly requestedAt: string
  readonly failureSummary: JsonObject
  readonly transport?: CollectionRunTransport
}): Promise<boolean> => {
  const now = new Date().toISOString()
  const append = buildInterestCollectionRun({
    contractVersion: INTEREST_CONTRACT_VERSION,
    requestWindowStart: input.startDate,
    requestWindowEnd: input.endDate,
    requestPayload: input.requestPayload,
    responsePayload: null,
    keywordGroupHash: input.keywordGroupHash,
    requestedThemes: input.requestedThemes,
    observations: [],
    respondedThemeIds: [],
    timestamps: { requestedAt: input.requestedAt, collectedAt: now, completedAt: now },
    failureSummary: input.failureSummary,
  })

  try {
    await appendCollectionRun(append, input.transport)
    return true
  } catch (error: unknown) {
    console.error('   ⚠️ failed interest run 기록 실패:', error instanceof Error ? error.message : String(error))
    return false
  }
}
