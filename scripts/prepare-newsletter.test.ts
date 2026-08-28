import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assessMarket: vi.fn(),
  collectDaily: vi.fn(),
  createClient: vi.fn(),
  generateCodePicks: vi.fn(),
  getLlmAnalysis: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/llm/korea/gemini-pipeline', () => ({ executeMarketAssessment: mocks.assessMarket }))
vi.mock('@/lib/llm/stock-analysis', () => ({ getStockAnalysis: mocks.getLlmAnalysis }))
vi.mock('@/scripts/stock-picks/collect-daily', () => ({ collectDailyStockPrices: mocks.collectDaily }))
vi.mock('@/scripts/stock-picks/generate-picks', () => ({ generatePicks: mocks.generateCodePicks }))

import { prepareNewsletter, resolveNewsletterAnalysis } from '@/scripts/prepare-newsletter'

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
        picksSource: 'crash',
      })
      expect(collectDaily).not.toHaveBeenCalled()
      expect(generateCodePicks).not.toHaveBeenCalled()
      expect(getLlmAnalysis).toHaveBeenCalledWith({ marketAssessment: crashAssessment })
    } finally {
      consoleLogSpy.mockRestore()
    }
  })

  it("upserts picks_source='crash' for a CRASH_ALERT newsletter", async () => {
    const select = vi.fn(async () => ({ error: null }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    mocks.createClient.mockReturnValue({ from })
    mocks.assessMarket.mockResolvedValue({
      verdict: 'CRASH_ALERT',
      confidence: 94,
      summary: 'upsert crash fixture',
    })
    mocks.getLlmAnalysis.mockResolvedValue({
      geminiAnalysis: '{"type":"crash_alert"}',
    })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await prepareNewsletter()

      expect(from).toHaveBeenCalledWith('newsletter_content')
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          gemini_analysis: '{"type":"crash_alert"}',
          picks_source: 'crash',
        }),
        { onConflict: 'newsletter_date' },
      )
      expect(select).toHaveBeenCalledOnce()
      expect(mocks.collectDaily).not.toHaveBeenCalled()
      expect(mocks.generateCodePicks).not.toHaveBeenCalled()
    } finally {
      consoleLogSpy.mockRestore()
      vi.unstubAllEnvs()
      vi.clearAllMocks()
    }
  })
})
