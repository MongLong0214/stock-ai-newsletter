/**
 * CMPV4-016 + CMPV4-017: Experimental Queue A & B
 *
 * 각 실험은 isolated version으로만 수행, held-out report 없이 prod 승격 금지.
 */

// ══════════════════════════════════════════════════════════════════════════════
// CMPV4-016: Experimental Queue A
// ══════════════════════════════════════════════════════════════════════════════

// ── curve scale unification ──

export const unifyCurveScale = (raw: number[]): number[] => {
  if (raw.length === 0) return []
  const max = Math.max(...raw)
  const min = Math.min(...raw)
  const range = max - min
  if (range === 0) return raw.map(() => 0)
  return raw.map((v) => (v - min) / range)
}

// ── sigmoid weight smoothing ──

export const applySigmoidWeightSmoothing = (input: {
  featureWeight: number
  curveWeight: number
  curveDataDays: number
  transitionCenter: number
  transitionSteepness: number
}): { smoothedFeatureWeight: number; smoothedCurveWeight: number } => {
  // sigmoid: maps curveDataDays → [0, 1], centered at transitionCenter
  const x = (input.curveDataDays - input.transitionCenter) * input.transitionSteepness
  const curveConfidence = 1 / (1 + Math.exp(-x))

  // Blend: as curveConfidence → 1, use original weights; as → 0, shift to feature-heavy
  const smoothedCurveWeight = input.curveWeight * curveConfidence
  const smoothedFeatureWeight = 1 - smoothedCurveWeight

  return { smoothedFeatureWeight, smoothedCurveWeight }
}

// ── sector affinity matrix ──

const DEFAULT_CROSS_SECTOR_AFFINITY = 0.3

const SECTOR_AFFINITIES: Record<string, Record<string, number>> = {
  tech: { bio: 0.4, finance: 0.5, energy: 0.3, consumer: 0.4 },
  bio: { tech: 0.4, finance: 0.3, energy: 0.2, consumer: 0.3 },
  finance: { tech: 0.5, bio: 0.3, energy: 0.4, consumer: 0.5 },
  energy: { tech: 0.3, bio: 0.2, finance: 0.4, consumer: 0.3 },
  consumer: { tech: 0.4, bio: 0.3, finance: 0.5, energy: 0.3 },
}

export const buildSectorAffinityMatrix = () => ({
  getAffinity: (sectorA: string, sectorB: string): number => {
    if (sectorA === sectorB) return 1.0
    return SECTOR_AFFINITIES[sectorA]?.[sectorB]
      ?? SECTOR_AFFINITIES[sectorB]?.[sectorA]
      ?? DEFAULT_CROSS_SECTOR_AFFINITY
  },
})

// ── length ratio penalty (PRD §14.2 #4) ──

export const applyLengthRatioPenalty = (input: {
  currentCurveLength: number
  pastCurveLength: number
  maxRatio: number
  penaltyWeight: number
  baseSimilarity?: number
}): { penalty: number; ratio: number; adjustedSimilarity?: number } => {
  if (input.currentCurveLength <= 0 || input.pastCurveLength <= 0) {
    return { penalty: 0, ratio: 0 }
  }

  const longer = Math.max(input.currentCurveLength, input.pastCurveLength)
  const shorter = Math.min(input.currentCurveLength, input.pastCurveLength)
  const ratio = longer / shorter

  if (ratio <= input.maxRatio) {
    return {
      penalty: 0,
      ratio,
      adjustedSimilarity: input.baseSimilarity,
    }
  }

  // Linear penalty that scales from 0 at maxRatio to penaltyWeight at 2*maxRatio, capped
  const excess = (ratio - input.maxRatio) / input.maxRatio
  const penalty = Math.min(input.penaltyWeight, excess * input.penaltyWeight)

  const adjustedSimilarity = input.baseSimilarity != null
    ? Math.max(0, input.baseSimilarity - penalty)
    : undefined

  return { penalty, ratio, adjustedSimilarity }
}

// ── experiment version isolation ──

export const createExperimentVersion = (input: {
  baseVersion: string
  experimentId: string
  runDate: string
}): string => `${input.baseVersion}+exp.${input.experimentId}.${input.runDate}`

// ══════════════════════════════════════════════════════════════════════════════
// CMPV4-017: Experimental Queue B
// ══════════════════════════════════════════════════════════════════════════════

// ── inactive-theme news snapshot normalization ──

export const normalizeInactiveThemeNewsSnapshot = (input: {
  rawNewsCount: number
  activeDays: number
  lookbackDays: number
}): { normalizedCount: number; scaleFactor: number } => {
  if (input.lookbackDays <= 0 || input.activeDays <= 0) {
    return { normalizedCount: 0, scaleFactor: 0 }
  }
  const scaleFactor = Math.min(1, input.activeDays / input.lookbackDays)
  return {
    normalizedCount: input.rawNewsCount * scaleFactor,
    scaleFactor,
  }
}

// ── VIF diagnostic and conditional feature merge ──

export const computeVIFDiagnostic = (input: {
  featureNames: string[]
  correlationMatrix: number[][]
  mergeThreshold: number
}): { vifValues: number[]; featuresToMerge: string[] } => {
  const n = input.featureNames.length
  const vifValues: number[] = []
  const featuresToMerge: string[] = []

  for (let i = 0; i < n; i++) {
    // Approximate VIF from max squared correlation with other features
    let maxR2 = 0
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const r = input.correlationMatrix[i][j]
        maxR2 = Math.max(maxR2, r * r)
      }
    }
    const vif = maxR2 < 1 ? 1 / (1 - maxR2) : Infinity
    vifValues.push(vif)

    if (vif > input.mergeThreshold) {
      featuresToMerge.push(input.featureNames[i])
    }
  }

  return { vifValues, featuresToMerge }
}

// ── N<15 Mutual Rank explicit fallback ──

export const MUTUAL_RANK_MIN_THEMES = 15

export const mutualRankExplicitFallback = (input: {
  themeCount: number
  themeIdA: string
  themeIdB: string
}): { applicable: boolean; similarity: null; fallbackReason: string | null } => {
  if (input.themeCount < MUTUAL_RANK_MIN_THEMES) {
    return {
      applicable: false,
      similarity: null,
      fallbackReason: 'insufficient_population',
    }
  }
  return {
    applicable: true,
    similarity: null,
    fallbackReason: null,
  }
}
