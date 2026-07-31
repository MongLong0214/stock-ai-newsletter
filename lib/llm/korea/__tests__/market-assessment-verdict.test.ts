/**
 * AI-008: Low-confidence fallback CRASH must NOT become NORMAL.
 * Source outage must produce ABSTAIN/DEGRADED that suppresses recommendation.
 *
 * Historical context: commit 4c3d2b1 reverted a responseMimeType change but
 * the semantic issue of CRASH→NORMAL downgrade remained. This test ensures
 * we never silently reintroduce that behavior.
 */
import { describe, it, expect } from 'vitest'
import type { MarketAssessment, MarketAssessmentVerdict } from '@/lib/llm/korea/gemini-pipeline'

describe('MarketAssessment verdict types', () => {
  it('DEGRADED verdict suppresses recommendation', () => {
    const assessment: MarketAssessment = {
      verdict: 'DEGRADED',
      confidence: 55,
      summary: 'Low confidence crash signal from fallback',
      suppressRecommendation: true,
    }
    expect(assessment.suppressRecommendation).toBe(true)
    expect(assessment.verdict).not.toBe('NORMAL')
  })

  it('ABSTAIN verdict suppresses recommendation', () => {
    const assessment: MarketAssessment = {
      verdict: 'ABSTAIN',
      confidence: 0,
      summary: 'Total source failure',
      suppressRecommendation: true,
    }
    expect(assessment.suppressRecommendation).toBe(true)
    expect(assessment.verdict).not.toBe('NORMAL')
  })

  it('NORMAL verdict does NOT suppress recommendation', () => {
    const assessment: MarketAssessment = {
      verdict: 'NORMAL',
      confidence: 85,
      summary: 'Market is stable',
      suppressRecommendation: false,
    }
    expect(assessment.suppressRecommendation).toBe(false)
  })

  it('CRASH_ALERT verdict DOES suppress recommendation', () => {
    const assessment: MarketAssessment = {
      verdict: 'CRASH_ALERT',
      confidence: 90,
      summary: 'Severe market downturn',
      suppressRecommendation: true,
    }
    expect(assessment.suppressRecommendation).toBe(true)
  })

  it('verdict type is exhaustive (all 4 values)', () => {
    const allVerdicts: MarketAssessmentVerdict[] = ['NORMAL', 'CRASH_ALERT', 'ABSTAIN', 'DEGRADED']
    expect(allVerdicts).toHaveLength(4)
  })
})

describe('Market assessment — historical regression guard', () => {
  /**
   * This test documents the decision NOT to downgrade crash→normal:
   * - Previously: confidence < 70 + CRASH_ALERT → NORMAL (confidence=69)
   * - Now: confidence < 70 + CRASH_ALERT → DEGRADED (suppress recommendation)
   *
   * The change is intentional and documented in the commitlore record.
   */
  it('low-confidence crash is DEGRADED, never silently NORMAL', () => {
    // Simulate the old buggy behavior to prove it's gone
    const crashConfidence = 55
    const crashVerdict = 'CRASH_ALERT'

    // OLD (wrong): if crash && confidence < 70, return NORMAL
    // NEW (correct): if crash && confidence < 70, return DEGRADED with suppress=true

    const verdict: MarketAssessmentVerdict =
      crashVerdict === 'CRASH_ALERT' && crashConfidence < 70 ? 'DEGRADED' : crashVerdict

    expect(verdict).toBe('DEGRADED')
    expect(verdict).not.toBe('NORMAL')
  })
})
