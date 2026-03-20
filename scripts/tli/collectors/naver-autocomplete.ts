import { sleep, withRetry } from '@/scripts/tli/shared/utils'

interface AutocompleteResult {
  keyword: string
  /** 투자 관련 키워드 여부 */
  isStockRelated: boolean
}

/** 투자 관련 접미사 패턴 */
const STOCK_SUFFIXES = [
  '관련주', '수혜주', '대장주', '테마주', 'ETF',
  '종목', '주식', '투자', '상장', '주가',
]

/** 네이버 자동완성 API 호출 */
async function fetchAutocomplete(query: string): Promise<string[]> {
  const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(query)}&con=1&frm=nv&ans=2&t_koreng=1&q_enc=UTF-8&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&r_lt=100`

  const response = await withRetry(
    async () => {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TLI-Bot/1.0)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    2,
    `자동완성: ${query}`
  )

  // 네이버 자동완성 응답: items 배열 내 [keyword, ...] 구조
  const items: string[] = []
  try {
    const suggestions = response?.items || []
    for (const group of suggestions) {
      if (Array.isArray(group)) {
        for (const item of group) {
          if (Array.isArray(item) && typeof item[0] === 'string') {
            items.push(item[0])
          }
        }
      }
    }
  } catch (error: unknown) {
    console.warn('   자동완성 응답 파싱 실패:', error instanceof Error ? error.message : String(error))
  }

  return items
}

/** 키워드가 투자 관련인지 판별 */
function isStockRelated(keyword: string): boolean {
  return STOCK_SUFFIXES.some(suffix => keyword.includes(suffix))
}

/** 테마명으로 관련 키워드 자동 확장 */
export async function expandKeywords(
  themeName: string,
  maxKeywords = 10,
): Promise<string[]> {
  // 여러 쿼리 변형으로 검색
  const queries = [
    themeName,
    `${themeName} 관련주`,
    `${themeName} 주식`,
  ]

  const allResults: AutocompleteResult[] = []
  const seen = new Set<string>()

  for (const query of queries) {
    const suggestions = await fetchAutocomplete(query)

    for (const suggestion of suggestions) {
      const clean = suggestion.trim()
      if (!clean || seen.has(clean)) continue
      if (clean === query) continue

      seen.add(clean)
      allResults.push({
        keyword: clean,
        isStockRelated: isStockRelated(clean),
      })
    }

    await sleep(200)
  }

  // 투자 관련 키워드 우선 정렬, 이후 일반 키워드
  allResults.sort((a, b) => {
    if (a.isStockRelated !== b.isStockRelated) return b.isStockRelated ? 1 : -1
    return 0
  })

  return allResults.slice(0, maxKeywords).map(r => r.keyword)
}

