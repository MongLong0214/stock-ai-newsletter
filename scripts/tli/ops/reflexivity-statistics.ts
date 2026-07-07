export const DEFAULT_REFLEXIVITY_ALPHA = 0.05
export const DEFAULT_REFLEXIVITY_PERMUTATION_ITERATIONS = 2000

const PERMUTATION_SEED = 73_129

type OneSidedPermutationPValueInput = {
  readonly treatmentValues: readonly number[]
  readonly controlValues: readonly number[]
  readonly observedDifference: number
  readonly iterations: number
}

export function roundMetric(value: number): number {
  return Number(value.toFixed(6))
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function nextRandomFactory(seedInput: number): () => number {
  let seed = seedInput
  return () => {
    seed = (seed * 1664525 + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }
}

function differenceInMeansForSplit(values: readonly number[], treatmentCount: number): number | null {
  const controlCount = values.length - treatmentCount
  if (treatmentCount === 0 || controlCount === 0) return null

  let treatmentSum = 0
  let controlSum = 0
  for (let index = 0; index < values.length; index += 1) {
    if (index < treatmentCount) {
      treatmentSum += values[index]
    } else {
      controlSum += values[index]
    }
  }

  return treatmentSum / treatmentCount - controlSum / controlCount
}

function shuffledCopy(values: readonly number[], nextRandom: () => number): number[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }
  return shuffled
}

export function oneSidedPermutationPValue(input: OneSidedPermutationPValueInput): number | null {
  const iterations = Math.floor(input.iterations)
  if (
    input.treatmentValues.length === 0
    || input.controlValues.length === 0
    || iterations < 1
    || !Number.isFinite(input.observedDifference)
  ) {
    return null
  }

  const pooledValues = [...input.treatmentValues, ...input.controlValues]
  const nextRandom = nextRandomFactory(PERMUTATION_SEED)
  let exceedanceCount = 0
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const permutedDifference = differenceInMeansForSplit(
      shuffledCopy(pooledValues, nextRandom),
      input.treatmentValues.length,
    )
    if (permutedDifference !== null && permutedDifference >= input.observedDifference) {
      exceedanceCount += 1
    }
  }

  return roundMetric(exceedanceCount / iterations)
}
