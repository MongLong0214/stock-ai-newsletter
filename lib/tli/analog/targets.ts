/**
 * TCAR-012: Reusable target definitions for future alignment classification.
 *
 * Contains threshold constants and the classifyFutureAlignment function,
 * extracted from build-future-aligned-dataset.ts for reuse across modules.
 */

// --- Types ---

export type FutureAlignmentLabel = 'positive' | 'negative' | 'ambiguous'

// --- Constants ---

export const PEAK_GAP_POSITIVE_THRESHOLD = 5
export const PEAK_GAP_NEGATIVE_THRESHOLD = 15
export const TOTAL_DAYS_RATIO_POSITIVE = 0.3
export const TOTAL_DAYS_RATIO_NEGATIVE = 0.6

// --- Future Alignment Classifier ---
// Contract: callers must filter episodes with totalDays === 0 before calling.
// When both totalDays are 0, Math.max(..., 1) prevents division by zero
// and the result is 'positive' (ratio = 0) — valid only for self-comparison.

export const classifyFutureAlignment = (input: {
  queryPeakDay: number
  queryTotalDays: number
  candidatePeakDay: number
  candidateTotalDays: number
}): { label: FutureAlignmentLabel; peakDayGap: number } => {
  const peakDayGap = Math.abs(input.queryPeakDay - input.candidatePeakDay)
  const totalDaysRatio = Math.abs(input.queryTotalDays - input.candidateTotalDays)
    / Math.max(input.queryTotalDays, input.candidateTotalDays, 1)

  if (peakDayGap <= PEAK_GAP_POSITIVE_THRESHOLD && totalDaysRatio <= TOTAL_DAYS_RATIO_POSITIVE) {
    return { label: 'positive', peakDayGap }
  }

  if (peakDayGap > PEAK_GAP_NEGATIVE_THRESHOLD || totalDaysRatio > TOTAL_DAYS_RATIO_NEGATIVE) {
    return { label: 'negative', peakDayGap }
  }

  return { label: 'ambiguous', peakDayGap }
}
