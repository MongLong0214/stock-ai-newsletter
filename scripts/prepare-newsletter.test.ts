import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { siteConfig } from '@/lib/constants/seo/config'
import { MarketAssessmentUnavailableError } from '@/lib/market-data/market-assessment-policy'

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  assessMarket: vi.fn(),
  collectDaily: vi.fn(),
  createClient: vi.fn(),
  ensureToken: vi.fn(),
  generateCodePicks: vi.fn(),
  getLlmAnalysis: vi.fn(),
  persistSnapshot: vi.fn(),
  refreshStockMaster: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/app/archive/_utils/api/kis/client', () => ({ ensureKisAccessToken: mocks.ensureToken }))
vi.mock('@/lib/llm/korea/gemini-pipeline', () => ({ executeMarketAssessment: mocks.assessMarket }))
vi.mock('@/lib/llm/stock-analysis', () => ({ getStockAnalysis: mocks.getLlmAnalysis }))
vi.mock('@/lib/newsletter/alert', () => ({ sendNewsletterAlertEmail: mocks.alert }))
vi.mock('@/scripts/stock-picks/collect-daily', () => ({ collectDailyStockPrices: mocks.collectDaily }))
vi.mock('@/scripts/stock-picks/generate-picks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/stock-picks/generate-picks')>()
  return { ...actual, generatePicksWithMeta: mocks.generateCodePicks }
})
vi.mock('@/scripts/stock-picks/load-stock-master', () => ({ loadStockMaster: mocks.refreshStockMaster }))
vi.mock('@/scripts/stock-picks/pick-snapshots', () => ({
  persistStockPickSnapshot: mocks.persistSnapshot,
}))

import {
  parsePrepareNewsletterCliArgs,
  prepareNewsletter,
  resolveNewsletterAnalysis,
  runPrepareNewsletterCli,
} from '@/scripts/prepare-newsletter'

const TARGET_DATE = '2026-09-02'
const SIGNAL_DATE = '2026-09-01'
const NORMAL_ASSESSMENT = {
  verdict: 'NORMAL' as const,
  confidence: 90,
  summary: '정상 시장 fixture',
}
const HEALTHY_COLLECTION = {
  successRate: 1,
  skippedForBudget: 0,
  exactDateCoverageRate: 1,
  attemptedCalls: 3,
  successCount: 3,
  failureCount: 0,
  indexFailed: false,
  retriedSymbols: [],
  recoveredSymbols: [],
  persistedRows: 21,
  perDateSymbolCounts: {
    '2026-08-31': 3,
    [SIGNAL_DATE]: 3,
  },
}
const CODE_PICKS = JSON.stringify([
  { ticker: 'KOSPI:000001', name: '테스트1', close_price: 1000 },
  { ticker: 'KOSPI:000002', name: '테스트2', close_price: 2000 },
  { ticker: 'KOSPI:000003', name: '테스트3', close_price: 3000 },
].map((pick) => ({ ...pick, rationale: '관측한 가격과 거래량에 기반한 검증용 기술적 분석입니다. 미래 수익이나 상승 확률을 보장하지 않습니다.',
  signals: { trend_score: 50, momentum_score: 50, volume_score: 50, volatility_score: 50,
    pattern_score: 50, sentiment_score: 50, overall_score: 50 },
})))

const GENERATED_RESULT = {
  json: CODE_PICKS,
  picks: JSON.parse(CODE_PICKS),
  meta: {
    signalDate: SIGNAL_DATE,
    strategy: 'volumeBreakoutNoGapUp+volumeOnlyFill',
    strategyVersion: 'v1-2026-09-03',
    parameters: {},
    parametersHash: 'fixture-hash',
    funnel: {
      signalDate: SIGNAL_DATE,
      activeMasters: 4,
      withFreshKisRow: 4,
      withCompleteFeatures: 4,
      gatePassed: 4,
      picked: 3,
    },
    rankedCandidates: [
      { symbol: 'KOSPI:000001', name: '테스트1', score: 91, rank: 1, tier: 'breakout' },
      { symbol: 'KOSPI:000002', name: '테스트2', score: 87, rank: 2, tier: 'breakout' },
      { symbol: 'KOSPI:000003', name: '테스트3', score: 83, rank: 3, tier: 'volumeOnly' },
      { symbol: 'KOSPI:000004', name: '테스트4', score: 80, rank: 4, tier: 'volumeOnly' },
    ],
  },
}

interface NewsletterRow {
  readonly is_sent: boolean
  readonly picks_source: 'code' | 'llm_fallback' | 'crash' | null
}

const mockNewsletterClient = (input: {
  readonly reads: Array<NewsletterRow | null>
  readonly updateData?: readonly { readonly newsletter_date: string }[]
  readonly updateError?: { readonly message: string; readonly code?: string } | null
  readonly insertError?: { readonly message: string; readonly code?: string } | null
}) => {
  const reads = [...input.reads]
  const maybeSingle = vi.fn(async () => ({ data: reads.shift() ?? null, error: null }))
  const readEq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: readEq }))
  const updateSelect = vi.fn(async () => ({
    data: input.updateData ?? [{ newsletter_date: TARGET_DATE }],
    error: input.updateError ?? null,
  }))
  const updateBuilder = {
    eq: vi.fn(),
    select: updateSelect,
  }
  updateBuilder.eq.mockReturnValue(updateBuilder)
  const update = vi.fn(() => updateBuilder)
  const insertSelect = vi.fn(async () => ({ error: input.insertError ?? null }))
  const insert = vi.fn(() => ({ select: insertSelect }))
  const from = vi.fn(() => ({ insert, select, update }))
  mocks.createClient.mockReturnValue({ from })
  return { from, insert, insertSelect, update, updateSelect }
}

const findSummary = (logSpy: ReturnType<typeof vi.spyOn>) => logSpy.mock.calls
  .map(([line]) => String(line))
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line))
  .find((value) => value.event === 'prepare_run_summary')

describe('prepare-newsletter stock-pick wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Actions 실행 환경의 run 식별자가 스냅샷 run_id/git_sha 단언에 새어 들어오지 않게 고정
    vi.stubEnv('DISPATCH_ID', undefined)
    vi.stubEnv('GITHUB_RUN_ID', undefined)
    vi.stubEnv('GITHUB_SHA', undefined)
    mocks.alert.mockResolvedValue(undefined)
    mocks.assessMarket.mockResolvedValue(NORMAL_ASSESSMENT)
    mocks.collectDaily.mockResolvedValue(HEALTHY_COLLECTION)
    mocks.ensureToken.mockResolvedValue({ source: 'issued', expiresAt: Date.now() + 60_000 })
    mocks.generateCodePicks.mockResolvedValue(GENERATED_RESULT)
    mocks.getLlmAnalysis.mockResolvedValue({ geminiAnalysis: '[{"fallback":true}]' })
    mocks.persistSnapshot.mockResolvedValue(undefined)
    mocks.refreshStockMaster.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('aborts instead of replacing failed code picks with unvalidated LLM stocks', async () => {
    const generateCodePicks = vi.fn(async () => {
      throw new Error('synthetic code-pick failure')
    })
    const getLlmAnalysis = vi.fn(async () => ({ geminiAnalysis: '[{"fallback":true}]' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(resolveNewsletterAnalysis({
      assessMarket: async () => NORMAL_ASSESSMENT,
      collectDaily: async () => HEALTHY_COLLECTION,
      generateCodePicks,
      getLlmAnalysis,
      refreshStockMaster: vi.fn(async () => {}),
    })).rejects.toThrow('synthetic code-pick failure')

    expect(getLlmAnalysis).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalledWith('PICKS_SOURCE=llm_fallback')
  })

  it('keeps the LLM fallback idle when code picks succeed', async () => {
    const getLlmAnalysis = vi.fn()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await resolveNewsletterAnalysis({
      assessMarket: async () => NORMAL_ASSESSMENT,
      collectDaily: async () => HEALTHY_COLLECTION,
      generateCodePicks: async () => CODE_PICKS,
      getLlmAnalysis,
      refreshStockMaster: vi.fn(async () => {}),
    })

    expect(result).toEqual({ geminiAnalysis: CODE_PICKS, picksSource: 'code' })
    expect(getLlmAnalysis).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('PICKS_SOURCE=code')
  })

  it('warns without gating code picks when a historical collection date is below 80%', async () => {
    const getLlmAnalysis = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await resolveNewsletterAnalysis({
      assessMarket: async () => NORMAL_ASSESSMENT,
      collectDaily: async () => ({
        ...HEALTHY_COLLECTION,
        perDateSymbolCounts: {
          '2026-08-31': 2,
          [SIGNAL_DATE]: 3,
        },
      }),
      generateCodePicks: async () => CODE_PICKS,
      getLlmAnalysis,
      refreshStockMaster: vi.fn(async () => {}),
    })

    expect(result.picksSource).toBe('code')
    expect(getLlmAnalysis).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('2026-08-31=2/3'))
  })

  it.each([
    { report: { ...HEALTHY_COLLECTION, successRate: 0.9499 }, reason: 'successRate=0.9499' },
    { report: { ...HEALTHY_COLLECTION, skippedForBudget: 1 }, reason: 'skippedForBudget=1' },
    { report: { ...HEALTHY_COLLECTION, exactDateCoverageRate: 0.9699 }, reason: 'exactDateCoverageRate=0.9699' },
    { report: { ...HEALTHY_COLLECTION, exactDateCoverageRate: undefined }, reason: 'exactDateCoverageRate=missing' },
    { report: { ...HEALTHY_COLLECTION, exactDateCoverageRate: NaN }, reason: 'exactDateCoverageRate=NaN' },
    { report: { ...HEALTHY_COLLECTION, successRate: NaN }, reason: 'successRate=NaN' },
    { report: { ...HEALTHY_COLLECTION, successRate: 1.1 }, reason: 'successRate=1.1000' },
    { report: { ...HEALTHY_COLLECTION, skippedForBudget: -1 }, reason: 'skippedForBudget=-1' },
  ])('aborts when daily collection coverage is insufficient or invalid: $reason', async ({ report, reason }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const generateCodePicks = vi.fn()
    const getLlmAnalysis = vi.fn()
    await expect(resolveNewsletterAnalysis({
      assessMarket: async () => NORMAL_ASSESSMENT,
      collectDaily: async () => report,
      generateCodePicks,
      getLlmAnalysis,
      refreshStockMaster: vi.fn(async () => {}),
    })).rejects.toThrow(reason)
    expect(generateCodePicks).not.toHaveBeenCalled()
    expect(getLlmAnalysis).not.toHaveBeenCalled()
  })

  it('preserves the crash-analysis path without collecting stock prices', async () => {
    const collectDaily = vi.fn()
    const getLlmAnalysis = vi.fn(async () => ({ geminiAnalysis: '{"type":"crash_alert"}' }))
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await resolveNewsletterAnalysis({
      assessMarket: async () => ({ ...NORMAL_ASSESSMENT, verdict: 'CRASH_ALERT' }),
      collectDaily,
      generateCodePicks: vi.fn(),
      getLlmAnalysis,
    })

    expect(result).toEqual({ geminiAnalysis: '{"type":"crash_alert"}', picksSource: 'crash' })
    expect(collectDaily).not.toHaveBeenCalled()
  })

  it('parses target date, force, and dispatch-id CLI flags', () => {
    expect(parsePrepareNewsletterCliArgs([
      '--dry-run',
      '--backup-run',
      '--simulate-today=2026-09-01',
      '--target-date=2026-09-02',
      '--force',
      '--dispatch-id=dispatch-42',
      '--deadline-minutes=37',
    ])).toEqual({
      dryRun: true,
      backupRun: true,
      simulateTodayKst: '2026-09-01',
      targetDate: '2026-09-02',
      force: true,
      runId: 'dispatch-42',
      deadlineMinutes: 37,
    })
  })

  it('skips a non-trading target date unless force is set', async () => {
    mocks.generateCodePicks.mockResolvedValue(CODE_PICKS)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await prepareNewsletter({ dryRun: true, targetDate: '2026-08-30' })

    expect(mocks.ensureToken).not.toHaveBeenCalled()
    expect(mocks.assessMarket).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({
      event: 'prepare_skipped',
      reason: 'non_trading_day',
      targetDate: '2026-08-30',
    }))

    await prepareNewsletter({ dryRun: true, force: true, targetDate: '2026-08-30' })
    expect(mocks.assessMarket).toHaveBeenCalledOnce()
    expect(mocks.collectDaily).toHaveBeenCalledWith(expect.objectContaining({
      endDate: '2026-08-28',
      deadlineAt: expect.any(Number),
    }))
    expect(mocks.generateCodePicks).toHaveBeenCalledWith({ todayKst: '2026-08-30' })
  })

  it('records token warmup, signal date, run id, collection, and picks in the summary', async () => {
    mocks.ensureToken.mockResolvedValue({ source: 'storage', expiresAt: Date.now() + 7_200_000 })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await prepareNewsletter({ dryRun: true, targetDate: TARGET_DATE, runId: 'run-123' })

    expect(mocks.ensureToken).toHaveBeenCalledWith({ minRemainingMs: 90 * 60_000 })
    expect(mocks.collectDaily).toHaveBeenCalledWith(expect.objectContaining({
      endDate: SIGNAL_DATE,
      deadlineAt: expect.any(Number),
    }))
    expect(mocks.generateCodePicks).toHaveBeenCalledWith({ todayKst: TARGET_DATE })
    expect(mocks.persistSnapshot).not.toHaveBeenCalled()
    expect(findSummary(logSpy)).toMatchObject({
      event: 'prepare_run_summary',
      targetDate: TARGET_DATE,
      signalDate: SIGNAL_DATE,
      runId: 'run-123',
      picksSource: 'code',
      tokenWarmup: 'storage',
      collection: { exactDateCoverageRate: 1, persistedRows: 21 },
      candidateCount: 4,
      budget: {
        deadlineMinutes: 38,
        remainingSecAtCollection: expect.any(Number),
        remainingSecAtPicks: expect.any(Number),
      },
      picks: [
        { rank: 1, ticker: 'KOSPI:000001', score: 91 },
        { rank: 2, ticker: 'KOSPI:000002', score: 87 },
        { rank: 3, ticker: 'KOSPI:000003', score: 83 },
      ],
    })
  })

  it('writes the same structured summary to PREPARE_SUMMARY_PATH', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'prepare-summary-'))
    const summaryPath = join(temporaryDirectory, 'nested', 'summary.json')
    vi.stubEnv('PREPARE_SUMMARY_PATH', summaryPath)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await prepareNewsletter({ dryRun: true, targetDate: TARGET_DATE, runId: 'file-run' })
      const fileSummary = JSON.parse(await readFile(summaryPath, 'utf8'))

      expect(fileSummary).toEqual(findSummary(logSpy))
      expect(fileSummary).toMatchObject({
        event: 'prepare_run_summary',
        targetDate: TARGET_DATE,
        runId: 'file-run',
      })
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  it('rejects invalid target dates before doing work', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(prepareNewsletter({ dryRun: true, targetDate: '2026-02-30' }))
      .rejects.toThrow('유효한 날짜')
    expect(mocks.ensureToken).not.toHaveBeenCalled()
    expect(mocks.assessMarket).not.toHaveBeenCalled()
  })

  it('does not generate, save or send an alert in a failed dry run', async () => {
    mocks.collectDaily.mockResolvedValue({ ...HEALTHY_COLLECTION, exactDateCoverageRate: 0.5 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(await runPrepareNewsletterCli(['--dry-run', `--target-date=${TARGET_DATE}`])).toBe(1)

    expect(mocks.generateCodePicks).not.toHaveBeenCalled()
    expect(mocks.alert).not.toHaveBeenCalled()
    expect(mocks.getLlmAnalysis).not.toHaveBeenCalled()
    expect(mocks.persistSnapshot).not.toHaveBeenCalled()
    expect(findSummary(logSpy)).toBeUndefined()
  })

  it('does not overwrite a row that becomes sent during the final CAS update', async () => {
    const client = mockNewsletterClient({
      reads: [
        { is_sent: false, picks_source: 'llm_fallback' },
        { is_sent: true, picks_source: 'llm_fallback' },
      ],
      updateData: [],
    })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await prepareNewsletter({ targetDate: TARGET_DATE })

    expect(client.update).toHaveBeenCalledWith(expect.objectContaining({ picks_source: 'code' }))
    expect(client.insert).not.toHaveBeenCalled()
    expect(mocks.persistSnapshot).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({
      event: 'prepare_write_skipped',
      reason: 'already_sent',
    }))
  })

  it('inserts a new newsletter row and writes the structured summary', async () => {
    const client = mockNewsletterClient({ reads: [null] })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await prepareNewsletter({ targetDate: TARGET_DATE })

    expect(client.insert).toHaveBeenCalledWith(expect.objectContaining({
      newsletter_date: TARGET_DATE,
      picks_source: 'code',
    }))
    expect(mocks.persistSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      signal_date: SIGNAL_DATE,
      strategy: 'volumeBreakoutNoGapUp+volumeOnlyFill',
      strategy_version: 'v1-2026-09-03',
      parameters_hash: 'fixture-hash',
      run_id: null,
      picks: expect.arrayContaining([expect.objectContaining({ tier: 'breakout' })]),
      top_candidates: expect.arrayContaining([expect.objectContaining({ tier: 'volumeOnly' })]),
    }))
    expect(findSummary(logSpy)).toMatchObject({ event: 'prepare_run_summary', picksSource: 'code' })
  })

  it('warns but still writes the newsletter when snapshot persistence fails', async () => {
    const client = mockNewsletterClient({ reads: [null] })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    mocks.persistSnapshot.mockRejectedValue(new Error('snapshot unavailable'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await prepareNewsletter({ targetDate: TARGET_DATE })

    expect(client.insert).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('snapshot unavailable'))
    expect(findSummary(logSpy)).toMatchObject({
      warnings: expect.arrayContaining([expect.stringContaining('snapshot unavailable')]),
    })
  })

  it('alerts and returns exit code 1 on an unhandled CLI failure', async () => {
    mockNewsletterClient({ reads: [null] })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    mocks.assessMarket.mockRejectedValue(new Error('synthetic hard failure'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await runPrepareNewsletterCli([`--target-date=${TARGET_DATE}`])

    expect(result).toBe(1)
    expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({
      subject: `[${siteConfig.serviceName}] ${TARGET_DATE} prepare 실패 — 수동 조치 필요`,
      lines: [expect.stringContaining('synthetic hard failure')],
    }))
  })

  it('does not write code picks when collection exhausts the deadline', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-09-02T00:00:00.000Z')
    vi.setSystemTime(startedAt)
    const client = mockNewsletterClient({ reads: [null] })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    mocks.collectDaily.mockImplementation(async () => {
      vi.setSystemTime(new Date(startedAt.getTime() + 10 * 60_000))
      return HEALTHY_COLLECTION
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await runPrepareNewsletterCli([
      `--target-date=${TARGET_DATE}`,
      '--deadline-minutes=10',
    ])

    expect(result).toBe(1)
    expect(mocks.getLlmAnalysis).not.toHaveBeenCalled()
    expect(client.insert).not.toHaveBeenCalled()
    expect(client.update).not.toHaveBeenCalled()
    expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({
      subject: `[${siteConfig.serviceName}] ${TARGET_DATE} prepare 실패 — 수동 조치 필요`,
      lines: [expect.stringContaining('prepare deadline exceeded before collection completion')],
    }))
    expect(errorSpy).toHaveBeenCalledWith(JSON.stringify({
      event: 'prepare_aborted',
      reason: 'deadline',
    }))
  })

  it('keeps the workflow inside the recovery window and marks LLM fallback red', async () => {
    const workflow = await readFile('.github/workflows/prepare-newsletter.yml', 'utf8')

    expect(workflow).toContain('timeout-minutes: 45')
    expect(workflow).toContain('timeout-minutes: 42')
    expect(workflow).toContain("PREPARE_DEADLINE_MINUTES: '38'")
    expect(workflow).toContain('::error::코드 픽 실패 — LLM fallback으로 발행됨')
    expect(workflow).toMatch(/PICKS_SOURCE=llm_fallback[\s\S]*exit 1/)
  })

  it('aborts on unavailable market data without code picks, stock fallback, or database writes', async () => {
    const client = mockNewsletterClient({ reads: [null] })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    mocks.assessMarket.mockRejectedValue(new MarketAssessmentUnavailableError('fresh US quotes missing'))
    const result = await runPrepareNewsletterCli([`--target-date=${TARGET_DATE}`])
    expect(result).toBe(1)
    expect(mocks.getLlmAnalysis).not.toHaveBeenCalled()
    expect(mocks.collectDaily).not.toHaveBeenCalled()
    expect(mocks.generateCodePicks).not.toHaveBeenCalled()
    expect(client.insert).not.toHaveBeenCalled()
    expect(client.update).not.toHaveBeenCalled()
    expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.stringContaining('NORMAL 처리 및 종목 추천을 중단')],
    }))
  })

  it.each(['duplicate', 'nonfinite', 'fractional', 'wrong-date', 'invalid-json'])(
    'rejects invalid generated output before persistence: %s', async (kind) => {
      const client = mockNewsletterClient({ reads: [null] })
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
      const picks = JSON.parse(CODE_PICKS)
      if (kind === 'duplicate') picks[2] = picks[0]
      if (kind === 'nonfinite') picks[0].close_price = NaN
      if (kind === 'fractional') picks[0].close_price = 100.5
      mocks.generateCodePicks.mockResolvedValue({
        ...GENERATED_RESULT,
        json: kind === 'invalid-json' ? 'invalid' : JSON.stringify(picks),
        meta: { ...GENERATED_RESULT.meta, signalDate: kind === 'wrong-date' ? '2026-08-31' : SIGNAL_DATE },
      })
      expect(await runPrepareNewsletterCli([`--target-date=${TARGET_DATE}`])).toBe(1)
      expect(client.insert).not.toHaveBeenCalled()
      expect(client.update).not.toHaveBeenCalled()
      expect(mocks.persistSnapshot).not.toHaveBeenCalled()
      expect(mocks.getLlmAnalysis).not.toHaveBeenCalled()
    },
  )

  it.each(['CRASH_ALERT', 'unavailable'] as const)('rechecks an expired NORMAL assessment before writing: %s', async (verdict) => {
    vi.useFakeTimers()
    const started = new Date('2026-09-02T06:00:00+09:00')
    vi.setSystemTime(started)
    const client = mockNewsletterClient({ reads: [null] })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
    mocks.collectDaily.mockImplementation(async () => {
      vi.setSystemTime(new Date(started.getTime() + 11 * 60_000))
      return HEALTHY_COLLECTION
    })
    mocks.assessMarket.mockResolvedValueOnce(NORMAL_ASSESSMENT)
    if (verdict === 'unavailable') {
      mocks.assessMarket.mockRejectedValueOnce(new MarketAssessmentUnavailableError('final market data unavailable'))
    } else {
      mocks.assessMarket.mockResolvedValueOnce({ ...NORMAL_ASSESSMENT, verdict })
      mocks.getLlmAnalysis.mockResolvedValue({ geminiAnalysis: '{"type":"crash_alert"}' })
    }
    expect(await runPrepareNewsletterCli([`--target-date=${TARGET_DATE}`])).toBe(verdict === 'CRASH_ALERT' ? 0 : 1)
    expect(mocks.assessMarket).toHaveBeenCalledTimes(2)
    expect(mocks.persistSnapshot).not.toHaveBeenCalled()
    if (verdict === 'CRASH_ALERT') {
      expect(client.insert).toHaveBeenCalledWith(expect.objectContaining({ picks_source: 'crash' }))
    } else {
      expect(client.insert).not.toHaveBeenCalled()
      expect(mocks.getLlmAnalysis).not.toHaveBeenCalled()
    }
  })
})
