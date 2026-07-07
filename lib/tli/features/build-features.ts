import {
  avg,
  calculateDVI,
  linearRegressionSlope,
  log_normalize,
  median,
  percentileRank,
} from '@/lib/tli/normalize'

export const FEATURE_NAMES = [
  'interest_slope_7d',
  'interest_level_pct',
  'interest_accel',
  'dvi_7d',
  'news_volume_7d',
  'news_momentum',
  'basket_return_5d',
  'basket_volume_ratio',
  'episode_progress',
  'market_regime',
] as const

export type FeatureName = typeof FEATURE_NAMES[number]

export interface BasketStockFeatureInput {
  readonly symbol: string
  readonly closeAtLookback: number | null
  readonly closeAtBase: number | null
  readonly recentVolumes: readonly number[]
  readonly baselineVolumes: readonly number[]
}

export interface FeatureInputs {
  readonly interestRaw: readonly number[]
  readonly anchorScaled: readonly number[]
  readonly crossSectionalAnchorMeans: readonly number[]
  readonly newsCounts: readonly number[]
  readonly basketStocks: readonly BasketStockFeatureInput[]
  readonly kospiCloseAtLookback: number | null
  readonly kospiCloseAtBase: number | null
  readonly daysSinceSpike: number | null
  readonly completedEpisodePeakDays: readonly number[]
}

export interface FeatureVector {
  readonly values: readonly number[]
  readonly missingFlags: readonly boolean[]
  readonly abstain: boolean
  readonly abstainReasons: readonly string[]
}

const MIN_INTEREST_HISTORY_DAYS = 7
const MAX_MISSING_FEATURES = 3
const NEWS_LOG_SCALE = 64.3

const finiteValues = (values: readonly number[]): number[] => (
  values.filter((value) => Number.isFinite(value))
)

const lastFiniteValues = (values: readonly number[], count: number): number[] => (
  finiteValues(values).slice(-count)
)

const safeMean = (values: readonly number[]): number | null => {
  const finite = finiteValues(values)
  return finite.length === 0 ? null : avg(finite)
}

const finiteOrMissing = (value: number | null): { readonly value: number; readonly missing: boolean } => {
  if (value === null || !Number.isFinite(value)) {
    // G.1: impute missing slots as 0 (not NaN) — the missing flag preserves the "unknown" signal
    // while keeping values finite for downstream (pydantic float validation, matrix ops).
    return { value: 0, missing: true }
  }
  return { value, missing: false }
}

const computeInterestSlope7d = (interestRaw: readonly number[]) => {
  const recent = lastFiniteValues(interestRaw, 7)
  if (recent.length < 7) return finiteOrMissing(null)
  const mean = Math.max(avg(recent), 1)
  return finiteOrMissing(linearRegressionSlope(recent) / mean)
}

const computeInterestLevelPct = (input: FeatureInputs) => {
  const recentAnchorMean = safeMean(input.anchorScaled.slice(-7))
  if (recentAnchorMean === null || input.crossSectionalAnchorMeans.length === 0) {
    return finiteOrMissing(null)
  }
  const population = finiteValues(input.crossSectionalAnchorMeans).sort((left, right) => left - right)
  return population.length === 0 ? finiteOrMissing(null) : finiteOrMissing(percentileRank(recentAnchorMean, population))
}

const computeInterestAccel = (interestRaw: readonly number[], interestSlope7d: { readonly value: number; readonly missing: boolean }) => {
  const recent = lastFiniteValues(interestRaw, 3)
  if (recent.length < 3 || interestSlope7d.missing) return finiteOrMissing(null)
  const mean = Math.max(avg(recent), 1)
  return finiteOrMissing(linearRegressionSlope(recent) / mean - interestSlope7d.value)
}

const computeDvi7d = (interestRaw: readonly number[]) => {
  const recent = lastFiniteValues(interestRaw, 7)
  return recent.length < 7 ? finiteOrMissing(null) : finiteOrMissing(calculateDVI(recent))
}

const computeNewsVolume7d = (newsCounts: readonly number[]) => {
  const recent = lastFiniteValues(newsCounts, 7)
  return recent.length < 7 ? finiteOrMissing(null) : finiteOrMissing(log_normalize(avg(recent) * recent.length, NEWS_LOG_SCALE))
}

const computeNewsMomentum = (newsCounts: readonly number[]) => {
  const recent14 = lastFiniteValues(newsCounts, 14)
  if (recent14.length < 14) return finiteOrMissing(null)
  const previous = recent14.slice(0, 7).reduce((sum, value) => sum + value, 0)
  const current = recent14.slice(7).reduce((sum, value) => sum + value, 0)
  return finiteOrMissing((current - previous) / Math.max(previous, 1))
}

const computeKospiReturn = (input: FeatureInputs): number | null => {
  if (
    input.kospiCloseAtLookback === null ||
    input.kospiCloseAtBase === null ||
    input.kospiCloseAtLookback <= 0
  ) {
    return null
  }
  return input.kospiCloseAtBase / input.kospiCloseAtLookback - 1
}

const computeBasketReturn5d = (input: FeatureInputs) => {
  const kospiReturn = computeKospiReturn(input)
  if (kospiReturn === null) return finiteOrMissing(null)

  const stockReturns = input.basketStocks.flatMap((stock) => {
    if (stock.closeAtLookback === null || stock.closeAtBase === null || stock.closeAtLookback <= 0) {
      return []
    }
    return [stock.closeAtBase / stock.closeAtLookback - 1]
  })
  if (stockReturns.length === 0) return finiteOrMissing(null)

  return finiteOrMissing(avg(stockReturns) - kospiReturn)
}

const computeBasketVolumeRatio = (basketStocks: readonly BasketStockFeatureInput[]) => {
  // G.1: ratio-of-means — pool recent/baseline volumes across the basket before dividing,
  // rather than averaging each stock's own ratio (mean-of-ratios), so a single volatile stock
  // cannot dominate the feature.
  const recentPooled = basketStocks.flatMap((stock) => finiteValues(stock.recentVolumes))
  const baselinePooled = basketStocks.flatMap((stock) => finiteValues(stock.baselineVolumes))
  const recentMean = safeMean(recentPooled)
  const baselineMean = safeMean(baselinePooled)
  return recentMean === null || baselineMean === null || baselineMean <= 0
    ? finiteOrMissing(null)
    : finiteOrMissing(recentMean / baselineMean)
}

const computeEpisodeProgress = (input: FeatureInputs) => {
  if (input.daysSinceSpike === null || input.completedEpisodePeakDays.length === 0) {
    return finiteOrMissing(null)
  }
  const sortedPeaks = finiteValues(input.completedEpisodePeakDays).sort((left, right) => left - right)
  const medianPeakDay = median(sortedPeaks)
  return medianPeakDay <= 0 ? finiteOrMissing(null) : finiteOrMissing(input.daysSinceSpike / medianPeakDay)
}

const computeMarketRegime = (input: FeatureInputs) => {
  const kospiReturn = computeKospiReturn(input)
  return kospiReturn === null ? finiteOrMissing(null) : finiteOrMissing(kospiReturn >= 0 ? 1 : -1)
}

export function buildFeatureVector(input: FeatureInputs): FeatureVector {
  const interestSlope = computeInterestSlope7d(input.interestRaw)
  const featureResults = [
    interestSlope,
    computeInterestLevelPct(input),
    computeInterestAccel(input.interestRaw, interestSlope),
    computeDvi7d(input.interestRaw),
    computeNewsVolume7d(input.newsCounts),
    computeNewsMomentum(input.newsCounts),
    computeBasketReturn5d(input),
    computeBasketVolumeRatio(input.basketStocks),
    computeEpisodeProgress(input),
    computeMarketRegime(input),
  ] as const
  const missingFlags = featureResults.map((feature) => feature.missing)
  // N1 (G.1 contract): non-abstain rows must never emit a non-finite value. A missing slot is
  // already imputed as 0 above (via finiteOrMissing); this is a final defensive gate in case a
  // future feature forgets to route through finiteOrMissing.
  const values = featureResults.map((feature, index) => {
    if (Number.isFinite(feature.value)) return feature.value
    missingFlags[index] = true
    return 0
  })
  const missingCount = missingFlags.filter(Boolean).length
  const abstainReasons = [
    ...(finiteValues(input.interestRaw).length < MIN_INTEREST_HISTORY_DAYS ? ['interest_history_lt_7'] : []),
    ...(missingCount > MAX_MISSING_FEATURES ? ['missing_features_gt_3'] : []),
  ]

  return {
    values,
    missingFlags,
    abstain: abstainReasons.length > 0,
    abstainReasons,
  }
}
