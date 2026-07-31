import { getAuthoritativeStockMarket, getStockPrice } from '@/app/archive/_utils/api/kis/client'
import type { KisStockPrice } from '@/app/archive/_utils/api/kis/types'
import type { StockData, StockDataArray } from '@/lib/llm/_types/stock-data'
import { validateStockData } from '@/lib/llm/korea/stock-json'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

export interface StockIdentityEvidence {
  readonly symbol: string
  readonly name: string
  readonly market: 'KOSPI' | 'KOSDAQ'
  readonly source: 'naver_theme_stocks'
}

export interface VerifiedStockClaimEvidence {
  readonly ticker: string
  readonly identitySource: StockIdentityEvidence['source']
  readonly identitySourceUrl: string
  readonly quoteSource: 'KIS'
  readonly quoteSourceUrl: string
  readonly verifiedName: string
  readonly verifiedPreviousClose: number
  readonly sourceObservedAt: string
  readonly verifiedAt: string
}

export interface VerifiedStockClaims {
  readonly json: string
  readonly stocks: StockDataArray
  readonly evidence: readonly VerifiedStockClaimEvidence[]
}

export interface StockClaimsVerifierDependencies {
  readonly loadIdentities: (symbols: readonly string[]) => Promise<ReadonlyMap<string, StockIdentityEvidence>>
  readonly loadQuote: (ticker: string) => Promise<KisStockPrice>
  readonly loadMarket: (symbol: string) => Promise<'KOSPI' | 'KOSDAQ'>
  readonly now?: () => Date
}

const normalizeName = (value: string): string => value
  .normalize('NFKC')
  .replace(/주식회사|\(주\)|㈜/g, '')
  .replace(/\s+/g, '')
  .toLocaleLowerCase('ko-KR')

const tickerParts = (ticker: string): { readonly market: 'KOSPI' | 'KOSDAQ'; readonly symbol: string } => {
  const match = /^(KOSPI|KOSDAQ):(\d{6})$/.exec(ticker)
  if (!match) throw new Error(`Invalid stock ticker: ${ticker}`)
  return { market: match[1] as 'KOSPI' | 'KOSDAQ', symbol: match[2] }
}

async function loadPersistedNaverIdentities(
  symbols: readonly string[],
): Promise<ReadonlyMap<string, StockIdentityEvidence>> {
  const { data, error } = await supabaseAdmin
    .from('theme_stocks')
    .select('symbol, name, market, source')
    .in('symbol', [...symbols])
    .eq('source', 'naver')

  if (error) throw new Error(`Stock identity verification query failed: ${error.message}`)

  const candidates = new Map<string, StockIdentityEvidence[]>()
  for (const row of data ?? []) {
    if (
      typeof row.symbol !== 'string'
      || typeof row.name !== 'string'
      || (row.market !== 'KOSPI' && row.market !== 'KOSDAQ')
    ) continue
    const list = candidates.get(row.symbol) ?? []
    list.push({ symbol: row.symbol, name: row.name, market: row.market, source: 'naver_theme_stocks' })
    candidates.set(row.symbol, list)
  }

  const identities = new Map<string, StockIdentityEvidence>()
  for (const symbol of symbols) {
    const rows = candidates.get(symbol) ?? []
    const unique = new Map(rows.map((row) => [`${normalizeName(row.name)}|${row.market}`, row]))
    if (unique.size !== 1) {
      throw new Error(`Stock identity is missing or conflicting for ${symbol}`)
    }
    identities.set(symbol, [...unique.values()][0])
  }
  return identities
}

const defaultDependencies: StockClaimsVerifierDependencies = {
  loadIdentities: loadPersistedNaverIdentities,
  loadQuote: getStockPrice,
  loadMarket: getAuthoritativeStockMarket,
}

function deterministicRationale(input: {
  readonly stock: StockData
  readonly identity: StockIdentityEvidence
  readonly previousClose: number
}): string {
  const scores = input.stock.signals
  return [
    `Naver 종목 신원 확인 ${input.identity.name}(${input.identity.market}:${input.identity.symbol})`,
    `KIS 전일 종가 ${input.previousClose.toLocaleString('ko-KR')}원 확인`,
    `모델 산출 종합 ${scores.overall_score}점·추세 ${scores.trend_score}점·모멘텀 ${scores.momentum_score}점`,
    '모델 점수는 독립 시세 사실과 분리된 참고 지표이며 투자판단 근거가 아님',
  ].join('|')
}

/**
 * Final deterministic gate after all Gemini stages.
 * Unverified free-form rationale is never returned; it is replaced with text
 * containing only independently verified identity/close facts and clearly
 * labelled model scores.
 */
export async function verifyGeneratedStockClaims(
  json: string,
  dependencies: StockClaimsVerifierDependencies = defaultDependencies,
): Promise<VerifiedStockClaims> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error: unknown) {
    throw new Error('Generated stock JSON cannot be parsed', { cause: error })
  }
  if (!validateStockData(parsed)) throw new Error('Generated stock JSON failed strict shape validation')

  const stocks = parsed as StockDataArray
  const parts = stocks.map((stock) => ({ stock, ...tickerParts(stock.ticker) }))
  if (new Set(parts.map(({ symbol }) => symbol)).size !== parts.length) {
    throw new Error('Generated stock JSON contains duplicate tickers')
  }

  const identities = await dependencies.loadIdentities(parts.map(({ symbol }) => symbol))
  const verifiedAt = (dependencies.now ?? (() => new Date()))().toISOString()
  const verifiedStocks: StockData[] = []
  const evidence: VerifiedStockClaimEvidence[] = []

  // Sequential KIS requests keep this final gate inside the provider rate limit.
  for (const { stock, market, symbol } of parts) {
    const identity = identities.get(symbol)
    if (!identity) throw new Error(`No independent identity evidence for ${symbol}`)
    if (identity.market !== market) throw new Error(`Market mismatch for ${stock.ticker}`)
    if (normalizeName(identity.name) !== normalizeName(stock.name)) {
      throw new Error(`Name mismatch for ${stock.ticker}`)
    }

    const kisMarket = await dependencies.loadMarket(symbol)
    if (kisMarket !== market) throw new Error(`KIS market mismatch for ${stock.ticker}`)

    const quote = await dependencies.loadQuote(stock.ticker)
    if (!Number.isSafeInteger(quote.previousClose) || quote.previousClose <= 0) {
      throw new Error(`KIS returned invalid previous close for ${stock.ticker}`)
    }
    if (stock.close_price !== quote.previousClose) {
      throw new Error(
        `Previous-close mismatch for ${stock.ticker}: generated=${stock.close_price}, KIS=${quote.previousClose}`,
      )
    }

    verifiedStocks.push({
      ...stock,
      name: identity.name,
      close_price: quote.previousClose,
      rationale: deterministicRationale({ stock, identity, previousClose: quote.previousClose }),
    })
    evidence.push({
      ticker: stock.ticker,
      identitySource: identity.source,
      identitySourceUrl: `https://finance.naver.com/item/main.naver?code=${symbol}`,
      quoteSource: 'KIS',
      quoteSourceUrl: `https://openapi.koreainvestment.com/uapi/domestic-stock/v1/quotations/inquire-price?FID_INPUT_ISCD=${symbol}`,
      verifiedName: identity.name,
      verifiedPreviousClose: quote.previousClose,
      sourceObservedAt: new Date(quote.timestamp).toISOString(),
      verifiedAt,
    })
  }

  return { json: JSON.stringify(verifiedStocks), stocks: verifiedStocks, evidence }
}
