import { sleep, withRetry } from '../utils'

interface Theme {
  id: string
  keywords: string[]
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
function isRelevantArticle(title: string, keywords: string[]): boolean {
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

/** 네이버 뉴스 데이터 수집 */
export async function collectNaverNews(
  themes: Theme[],
  startDate: string,
  endDate: string
): Promise<NewsCollectionResult> {
  console.log('📰 네이버 뉴스 데이터 수집 중...')
  console.log(`   기간: ${startDate} ~ ${endDate}`)
  console.log(`   테마 수: ${themes.length}`)

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.warn('   ⚠️ NAVER_CLIENT_ID/SECRET 미설정 — 뉴스 수집 건너뜀')
    return { metrics: [], articles: [] }
  }

  const metrics: NewsMetric[] = []
  const allArticles: NewsArticle[] = []

  for (const theme of themes) {
    if (theme.keywords.length === 0) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: 키워드 없음`)
      continue
    }

    // 키워드를 OR(|) 연산자로 결합하여 단일 쿼리로 검색 (중복 기사 방지)
    const dateCounts = new Map<string, number>()
    const themeArticles: NewsArticle[] = []
    const searchKeywords = theme.keywords.slice(0, 5)
    const orQuery = searchKeywords.map(k => `"${k}"`).join(' | ')

    try {
      // 페이지네이션: 최대 1000건까지 수집 (Naver API start 상한 1000)
      let start = 1
      let totalFetched = 0
      let apiTotal = 0
      const MAX_RESULTS = 1000

      while (start < MAX_RESULTS) {
        const result = await searchNews(orQuery, 100, start)
        apiTotal = result.total

        if (result.items.length === 0) break

        for (const item of result.items) {
          const date = parseDate(item.pubDate)
          if (!date || date < startDate || date > endDate) continue

          const cleanTitle = stripHtml(item.title)

          // 관련도 필터: 제목에 키워드 최소 1개 포함 필수
          if (!isRelevantArticle(cleanTitle, theme.keywords)) continue

          dateCounts.set(date, (dateCounts.get(date) || 0) + 1)

          themeArticles.push({
            themeId: theme.id,
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
    } catch (error: unknown) {
      console.error(`   ⚠️ 테마 ${theme.id} 뉴스 검색 실패:`, error instanceof Error ? error.message : String(error))
    }

    await sleep(200)

    // 메트릭 생성
    for (const [date, count] of dateCounts) {
      metrics.push({ themeId: theme.id, date, articleCount: count })
    }

    // Keep only 10 most recent articles per theme (already sorted by date from API)
    allArticles.push(...themeArticles.slice(0, 10))

    const totalArticles = [...dateCounts.values()].reduce((a, b) => a + b, 0)
    console.log(`   ✓ ${theme.id}: ${totalArticles}건 (${dateCounts.size}일, 기사 ${Math.min(themeArticles.length, 10)}개)`)
  }

  console.log(`\n   ✅ ${metrics.length}개 뉴스 메트릭, ${allArticles.length}개 기사 수집 완료`)
  return { metrics, articles: allArticles }
}
