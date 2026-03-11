/** 테마 비교 모듈 — 배럴 re-export */

export { normalizeTimeline, normalizeValues, findPeakDay, resampleCurve } from './timeline'
export type { TimeSeriesPoint } from './timeline'

export { pearsonCorrelation, cosineSimilarity, zScoreEuclideanSimilarity, keywordJaccard } from './similarity'
export type { FeaturePopulationStats } from './similarity'

export { extractFeatures, featuresToArray, classifySector } from './features'
export type { ThemeFeatures } from './features'

export { compositeCompare } from './composite'
export {
  COMPARISON_PRIMARY_HORIZON_DAYS,
  COMPARISON_RUN_TYPES,
  COMPARISON_CANDIDATE_POOLS,
  COMPARISON_TIE_BREAK,
  THRESHOLD_REGIMES,
  computeBinaryRelevance,
  computeGradedGain,
  classifyRunLevelCensoring,
} from './spec'
export type { ComparisonRunType, ComparisonCandidatePool, ThresholdRegime, RunLevelCensoringReason } from './spec'
