import type { Stage } from '../types/db'
import type { ConfidenceLevel } from '../types/db'

export const QUALITY_GATE = {
  minScore: 50,
  excludeConfidence: ['low'] as ConfidenceLevel[],
  stageCaps: {
    Emerging: 12, Growth: 15, Peak: 25, Decline: 10,
  } satisfies Partial<Record<Stage, number>>,
  reignitingCap: 8,
} as const
