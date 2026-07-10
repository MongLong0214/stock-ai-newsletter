import type { JsonObject } from '@/lib/tli/canonical-json'
import { sleep, withRetry } from '@/scripts/tli/shared/utils'
import {
  buildNewsCollectionRun,
  calendarDatesBetween,
  keywordGroupSha256,
  resolveThemeKeywordGroup,
} from './collection-run-contract'
import { appendCollectionRun, type CollectionRunTransport } from './collection-run-store'

interface Theme {
  id: string
  name: string
  naverKeywords: string[]
}

interface NewsMetric {
  themeId: string
  date: string
  articleCount: number
}

export interface NewsArticle {
  themeId: string
  title: string
  link: string
  source: string | null
  pubDate: string
}

interface NaverNewsItem {
  title: string
  link: string
  originallink: string
  description: string
  pubDate: string
}

interface NaverNewsResponse {
  total: number
  items: NaverNewsItem[]
}

export interface NewsCollectionOptions {
  /** 테스트 주입용. 미지정 시 supabase RPC로 immutable run을 append한다. */
  readonly transport?: CollectionRunTransport
}

const NEWS_CONTRACT_VERSION = 'tli-news-v1'

function getNaverCredentials() {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 필요합니다')
  }
  return { clientId, clientSecret }
}

/** 네이버 뉴스 검색 API 호출 */
async function searchNews(query: string, display = 100, start = 1): Promise<NaverNewsResponse> {
  const { clientId, clientSecret } = getNaverCredentials()
  return withRetry(
    async () => {
      const params = new URLSearchParams({
        query,
        display: String(display),
        start: String(start),
        sort: 'date',
      })

      const res = await fetch(`https://openapi.naver.com/v1/search/news.json?${params}`, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) {
        throw new Error(`네이버 뉴스 API 오류 (${res.status}): ${await res.text()}`)
      }

      return res.json()
    },
    3,
    '네이버 뉴스 검색'
  )
}

/** pubDate → YYYY-MM-DD 변환 */
function parseDate(pubDate: string): string | null {
  const d = new Date(pubDate)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

/** HTML 태그 제거 + 엔티티 디코딩 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .trim()
}

/** 정규식 특수문자 이스케이프 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 기사 제목이 테마 키워드와 관련있는지 확인 */
function isRelevantArticle(title: string, keywords: readonly string[]): boolean {
  return keywords.some(keyword => {
    if (keyword.length <= 3 && /^[A-Za-z0-9]+$/.test(keyword)) {
      return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(title)
    }
    return title.includes(keyword)
  })
}

/** 링크에서 도메인(언론사) 추출 */
function extractSource(link: string): string | null {
  try {
    const hostname = new URL(link).hostname
    // news.naver.com → 원본 링크 사용이 나으므로 null
    if (hostname.includes('naver.com')) return null
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface NewsCollectionResult {
  metrics: NewsMetric[]
  articles: NewsArticle[]
}

interface ThemeSearchResult {
  readonly dateCounts: Map<string, number>
  readonly articles: NewsArticle[]
  readonly apiTotal: number
  readonly pages: number
}

async function searchThemeNews(input: {
  readonly theme: Theme
  readonly keywords: readonly string[]
  readonly startDate: string
  readonly endDate: string
}): Promise<ThemeSearchResult> {
  const dateCounts = new Map<string, number>()
  const articles: NewsArticle[] = []
  const orQuery = input.keywords.map(k => `"${k}"`).join(' | ')

  // 페이지네이션: 최대 1000건까지 수집 (Naver API start 상한 1000)
  let start = 1
  let totalFetched = 0
  let apiTotal = 0
  let pages = 0
  const MAX_RESULTS = 1000

  while (start < MAX_RESULTS) {
    const result = await searchNews(orQuery, 100, start)
    apiTotal = result.total
    pages++

    if (result.items.length === 0) break

    for (const item of result.items) {
      const date = parseDate(item.pubDate)
      if (!date || date < input.startDate || date > input.endDate) continue

      const cleanTitle = stripHtml(item.title)

      // 관련도 필터: 제목에 키워드 최소 1개 포함 필수
      if (!isRelevantArticle(cleanTitle, input.keywords)) continue

      dateCounts.set(date, (dateCounts.get(date) || 0) + 1)

      articles.push({
        themeId: input.theme.id,
        title: cleanTitle,
        link: item.originallink || item.link,
        source: extractSource(item.originallink || item.link),
        pubDate: date,
      })
    }

    totalFetched += result.items.length
    if (result.items.length < 100 || totalFetched >= apiTotal || start >= MAX_RESULTS) break

    start += 100
    await sleep(100) // 페이지 간 딜레이
  }

  return { dateCounts, articles, apiTotal, pages }
}

/**
 * 네이버 뉴스 데이터 수집 — 테마당 immutable run 1건.
 *
 * complete run은 expected theme×date마다 0건도 명시적 `article_count=0` row로 저장한다.
 * row 부재는 0건이 아니라 source missing이므로, 검색 실패 테마는 failed run(observation 0)이 되고
 * current cache(news_metrics)에도 반영하지 않는다. 테마별 run으로 분리해 한 테마의 실패가
 * 다른 테마의 complete를 오염시키지 못하게 한다.
 */
export async function collectNaverNews(
  themes: Theme[],
  startDate: string,
  endDate: string,
  options: NewsCollectionOptions = {},
): Promise<NewsCollectionResult> {
  console.log('📰 네이버 뉴스 데이터 수집 중...')
  console.log(`   기간: ${startDate} ~ ${endDate}`)
  console.log(`   테마 수: ${themes.length}`)

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    if (process.env.TLI_ALLOW_NEWS_SKIP === '1') {
      console.warn('   ⚠️ NAVER_CLIENT_ID/SECRET 미설정 — 뉴스 수집 건너뜀')
      return { metrics: [], articles: [] }
    }
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 필요합니다')
  }

  const metrics: NewsMetric[] = []
  const allArticles: NewsArticle[] = []

  for (const theme of themes) {
    if (theme.naverKeywords.length === 0) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: 키워드 없음`)
      continue
    }

    // interest run과 반드시 같은 keyword group을 쓴다 — 046이 query_hash == keyword_group_sha256를 강제한다.
    const spec = resolveThemeKeywordGroup(theme)
    const querySha256 = keywordGroupSha256(spec)
    const requestPayload: JsonObject = {
      startDate,
      endDate,
      sort: 'date',
      keyword_group_spec: { group_name: spec.group_name, keywords: [...spec.keywords] },
    }
    const requestedAt = new Date().toISOString()

    let search: ThemeSearchResult
    try {
      search = await searchThemeNews({ theme, keywords: spec.keywords, startDate, endDate })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`   ⚠️ 테마 ${theme.id} 뉴스 검색 실패:`, message)

      const now = new Date().toISOString()
      await appendNewsRun({
        append: buildNewsCollectionRun({
          contractVersion: NEWS_CONTRACT_VERSION,
          themeId: theme.id,
          requestWindowStart: startDate,
          requestWindowEnd: endDate,
          requestPayload,
          responsePayload: null,
          keywordGroupSha256: querySha256,
          articleCountByDate: new Map(),
          timestamps: { requestedAt, collectedAt: now, completedAt: now },
          failureSummary: { reason: 'naver_news_request_failed', message },
        }),
        transport: options.transport,
      })
      await sleep(200)
      continue
    }

    const collectedAt = new Date().toISOString()
    const append = buildNewsCollectionRun({
      contractVersion: NEWS_CONTRACT_VERSION,
      themeId: theme.id,
      requestWindowStart: startDate,
      requestWindowEnd: endDate,
      requestPayload,
      responsePayload: { total: search.apiTotal, pages: search.pages },
      keywordGroupSha256: querySha256,
      articleCountByDate: search.dateCounts,
      timestamps: { requestedAt, collectedAt, completedAt: new Date().toISOString() },
    })

    try {
      // snapshot을 먼저 확정한다. 실패하면 이 테마의 metric은 current cache로 전파되지 않는다.
      await appendCollectionRun(append, options.transport)
    } catch (error: unknown) {
      console.error(`   ❌ 테마 ${theme.id} news snapshot append 실패 (cache 미반영):`,
        error instanceof Error ? error.message : String(error))
      await sleep(200)
      continue
    }

    await sleep(200)

    // current cache는 기존 계약(관측된 날짜만)을 그대로 유지한다.
    // explicit zero row는 immutable snapshot 전용 — cache 경로의 동작을 바꾸지 않는다.
    for (const [date, articleCount] of search.dateCounts) {
      metrics.push({ themeId: theme.id, date, articleCount })
    }

    // Keep only 10 most recent articles per theme (already sorted by date from API)
    allArticles.push(...search.articles.slice(0, 10))

    const totalArticles = [...search.dateCounts.values()].reduce((a, b) => a + b, 0)
    console.log(`   ✓ ${theme.id}: ${totalArticles}건 (${search.dateCounts.size}일, 기사 ${Math.min(search.articles.length, 10)}개, expected slot ${calendarDatesBetween(startDate, endDate).length})`)
  }

  console.log(`\n   ✅ ${metrics.length}개 뉴스 메트릭, ${allArticles.length}개 기사 수집 완료`)
  return { metrics, articles: allArticles }
}

async function appendNewsRun(input: {
  readonly append: ReturnType<typeof buildNewsCollectionRun>
  readonly transport?: CollectionRunTransport
}): Promise<void> {
  try {
    await appendCollectionRun(input.append, input.transport)
  } catch (error: unknown) {
    console.error('   ⚠️ failed news run 기록 실패:', error instanceof Error ? error.message : String(error))
  }
}
