export const GTA_DELTA = 0.10
export const GTA_LABELER_VERSION = 'gta-v1'
export const GTA_HORIZON_DAYS = 5

export type GtALabelStatus = 'final' | 'censored' | 'excluded'

export type GtAExcludeReason =
  | 'insufficient_days'
  | 'denominator_floor'
  | 'keyword_epoch_break'
  | 'non_trading_base_date'

export interface GtALabelInput {
  readonly pastRaw: readonly number[]
  readonly futureRaw: readonly number[]
  readonly keywordEpochAtBase: number
  readonly keywordEpochAtFinalize: number
  readonly windowMaxRenewalGapDays: number | null
  readonly deactivatedBeforeHorizon: boolean
}

export interface GtALabelResult {
  readonly status: GtALabelStatus
  readonly gLogRatio: number | null
  readonly yBinary: boolean | null
  readonly denominator: number | null
  readonly rescaleSuspect: boolean
  readonly lowSignal: boolean
  readonly keywordEpoch: number
  readonly excludeReason: GtAExcludeReason | null
  readonly labelerVersion: typeof GTA_LABELER_VERSION
}

const DENOMINATOR_FLOOR = 4
const LOW_SIGNAL_DENOMINATOR = 10
const RESCALE_SUSPECT_GAP_DAYS = 5
const WINSOR_MIN = -1.5
const WINSOR_MAX = 1.5

const finiteValues = (values: readonly number[]): number[] =>
  values.filter((value) => Number.isFinite(value))

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const clip = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const excluded = (
  reason: GtAExcludeReason,
  denominator: number | null,
  keywordEpoch: number,
): GtALabelResult => ({
  status: 'excluded',
  gLogRatio: null,
  yBinary: null,
  denominator,
  rescaleSuspect: false,
  lowSignal: denominator !== null && denominator < LOW_SIGNAL_DENOMINATOR,
  keywordEpoch,
  excludeReason: reason,
  labelerVersion: GTA_LABELER_VERSION,
})

export function labelGtA(input: GtALabelInput): GtALabelResult {
  const past = finiteValues(input.pastRaw)
  const future = finiteValues(input.futureRaw)

  if (past.length < 4 || future.length < 4) {
    return excluded('insufficient_days', null, input.keywordEpochAtBase)
  }

  const denominator = mean(past)
  if (denominator < DENOMINATOR_FLOOR) {
    return excluded('denominator_floor', denominator, input.keywordEpochAtBase)
  }

  if (input.keywordEpochAtBase !== input.keywordEpochAtFinalize) {
    return excluded('keyword_epoch_break', denominator, input.keywordEpochAtBase)
  }

  if (input.deactivatedBeforeHorizon) {
    return {
      status: 'censored',
      gLogRatio: null,
      yBinary: null,
      denominator,
      rescaleSuspect: false,
      lowSignal: denominator < LOW_SIGNAL_DENOMINATOR,
      keywordEpoch: input.keywordEpochAtBase,
      excludeReason: null,
      labelerVersion: GTA_LABELER_VERSION,
    }
  }

  const futureMean = mean(future)
  const rawLogRatio = futureMean <= 0 ? WINSOR_MIN : Math.log(futureMean / denominator)
  const gLogRatio = clip(rawLogRatio, WINSOR_MIN, WINSOR_MAX)
  const rescaleSuspect = input.windowMaxRenewalGapDays !== null
    && input.windowMaxRenewalGapDays <= RESCALE_SUSPECT_GAP_DAYS

  return {
    status: 'final',
    gLogRatio,
    yBinary: gLogRatio >= GTA_DELTA,
    denominator,
    rescaleSuspect,
    lowSignal: denominator < LOW_SIGNAL_DENOMINATOR,
    keywordEpoch: input.keywordEpochAtBase,
    excludeReason: null,
    labelerVersion: GTA_LABELER_VERSION,
  }
}
