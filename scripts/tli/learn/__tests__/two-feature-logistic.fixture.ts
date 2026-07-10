import type {
  TwoFeatureLogisticPredictRow,
  TwoFeatureLogisticTrainRow,
} from '@/lib/tli/model/two-feature-logistic'

/** Deterministic PRNG (mulberry32) so the golden fixture is byte-stable across machines. */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value))

export const TWO_FEATURE_FIXTURE_STUDY_ID = 'study-two-feature-golden'
export const TWO_FEATURE_FIXTURE_STUDY_SHA256 = 'b'.repeat(64)

const ORIGIN_COUNT = 16
const THEMES_PER_ORIGIN = 12

const originDate = (index: number): string => {
  const date = new Date(Date.UTC(2026, 0, 5 + index * 7))
  return date.toISOString().slice(0, 10)
}

/**
 * 16 weekly origins × 12 themes with two informative features, a small share of missing values,
 * and a roughly balanced label so the inner-OOF class/origin floors are met and the diagnostic is
 * actually `computed`. The generator is fully deterministic.
 */
export const buildTwoFeatureFixtureRows = (): readonly TwoFeatureLogisticTrainRow[] => {
  const rows: TwoFeatureLogisticTrainRow[] = []
  for (let origin = 0; origin < ORIGIN_COUNT; origin += 1) {
    for (let theme = 0; theme < THEMES_PER_ORIGIN; theme += 1) {
      const random = mulberry32(origin * 1000 + theme * 7 + 1)
      const slopeRaw = random() * 2 - 1
      const newsRaw = random() * 3
      const slopeMissing = (origin * THEMES_PER_ORIGIN + theme) % 19 === 0
      const newsMissing = (origin * THEMES_PER_ORIGIN + theme) % 23 === 0
      const probability = sigmoid(1.6 * slopeRaw + 0.9 * (newsRaw - 1.2))
      rows.push({
        themeId: `theme-${theme.toString().padStart(2, '0')}`,
        originDate: originDate(origin),
        interestSlope7d: slopeMissing ? null : Number(slopeRaw.toFixed(6)),
        newsMomentum: newsMissing ? null : Number(newsRaw.toFixed(6)),
        y: random() < probability,
      })
    }
  }
  return rows
}

export const TWO_FEATURE_FIXTURE_PREDICT_ROWS: readonly TwoFeatureLogisticPredictRow[] = [
  { id: 'p-high', themeId: 'theme-hi', originDate: originDate(ORIGIN_COUNT), interestSlope7d: 0.9, newsMomentum: 2.8 },
  { id: 'p-low', themeId: 'theme-lo', originDate: originDate(ORIGIN_COUNT), interestSlope7d: -0.9, newsMomentum: 0.1 },
  { id: 'p-missing', themeId: 'theme-mi', originDate: originDate(ORIGIN_COUNT), interestSlope7d: null, newsMomentum: null },
]
