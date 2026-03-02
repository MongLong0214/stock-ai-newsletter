/** 점수 Confidence (데이터 커버리지 기반 신뢰도) 계산 */

import { getConfidenceThresholds } from './constants/score-config'
import type { InterestMetric, NewsMetric, ScoreConfidence, ConfidenceLevel } from './types'

export function computeScoreConfidence(
  interestMetrics: InterestMetric[],
  newsMetrics: NewsMetric[],
): ScoreConfidence {
  const interestCoverage = Math.min(interestMetrics.length / 30, 1)
  const newsDaysWithData = new Set(newsMetrics.filter(m => m.article_count > 0).map(m => m.time)).size
  const newsCoverage = Math.min(newsDaysWithData / 14, 1)
  const coverageScore = interestCoverage * 0.6 + newsCoverage * 0.4

  const ct = getConfidenceThresholds()

  let confidenceLevel: ConfidenceLevel
  let confidenceReason: string

  if (coverageScore >= ct.highCoverage && interestMetrics.length >= ct.highDays) {
    confidenceLevel = 'high'
    confidenceReason = '충분한 데이터'
  } else if (coverageScore >= ct.mediumCoverage && interestMetrics.length >= ct.mediumDays) {
    confidenceLevel = 'medium'
    confidenceReason = interestMetrics.length < ct.highDays
      ? `관심도 ${interestMetrics.length}일 (${ct.highDays}일 미만)`
      : newsDaysWithData < 7 ? '뉴스 데이터 부족' : '데이터 축적 중'
  } else {
    confidenceLevel = 'low'
    confidenceReason = interestMetrics.length < ct.mediumDays
      ? `관심도 ${interestMetrics.length}일 (${ct.mediumDays}일 미만)`
      : newsDaysWithData === 0 ? '뉴스 데이터 없음' : '데이터 부족'
  }

  return {
    level: confidenceLevel,
    dataAge: interestMetrics.length,
    interestCoverage,
    newsCoverage,
    reason: confidenceReason,
  }
}
