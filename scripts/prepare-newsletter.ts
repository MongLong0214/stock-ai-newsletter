import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import { ensureKisAccessToken } from '@/app/archive/_utils/api/kis/client'
import { siteConfig } from '@/lib/constants/seo/config'
import type { StockData } from '@/lib/llm/_types/stock-data'
import type { MarketAssessment } from '@/lib/llm/korea/gemini-pipeline'
import { executeMarketAssessment } from '@/lib/llm/korea/gemini-pipeline'
import {
  getStockAnalysis,
  type StockAnalysisOptions,
  type StockAnalysisResult,
} from '@/lib/llm/stock-analysis'
import { sendNewsletterAlertEmail } from '@/lib/newsletter/alert'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import { collectDailyStockPrices } from '@/scripts/stock-picks/collect-daily'
import {
  generatePicksWithMeta,
  getExpectedSignalDate,
  type GeneratePicksResult,
} from '@/scripts/stock-picks/generate-picks'
import { loadStockMaster } from '@/scripts/stock-picks/load-stock-master'
import { persistStockPickSnapshot } from '@/scripts/stock-picks/pick-snapshots'

export type PicksSource = 'code' | 'llm_fallback' | 'crash'
export const MIN_DAILY_COLLECTION_SUCCESS_RATE = 0.95
export const MIN_EXACT_DATE_COVERAGE_RATE = 0.97
export const MIN_HISTORICAL_DATE_COVERAGE_RATE = 0.8
export const DEFAULT_PREPARE_DEADLINE_MINUTES = 38
const MIN_LLM_FALLBACK_REMAINING_MS = 6 * 60_000

interface DailyCollectionCoverageReport {
  readonly successRate: number
  readonly skippedForBudget: number
  readonly exactDateCoverageRate?: number
  readonly attemptedCalls?: number
  readonly successCount?: number
  readonly failureCount?: number
  readonly indexFailed?: boolean
  readonly retriedSymbols?: readonly string[]
  readonly recoveredSymbols?: readonly string[]
  readonly persistedRows?: number
  readonly perDateSymbolCounts?: Readonly<Record<string, number>>
}

export interface NewsletterAnalysisResult {
  readonly geminiAnalysis: string
  readonly picksSource: PicksSource
}

type CodePicksResult = string | GeneratePicksResult

export interface NewsletterPipelineDependencies {
  readonly assessMarket?: () => Promise<MarketAssessment>
  readonly collectDaily?: (input?: {
    readonly endDate?: string
    readonly deadlineAt?: number
  }) => Promise<DailyCollectionCoverageReport>
  readonly generateCodePicks?: (input?: { readonly todayKst?: string }) => Promise<CodePicksResult>
  readonly getLlmAnalysis?: (options?: StockAnalysisOptions) => Promise<StockAnalysisResult>
  readonly refreshStockMaster?: () => Promise<void>
}

interface PipelineDurations {
  assessment: number
  master: number
  collection: number
  picks: number
}

interface NewsletterPipelineResult extends NewsletterAnalysisResult {
  readonly assessment: MarketAssessment
  readonly collection: DailyCollectionCoverageReport | null
  readonly generated: GeneratePicksResult | null
  readonly fallbackReason: string | null
  readonly durationsMs: PipelineDurations
  readonly warnings: readonly string[]
  readonly budget: {
    readonly remainingSecAtCollection: number | null
    readonly remainingSecAtPicks: number | null
  }
}

const elapsedMs = (startedAt: number): number => Date.now() - startedAt
const remainingMs = (deadlineAt: number): number => deadlineAt - Date.now()
const remainingSec = (deadlineAt: number): number => Math.max(0, Math.floor(remainingMs(deadlineAt) / 1_000))

type PrepareDeadlineError = Error & {
  readonly kind: 'prepare_deadline'
  readonly stage: string
}

const createPrepareDeadlineError = (stage: string): PrepareDeadlineError => Object.assign(
  new Error(`prepare deadline exceeded before ${stage}`),
  { kind: 'prepare_deadline' as const, stage },
)

const isPrepareDeadlineError = (error: unknown): error is PrepareDeadlineError => (
  error instanceof Error && 'kind' in error && error.kind === 'prepare_deadline'
)

function abortForDeadline(stage: string): never {
  console.error(JSON.stringify({ event: 'prepare_aborted', reason: 'deadline' }))
  throw createPrepareDeadlineError(stage)
}

async function runNewsletterPipeline(input: {
  readonly targetDate: string
  readonly signalDate: string
  readonly deadlineAt: number
  readonly dependencies?: NewsletterPipelineDependencies
}): Promise<NewsletterPipelineResult> {
  const dependencies = input.dependencies ?? {}
  const assessMarket = dependencies.assessMarket ?? executeMarketAssessment
  const collectDaily = dependencies.collectDaily ?? collectDailyStockPrices
  const generateCodePicks = dependencies.generateCodePicks
    ?? ((options) => generatePicksWithMeta({ todayKst: options?.todayKst }))
  const getLlmAnalysis = dependencies.getLlmAnalysis ?? getStockAnalysis
  const refreshStockMaster = dependencies.refreshStockMaster ?? loadStockMaster
  const durationsMs: PipelineDurations = { assessment: 0, master: 0, collection: 0, picks: 0 }
  const warnings: string[] = []
  const budget: NewsletterPipelineResult['budget'] = {
    remainingSecAtCollection: null,
    remainingSecAtPicks: null,
  }

  if (remainingMs(input.deadlineAt) <= 0) abortForDeadline('market assessment')
  const assessmentStartedAt = Date.now()
  const assessment = await assessMarket()
  durationsMs.assessment = elapsedMs(assessmentStartedAt)

  if (assessment.verdict === 'CRASH_ALERT') {
    console.log('\n🚨 [CRASH_ALERT] 기존 폭락 분석 Pipeline 실행')
    if (remainingMs(input.deadlineAt) <= 0) abortForDeadline('crash analysis')
    const picksStartedAt = Date.now()
    budget.remainingSecAtPicks = remainingSec(input.deadlineAt)
    const result = await getLlmAnalysis({ marketAssessment: assessment })
    durationsMs.picks = elapsedMs(picksStartedAt)
    if (remainingMs(input.deadlineAt) <= 0) abortForDeadline('crash analysis completion')
    return {
      geminiAnalysis: result.geminiAnalysis,
      picksSource: 'crash',
      assessment,
      collection: null,
      generated: null,
      fallbackReason: null,
      durationsMs,
      warnings,
      budget,
    }
  }

  console.log('\n✅ [NORMAL] 일일 수집 → 코드 종목 추천 Pipeline 실행')
  const masterStartedAt = Date.now()
  try {
    await refreshStockMaster()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const warning = `종목 마스터 일일 갱신 실패 — 기존 마스터로 계속 진행: ${reason}`
    warnings.push(warning)
    console.warn(`⚠️ ${warning}`)
  } finally {
    durationsMs.master = elapsedMs(masterStartedAt)
  }

  let collection: DailyCollectionCoverageReport | null = null
  try {
    budget.remainingSecAtCollection = remainingSec(input.deadlineAt)
    const collectionStartedAt = Date.now()
    collection = await collectDaily({
      endDate: input.signalDate,
      deadlineAt: input.deadlineAt,
    })
    durationsMs.collection = elapsedMs(collectionStartedAt)
    if (remainingMs(input.deadlineAt) <= 0) abortForDeadline('collection completion')
    const exactDateCoverageRate = collection.exactDateCoverageRate ?? 1
    if (
      collection.successRate < MIN_DAILY_COLLECTION_SUCCESS_RATE
      || collection.skippedForBudget > 0
      || exactDateCoverageRate < MIN_EXACT_DATE_COVERAGE_RATE
    ) {
      throw new Error(
        `일일 수집 커버리지 게이트 실패: successRate=${collection.successRate.toFixed(4)}`
        + ` (minimum=${MIN_DAILY_COLLECTION_SUCCESS_RATE}), skippedForBudget=${collection.skippedForBudget}`
        + `, exactDateCoverageRate=${exactDateCoverageRate.toFixed(4)}`
        + ` (minimum=${MIN_EXACT_DATE_COVERAGE_RATE})`,
      )
    }
    if (collection.indexFailed) {
      const warning = 'KOSPI 지수 수집 실패 — anchor 거래일 인덱스로 계속 진행'
      warnings.push(warning)
      console.warn(`⚠️ ${warning}`)
    }
    const attemptedSymbols = collection.attemptedCalls ?? 0
    const sparseHistoricalDates = attemptedSymbols > 0
      ? Object.entries(collection.perDateSymbolCounts ?? {})
          .filter(([date, count]) => (
            date !== input.signalDate
            && count / attemptedSymbols < MIN_HISTORICAL_DATE_COVERAGE_RATE
          ))
          .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      : []
    if (sparseHistoricalDates.length > 0) {
      const details = sparseHistoricalDates.map(([date, count]) => (
        `${date}=${count}/${attemptedSymbols}`
      )).join(', ')
      const warning = `일봉 수집 창 희소 날짜 — ${details}`
      warnings.push(warning)
      console.warn(`⚠️ ${warning}`)
    }

    if (remainingMs(input.deadlineAt) <= 0) abortForDeadline('code picks')
    const picksStartedAt = Date.now()
    budget.remainingSecAtPicks = remainingSec(input.deadlineAt)
    const codeResult = await generateCodePicks({ todayKst: input.targetDate })
    durationsMs.picks = elapsedMs(picksStartedAt)
    if (remainingMs(input.deadlineAt) <= 0) abortForDeadline('code picks completion')
    const generated = typeof codeResult === 'string'
      ? null
      : codeResult
    const geminiAnalysis = typeof codeResult === 'string' ? codeResult : codeResult.json
    console.log('PICKS_SOURCE=code')
    return {
      geminiAnalysis,
      picksSource: 'code',
      assessment,
      collection,
      generated,
      fallbackReason: null,
      durationsMs,
      warnings,
      budget,
    }
  } catch (error) {
    if (isPrepareDeadlineError(error)) throw error
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`\n${'━'.repeat(80)}`)
    console.error('🚨 코드 종목 추천 Pipeline 실패 — 기존 LLM Pipeline fallback')
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    console.error(`${'━'.repeat(80)}\n`)
    warnings.push(`LLM fallback: ${reason}`)
    const fallbackRemainingMs = remainingMs(input.deadlineAt)
    budget.remainingSecAtPicks = Math.max(0, Math.floor(fallbackRemainingMs / 1_000))
    if (fallbackRemainingMs < MIN_LLM_FALLBACK_REMAINING_MS) {
      abortForDeadline('LLM fallback')
    }
    console.log('PICKS_SOURCE=llm_fallback')
    const picksStartedAt = Date.now()
    const result = await getLlmAnalysis({ marketAssessment: assessment })
    durationsMs.picks += elapsedMs(picksStartedAt)
    if (remainingMs(input.deadlineAt) <= 0) abortForDeadline('LLM fallback completion')
    return {
      geminiAnalysis: result.geminiAnalysis,
      picksSource: 'llm_fallback',
      assessment,
      collection,
      generated: null,
      fallbackReason: reason,
      durationsMs,
      warnings,
      budget,
    }
  }
}

export async function resolveNewsletterAnalysis(
  dependencies: NewsletterPipelineDependencies = {},
): Promise<NewsletterAnalysisResult> {
  const targetDate = getKSTDateString()
  const deadlineAt = Date.now() + DEFAULT_PREPARE_DEADLINE_MINUTES * 60_000
  const result = await runNewsletterPipeline({
    targetDate,
    signalDate: getExpectedSignalDate(targetDate),
    deadlineAt,
    dependencies,
  })
  return { geminiAnalysis: result.geminiAnalysis, picksSource: result.picksSource }
}

const createNewsletterClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  })
}

type NewsletterClient = ReturnType<typeof createNewsletterClient>

interface ExistingNewsletterRow {
  readonly is_sent: boolean
  readonly picks_source: string | null
}

const readNewsletter = async (
  client: NewsletterClient,
  targetDate: string,
): Promise<ExistingNewsletterRow | null> => {
  const { data, error } = await client
    .from('newsletter_content')
    .select('is_sent, picks_source')
    .eq('newsletter_date', targetDate)
    .maybeSingle()
  if (error) throw new Error(`Database error: ${error.message}`)
  return data
}

const writeNewsletterWithCas = async (input: {
  readonly client: NewsletterClient
  readonly targetDate: string
  readonly existing: ExistingNewsletterRow | null
  readonly payload: {
    readonly newsletter_date: string
    readonly gemini_analysis: string
    readonly picks_source: PicksSource
    readonly created_at: string
  }
}): Promise<'written' | 'already_sent'> => {
  const updateUnsent = async (): Promise<'written' | 'missing' | 'already_sent'> => {
    const { data, error } = await input.client
      .from('newsletter_content')
      .update(input.payload)
      .eq('newsletter_date', input.targetDate)
      .eq('is_sent', false)
      .select('newsletter_date')
    if (error) throw new Error(`Database error: ${error.message}`)
    if ((data ?? []).length > 0) return 'written'
    const current = await readNewsletter(input.client, input.targetDate)
    if (current?.is_sent) {
      console.log(JSON.stringify({ event: 'prepare_write_skipped', reason: 'already_sent' }))
      return 'already_sent'
    }
    return 'missing'
  }

  const insertNew = async (): Promise<'written' | 'retry_update' | 'already_sent'> => {
    const { error } = await input.client
      .from('newsletter_content')
      .insert(input.payload)
      .select('newsletter_date')
    if (!error) return 'written'
    if (error.code !== '23505') throw new Error(`Database error: ${error.message}`)
    const current = await readNewsletter(input.client, input.targetDate)
    if (current?.is_sent) {
      console.log(JSON.stringify({ event: 'prepare_write_skipped', reason: 'already_sent' }))
      return 'already_sent'
    }
    return 'retry_update'
  }

  if (input.existing) {
    const updated = await updateUnsent()
    if (updated === 'written' || updated === 'already_sent') return updated
  }
  const inserted = await insertNew()
  if (inserted === 'written' || inserted === 'already_sent') return inserted
  const updated = await updateUnsent()
  if (updated === 'missing') throw new Error('Database error: newsletter row disappeared during CAS retry')
  return updated
}

export interface PrepareNewsletterOptions {
  readonly dryRun?: boolean
  readonly backupRun?: boolean
  readonly simulateTodayKst?: string
  readonly targetDate?: string
  readonly force?: boolean
  readonly runId?: string
  readonly deadlineMinutes?: number
}

interface PrepareRunSummary {
  readonly event: 'prepare_run_summary'
  readonly targetDate: string
  readonly signalDate: string
  readonly runId: string | null
  readonly picksSource: PicksSource
  readonly verdict: MarketAssessment['verdict']
  readonly confidence: number
  readonly tokenWarmup: 'memory' | 'storage' | 'issued' | 'failed'
  readonly collection: {
    readonly attemptedCalls: number
    readonly successCount: number
    readonly failureCount: number
    readonly exactDateCoverageRate: number
    readonly indexFailed: boolean
    readonly skippedForBudget: number
    readonly retriedSymbols: readonly string[]
    readonly recoveredSymbols: readonly string[]
    readonly persistedRows: number
  }
  readonly picks: readonly {
    readonly rank: number
    readonly ticker: string
    readonly name: string
    readonly close_price: number
    readonly score: number
  }[]
  readonly candidateCount: number
  readonly durationsSec: {
    readonly assessment: number
    readonly master: number
    readonly collection: number
    readonly picks: number
    readonly total: number
  }
  readonly warnings: readonly string[]
  readonly budget: {
    readonly deadlineMinutes: number
    readonly remainingSecAtCollection: number | null
    readonly remainingSecAtPicks: number | null
  }
}

const assertIsoDate = (value: string, name: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} 형식은 YYYY-MM-DD여야 합니다: ${value}`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name}가 유효한 날짜가 아닙니다: ${value}`)
  }
}

const emitPrepareSummary = async (summary: PrepareRunSummary): Promise<void> => {
  console.log(JSON.stringify(summary))
  const summaryPath = process.env.PREPARE_SUMMARY_PATH
  if (!summaryPath) return
  await mkdir(dirname(summaryPath), { recursive: true })
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
}

const parsePicks = (json: string): StockData[] => {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((pick): pick is StockData => (
      typeof pick === 'object' && pick !== null
      && typeof pick.ticker === 'string'
      && typeof pick.name === 'string'
      && typeof pick.close_price === 'number'
    )) : []
  } catch {
    return []
  }
}

export async function prepareNewsletter(options: PrepareNewsletterOptions = {}): Promise<void> {
  const totalStartedAt = Date.now()
  const configuredDeadline = options.deadlineMinutes
    ?? (process.env.PREPARE_DEADLINE_MINUTES === undefined
      ? DEFAULT_PREPARE_DEADLINE_MINUTES
      : Number(process.env.PREPARE_DEADLINE_MINUTES))
  if (!Number.isFinite(configuredDeadline) || configuredDeadline <= 0) {
    throw new Error(`PREPARE_DEADLINE_MINUTES는 양수여야 합니다: ${configuredDeadline}`)
  }
  const deadlineMinutes = configuredDeadline
  const deadlineAt = totalStartedAt + deadlineMinutes * 60_000
  if (options.simulateTodayKst && !options.dryRun) {
    throw new Error('simulateTodayKst는 dry-run에서만 허용됩니다 (발송분 오염 방지)')
  }
  const targetDate = options.targetDate ?? getKSTDateString()
  assertIsoDate(targetDate, 'targetDate')
  if (options.simulateTodayKst) assertIsoDate(options.simulateTodayKst, 'simulateTodayKst')
  if (!isKoreanTradingDate(targetDate) && !options.force) {
    console.log(JSON.stringify({ event: 'prepare_skipped', reason: 'non_trading_day', targetDate }))
    return
  }
  const signalTargetDate = options.simulateTodayKst ?? targetDate
  const signalDate = getExpectedSignalDate(signalTargetDate)
  const runId = options.runId ?? process.env.DISPATCH_ID ?? process.env.GITHUB_RUN_ID ?? null
  const modeLabel = [options.dryRun ? 'DRY-RUN' : '', options.backupRun ? 'BACKUP' : '']
    .filter(Boolean)
    .join(', ')
  console.log(`🚀 뉴스레터 준비 작업 시작...${modeLabel ? ` [${modeLabel}]` : ''}\n`)
  console.log(`📅 뉴스레터 날짜: ${targetDate}`)

  const client = options.dryRun ? null : createNewsletterClient()
  const existingNewsletter = client ? await readNewsletter(client, targetDate) : null
  if (existingNewsletter?.is_sent) {
    console.log('🛡️ 이미 발송된 뉴스레터 — 내용 보존')
    return
  }
  if (options.backupRun && existingNewsletter?.picks_source === 'code') {
    console.log('🛡️ 이미 코드 픽 존재 — 백업 실행 건너뜀')
    return
  }

  let tokenWarmup: PrepareRunSummary['tokenWarmup'] = 'failed'
  const warnings: string[] = []
  try {
    tokenWarmup = (await ensureKisAccessToken({ minRemainingMs: 90 * 60_000 })).source
  } catch (error) {
    const warning = `KIS token warmup 실패: ${error instanceof Error ? error.message : String(error)}`
    warnings.push(warning)
    console.warn(`⚠️ ${warning}`)
  }

  const pipeline = await runNewsletterPipeline({
    targetDate: signalTargetDate,
    signalDate,
    deadlineAt,
  })
  warnings.push(...pipeline.warnings)
  console.log('✅ 뉴스레터 분석 완료\n')

  if (pipeline.picksSource === 'llm_fallback') {
    const collection = pipeline.collection
    await sendNewsletterAlertEmail({
      subject: `[${siteConfig.serviceName}] ${targetDate} 코드 픽 실패 — LLM fallback으로 발행 예정`,
      lines: [
        `실패 원인: ${pipeline.fallbackReason ?? 'unknown'}`,
        `attemptedCalls=${collection?.attemptedCalls ?? 0}`,
        `successCount=${collection?.successCount ?? 0}`,
        `failureCount=${collection?.failureCount ?? 0}`,
        `exactDateCoverageRate=${collection?.exactDateCoverageRate ?? 0}`,
        `skippedForBudget=${collection?.skippedForBudget ?? 0}`,
      ],
    })
  }
  if (remainingMs(deadlineAt) <= 0) abortForDeadline('summary and database write')

  const rawPicks = pipeline.picksSource === 'code' ? parsePicks(pipeline.geminiAnalysis) : []
  const scoreBySymbol = new Map(
    pipeline.generated?.meta.rankedCandidates.map((candidate) => [candidate.symbol, candidate.score]) ?? [],
  )
  const summary: PrepareRunSummary = {
    event: 'prepare_run_summary',
    targetDate,
    signalDate,
    runId,
    picksSource: pipeline.picksSource,
    verdict: pipeline.assessment.verdict,
    confidence: pipeline.assessment.confidence,
    tokenWarmup,
    collection: {
      attemptedCalls: pipeline.collection?.attemptedCalls ?? 0,
      successCount: pipeline.collection?.successCount ?? 0,
      failureCount: pipeline.collection?.failureCount ?? 0,
      exactDateCoverageRate: pipeline.collection?.exactDateCoverageRate ?? 0,
      indexFailed: pipeline.collection?.indexFailed ?? false,
      skippedForBudget: pipeline.collection?.skippedForBudget ?? 0,
      retriedSymbols: pipeline.collection?.retriedSymbols ?? [],
      recoveredSymbols: pipeline.collection?.recoveredSymbols ?? [],
      persistedRows: pipeline.collection?.persistedRows ?? 0,
    },
    picks: rawPicks.map((pick, index) => ({
      rank: index + 1,
      ticker: pick.ticker,
      name: pick.name,
      close_price: pick.close_price,
      score: scoreBySymbol.get(pick.ticker) ?? 0,
    })),
    candidateCount: pipeline.generated?.meta.funnel.gatePassed ?? rawPicks.length,
    durationsSec: {
      assessment: pipeline.durationsMs.assessment / 1000,
      master: pipeline.durationsMs.master / 1000,
      collection: pipeline.durationsMs.collection / 1000,
      picks: pipeline.durationsMs.picks / 1000,
      total: elapsedMs(totalStartedAt) / 1000,
    },
    warnings,
    budget: {
      deadlineMinutes,
      ...pipeline.budget,
    },
  }

  if (options.dryRun) {
    console.log(`\nDRY_RUN_RESULT picks_source=${pipeline.picksSource} analysis_chars=${pipeline.geminiAnalysis.length}`)
    console.log(pipeline.geminiAnalysis.slice(0, 2_000))
    console.log('\n✅ dry-run — DB 저장 생략')
    await emitPrepareSummary(summary)
    return
  }

  if (pipeline.picksSource === 'code' && pipeline.generated) {
    try {
      await persistStockPickSnapshot({
        signal_date: pipeline.generated.meta.signalDate,
        strategy: pipeline.generated.meta.strategy,
        strategy_version: pipeline.generated.meta.strategyVersion,
        parameters_hash: pipeline.generated.meta.parametersHash,
        generated_at: new Date().toISOString(),
        git_sha: process.env.GITHUB_SHA ?? null,
        run_id: runId,
        funnel: pipeline.generated.meta.funnel,
        picks: pipeline.generated.meta.rankedCandidates.slice(0, 3),
        top_candidates: pipeline.generated.meta.rankedCandidates.slice(0, 20),
      })
    } catch (error) {
      const warning = `stock pick snapshot 저장 실패 — 뉴스레터 저장은 계속 진행: ${
        error instanceof Error ? error.message : String(error)
      }`
      warnings.push(warning)
      console.warn(`⚠️ ${warning}`)
    }
  }
  if (!client) throw new Error('newsletter client 초기화 실패')
  if (remainingMs(deadlineAt) <= 0) abortForDeadline('database write')

  const writeResult = await writeNewsletterWithCas({
    client,
    targetDate,
    existing: existingNewsletter,
    payload: {
      newsletter_date: targetDate,
      gemini_analysis: pipeline.geminiAnalysis,
      picks_source: pipeline.picksSource,
      created_at: new Date().toISOString(),
    },
  })
  await emitPrepareSummary(summary)
  if (writeResult === 'already_sent') return

  console.log(`\n${'━'.repeat(80)}`)
  console.log('✨ 뉴스레터 준비 완료!')
  console.log('━'.repeat(80))
  console.log('\n📝 저장된 데이터:')
  console.log(`  날짜: ${targetDate}`)
  console.log(`  분석 길이: ${pipeline.geminiAnalysis.length} characters`)
  console.log('  발송 예정: 07:27 KST\n')
}

const readOption = (args: readonly string[], name: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  return inline?.slice(name.length + 1)
}

export function parsePrepareNewsletterCliArgs(args: readonly string[]): PrepareNewsletterOptions {
  return {
    dryRun: args.includes('--dry-run'),
    backupRun: args.includes('--backup-run'),
    simulateTodayKst: readOption(args, '--simulate-today'),
    targetDate: readOption(args, '--target-date'),
    force: args.includes('--force'),
    runId: readOption(args, '--dispatch-id'),
    deadlineMinutes: readOption(args, '--deadline-minutes') === undefined
      ? undefined
      : Number(readOption(args, '--deadline-minutes')),
  }
}

export async function runPrepareNewsletterCli(args: readonly string[]): Promise<0 | 1> {
  const options = parsePrepareNewsletterCliArgs(args)
  try {
    await prepareNewsletter(options)
    return 0
  } catch (error) {
    const date = options.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(options.targetDate)
      ? options.targetDate
      : getKSTDateString()
    console.error('❌ 뉴스레터 준비 실패:', error)
    await sendNewsletterAlertEmail({
      subject: `[${siteConfig.serviceName}] ${date} prepare 실패 — 수동 조치 필요`,
      lines: [error instanceof Error ? error.stack ?? error.message : String(error)],
    })
    return 1
  }
}

const isDirectRun = /prepare-newsletter\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const envPath = resolve(process.cwd(), '.env.local')
  if (existsSync(envPath)) config({ path: envPath })
  runPrepareNewsletterCli(process.argv.slice(2)).then((exitCode) => {
    if (exitCode === 0) process.exit(0)
    else process.exit(1)
  })
}
