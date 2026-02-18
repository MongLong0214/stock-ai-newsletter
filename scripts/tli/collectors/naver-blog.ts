import { sleep, withRetry } from '../utils'
import { stripHtml, isRelevantArticle } from './search-utils'

interface Theme {
  id: string
  keywords: string[]
}

export interface BlogMetric {
  themeId: string
  date: string
  source: 'blog'
  mentionCount: number
}

interface NaverBlogItem {
  title: string
  link: string
  description: string
  bloggername: string
  bloggerlink: string
  postdate: string // YYYYMMDD 형식
}

interface NaverBlogResponse {
  total: number
  items: NaverBlogItem[]
}

function getNaverCredentials() {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 필요합니다')
  }
  return { clientId, clientSecret }
}

/** 네이버 블로그 검색 API 호출 */
async function searchBlog(query: string, display = 100, start = 1): Promise<NaverBlogResponse> {
  const { clientId, clientSecret } = getNaverCredentials()
  return withRetry(
    async () => {
      const params = new URLSearchParams({
        query,
        display: String(display),
        start: String(start),
        sort: 'date',
      })

      const res = await fetch(`https://openapi.naver.com/v1/search/blog.json?${params}`, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) {
        throw new Error(`네이버 블로그 API 오류 (${res.status}): ${await res.text()}`)
      }

      return res.json()
    },
    3,
    '네이버 블로그 검색'
  )
}

/** postdate (YYYYMMDD) → YYYY-MM-DD 변환 */
function parsePostDate(postdate: string): string | null {
  if (!/^\d{8}$/.test(postdate)) return null
  const y = postdate.slice(0, 4)
  const m = postdate.slice(4, 6)
  const d = postdate.slice(6, 8)
  return `${y}-${m}-${d}`
}

/** 네이버 블로그 데이터 수집 (일별 멘션 수) */
export async function collectNaverBlog(
  themes: Theme[],
  startDate: string,
  endDate: string
): Promise<BlogMetric[]> {
  console.log('📝 네이버 블로그 데이터 수집 중...')
  console.log(`   기간: ${startDate} ~ ${endDate}`)
  console.log(`   테마 수: ${themes.length}`)

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.warn('   ⚠️ NAVER_CLIENT_ID/SECRET 미설정 — 블로그 수집 건너뜀')
    return []
  }

  const metrics: BlogMetric[] = []

  for (const theme of themes) {
    if (theme.keywords.length === 0) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: 키워드 없음`)
      continue
    }

    const dateCounts = new Map<string, number>()
    const searchKeywords = theme.keywords.slice(0, 5)
    const orQuery = searchKeywords.map(k => `"${k}"`).join(' | ')

    try {
      let start = 1
      let totalFetched = 0
      let apiTotal = 0
      const MAX_RESULTS = 1000

      while (start < MAX_RESULTS) {
        const result = await searchBlog(orQuery, 100, start)
        apiTotal = result.total

        if (result.items.length === 0) break

        for (const item of result.items) {
          const date = parsePostDate(item.postdate)
          if (!date || date < startDate || date > endDate) continue

          const cleanTitle = stripHtml(item.title)

          // 관련도 필터: 제목에 키워드 최소 1개 포함 필수
          if (!isRelevantArticle(cleanTitle, theme.keywords)) continue

          dateCounts.set(date, (dateCounts.get(date) || 0) + 1)
        }

        totalFetched += result.items.length
        if (result.items.length < 100 || totalFetched >= apiTotal || start >= MAX_RESULTS) break

        start += 100
        await sleep(100)
      }
    } catch (error: unknown) {
      console.error(`   ⚠️ 테마 ${theme.id} 블로그 검색 실패:`, error instanceof Error ? error.message : String(error))
    }

    await sleep(200)

    for (const [date, count] of dateCounts) {
      metrics.push({ themeId: theme.id, date, source: 'blog', mentionCount: count })
    }

    const totalMentions = [...dateCounts.values()].reduce((a, b) => a + b, 0)
    console.log(`   ✓ ${theme.id}: ${totalMentions}건 (${dateCounts.size}일)`)
  }

  console.log(`\n   ✅ ${metrics.length}개 블로그 메트릭 수집 완료`)
  return metrics
}
