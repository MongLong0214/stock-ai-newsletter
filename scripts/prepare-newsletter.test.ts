import { describe, expect, it, vi } from 'vitest'

import { resolveNewsletterAnalysis } from '@/scripts/prepare-newsletter'

const NORMAL_ASSESSMENT = {
  verdict: 'NORMAL' as const,
  confidence: 90,
  summary: '정상 시장 fixture',
}

describe('prepare-newsletter stock-pick wiring', () => {
  it('uses the legacy LLM analysis when code pick generation fails', async () => {
    const collectDaily = vi.fn(async () => ({}))
    const generateCodePicks = vi.fn(async () => {
      throw new Error('synthetic code-pick failure')
    })
    const getLlmAnalysis = vi.fn(async () => ({ geminiAnalysis: '[{"fallback":true}]' }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const result = await resolveNewsletterAnalysis({
        assessMarket: async () => NORMAL_ASSESSMENT,
        collectDaily,
        generateCodePicks,
        getLlmAnalysis,
      })

      expect(result).toEqual({
        geminiAnalysis: '[{"fallback":true}]',
        picksSource: 'llm_fallback',
      })
      expect(collectDaily).toHaveBeenCalledOnce()
      expect(generateCodePicks).toHaveBeenCalledOnce()
      expect(getLlmAnalysis).toHaveBeenCalledWith({ marketAssessment: NORMAL_ASSESSMENT })
      expect(consoleLogSpy).toHaveBeenCalledWith('PICKS_SOURCE=llm_fallback')
    } finally {
      consoleErrorSpy.mockRestore()
      consoleLogSpy.mockRestore()
    }
  })

  it('keeps the LLM fallback idle when code picks succeed', async () => {
    const getLlmAnalysis = vi.fn()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const result = await resolveNewsletterAnalysis({
        assessMarket: async () => NORMAL_ASSESSMENT,
        collectDaily: vi.fn(async () => ({})),
        generateCodePicks: async () => '[{"source":"code"}]',
        getLlmAnalysis,
      })

      expect(result).toEqual({
        geminiAnalysis: '[{"source":"code"}]',
        picksSource: 'code',
      })
      expect(getLlmAnalysis).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('PICKS_SOURCE=code')
    } finally {
      consoleLogSpy.mockRestore()
    }
  })

  it('preserves the existing crash-analysis path without collecting stock prices', async () => {
    const crashAssessment = {
      verdict: 'CRASH_ALERT' as const,
      confidence: 91,
      summary: '폭락 경보 fixture',
    }
    const collectDaily = vi.fn()
    const generateCodePicks = vi.fn()
    const getLlmAnalysis = vi.fn(async () => ({ geminiAnalysis: '{"type":"crash_alert"}' }))
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const result = await resolveNewsletterAnalysis({
        assessMarket: async () => crashAssessment,
        collectDaily,
        generateCodePicks,
        getLlmAnalysis,
      })

      expect(result).toEqual({
        geminiAnalysis: '{"type":"crash_alert"}',
        picksSource: null,
      })
      expect(collectDaily).not.toHaveBeenCalled()
      expect(generateCodePicks).not.toHaveBeenCalled()
      expect(getLlmAnalysis).toHaveBeenCalledWith({ marketAssessment: crashAssessment })
    } finally {
      consoleLogSpy.mockRestore()
    }
  })
})
