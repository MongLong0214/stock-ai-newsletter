import * as cheerio from 'cheerio'
import { sleep, withRetry } from '../utils'

export interface DiscoveredTheme {
  name: string
  naverThemeId: string
  /** 오늘자 등락률 (%) */
  changePercent: number
}

/** 네이버 금융 테마 목록 단일 페이지 스크래핑 */
async function scrapeThemeListPage(page: number): Promise<DiscoveredTheme[]> {
  const url = `https://finance.naver.com/sise/theme.naver?&page=${page}`

  const response = await withRetry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    },
    3,
    `테마 목록 페이지 ${page}`
  )

  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('euc-kr').decode(buffer)
  const $ = cheerio.load(html)
  const themes: DiscoveredTheme[] = []

  // 테마 테이블 각 행 파싱
  $('table.type_1 tbody tr').each((_, row) => {
    const $row = $(row)
    const $link = $row.find('td.col_type1 a')
    const href = $link.attr('href') || ''
    const noMatch = href.match(/no=(\d+)/)
    if (!noMatch) return

    const name = $link.text().trim()
    if (!name) return

    // 등락률 파싱
    const changeText = $row.find('td.col_type2').text().trim().replace('%', '')
    const changePercent = parseFloat(changeText) || 0

    themes.push({
      name,
      naverThemeId: noMatch[1],
      changePercent,
    })
  })

  return themes
}

/** 전체 페이지 수 추출 */
async function getTotalPages(): Promise<number> {
  const url = 'https://finance.naver.com/sise/theme.naver?&page=1'

  const response = await withRetry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    },
    3,
    '테마 목록 총 페이지 수 조회'
  )

  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('euc-kr').decode(buffer)
  const $ = cheerio.load(html)

  // 페이지네이션에서 마지막 페이지 번호 추출
  let maxPage = 1
  $('table.Nnavi td a, table.Nnavi td strong').each((_, el) => {
    const pageNum = parseInt($(el).text().trim(), 10)
    if (!isNaN(pageNum) && pageNum > maxPage) maxPage = pageNum
  })

  // 마지막 페이지 링크에서도 확인
  $('table.Nnavi a.pgRR').each((_, el) => {
    const href = $(el).attr('href') || ''
    const match = href.match(/page=(\d+)/)
    if (match) {
      const lastPage = parseInt(match[1], 10)
      if (lastPage > maxPage) maxPage = lastPage
    }
  })

  return maxPage
}

/** 네이버 금융 전체 테마 목록 수집 */
export async function collectNaverThemeList(): Promise<DiscoveredTheme[]> {
  console.log('🔍 네이버 금융 테마 목록 스크래핑 시작...')

  const totalPages = await getTotalPages()
  console.log(`   총 ${totalPages} 페이지 감지`)

  const allThemes: DiscoveredTheme[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= totalPages; page++) {
    console.log(`   페이지 ${page}/${totalPages} 수집 중...`)

    const themes = await scrapeThemeListPage(page)
    for (const theme of themes) {
      // 중복 제거 (naverThemeId 기준)
      if (seen.has(theme.naverThemeId)) continue
      seen.add(theme.naverThemeId)
      allThemes.push(theme)
    }

    // 정중한 지연
    if (page < totalPages) await sleep(1000)
  }

  console.log(`   ✅ 총 ${allThemes.length}개 테마 발견`)
  return allThemes
}
