import * as cheerio from 'cheerio'
import { sleep, withRetry, getKSTDate } from '../utils'
import { batchQuery, groupByThemeId } from '../supabase-batch'

interface ThemeInput {
  id: string
}

export interface DiscussionMetric {
  themeId: string
  date: string
  source: 'discussion'
  mentionCount: number
  stockCount: number
  stocksSampled: number
}

interface StockInfo {
  theme_id: string
  symbol: string
  name: string
}

const MAX_STOCKS_PER_THEME = 5
const PAGES_PER_STOCK = 3

/** 주말/공휴일 체크 (토=6, 일=0) */
function isWeekday(): boolean {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const day = kst.getUTCDay()
  return day >= 1 && day <= 5
}

/** 종목 토론방 페이지 스크래핑 — 오늘 날짜 게시물 수 반환 */
async function scrapeDiscussionPage(stockCode: string, page: number, today: string): Promise<number> {
  const url = `https://finance.naver.com/item/board.naver?code=${stockCode}&page=${page}`

  const response = await withRetry(
    async () => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`HTTP 오류 ${res.status}`)
      return res
    },
    3,
    `종목 ${stockCode} 토론방 p${page}`
  )

  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('euc-kr').decode(buffer)
  const $ = cheerio.load(html)

  let count = 0
  // 토론방 테이블: <table class="type2"> 안에 날짜 컬럼이 있음
  $('table.type2 tbody tr').each((_, row) => {
    const $row = $(row)
    const $tds = $row.find('td')
    if ($tds.length < 4) return

    // 날짜 컬럼: 첫 번째 td (YYYY.MM.DD HH:mm 또는 HH:mm 형식)
    const dateText = $tds.eq(0).text().trim()

    // HH:mm 형식이면 오늘 게시물
    if (/^\d{2}:\d{2}$/.test(dateText)) {
      count++
      return
    }

    // YYYY.MM.DD HH:mm 형식
    const dateMatch = dateText.match(/^(\d{4})\.(\d{2})\.(\d{2})/)
    if (dateMatch) {
      const postDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      if (postDate === today) {
        count++
      }
    }
  })

  return count
}

/** 단일 종목의 오늘 토론 게시물 수 수집 */
async function countStockDiscussions(stockCode: string, today: string): Promise<number> {
  let total = 0

  for (let page = 1; page <= PAGES_PER_STOCK; page++) {
    try {
      const count = await scrapeDiscussionPage(stockCode, page, today)
      total += count

      // 오늘 게시물이 없는 페이지 → 이후 페이지에도 없을 것
      if (count === 0) break

      if (page < PAGES_PER_STOCK) {
        await sleep(500)
      }
    } catch (error: unknown) {
      console.error(`   ⚠️ ${stockCode} p${page} 스크래핑 실패:`, error instanceof Error ? error.message : String(error))
      break
    }
  }

  return total
}

/** 네이버 종목토론방 데이터 수집 (테마별 일일 토론 수) */
export async function collectStockDiscussions(themes: ThemeInput[]): Promise<DiscussionMetric[]> {
  console.log('💬 종목 토론방 데이터 수집 중...')

  if (!isWeekday()) {
    console.log('   ⊘ 주말 — 토론방 수집 건너뜀')
    return []
  }

  const today = getKSTDate()
  console.log(`   날짜: ${today}`)
  console.log(`   테마 수: ${themes.length}`)

  // 활성 종목 배치 로딩
  const themeIds = themes.map(t => t.id)
  const allStocks = await batchQuery<StockInfo>(
    'theme_stocks', 'theme_id, symbol, name', themeIds,
    q => q.eq('is_active', true),
  )
  const stocksByTheme = groupByThemeId(allStocks)

  const metrics: DiscussionMetric[] = []

  for (const theme of themes) {
    const stocks = stocksByTheme.get(theme.id) || []
    if (stocks.length === 0) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: 활성 종목 없음`)
      continue
    }

    const totalStockCount = stocks.length
    const sampled = stocks.slice(0, MAX_STOCKS_PER_THEME)
    let rawCount = 0

    for (const stock of sampled) {
      const count = await countStockDiscussions(stock.symbol, today)
      rawCount += count
      if (count > 0) {
        console.log(`     ${stock.name}(${stock.symbol}): ${count}건`)
      }
      await sleep(2000)
    }

    // 샘플링 비율 보정 (5개만 조사했는데 종목이 더 많으면 외삽)
    const mentionCount = sampled.length < totalStockCount
      ? Math.round((rawCount / sampled.length) * totalStockCount)
      : rawCount

    metrics.push({
      themeId: theme.id,
      date: today,
      source: 'discussion',
      mentionCount,
      stockCount: totalStockCount,
      stocksSampled: sampled.length,
    })

    console.log(`   ✓ ${theme.id}: ${mentionCount}건 (${sampled.length}/${totalStockCount} 종목 샘플링)`)
  }

  console.log(`\n   ✅ ${metrics.length}개 토론 메트릭 수집 완료`)
  return metrics
}
