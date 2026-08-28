// 환경변수를 가장 먼저 로드
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

import type { MarketAssessment } from '@/lib/llm/korea/gemini-pipeline'
import { executeMarketAssessment } from '@/lib/llm/korea/gemini-pipeline'
import {
  getStockAnalysis,
  type StockAnalysisOptions,
  type StockAnalysisResult,
} from '@/lib/llm/stock-analysis'
import { collectDailyStockPrices } from '@/scripts/stock-picks/collect-daily'
import { generatePicks } from '@/scripts/stock-picks/generate-picks'
import { loadStockMaster } from '@/scripts/stock-picks/load-stock-master'

// 로컬 환경에서만 .env.local 로드 (GitHub Actions는 환경변수 직접 사용)
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) config({ path: envPath })

export type PicksSource = 'code' | 'llm_fallback' | 'crash'
export const MIN_DAILY_COLLECTION_SUCCESS_RATE = 0.95

interface DailyCollectionCoverageReport {
  readonly successRate: number
  readonly skippedForBudget: number
}

export interface NewsletterAnalysisResult {
  readonly geminiAnalysis: string
  readonly picksSource: PicksSource
}

export interface NewsletterPipelineDependencies {
  readonly assessMarket?: () => Promise<MarketAssessment>
  readonly collectDaily?: () => Promise<DailyCollectionCoverageReport>
  readonly generateCodePicks?: () => Promise<string>
  readonly getLlmAnalysis?: (options?: StockAnalysisOptions) => Promise<StockAnalysisResult>
  readonly refreshStockMaster?: () => Promise<void>
}

/**
 * 시장평가는 한 번만 실행한다. CRASH_ALERT는 기존 Gemini crash 경로를 재사용하고,
 * NORMAL에서만 코드 파이프라인을 우선한 뒤 모든 오류를 기존 LLM 파이프라인으로 되돌린다.
 */
export async function resolveNewsletterAnalysis(
  dependencies: NewsletterPipelineDependencies = {},
): Promise<NewsletterAnalysisResult> {
  const assessMarket = dependencies.assessMarket ?? executeMarketAssessment
  const collectDaily = dependencies.collectDaily ?? collectDailyStockPrices
  const generateCodePicks = dependencies.generateCodePicks ?? generatePicks
  const getLlmAnalysis = dependencies.getLlmAnalysis ?? getStockAnalysis
  const refreshStockMaster = dependencies.refreshStockMaster ?? loadStockMaster
  const assessment = await assessMarket()

  if (assessment.verdict === 'CRASH_ALERT') {
    console.log('\n🚨 [CRASH_ALERT] 기존 폭락 분석 Pipeline 실행')
    const result = await getLlmAnalysis({ marketAssessment: assessment })
    return { geminiAnalysis: result.geminiAnalysis, picksSource: 'crash' }
  }

  console.log('\n✅ [NORMAL] 일일 수집 → 코드 종목 추천 Pipeline 실행')
  try {
    await refreshStockMaster()
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`⚠️ 종목 마스터 일일 갱신 실패 — 기존 마스터로 계속 진행: ${reason}`)
  }
  try {
    const collection = await collectDaily()
    if (
      collection.successRate < MIN_DAILY_COLLECTION_SUCCESS_RATE
      || collection.skippedForBudget > 0
    ) {
      throw new Error(
        `일일 수집 커버리지 게이트 실패: successRate=${collection.successRate.toFixed(4)}`
        + ` (minimum=${MIN_DAILY_COLLECTION_SUCCESS_RATE}), skippedForBudget=${collection.skippedForBudget}`,
      )
    }
    const geminiAnalysis = await generateCodePicks()
    console.log('PICKS_SOURCE=code')
    return { geminiAnalysis, picksSource: 'code' }
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`\n${'━'.repeat(80)}`)
    console.error('🚨 코드 종목 추천 Pipeline 실패 — 기존 LLM Pipeline fallback')
    console.error(reason)
    console.error(`${'━'.repeat(80)}\n`)
    console.log('PICKS_SOURCE=llm_fallback')
    const result = await getLlmAnalysis({ marketAssessment: assessment })
    return { geminiAnalysis: result.geminiAnalysis, picksSource: 'llm_fallback' }
  }
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

export interface PrepareNewsletterOptions {
  /** true면 분석·픽 생성까지 전부 실행하되 DB 저장을 생략 — CI 실검수용. */
  readonly dryRun?: boolean
  /**
   * 신선도 게이트 기준일 재정의(YYYY-MM-DD). 장 마감 후 CI 검수에서 다음 발행 시점을
   * 시뮬레이션할 때 쓴다. 발송분 오염 방지를 위해 dryRun에서만 허용한다.
   */
  readonly simulateTodayKst?: string
}

export async function prepareNewsletter(options: PrepareNewsletterOptions = {}): Promise<void> {
  if (options.simulateTodayKst && !options.dryRun) {
    throw new Error('simulateTodayKst는 dry-run에서만 허용됩니다 (발송분 오염 방지)')
  }
  console.log(`🚀 뉴스레터 준비 작업 시작...${options.dryRun ? ' [DRY-RUN]' : ''}\n`)
  const { geminiAnalysis, picksSource } = await resolveNewsletterAnalysis(
    options.simulateTodayKst
      ? { generateCodePicks: () => generatePicks({ todayKst: options.simulateTodayKst }) }
      : {},
  )
  console.log('✅ 뉴스레터 분석 완료\n')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  console.log(`📅 뉴스레터 날짜: ${today}`)

  if (options.dryRun) {
    console.log(`\nDRY_RUN_RESULT picks_source=${picksSource} analysis_chars=${geminiAnalysis.length}`)
    console.log(geminiAnalysis.slice(0, 2_000))
    console.log('\n✅ dry-run — DB 저장 생략')
    return
  }

  const client = createNewsletterClient()
  const { data: existingNewsletter, error: lookupError } = await client
    .from('newsletter_content')
    .select('is_sent')
    .eq('newsletter_date', today)
    .maybeSingle()

  if (lookupError) {
    console.error('❌ Database error:', lookupError)
    throw new Error(`Database error: ${lookupError.message}`)
  }
  if (existingNewsletter?.is_sent === true) {
    console.log('🛡️ 이미 발송된 뉴스레터 — 내용 보존')
    return
  }

  // is_sent를 payload에 넣지 않아 미발송 행의 기존 발송 상태를 그대로 보존한다.
  const { error } = await client
    .from('newsletter_content')
    .upsert(
      {
        newsletter_date: today,
        gemini_analysis: geminiAnalysis,
        picks_source: picksSource,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'newsletter_date' },
    )
    .select()

  if (error) {
    console.error('❌ Database error:', error)
    throw new Error(`Database error: ${error.message}`)
  }

  console.log(`\n${'━'.repeat(80)}`)
  console.log('✨ 뉴스레터 준비 완료!')
  console.log('━'.repeat(80))
  console.log('\n📝 저장된 데이터:')
  console.log(`  날짜: ${today}`)
  console.log(`  분석 길이: ${geminiAnalysis.length} characters`)
  console.log('  발송 예정: 07:30 KST\n')
}

const isDirectRun = /prepare-newsletter\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const args = process.argv.slice(2)
  const simulateInline = args.find((arg) => arg.startsWith('--simulate-today='))
  prepareNewsletter({
    dryRun: args.includes('--dry-run'),
    simulateTodayKst: simulateInline?.slice('--simulate-today='.length),
  }).then(() => {
    process.exit(0)
  }).catch((error: unknown) => {
    console.error('❌ 뉴스레터 준비 실패:', error)
    process.exit(1)
  })
}
