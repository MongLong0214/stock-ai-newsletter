import type { ComparisonInput, PredictionResult } from '@/lib/tli/prediction'

export function makeComparison(overrides: Partial<ComparisonInput> = {}): ComparisonInput {
  return {
    pastTheme: 'Test Theme',
    similarity: 0.6,
    estimatedDaysToPeak: 10,
    pastPeakDay: 30,
    pastTotalDays: 60,
    ...overrides,
  }
}

export function makeTriple(overrides: Partial<ComparisonInput> = {}): ComparisonInput[] {
  return [
    makeComparison(overrides),
    makeComparison({ pastTheme: 'Triple-B', ...overrides }),
    makeComparison({ pastTheme: 'Triple-C', ...overrides }),
  ]
}

export function requirePrediction(result: PredictionResult | null): PredictionResult {
  if (result === null) throw new Error('Expected prediction result')
  return result
}
