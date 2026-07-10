import { getKoreanTradingDateWindow } from '../../../lib/tli/trading-calendar'
import type {
  DatasetDataSource,
  RawConfirmatoryLabelRow,
} from '../learn/dataset-manifest'
import { resolveGtAV2Finalize } from '../labels/finalize-gt-a-v2'
import type { FixtureOriginRef, FixtureOriginStack } from './fixture-origins'
import {
  deterministicUuid,
  FEATURE_CONTRACT_SHA256,
  FEATURE_CONTRACT_VERSION,
  LABEL_CONTRACT_SHA256,
  sha256Identity,
  signalForTheme,
  STUDY_CONTRACT_ID,
  THEME_IDS,
} from './fixture-identities'

interface BuiltLabel {
  readonly row: RawConfirmatoryLabelRow
  readonly completedAt: string
}

export interface FixtureLabelSet {
  readonly rows: readonly RawConfirmatoryLabelRow[]
  readonly completions: Map<string, string>
}

const timestamp = (date: string, hour: string): string => `${date}T${hour}:00:00.000Z`

const buildRawLabel = (origin: FixtureOriginRef, themeId: string): BuiltLabel => {
  const identity = `${origin.originDate}:${themeId}`
  const pastDates = getKoreanTradingDateWindow({ baseDate: origin.originDate, startOffset: -4, endOffset: 0 })
  const futureDates = getKoreanTradingDateWindow({ baseDate: origin.originDate, startOffset: 1, endOffset: 5 })
  const lastFutureDate = futureDates.at(-1)
  if (lastFutureDate === undefined) throw new Error(`future window missing for ${identity}`)
  const sourceRunId = deterministicUuid('label-source-run', identity)
  const outcome = resolveGtAV2Finalize({
    themeId,
    baseDate: origin.originDate,
    forecastOriginManifestId: origin.forecastManifestId,
    asOf: timestamp(lastFutureDate, '11'),
    child: {
      inputStatus: 'usable',
      keywordGroupSha256: sha256Identity('keyword-group', themeId),
      forecastInterestRunId: deterministicUuid('origin-interest-run', identity),
    },
    sourceRun: {
      id: sourceRunId,
      requestSha256: sha256Identity('label-request', identity),
      responseSha256: sha256Identity('label-response', identity),
      observations: [
        ...pastDates.map((tradingDate) => ({ tradingDate, normalized: 100 })),
        ...futureDates.map((tradingDate) => ({
          tradingDate,
          normalized: signalForTheme(themeId) > 0 ? 120 : 80,
        })),
      ],
    },
    pastDates,
    futureDates,
    graceExpired: true,
  })
  if (outcome.kind !== 'finalize' || outcome.payload.y_binary === null || outcome.payload.g_log_ratio === null) {
    throw new Error(`gta-v2 fixture did not finalize an eligible row for ${identity}`)
  }
  return {
    row: {
      id: deterministicUuid('label', identity),
      theme_id: themeId,
      base_date: origin.originDate,
      horizon_days: 5,
      labeler_version: 'gta-v2',
      label_type: 'gt_a',
      label_status: 'final',
      scientific_use_status: 'confirmatory_eligible',
      scientific_use_reason: 'gta_v2_exact_contract',
      rescale_suspect: false,
      y_binary: outcome.payload.y_binary,
      g_log_ratio: outcome.payload.g_log_ratio,
      finalized_at: timestamp(lastFutureDate, '11'),
      forecast_origin_manifest_id: origin.forecastManifestId,
      label_source_run_id: sourceRunId,
      past_dates: pastDates,
      future_dates: futureDates,
    },
    completedAt: timestamp(lastFutureDate, '10'),
  }
}

export function buildFixtureLabelSet(stack: FixtureOriginStack): FixtureLabelSet {
  const built = stack.trainingOrigins.flatMap((origin) => (
    THEME_IDS.map((themeId) => buildRawLabel(origin, themeId))
  ))
  const rows = built.map((item) => item.row).sort((left, right) => (
    left.base_date.localeCompare(right.base_date)
    || left.theme_id.localeCompare(right.theme_id)
    || left.id.localeCompare(right.id)
  ))
  return {
    rows,
    completions: new Map(built.map((item) => [item.row.label_source_run_id ?? '', item.completedAt])),
  }
}

const afterCursor = (
  row: RawConfirmatoryLabelRow,
  after: { readonly first: string; readonly second: string; readonly third: string } | null,
): boolean => after === null
  || row.base_date > after.first
  || (row.base_date === after.first && row.theme_id > after.second)
  || (row.base_date === after.first && row.theme_id === after.second && row.id > after.third)

export const buildFixtureDatasetSource = (input: {
  readonly stack: FixtureOriginStack
  readonly labels: FixtureLabelSet
}): DatasetDataSource => ({
  async loadStudyContract() {
    return {
      id: STUDY_CONTRACT_ID,
      payload_sha256: input.stack.studyContractSha256,
      labeler_version: 'gta-v2',
      label_contract_sha256: LABEL_CONTRACT_SHA256,
      feature_contract_version: FEATURE_CONTRACT_VERSION,
      feature_contract_sha256: FEATURE_CONTRACT_SHA256,
    }
  },
  async loadStudyOriginBindings() {
    return input.stack.trainingOrigins.map((origin) => ({
      study_origin_manifest_id: origin.studyOriginManifestId,
      forecast_origin_manifest_id: origin.forecastManifestId,
    }))
  },
  async loadConfirmatoryLabelPage({ after, pageSize }) {
    return input.labels.rows.filter((row) => afterCursor(row, after)).slice(0, pageSize)
  },
  async loadSourceRunCompletions(runIds) {
    return new Map(runIds.flatMap((runId) => {
      const completedAt = input.labels.completions.get(runId)
      return completedAt === undefined ? [] : [[runId, completedAt] as const]
    }))
  },
})
