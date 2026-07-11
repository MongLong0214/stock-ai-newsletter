import { sleep } from '../shared/utils'
import { ANCHOR_KEYWORD } from './datalab-anchor'
import {
  buildInterestCollectionRun,
  forecastInterestRunWindow,
  keywordGroupSha256,
  resolveThemeKeywordGroup,
} from './collection-run-contract'
import type { CollectionReport } from './collection-report'
import { appendCollectionRun } from './collection-run-store'
import {
  callNaverDatalab,
  datalabFailureReason,
  toDatalabRequestPayload,
  toDatalabResponsePayload,
  type NaverDatalabRequest,
} from './naver-datalab-api'
import {
  ANCHOR_GROUP_NAME,
  resolveDatalabAnchor,
  toInterestObservations,
} from './naver-datalab-observations'
import { appendFailedInterestRun, INTEREST_CONTRACT_VERSION } from './naver-datalab-run'
import { isDatalabAnchorEnabled } from './naver-datalab-settings'
import type { DatalabCollectionOptions, DatalabTheme } from './naver-datalab-types'

export const collectForecastInterestRuns = async (
  themes: DatalabTheme[],
  baseDate: string,
  options: DatalabCollectionOptions = {},
): Promise<CollectionReport> => {
  const anchorEnabled = isDatalabAnchorEnabled()
  const { startDate, endDate } = forecastInterestRunWindow(baseDate)
  console.log(`\n🔒 forecast interest run 수집 (${startDate} ~ ${endDate}, ${themes.length}개 테마)`)

  let requested = 0
  let succeeded = 0
  let failed = 0
  let persistenceFailed = 0

  for (const theme of themes) {
    if (theme.naverKeywords.length === 0) continue
    requested++

    const spec = resolveThemeKeywordGroup(theme)
    const keywordGroups = anchorEnabled
      ? [
          { groupName: ANCHOR_GROUP_NAME, keywords: [ANCHOR_KEYWORD] },
          { groupName: spec.group_name, keywords: [...spec.keywords] },
        ]
      : [{ groupName: spec.group_name, keywords: [...spec.keywords] }]
    const request: NaverDatalabRequest = { startDate, endDate, timeUnit: 'date', keywordGroups }
    const requestPayload = toDatalabRequestPayload(request)
    const keywordGroupHash = keywordGroupSha256(spec)
    const requestedThemes = [{ themeId: theme.id, groupName: spec.group_name }]
    const requestedAt = new Date().toISOString()

    try {
      const response = await callNaverDatalab(request)
      const collectedAt = new Date().toISOString()
      const anchorScaleFactor = resolveDatalabAnchor(response, anchorEnabled)
      const themeResult = response.results.find((result) => result.title === spec.group_name)
      const themeMax = Math.max(...(themeResult?.data.map((point) => point.ratio) ?? []), 0)
      const append = buildInterestCollectionRun({
        contractVersion: INTEREST_CONTRACT_VERSION,
        requestWindowStart: startDate,
        requestWindowEnd: endDate,
        requestPayload,
        responsePayload: toDatalabResponsePayload(response),
        keywordGroupHash,
        requestedThemes,
        observations: themeResult
          ? toInterestObservations({ themeId: theme.id, points: themeResult.data, themeMax, anchorScaleFactor })
          : [],
        respondedThemeIds: themeResult ? [theme.id] : [],
        timestamps: { requestedAt, collectedAt, completedAt: new Date().toISOString() },
      })

      try {
        await appendCollectionRun(append, options.transport)
        if (append.run.status === 'complete') succeeded++
        else failed++
      } catch (error: unknown) {
        failed++
        persistenceFailed++
        console.error(
          `   ❌ ${theme.name} forecast interest run append 실패:`,
          error instanceof Error ? error.message : String(error),
        )
      }
    } catch (error: unknown) {
      failed++
      const persisted = await appendFailedInterestRun({
        startDate,
        endDate,
        requestPayload,
        keywordGroupHash,
        requestedThemes,
        requestedAt,
        failureSummary: {
          reason: datalabFailureReason(error),
          message: error instanceof Error ? error.message : String(error),
        },
        transport: options.transport,
      })
      if (!persisted) persistenceFailed++
    }

    await sleep(1000)
  }

  console.log(`   ✅ forecast interest run ${succeeded}건 성공, ${failed}건 실패`)
  return { requested, succeeded, failed, persistenceFailed }
}
