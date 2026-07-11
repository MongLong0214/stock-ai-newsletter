import { isKoreanTradingDate } from '../../../lib/tli/trading-calendar'
import {
  ANCHOR_CV_WARNING_THRESHOLD,
  computeAnchorScaleFactor,
  computeCoefficientOfVariation,
} from './datalab-anchor'
import type { InterestObservationInput } from './collection-run-contract'
import type { NaverDatalabResponse } from './naver-datalab-api'
import type { InterestMetric } from './naver-datalab-types'

export const ANCHOR_GROUP_NAME = '__tli_anchor__'

const KEYWORD_EPOCH = 1

export const toInterestObservations = (input: {
  readonly themeId: string
  readonly points: ReadonlyArray<{ readonly period: string; readonly ratio: number }>
  readonly themeMax: number
  readonly anchorScaleFactor: number | null
}): InterestObservationInput[] =>
  input.points
    .filter((point) => isKoreanTradingDate(point.period))
    .map((point) => ({
      theme_id: input.themeId,
      trading_date: point.period,
      source: 'naver_datalab' as const,
      raw_value: Math.round(point.ratio),
      normalized: input.themeMax > 0 ? (point.ratio / input.themeMax) * 100 : 0,
      anchor_scaled_value: input.anchorScaleFactor === null ? null : point.ratio * input.anchorScaleFactor,
      keyword_epoch: KEYWORD_EPOCH,
    }))

export const toInterestMetrics = (
  observations: readonly InterestObservationInput[],
): InterestMetric[] =>
  observations.map((observation) => ({
    themeId: observation.theme_id,
    date: observation.trading_date,
    rawValue: observation.raw_value,
    normalized: observation.normalized,
    anchorScaledValue: observation.anchor_scaled_value,
  }))

export const resolveDatalabAnchor = (
  response: NaverDatalabResponse,
  anchorEnabled: boolean,
): number | null => {
  const anchorResult = anchorEnabled
    ? response.results.find((result) => result.title === ANCHOR_GROUP_NAME)
    : undefined
  const anchorRatios = anchorResult?.data.map((point) => point.ratio) ?? []
  const anchorScaleFactor = anchorEnabled ? computeAnchorScaleFactor(anchorRatios) : null
  const anchorCv = anchorEnabled ? computeCoefficientOfVariation(anchorRatios.slice(-14)) : null

  if (anchorCv !== null && anchorCv > ANCHOR_CV_WARNING_THRESHOLD) {
    console.warn(`   ⚠️ DataLab 앵커 변동성 경고: CV=${anchorCv.toFixed(3)} > ${ANCHOR_CV_WARNING_THRESHOLD}`)
  }
  if (anchorEnabled && anchorScaleFactor === null) {
    console.warn('   ⚠️ DataLab 앵커 응답 누락 — anchor_scaled_value를 null로 적재')
  }

  return anchorScaleFactor
}
