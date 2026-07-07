export const ANCHOR_KEYWORD = '계산기'
export const ANCHOR_CANDIDATES = ['계산기', '번역', '지도'] as const
export const ANCHOR_EPSILON = 1
export const ANCHOR_CV_WARNING_THRESHOLD = 0.3

export function computeAnchorScaleFactor(anchorRatios: readonly number[]): number | null {
  const values = anchorRatios.filter((value) => Number.isFinite(value)).slice(-7).sort((a, b) => a - b)
  if (values.length === 0) return null
  const middle = Math.floor(values.length / 2)
  const median = values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle]
  return 1 / Math.max(median, ANCHOR_EPSILON)
}

export function computeCoefficientOfVariation(values: readonly number[]): number | null {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (finiteValues.length < 2) return null
  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
  if (mean <= 0) return null
  const variance = finiteValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finiteValues.length
  return Math.sqrt(variance) / mean
}
