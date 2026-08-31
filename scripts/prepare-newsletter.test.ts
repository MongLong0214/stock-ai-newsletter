import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assessMarket: vi.fn(),
  collectDaily: vi.fn(),
  createClient: vi.fn(),
  generateCodePicks: vi.fn(),
  getLlmAnalysis: vi.fn(),
  refreshStockMaster: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/llm/korea/gemini-pipeline', () => ({ executeMarketAssessment: mocks.assessMarket }))
vi.mock('@/lib/llm/stock-analysis', () => ({ getStockAnalysis: mocks.getLlmAnalysis }))
vi.mock('@/scripts/stock-picks/collect-daily', () => ({ collectDailyStockPrices: mocks.collectDaily }))
vi.mock('@/scripts/stock-picks/generate-picks', () => ({ generatePicks: mocks.generateCodePicks }))
vi.mock('@/scripts/stock-picks/load-stock-master', () => ({ loadStockMaster: mocks.refreshStockMaster }))

import { prepareNewsletter, resolveNewsletterAnalysis } from '@/scripts/prepare-newsletter'

const NORMAL_ASSESSMENT = {
  verdict: 'NORMAL' as const,
  confidence: 90,
  summary: '정상 시장 fixture',
}
const HEALTHY_COLLECTION = { successRate: 1, skippedForBudget: 0 }

const mockNewsletterClient = (existingNewsletter: {
  readonly is_sent: boolean
  readonly picks_source: 'code' | 'llm_fallback' | 'crash' | null
} | null) => {
  const maybeSingle = vi.fn(async () => ({ data: existingNewsletter, error: null }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const lookupSelect = vi.fn(() => ({ eq }))
  const writeSelect = vi.fn(async () => ({ error: null }))
  const upsert = vi.fn(() => ({ select: writeSelect }))
  const from = vi.fn(() => ({ select: lookupSelect, upsert }))
  mocks.createClient.mockReturnValue({ from })
  return { from, lookupSelect, upsert, writeSelect }
}

const mockSuccessfulCodePipeline = () => {
  mocks.assessMarket.mockResolvedValue(NORMAL_ASSESSMENT)
  mocks.refreshStockMaster.mockResolvedValue(undefined)
  mocks.collectDaily.mockResolvedValue(HEALTHY_COLLECTION)
  mocks.generateCodePicks.mockResolvedValue('[{"source":"code"}]')
}

describe('prepare-newsletter stock-pick wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the legacy LLM analysis when code pick generation fails', async () => {
    const collectDaily = vi.fn(async () => HEALTHY_COLLECTION)
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
        refreshStockMaster: vi.fn(async () => {}),
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
        collectDaily: vi.fn(async () => HEALTHY_COLLECTION),
        generateCodePicks: async () => '[{"source":"code"}]',
        getLlmAnalysis,
        refreshStockMaster: vi.fn(async () => {}),
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

  it.each([
    { report: { successRate: 0.9499, skippedForBudget: 0 }, reason: 'successRate=0.9499' },
    { report: { successRate: 1, skippedForBudget: 1 }, reason: 'skippedForBudget=1' },
  ])('falls back to LLM when daily collection coverage is insufficient: $reason', async ({ report, reason }) => {
    const generateCodePicks = vi.fn()
    const getLlmAnalysis = vi.fn(async () => ({ geminiAnalysis: '[{"fallback":true}]' }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const result = await resolveNewsletterAnalysis({
        assessMarket: async () => NORMAL_ASSESSMENT,
        collectDaily: async () => report,
        generateCodePicks,
        getLlmAnalysis,
        refreshStockMaster: vi.fn(async () => {}),
      })

      expect(result.picksSource).toBe('llm_fallback')
      expect(generateCodePicks).not.toHaveBeenCalled()
      expect(consoleErrorSpy.mock.calls.flat().join(' ')).toContain(reason)
    } finally {
      consoleErrorSpy.mockRestore()
      consoleLogSpy.mockRestore()
    }
  })

  it('warns on stock-master refresh failure and continues with collection and code picks', async () => {
    const refreshStockMaster = vi.fn(async () => {
      throw new Error('synthetic master failure')
    })
    const collectDaily = vi.fn(async () => HEALTHY_COLLECTION)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const result = await resolveNewsletterAnalysis({
        assessMarket: async () => NORMAL_ASSESSMENT,
        collectDaily,
        generateCodePicks: async () => '[{"source":"code"}]',
        getLlmAnalysis: vi.fn(),
        refreshStockMaster,
      })

      expect(result.picksSource).toBe('code')
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('기존 마스터로 계속 진행'))
      expect(refreshStockMaster.mock.invocationCallOrder[0]).toBeLessThan(collectDaily.mock.invocationCallOrder[0])
    } finally {
      consoleWarnSpy.mockRestore()
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
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const lookupSelect = vi.fn(() => ({ eq }))
    const writeSelect = vi.fn(async () => ({ error: null }))
    const upsert = vi.fn(() => ({ select: writeSelect }))
    const from = vi.fn(() => ({ select: lookupSelect, upsert }))
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
      expect(lookupSelect).toHaveBeenCalledWith('is_sent, picks_source')
      expect(writeSelect).toHaveBeenCalledOnce()
      expect(mocks.collectDaily).not.toHaveBeenCalled()
      expect(mocks.generateCodePicks).not.toHaveBeenCalled()
    } finally {
      consoleLogSpy.mockRestore()
      vi.unstubAllEnvs()
      vi.clearAllMocks()
    }
  })

  it('preserves an already-sent newsletter row during a backup run', async () => {
    const { upsert } = mockNewsletterClient({ is_sent: true, picks_source: 'llm_fallback' })
    mockSuccessfulCodePipeline()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await prepareNewsletter({ backupRun: true })

      expect(upsert).not.toHaveBeenCalled()
      expect(mocks.assessMarket).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('🛡️ 이미 발송된 뉴스레터 — 내용 보존')
    } finally {
      consoleLogSpy.mockRestore()
      vi.unstubAllEnvs()
      vi.clearAllMocks()
    }
  })

  it("skips a backup run when today's row already has picks_source='code'", async () => {
    const { upsert } = mockNewsletterClient({ is_sent: false, picks_source: 'code' })
    mockSuccessfulCodePipeline()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await prepareNewsletter({ backupRun: true })

      expect(upsert).not.toHaveBeenCalled()
      expect(mocks.assessMarket).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('🛡️ 이미 코드 픽 존재 — 백업 실행 건너뜀')
    } finally {
      consoleLogSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it("regenerates an existing llm_fallback row and promotes it to picks_source='code'", async () => {
    const { upsert } = mockNewsletterClient({ is_sent: false, picks_source: 'llm_fallback' })
    mockSuccessfulCodePipeline()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await prepareNewsletter({ backupRun: true })

      expect(mocks.generateCodePicks).toHaveBeenCalledOnce()
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ picks_source: 'code' }),
        { onConflict: 'newsletter_date' },
      )
    } finally {
      consoleLogSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it("creates today's row when a backup run finds no existing newsletter", async () => {
    const { upsert } = mockNewsletterClient(null)
    mockSuccessfulCodePipeline()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await prepareNewsletter({ backupRun: true })

      expect(mocks.generateCodePicks).toHaveBeenCalledOnce()
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ picks_source: 'code' }),
        { onConflict: 'newsletter_date' },
      )
    } finally {
      consoleLogSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
