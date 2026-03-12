import type { Level4ConfidenceTier } from './level4-types'

export function clampProbability(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function buildWilsonInterval(probability: number, count: number) {
  if (count <= 0) return { lower: null, upper: null }

  const z = 1.96
  const denominator = 1 + (z * z) / count
  const center = (probability + (z * z) / (2 * count)) / denominator
  const halfWidth = (z * Math.sqrt((probability * (1 - probability) + (z * z) / (4 * count)) / count)) / denominator

  return {
    lower: clampProbability(center - halfWidth),
    upper: clampProbability(center + halfWidth),
  }
}

export function getConfidenceIntervalWidth(input: {
  probabilityCiLower?: number | null
  probabilityCiUpper?: number | null
}) {
  if (input.probabilityCiLower == null || input.probabilityCiUpper == null) {
    return Number.POSITIVE_INFINITY
  }

  return input.probabilityCiUpper - input.probabilityCiLower
}

export function resolveLevel4ConfidenceTier(input: {
  supportCount?: number | null
  probabilityCiLower?: number | null
  probabilityCiUpper?: number | null
}): Level4ConfidenceTier {
  const supportCount = input.supportCount ?? null
  const ciWidth = getConfidenceIntervalWidth(input)

  if (supportCount != null && supportCount >= 200 && ciWidth <= 0.10) {
    return 'high'
  }
  if (supportCount != null && supportCount >= 75 && ciWidth <= 0.20) {
    return 'medium'
  }
  return 'low'
}

export const getLevel4ConfidenceTier = resolveLevel4ConfidenceTier
