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

interface NaverNewsResponse {
  total: number
  items: { pubDate: string }[]
}

const CLIENT_ID = process.env.NAVER_CLIENT_ID || ''
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || ''

/** 네이버 뉴스 검색 API 호출 */
async function searchNews(query: string, display = 100, start = 1): Promise<NaverNewsResponse> {
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
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET,
        },
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
function parseDate(pubDate: string): string {
  return new Date(pubDate).toISOString().split('T')[0]
}

/** 네이버 뉴스 데이터 수집 */
export async function collectNaverNews(
  themes: Theme[],
  startDate: string,
  endDate: string
): Promise<NewsMetric[]> {
  console.log('📰 네이버 뉴스 데이터 수집 중...')
  console.log(`   기간: ${startDate} ~ ${endDate}`)
  console.log(`   테마 수: ${themes.length}`)

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('   ⚠️ NAVER_CLIENT_ID/SECRET 미설정 — 뉴스 수집 건너뜀')
    return []
  }

  const metrics: NewsMetric[] = []

  for (const theme of themes) {
    if (theme.keywords.length === 0) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: 키워드 없음`)
      continue
    }

    // 키워드를 OR(|) 연산자로 결합하여 단일 쿼리로 검색 (중복 기사 방지)
    const dateCounts = new Map<string, number>()
    const searchKeywords = theme.keywords.slice(0, 5)
    const orQuery = searchKeywords.map(k => `"${k}"`).join(' | ')

    try {
      const result = await searchNews(orQuery, 100)

      for (const item of result.items) {
        const date = parseDate(item.pubDate)
        if (date >= startDate && date <= endDate) {
          dateCounts.set(date, (dateCounts.get(date) || 0) + 1)
        }
      }
    } catch (error) {
      console.error(`   ⚠️ 테마 ${theme.id} 뉴스 검색 실패:`, error)
    }

    await sleep(200)

    // 메트릭 생성
    for (const [date, count] of dateCounts) {
      metrics.push({ themeId: theme.id, date, articleCount: count })
    }

    const totalArticles = [...dateCounts.values()].reduce((a, b) => a + b, 0)
    console.log(`   ✓ ${theme.id}: ${totalArticles}건 (${dateCounts.size}일, 키워드 ${searchKeywords.length}개)`)
  }

  console.log(`\n   ✅ ${metrics.length}개 뉴스 메트릭 수집 완료`)
  return metrics
}
